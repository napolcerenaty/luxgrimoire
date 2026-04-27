# restart.ps1 — kills anything on 3000/3001 then starts API + web
param(
  [switch]$ApiOnly,
  [switch]$WebOnly
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

$root = $PSScriptRoot

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

if (-not $ApiOnly) {
  Write-Host "==> Killing :3000 (Web)..."
  Kill-Port 3000
  Start-Sleep -Milliseconds 500
  Write-Host "==> Starting Web..."
  Start-Process -FilePath "node_modules\.bin\next" -ArgumentList "start","--port","3000" `
    -WorkingDirectory "$root\apps\web" -WindowStyle Hidden
}

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "==> Running processes:"
netstat -ano | Select-String ":3000 |:3001 " | Select-String "LISTENING"
Write-Host ""
Write-Host "Done! API: http://localhost:3001  Web: http://localhost:3000"
