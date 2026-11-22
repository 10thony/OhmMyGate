using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;

namespace OhmMyGate.Auth;

public sealed class ClerkOptions
{
    public const string SectionName = "Clerk";
    public string PublishableKey { get; set; } = "";
    public string SecretKey { get; set; } = "";
    public string Authority { get; set; } = "";
    public string JwksUrl { get; set; } = "";
    /// <summary>Comma-separated extra origins allowed as JWT <c>azp</c>. Never a user allowlist.</summary>
    public string AuthorizedParties { get; set; } = "";
}

public sealed class ClerkTokenValidator
{
    private readonly ClerkOptions _options;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ConfigurationManager<OpenIdConnectConfiguration> _configManager;
    private readonly ILogger<ClerkTokenValidator> _logger;
    private readonly HashSet<string> _authorizedParties;

    public ClerkTokenValidator(
        IConfiguration config,
        IHttpClientFactory httpClientFactory,
        ILogger<ClerkTokenValidator> logger)
    {
        _options = config.GetSection(ClerkOptions.SectionName).Get<ClerkOptions>() ?? new ClerkOptions();
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _authorizedParties = BuildAuthorizedParties(config, _options);

        var authority = _options.Authority.TrimEnd('/');
        _configManager = new ConfigurationManager<OpenIdConnectConfiguration>(
            $"{authority}/.well-known/openid-configuration",
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever { RequireHttps = true });
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_options.Authority)
        && !string.IsNullOrWhiteSpace(_options.PublishableKey);

    public string PublishableKey => _options.PublishableKey;
    public string Authority => _options.Authority.TrimEnd('/');

    public async Task<ClaimsPrincipal?> ValidateAsync(
        string? token,
        string? sessionId,
        string? fallbackFirstName = null,
        CancellationToken ct = default)
    {
        if (!IsConfigured)
            return null;

        ClaimsPrincipal? principal = null;
        if (LooksLikeJwt(token))
        {
            principal = await ValidateJwtAsync(token!, ct);
            if (principal is null)
                _logger.LogWarning("Clerk JWT validation failed; falling back to session API if possible");
        }

        if (principal is null)
        {
            var sid = FirstNonEmpty(sessionId, LooksLikeSessionId(token) ? token : null);
            if (!string.IsNullOrWhiteSpace(sid))
                principal = await ValidateSessionViaBackendAsync(sid!, ct);
        }

        if (principal is null)
        {
            _logger.LogWarning(
                "Clerk auth rejected: tokenLen={TokenLen} segments={Segments} sessionId={HasSession}",
                token?.Length ?? 0,
                token?.Count(c => c == '.') ?? 0,
                !string.IsNullOrWhiteSpace(sessionId));
            return null;
        }

        if (AuthClaims.GetFirstName(principal) is null && LooksLikeHumanName(fallbackFirstName))
        {
            principal = BuildPrincipal(
                AuthClaims.GetUserId(principal),
                principal.FindFirstValue(ClaimTypes.Email),
                fallbackFirstName,
                null,
                null) ?? principal;
        }

        return principal;
    }

