param(
    [int]$Port = 9210,
    [System.IO.FileInfo]$InputFile = (Join-Path $PSScriptRoot "..\dev-credentials.json"),
    [switch]$EnablePromptGuard,
    [string]$PromptGuardUrl = "http://127.0.0.1:8765",
    [switch]$ExpectGuardBlock
)

$ErrorActionPreference = 'Stop'

$authRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$baseUrl = "http://127.0.0.1:$Port"

function Test-Health {
    param([string]$Url)

    try {
        $r = Invoke-RestMethod -Uri "$Url/health" -Method Get -TimeoutSec 2
        if ($null -ne $r.ok) {
            return ($r.ok -eq $true)
        }
        if ($null -ne $r.status) {
            return ($r.status -eq 'ok')
        }
        return $false
    } catch {
        return $false
    }
}

Write-Host "[smoke] Starting xcm_auth on alternate server: $baseUrl"

$guardEnabled = if ($EnablePromptGuard) { 'true' } else { 'false' }
$guardFailOpen = 'true'
$guardStartupHealth = 'false'
if ($EnablePromptGuard -and $ExpectGuardBlock) {
    $guardFailOpen = 'false'
    $guardStartupHealth = 'true'
}
$cmd = @(
    "`$env:SERVER_ADDR=':$Port';"
    "`$env:DB_DRIVER='sqlite';"
    "`$env:DB_DSN='./xcm_auth_dev.db';"
    "`$env:TWOFA_ENABLED='false';"
    "`$env:PROMPT_GUARD_ENABLED='$guardEnabled';"
    "`$env:PROMPT_GUARD_URL='$PromptGuardUrl';"
    "`$env:PROMPT_GUARD_MODE='block';"
    "`$env:PROMPT_GUARD_FAIL_OPEN='$guardFailOpen';"
    "`$env:PROMPT_GUARD_STARTUP_HEALTHCHECK='$guardStartupHealth';"
    "go run ./cmd"
) -join ' '

$server = Start-Process -FilePath 'pwsh' -WorkingDirectory $authRoot -ArgumentList @(
    '-NoExit',
    '-Command',
    $cmd
) -PassThru

try {
    $ok = $false
    for ($i = 0; $i -lt 80; $i++) {
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

    $smokeArgs = @{
        BaseUrl = $baseUrl
        InputFile = $InputFile
    }
    if ($ExpectGuardBlock) {
        $smokeArgs['ExpectGuardBlock'] = $true
    }

    & (Join-Path $PSScriptRoot 'smoke_auth_guard_login.ps1') @smokeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "smoke_auth_guard_login.ps1 failed with exit code $LASTEXITCODE"
    }

    Write-Host "[smoke] COMPLETE: Alternate server auth+guard smoke passed."
}
finally {
    if ($server -and -not $server.HasExited) {
        Write-Host "[smoke] Stopping alternate xcm_auth process PID $($server.Id)"
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    }
}
