$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvPath = Join-Path $Root ".env"

if (Test-Path $EnvPath) {
    Get-Content $EnvPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $idx = $line.IndexOf("=")
            $key = $line.Substring(0, $idx).Trim()
            $value = $line.Substring($idx + 1).Trim()
            if ($key) {
                if ($key.Equals("PATH", [System.StringComparison]::OrdinalIgnoreCase)) {
                    Set-Item -Path "Env:Path" -Value $value
                } else {
                    Set-Item -Path "Env:$key" -Value $value
                }
            }
        }
    }
}

$backendPort = if ($env:LOCAL_API_PORT) { [int]$env:LOCAL_API_PORT } else { 3001 }
$frontendPort = if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } else { 5500 }
$ports = @($backendPort, $frontendPort)

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $pidToStop = $connection.OwningProcess
        if ($pidToStop -and $pidToStop -ne $PID) {
            Stop-Process -Id $pidToStop -Force
            Write-Host "Stopped process $pidToStop on port $port"
        }
    }
}
