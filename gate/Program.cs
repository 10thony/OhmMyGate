using System.Net;
using System.Security.Claims;
using DotNetEnv;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using OhmMyGate.Auth;

var envCandidates = new[]
{
    Path.Combine(Directory.GetCurrentDirectory(), ".env.local"),
    "/secrets/.env.local",
    "/app/.env.local"
};
foreach (var path in envCandidates)
{
    if (File.Exists(path))
        Env.Load(path, LoadOptions.NoClobber());
}

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
{
    ["Clerk:PublishableKey"] = Environment.GetEnvironmentVariable("CLERK_PUBLISHABLE_KEY")
        ?? builder.Configuration["Clerk:PublishableKey"],
    ["Clerk:SecretKey"] = Environment.GetEnvironmentVariable("CLERK_SECRET_KEY")
        ?? Environment.GetEnvironmentVariable("CLERK_PRIVATE_KEY")
        ?? builder.Configuration["Clerk:SecretKey"],
    ["Clerk:Authority"] = Environment.GetEnvironmentVariable("CLERK_ISSUER_DOMAIN")
        ?? builder.Configuration["Clerk:Authority"],
    ["Clerk:JwksUrl"] = Environment.GetEnvironmentVariable("CLERK_JWKS_URL")
        ?? builder.Configuration["Clerk:JwksUrl"],
    ["Clerk:AuthorizedParties"] = Environment.GetEnvironmentVariable("CLERK_AUTHORIZED_PARTIES")
        ?? builder.Configuration["Clerk:AuthorizedParties"],
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor
        | ForwardedHeaders.XForwardedProto
        | ForwardedHeaders.XForwardedHost;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
    options.KnownProxies.Add(IPAddress.Loopback);
    options.KnownProxies.Add(IPAddress.IPv6Loopback);
    options.ForwardLimit = 2;
});

var cookiePath = ResolvePathBase(builder.Configuration);
if (string.IsNullOrEmpty(cookiePath))
    cookiePath = "/";

var authCookieSecure = Uri.TryCreate(builder.Configuration["PublicBaseUrl"], UriKind.Absolute, out var publicBaseUri)
    && publicBaseUri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
    ? CookieSecurePolicy.Always
    : CookieSecurePolicy.SameAsRequest;

var dataDir = builder.Configuration["Data:Directory"] ?? "Data";
if (!Path.IsPathRooted(dataDir))
    dataDir = Path.Combine(builder.Environment.ContentRootPath, dataDir);
Directory.CreateDirectory(dataDir);
var dpKeys = Path.Combine(dataDir, "dp-keys");
Directory.CreateDirectory(dpKeys);
builder.Services.AddDataProtection()
    .SetApplicationName("OhmMyGate")
    .PersistKeysToFileSystem(new DirectoryInfo(dpKeys));

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "ohmmgate_auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.Path = cookiePath;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = authCookieSecure;
        options.ExpireTimeSpan = TimeSpan.FromDays(14);
        options.SlidingExpiration = true;
        options.LoginPath = "/login";
        options.Events.OnRedirectToLogin = ctx =>
        {
            if (ctx.Request.Path.StartsWithSegments("/api"))
            {
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }

            var returnUrl = ctx.Request.PathBase + ctx.Request.Path + ctx.Request.QueryString;
            var login = $"{ctx.Request.PathBase}/login?returnUrl={Uri.EscapeDataString(returnUrl)}";
            ctx.Response.Redirect(login);
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddHttpClient("clerk-api", client =>
{
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("OhmMyGate/1.0");
});
builder.Services.AddSingleton<ClerkTokenValidator>();

var app = builder.Build();

app.UseForwardedHeaders();

var pathBase = ResolvePathBase(app.Configuration);
if (!string.IsNullOrEmpty(pathBase))
    app.UsePathBase(pathBase);

app.Use(async (ctx, next) =>
{
    if (!ctx.Request.IsHttps
        && Uri.TryCreate(ctx.RequestServices.GetRequiredService<IConfiguration>()["PublicBaseUrl"], UriKind.Absolute, out var u)
        && u.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
        && ctx.Request.Host.Host.Equals(u.Host, StringComparison.OrdinalIgnoreCase))
    {
        ctx.Request.Scheme = Uri.UriSchemeHttps;
    }

    await next();
});

app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { ok = true, app = "ohmmgate" }))
    .AllowAnonymous();

