[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repositoryRoot = $PSScriptRoot
$environmentFile = Join-Path $repositoryRoot ".env"
$backendDirectory = Join-Path $repositoryRoot "backend"
$localCaFile = Join-Path $backendDirectory "local-ca.pem"

if (-not (Test-Path -LiteralPath $environmentFile)) {
    throw "Cannot find $environmentFile"
}

$settings = @{}
Get-Content -LiteralPath $environmentFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
        return
    }

    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
        $name = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")
        $settings[$name] = $value
    }
}

$requiredSettings = @("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION")
foreach ($name in $requiredSettings) {
    if (-not $settings.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($settings[$name])) {
        throw "$name is missing or empty in .env"
    }

    [Environment]::SetEnvironmentVariable($name, $settings[$name], "Process")
}

[Environment]::SetEnvironmentVariable("AWS_DEFAULT_REGION", $settings["AWS_REGION"], "Process")

# Avast HTTPS inspection replaces AWS certificates with its local root.
# Trust the local CA when present instead of disabling TLS validation.
if (Test-Path -LiteralPath $localCaFile) {
    [Environment]::SetEnvironmentVariable("AWS_CA_BUNDLE", $localCaFile, "Process")
    [Environment]::SetEnvironmentVariable("REQUESTS_CA_BUNDLE", $localCaFile, "Process")
}

if ($settings.ContainsKey("AWS_SESSION_TOKEN") -and -not [string]::IsNullOrWhiteSpace($settings["AWS_SESSION_TOKEN"])) {
    [Environment]::SetEnvironmentVariable("AWS_SESSION_TOKEN", $settings["AWS_SESSION_TOKEN"], "Process")
}
elseif ($settings["AWS_ACCESS_KEY_ID"].StartsWith("ASIA")) {
    throw "AWS_SESSION_TOKEN is required for the temporary AWS credentials in .env"
}

$samCommand = Get-Command "sam" -ErrorAction SilentlyContinue
if ($samCommand) {
    $samExecutable = $samCommand.Source
}
else {
    $samExecutable = "C:\Program Files\Amazon\AWSSAMCLI\bin\sam.cmd"
    if (-not (Test-Path -LiteralPath $samExecutable)) {
        throw "AWS SAM CLI is not installed or could not be located"
    }
}

Write-Host "AWS credentials loaded and SAM CLI located."

Push-Location $backendDirectory
try {
    & $samExecutable validate --lint --template-file "template.yaml"
    if ($LASTEXITCODE -ne 0) {
        throw "SAM validation failed with exit code $LASTEXITCODE"
    }

    & $samExecutable build
    if ($LASTEXITCODE -ne 0) {
        throw "SAM build failed with exit code $LASTEXITCODE"
    }

    & $samExecutable deploy --no-confirm-changeset --no-fail-on-empty-changeset --parameter-overrides "FrontendOrigin=https://coursemastery.netlify.app CognitoUserPoolArn=arn:aws:cognito-idp:eu-central-1:672626785669:userpool/eu-central-1_fVi49DC6p"
    if ($LASTEXITCODE -ne 0) {
        throw "SAM deployment failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
