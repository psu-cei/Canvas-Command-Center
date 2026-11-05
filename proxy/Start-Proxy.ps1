# File: proxy/Start-Proxy.ps1
# Starts the local READ ONLY Canvas proxy after checking prerequisites.
# Run from the repository root:   pwsh ./proxy/Start-Proxy.ps1

$ErrorActionPreference = 'Stop'
$proxyDir = $PSScriptRoot

# 1. Node.js 18+ is required (built-in fetch).
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host 'Node.js was not found. Install the LTS version first:' -ForegroundColor Red
    Write-Host '  Windows: winget install OpenJS.NodeJS.LTS'
    Write-Host '  macOS:   brew install node'
    exit 1
}
$major = [int]((node --version).TrimStart('v').Split('.')[0])
if ($major -lt 18) {
    Write-Host "Node.js $(node --version) is too old. Version 18 or newer is required." -ForegroundColor Red
    exit 1
}

# 2. proxy/.env must exist (created from .env.example) unless env vars are set.
$envFile = Join-Path $proxyDir '.env'
if (-not (Test-Path $envFile) -and -not $env:CANVAS_TOKEN) {
    Write-Host 'proxy/.env not found. Create it with:' -ForegroundColor Yellow
    Write-Host '  Copy-Item ./proxy/.env.example ./proxy/.env'
    Write-Host 'then open proxy/.env and fill in CANVAS_BASE_URL and CANVAS_TOKEN.'
    exit 1
}

# 3. Start the proxy (Ctrl+C to stop).
node (Join-Path $proxyDir 'server.js')