app.MapGet("/api/auth/config", (ClerkTokenValidator clerk) => Results.Json(new
{
    publishableKey = clerk.PublishableKey,
    authority = clerk.Authority,
    configured = clerk.IsConfigured
})).AllowAnonymous();

app.MapGet("/api/auth/me", (ClaimsPrincipal user) =>
{
    if (!AuthClaims.IsSignedIn(user))
        return Results.Json(new { signedIn = false });

    return Results.Json(new
    {
        signedIn = true,
        userId = AuthClaims.GetUserId(user),
        name = AuthClaims.GetFirstName(user),
        email = user.FindFirstValue(ClaimTypes.Email)
    });
}).AllowAnonymous();

app.MapPost("/api/auth/clerk", async (HttpContext http, ClerkTokenValidator clerk, ClerkSessionRequest body) =>
{
    if (!clerk.IsConfigured)
        return Results.Problem("Clerk is not configured", statusCode: 500);

    var principal = await clerk.ValidateAsync(body.Token, body.SessionId, body.FirstName);
    if (principal is null)
        return Results.Unauthorized();

    http.Response.Cookies.Delete("ohmmgate_auth", new CookieOptions { Path = "/" });

    await http.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        principal,
        new AuthenticationProperties
        {
            IsPersistent = true,
            ExpiresUtc = DateTimeOffset.UtcNow.AddDays(14)
        });

    return Results.Ok(new
    {
        userId = AuthClaims.GetUserId(principal),
        name = AuthClaims.GetFirstName(principal)
    });
}).AllowAnonymous();

app.MapPost("/api/auth/logout", async (HttpContext http) =>
{
    await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    http.Response.Cookies.Delete("ohmmgate_auth", new CookieOptions { Path = "/" });
    return Results.Ok();
}).AllowAnonymous();

app.MapGet("/login", async (HttpContext http, ClerkTokenValidator clerk) =>
{
    if (AuthClaims.IsSignedIn(http.User))
    {
        var dest = http.Request.Query["returnUrl"].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(dest) || !dest.StartsWith(http.Request.PathBase, StringComparison.Ordinal))
            dest = http.Request.PathBase + "/";
        http.Response.Redirect(dest);
        return;
    }

    http.Response.ContentType = "text/html; charset=utf-8";
    await http.Response.SendFileAsync(Path.Combine(app.Environment.WebRootPath, "login.html"));
}).AllowAnonymous();

app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value ?? "";
    if (IsAnonymousPath(path))
    {
        await next();
        return;
    }

    if (!AuthClaims.IsSignedIn(ctx.User))
    {
        var returnUrl = ctx.Request.PathBase + ctx.Request.Path + ctx.Request.QueryString;
        ctx.Response.Redirect($"{ctx.Request.PathBase}/login?returnUrl={Uri.EscapeDataString(returnUrl)}");
        return;
    }

    await next();
});

var defaultFiles = new DefaultFilesOptions();
defaultFiles.DefaultFileNames.Clear();
defaultFiles.DefaultFileNames.Add("index.html");
app.UseDefaultFiles(defaultFiles);
app.UseStaticFiles();

app.Run();

static string ResolvePathBase(IConfiguration config)
{
    var raw = config["PathBase"]?.Trim();
    if (string.IsNullOrWhiteSpace(raw) || raw == "/")
        return "";
    return raw.StartsWith('/') ? raw.TrimEnd('/') : "/" + raw.TrimEnd('/');
}

static bool IsAnonymousPath(string path)
{
    if (string.IsNullOrEmpty(path) || path == "/")
        return false;
    return path.Equals("/login", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith("/login/", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith("/api/auth/", StringComparison.OrdinalIgnoreCase)
        || path.Equals("/api/health", StringComparison.OrdinalIgnoreCase)
        || path.StartsWith("/js/clerk-auth.js", StringComparison.OrdinalIgnoreCase);
}
