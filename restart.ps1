# restart.ps1 — starts Redis (if not running), then API + web
# Use -Stop to just kill API/Web (they run hidden/detached via Start-Process, so there's
# no window or Ctrl+C to stop them with otherwise) without starting anything back up.
param(
  [switch]$ApiOnly,
  [switch]$WebOnly,
  [switch]$RedisOnly,
  [switch]$Stop
)

function Kill-Port($port) {
  $lines = netstat -ano | Select-String ":$port " | Select-String "LISTENING"
  foreach ($line in $lines) {
    $procId = ($line.ToString().Trim() -split '\s+')[-1].Trim()
    if ($procId -match '^\d+$' -and [int]$procId -ne 0) {
      Write-Host "  Stopping PID $procId on :$port"
      Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
    }
  }
}

function Is-PortOpen($port) {
  $conn = netstat -ano | Select-String ":$port " | Select-String "LISTENING"
  return $null -ne $conn
}

$root = $PSScriptRoot

if ($Stop) {
  # Redis is intentionally left running (it's a shared, persistent local service, not
  # tied to this dev session) — only API/Web get stopped, matching what -ApiOnly/-WebOnly
  # would have started.
  if (-not $WebOnly) { Write-Host "==> Stopping API (:3001)..."; Kill-Port 3001 }
  if (-not $ApiOnly) { Write-Host "==> Stopping Web (:3000)..."; Kill-Port 3000 }
  Write-Host "Done!"
  exit 0
}

# ── Redis ─────────────────────────────────────────────────────────────────────
$redisExe = "$env:USERPROFILE\scoop\apps\redis\current\redis-server.exe"
if (Test-Path $redisExe) {
  if (Is-PortOpen 6379) {
    Write-Host "==> Redis already running on :6379 ✓"
  } else {
    Write-Host "==> Starting Redis..."
    Start-Process -FilePath $redisExe -WindowStyle Hidden
    Start-Sleep -Milliseconds 800
    if (Is-PortOpen 6379) {
      Write-Host "    Redis started ✓"
    } else {
      Write-Host "    Redis failed to start — API will run without cache"
    }
  }
} else {
  Write-Host "==> Redis not found (scoop install redis), skipping..."
}

if ($RedisOnly) { exit 0 }

# ── API ───────────────────────────────────────────────────────────────────────
if (-not $WebOnly) {
  Write-Host "==> Killing :3001 (API)..."
  Kill-Port 3001
  Start-Sleep -Milliseconds 500
  Write-Host "==> Starting API..."
  # Load env vars from .env so JWT_SECRET and other secrets are available
  $envFile = "$root\apps\api\.env"
  if (Test-Path $envFile) {
    Get-Content $envFile | Where-Object { $_ -match '^\s*[^#\s]' -and $_ -match '=' } | ForEach-Object {
      $k, $v = $_ -split '=', 2
      [System.Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), 'Process')
    }
  }
  Start-Process -FilePath "node" -ArgumentList "--enable-source-maps","dist/main" `
    -WorkingDirectory "$root\apps\api" -WindowStyle Hidden
}

# ── Web ───────────────────────────────────────────────────────────────────────
if (-not $ApiOnly) {
  Write-Host "==> Killing :3000 (Web)..."
  Kill-Port 3000
  Start-Sleep -Milliseconds 500
  Write-Host "==> Starting Web..."
  Start-Process -FilePath "node_modules\.bin\next" -ArgumentList "dev","--port","3000" `
    -WorkingDirectory "$root\apps\web" -WindowStyle Hidden
}

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "==> Running processes:"
netstat -ano | Select-String ":6379 |:3000 |:3001 " | Select-String "LISTENING"
Write-Host ""
Write-Host "Done!"
Write-Host "  API:   http://localhost:3001"
Write-Host "  Web:   http://localhost:3000"
Write-Host "  Redis: localhost:6379"
