param(
    [int]$Port = 9200,
    [string]$CredentialsPath = (Join-Path $PSScriptRoot "..\dev-credentials.json")
)

$ErrorActionPreference = 'Stop'

$authRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$baseUrl = "http://127.0.0.1:$Port"

function Test-Health {
    param([string]$Url)

    try {
        $r = Invoke-RestMethod -Uri "$Url/health" -Method Get -TimeoutSec 2
        return ($r.ok -eq $true)
    } catch {
        return $false
    }
}

Write-Host "[smoke] Starting xcm_auth on alternate server: $baseUrl"

$cmd = @(
    "`$env:SERVER_ADDR=':$Port';"
    "`$env:DB_DRIVER='sqlite';"
    "`$env:DB_DSN='./xcm_auth_dev.db';"
    "`$env:TWOFA_ENABLED='false';"
    "go run ./cmd"
) -join ' '

$server = Start-Process -FilePath 'pwsh' -WorkingDirectory $authRoot -ArgumentList @(
    '-NoExit',
    '-Command',
    $cmd
) -PassThru

try {
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Milliseconds 500
        if (Test-Health -Url $baseUrl) {
            $ok = $true
            break
        }
    }

    if (-not $ok) {
        throw "xcm_auth did not become healthy at $baseUrl/health"
    }

    Write-Host "[smoke] xcm_auth healthy on $baseUrl"
    & (Join-Path $PSScriptRoot "smoke_login.ps1") -BaseUrl $baseUrl -CredentialsPath $CredentialsPath
    if ($LASTEXITCODE -ne 0) {
        throw "smoke_login.ps1 failed with exit code $LASTEXITCODE"
    }

    Write-Host "[smoke] COMPLETE: Alternate server login smoke passed."
}
finally {
    if ($server -and -not $server.HasExited) {
        Write-Host "[smoke] Stopping alternate xcm_auth process PID $($server.Id)"
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
}