    private async Task<ClaimsPrincipal?> ValidateJwtAsync(string token, CancellationToken ct)
    {
        try
        {
            var oidc = await _configManager.GetConfigurationAsync(ct);
            var parameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuers = [Authority, Authority + "/"],
                // Clerk session tokens usually have no aud; ValidateAudience=true would reject the live instance.
                ValidateAudience = false,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKeys = oidc.SigningKeys,
                NameClaimType = ClaimTypes.GivenName,
                ClockSkew = TimeSpan.FromMinutes(2)
            };

            var handler = new JwtSecurityTokenHandler();
            var principal = handler.ValidateToken(token, parameters, out var validated);
            if (!AzpAllowed(principal, validated))
                return null;
            var userId = principal.FindFirstValue("sub") ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            var jwtEmail = principal.FindFirstValue("email") ?? principal.FindFirstValue(ClaimTypes.Email);
            var jwtFirst = FirstNonEmpty(
                principal.FindFirstValue(ClaimTypes.GivenName),
                principal.FindFirstValue("given_name"),
                principal.FindFirstValue("first_name"),
                FirstNameFromFull(principal.FindFirstValue("name")));

            var profile = await FetchUserProfileAsync(userId, ct);
            return BuildPrincipal(
                userId,
                FirstNonEmpty(profile.Email, jwtEmail),
                FirstNonEmpty(profile.FirstName, jwtFirst),
                profile.LastName,
                profile.Username);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Clerk JWT validation failed");
            return null;
        }
    }

    private async Task<ClaimsPrincipal?> ValidateSessionViaBackendAsync(string sessionId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_options.SecretKey))
        {
            _logger.LogWarning("Clerk secret key missing; cannot verify opaque session tokens");
            return null;
        }

        try
        {
            var client = _httpClientFactory.CreateClient("clerk-api");
            using var req = new HttpRequestMessage(HttpMethod.Get, $"https://api.clerk.com/v1/sessions/{sessionId}");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.SecretKey);

            using var res = await client.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Clerk session API returned {Status} for {SessionId}", (int)res.StatusCode, sessionId);
                return null;
            }

            await using var stream = await res.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var root = doc.RootElement;
            var status = root.TryGetProperty("status", out var statusEl) ? statusEl.GetString() : null;
            if (!string.Equals(status, "active", StringComparison.OrdinalIgnoreCase))
            {
                _logger.LogWarning("Clerk session {SessionId} status is {Status}", sessionId, status);
                return null;
            }

            var userId = root.TryGetProperty("user_id", out var userEl) ? userEl.GetString() : null;
            if (string.IsNullOrWhiteSpace(userId))
                return null;

            var profile = await FetchUserProfileAsync(userId, ct);
            return BuildPrincipal(userId, profile.Email, profile.FirstName, profile.LastName, profile.Username);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Clerk session API validation failed");
            return null;
        }
    }

    private async Task<(string? Email, string? FirstName, string? LastName, string? Username)> FetchUserProfileAsync(
        string? userId,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(userId) || string.IsNullOrWhiteSpace(_options.SecretKey))
            return default;

        try
        {
            var client = _httpClientFactory.CreateClient("clerk-api");
            using var userReq = new HttpRequestMessage(HttpMethod.Get, $"https://api.clerk.com/v1/users/{userId}");
            userReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.SecretKey);
            using var userRes = await client.SendAsync(userReq, ct);
            if (!userRes.IsSuccessStatusCode)
                return default;

            await using var userStream = await userRes.Content.ReadAsStreamAsync(ct);
            using var userDoc = await JsonDocument.ParseAsync(userStream, cancellationToken: ct);
            var user = userDoc.RootElement;

            string? email = null;
            if (user.TryGetProperty("primary_email_address_id", out var primaryIdEl)
                && user.TryGetProperty("email_addresses", out var emails)
                && emails.ValueKind == JsonValueKind.Array)
            {
                var primaryId = primaryIdEl.GetString();
                foreach (var e in emails.EnumerateArray())
                {
                    if (e.TryGetProperty("id", out var idEl) && idEl.GetString() == primaryId
                        && e.TryGetProperty("email_address", out var addr))
                    {
                        email = addr.GetString();
                        break;
                    }
                }
            }

            var first = user.TryGetProperty("first_name", out var fn) ? fn.GetString() : null;
            var last = user.TryGetProperty("last_name", out var ln) ? ln.GetString() : null;
            var username = user.TryGetProperty("username", out var un) ? un.GetString() : null;
            return (email, first, last, username);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Clerk user profile fetch skipped");
            return default;
        }
    }

    private static ClaimsPrincipal? BuildPrincipal(
        string? userId,
        string? email,
        string? firstName,
        string? lastName,
        string? username)
    {
        if (string.IsNullOrWhiteSpace(userId))
            return null;

        var first = FirstNonEmpty(firstName, FirstNameFromFull(username), FirstNameFromFull(email?.Split('@')[0]));
        var display = FirstNonEmpty(first, "Teammate")!;

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, userId),
            new("sub", userId),
            new(ClaimTypes.Name, display)
        };
        if (!string.IsNullOrWhiteSpace(first) && !IsClerkUserId(first))
            claims.Add(new Claim(ClaimTypes.GivenName, first));
        if (!string.IsNullOrWhiteSpace(lastName))
            claims.Add(new Claim(ClaimTypes.Surname, lastName));
        if (!string.IsNullOrWhiteSpace(email))
            claims.Add(new Claim(ClaimTypes.Email, email));

        return new ClaimsPrincipal(
            new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
    }

    private static bool LooksLikeJwt(string? token) =>
        !string.IsNullOrWhiteSpace(token) && token.Count(c => c == '.') == 2;

    private static bool LooksLikeSessionId(string? token) =>
        !string.IsNullOrWhiteSpace(token)
        && token.StartsWith("sess_", StringComparison.OrdinalIgnoreCase);

    private static bool IsClerkUserId(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && value.StartsWith("user_", StringComparison.OrdinalIgnoreCase);

    private static bool LooksLikeHumanName(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && !IsClerkUserId(value)
        && value.Length <= 80
        && !value.Contains('@', StringComparison.Ordinal);

    private static string? FirstNameFromFull(string? full)
    {
        if (string.IsNullOrWhiteSpace(full) || IsClerkUserId(full))
            return null;
        var trimmed = full.Trim();
        var space = trimmed.IndexOf(' ');
        return space > 0 ? trimmed[..space] : trimmed;
    }

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));

    private bool AzpAllowed(ClaimsPrincipal principal, SecurityToken validated)
    {
        var azp = principal.FindFirstValue("azp");
        if (string.IsNullOrWhiteSpace(azp)
            && validated is JwtSecurityToken jwt
            && jwt.Payload.TryGetValue("azp", out var raw))
            azp = raw?.ToString();
        if (string.IsNullOrWhiteSpace(azp))
            return true;

        azp = azp.Trim().TrimEnd('/');
        if (_authorizedParties.Count == 0)
        {
            _logger.LogWarning("Clerk azp list is empty; accepting token rather than locking users out");
            return true;
        }

        if (_authorizedParties.Contains(azp))
            return true;

        _logger.LogWarning("Clerk JWT azp {Azp} is not an authorized party for this application", azp);
        return false;
    }

    private static HashSet<string> BuildAuthorizedParties(IConfiguration config, ClerkOptions options)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        void add(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return;
            var v = value.Trim().TrimEnd('/');
            if (v.Length > 0)
                set.Add(v);
        }

        add(options.Authority);
        add(FrontendApiFromPublishableKey(options.PublishableKey));

        if (Uri.TryCreate(config["PublicBaseUrl"], UriKind.Absolute, out var pub))
            add(pub.GetLeftPart(UriPartial.Authority));

        add("https://cobec-spark.tail336878.ts.net");
        add("https://cobec-sv-01.tail336878.ts.net");
        add("http://192.168.151.30:5370");
        add("http://localhost:5370");
        add("http://127.0.0.1:5370");

        foreach (var extra in (options.AuthorizedParties ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            add(extra);

        var fromEnv = Environment.GetEnvironmentVariable("CLERK_AUTHORIZED_PARTIES");
        foreach (var extra in (fromEnv ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            add(extra);

        return set;
    }

    private static string? FrontendApiFromPublishableKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key))
            return null;
        var idx = key.IndexOf('_');
        if (idx < 0)
            return null;
        var rest = key[(idx + 1)..];
        var second = rest.IndexOf('_');
        var payload = second >= 0 ? rest[(second + 1)..] : rest;
        if (string.IsNullOrWhiteSpace(payload))
            return null;
        try
        {
            var padded = payload.Replace('-', '+').Replace('_', '/');
            padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(padded)).Split('$')[0].Trim();
            if (string.IsNullOrWhiteSpace(decoded))
                return null;
            return decoded.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? decoded.TrimEnd('/')
                : "https://" + decoded.TrimEnd('/');
        }
        catch
        {
            return null;
        }
    }
}

