# OhmMyGate — static Logic Pages behind a Clerk cookie gate.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY gate/OhmMyGate.csproj ./gate/
RUN dotnet restore ./gate/OhmMyGate.csproj
COPY gate/ ./gate/
# Site content into wwwroot; re-copy gate-owned files last so site js/ does not wipe Clerk.
COPY index.html concept.html curriculum-deep.html ./gate/wwwroot/
COPY css/ ./gate/wwwroot/css/
COPY js/ ./gate/wwwroot/js/
COPY gate/wwwroot/login.html ./gate/wwwroot/login.html
COPY gate/wwwroot/js/clerk-auth.js ./gate/wwwroot/js/clerk-auth.js
RUN dotnet publish ./gate/OhmMyGate.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://0.0.0.0:5370 \
    DOTNET_EnableDiagnostics=0
EXPOSE 5370
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:5370/ohm/api/health || exit 1
ENTRYPOINT ["dotnet", "OhmMyGate.dll"]
