$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$EnvPath = Join-Path $Root ".env"

if (-not (Test-Path $EnvPath)) {
    throw "Missing .env at $EnvPath"
}

Get-Content $EnvPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $idx = $line.IndexOf("=")
        $key = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim()
        if ($key) {
            # Windows env names are case-insensitive; avoid duplicate PATH/Path entries.
            if ($key.Equals("PATH", [System.StringComparison]::OrdinalIgnoreCase)) {
                Set-Item -Path "Env:Path" -Value $value
            } else {
                Set-Item -Path "Env:$key" -Value $value
            }
        }
    }
}

$FrontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "5500" }
$BackendPort = if ($env:LOCAL_API_PORT) { $env:LOCAL_API_PORT } else { "3001" }

$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    throw "Node.js is not available in PATH. Install Node.js or add it to PATH, then retry."
}

$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    throw "Python is not available in PATH. Install Python or add it to PATH, then retry."
}

foreach ($port in @($BackendPort, $FrontendPort)) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        throw "Port $port is already in use by process $($listener.OwningProcess). Run .\stop-dev.ps1 first or change the port in .env."
    }
}

if (-not (Test-Path (Join-Path $BackendDir "node_modules"))) {
    Push-Location $BackendDir
    try {
        cmd /c npm install
    } finally {
        Pop-Location
    }
}

$BackendOut = Join-Path $BackendDir "local-api.out.log"
$BackendErr = Join-Path $BackendDir "local-api.err.log"
$FrontendOut = Join-Path $FrontendDir "frontend.out.log"
$FrontendErr = Join-Path $FrontendDir "frontend.err.log"

Remove-Item $BackendOut, $BackendErr, $FrontendOut, $FrontendErr -ErrorAction SilentlyContinue

$Backend = Start-Process -FilePath $NodeCmd.Source -ArgumentList "local-api.js" -WorkingDirectory $BackendDir -WindowStyle Hidden -RedirectStandardOutput $BackendOut -RedirectStandardError $BackendErr -PassThru
$Frontend = Start-Process -FilePath $PythonCmd.Source -ArgumentList "-m", "http.server", $FrontendPort -WorkingDirectory $FrontendDir -WindowStyle Hidden -RedirectStandardOutput $FrontendOut -RedirectStandardError $FrontendErr -PassThru

Start-Sleep -Seconds 2

Write-Host "Backend:  http://127.0.0.1:$BackendPort  pid=$($Backend.Id)"
Write-Host "Frontend: http://127.0.0.1:$FrontendPort/index.html  pid=$($Frontend.Id)"
Write-Host "Logs:     backend/local-api.*.log and frontend/frontend.*.log"