public sealed class ClerkSessionRequest
{
    public string? Token { get; set; }
    public string? SessionId { get; set; }
    public string? FirstName { get; set; }
}

public static class AuthClaims
{
    public static string? GetUserId(ClaimsPrincipal? user) =>
        user?.FindFirstValue("sub")
        ?? user?.FindFirstValue(ClaimTypes.NameIdentifier);

    public static bool IsSignedIn(ClaimsPrincipal? user) =>
        user?.Identity?.IsAuthenticated == true
        && !string.IsNullOrWhiteSpace(GetUserId(user));

    public static void RequireSignedIn(ClaimsPrincipal? user)
    {
        if (!IsSignedIn(user))
            throw new UnauthorizedAccessException("Not signed in");
    }

    public static string? GetFirstName(ClaimsPrincipal? user)
    {
        var given = user?.FindFirstValue(ClaimTypes.GivenName)?.Trim();
        if (LooksLikeFirstName(given))
            return given;

        var name = user?.Identity?.Name?.Trim();
        if (!LooksLikeFirstName(name))
            return null;
        var space = name!.IndexOf(' ');
        return space > 0 ? name[..space] : name;
    }

    public static string DisplayName(ClaimsPrincipal? user) =>
        GetFirstName(user) ?? "Teammate";

    public static string? GetDisplayName(ClaimsPrincipal? user) => GetFirstName(user);

    private static bool LooksLikeFirstName(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && !value.StartsWith("user_", StringComparison.OrdinalIgnoreCase)
        && !value.Contains('@', StringComparison.Ordinal);
}
