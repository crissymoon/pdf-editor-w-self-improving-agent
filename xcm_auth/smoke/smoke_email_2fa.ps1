param(
    [string]$BaseUrl = "http://127.0.0.1:9110",
    [string]$InboxUrl = "http://127.0.0.1:8025",
    [string]$CredentialsPath = (Join-Path $PSScriptRoot "..\dev-credentials.json"),
    [string]$EmailSmokeRoot = (Join-Path $PSScriptRoot "..\..\..\dev-tools\email_smoke"),
    [string]$WorkspaceRoot = (Join-Path $PSScriptRoot "..\..\.."),
    [int]$AuthStartupSeconds = 20,
    [int]$InboxStartupSeconds = 20,
    [int]$CodeWaitSeconds = 15,
    [switch]$SkipNegativeChecks,
    # -CI: structured summary output suitable for CI pipelines
    [switch]$CI,
    # -ResetAfter: clear runtime DB tables automatically after the run
    [switch]$ResetAfter
)

$ErrorActionPreference = 'Stop'

$script:passCount = 0
$script:failCount = 0
$script:startTime = Get-Date

function Register-Pass {
    param([string]$Label)
    $script:passCount++
    Write-Host "[smoke-email-2fa] PASS: $Label"
}

function Register-Fail {
    param([string]$Label)
    $script:failCount++
    Write-Host "[smoke-email-2fa] FAIL: $Label" -ForegroundColor Red
}

function Write-Summary {
    param([bool]$Passed)
    $elapsed = [math]::Round(((Get-Date) - $script:startTime).TotalSeconds, 1)
    $total   = $script:passCount + $script:failCount
    $result  = if ($Passed) { 'PASSED' } else { 'FAILED' }
    $summary = "[$result] $($script:passCount)/$total checks passed  (${elapsed}s)"
    if ($CI) {
        Write-Host "##[section]$summary"
    } else {
        Write-Host ""
        Write-Host "[smoke-email-2fa] $summary"
    }
}

$authRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workspaceRootResolved = (Resolve-Path $WorkspaceRoot).Path
$emailSmokeRootResolved = (Resolve-Path $EmailSmokeRoot).Path
$pythonExe = Join-Path $workspaceRootResolved ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    throw "Python executable not found: $pythonExe"
}

function Invoke-JsonRequest {
    param(
        [string]$Method,
        [string]$Url,
        $Body = $null,
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = 10
    )

    $requestParams = @{
        Uri             = $Url
        Method          = $Method
        Headers         = $Headers
        UseBasicParsing = $true
        TimeoutSec      = $TimeoutSec
    }

    if ($null -ne $Body) {
        $requestParams.ContentType = 'application/json'
        $requestParams.Body = ($Body | ConvertTo-Json -Depth 8)
    }

    try {
        $response = Invoke-WebRequest @requestParams
        $json = $null
        if (-not [string]::IsNullOrWhiteSpace($response.Content)) {
            $json = $response.Content | ConvertFrom-Json
        }
        return [PSCustomObject]@{
            StatusCode = [int]$response.StatusCode
            Json       = $json
            Raw        = $response.Content
        }
    }
    catch {
        $statusCode = 0
        $raw = ''
        if ($_.Exception.Response) {
            try { $statusCode = [int]$_.Exception.Response.StatusCode.value__ } catch { $statusCode = 0 }
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $raw = $reader.ReadToEnd()
                $reader.Dispose()
            } catch {
                $raw = ''
            }
        }

        $json = $null
        if (-not [string]::IsNullOrWhiteSpace($raw)) {
            try { $json = $raw | ConvertFrom-Json } catch { $json = $null }
        }

        return [PSCustomObject]@{
            StatusCode = $statusCode
            Json       = $json
            Raw        = $raw
        }
    }
}

function Test-InboxReady {
    param([string]$Url)
    try {
        $resp = Invoke-JsonRequest -Method 'GET' -Url "$Url/"
        return ($resp.StatusCode -eq 200 -and $resp.Json -and $resp.Json.status -eq 'ok')
    } catch {
        return $false
    }
}

function Test-AuthReady {
    param([string]$Url)
    try {
        $resp = Invoke-JsonRequest -Method 'GET' -Url "$Url/health"
        return ($resp.StatusCode -eq 200 -and $resp.Json -and $resp.Json.ok -eq $true)
    } catch {
        return $false
    }
}

function Wait-Until {
    param(
        [scriptblock]$Condition,
        [int]$TimeoutSeconds,
        [string]$Description
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (& $Condition) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    throw "$Description did not become ready within $TimeoutSeconds seconds"
}

function Start-InboxIfNeeded {
    param([string]$Url)

    if (Test-InboxReady -Url $Url) {
        Write-Host "[smoke-email-2fa] Reusing inbox service at $Url"
        return $null
    }

    Write-Host "[smoke-email-2fa] Starting inbox service from $emailSmokeRootResolved"
    $proc = Start-Process -FilePath 'pwsh' -WorkingDirectory $emailSmokeRootResolved -ArgumentList @(
        '-NoProfile',
        '-Command',
        "& '$pythonExe' run_smoke.py --keep"
    ) -PassThru

    Wait-Until -Condition { Test-InboxReady -Url $Url } -TimeoutSeconds $InboxStartupSeconds -Description "Inbox service"
    return $proc
}

function Start-AuthIfNeeded {
    param([string]$Url)

    if (Test-AuthReady -Url $Url) {
        Write-Host "[smoke-email-2fa] Reusing auth service at $Url"
        return $null
    }

    $uri = [System.Uri]$Url
    $port = $uri.Port
    Write-Host "[smoke-email-2fa] Starting xcm_auth on $Url"

    $cmd = @(
        "`$env:SERVER_ADDR=':$port';"
        "`$env:DB_DRIVER='sqlite';"
        "`$env:DB_DSN='./xcm_auth_dev.db';"
        "`$env:TWOFA_ENABLED='true';"
        "`$env:SMTP_HOST='127.0.0.1';"
        "`$env:SMTP_PORT='1025';"
        "`$env:SMTP_TLS='false';"
        "Remove-Item Env:SMTP_USER -ErrorAction SilentlyContinue;"
        "Remove-Item Env:SMTP_PASS -ErrorAction SilentlyContinue;"
        "`$env:SMTP_FROM='noreply@localhost';"
        "`$env:CORS_ORIGINS='*';"
        "go run ./cmd"
    ) -join ' '

    $proc = Start-Process -FilePath 'pwsh' -WorkingDirectory $authRoot -ArgumentList @(
        '-NoProfile',
        '-Command',
        $cmd
    ) -PassThru

    Wait-Until -Condition { Test-AuthReady -Url $Url } -TimeoutSeconds $AuthStartupSeconds -Description "xcm_auth"
    return $proc
}

function Get-LatestInboxCode {
    param(
        [string]$Url,
        [string]$Email,
        [int]$TimeoutSeconds
    )

    $encoded = [uri]::EscapeDataString($Email)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        $messages = Invoke-JsonRequest -Method 'GET' -Url "$Url/messages?to=$encoded"
        if ($messages.StatusCode -eq 200 -and $messages.Json) {
            $latest = @($messages.Json) | Select-Object -First 1
            if ($latest) {
                $message = Invoke-JsonRequest -Method 'GET' -Url "$Url/message/$($latest.id)"
                if ($message.StatusCode -eq 200 -and $message.Json) {
                    $raw = [string]$message.Json.raw
                    $match = [regex]::Match($raw, '(?m)^\s*(\d{6})\s*$')
                    if ($match.Success) {
                        return [PSCustomObject]@{
                            Code    = $match.Groups[1].Value
                            Subject = [string]$latest.subject
                            Id      = [int]$latest.id
                        }
                    }
                }
            }
        }
        Start-Sleep -Milliseconds 500
    }

    throw "No 6-digit code was captured for $Email within $TimeoutSeconds seconds"
}

function Assert-ResponseFailure {
    param(
        $Response,
        [int[]]$AllowedStatusCodes,
        [string]$Expectation
    )

    if ($AllowedStatusCodes -contains $Response.StatusCode) {
        Register-Pass $Expectation
        return
    }

    $msg = if ($Response.Json -and $Response.Json.message) { [string]$Response.Json.message } else { $Response.Raw }
    Register-Fail $Expectation
    throw "$Expectation failed. status=$($Response.StatusCode) message=$msg"
}

if (-not (Test-Path $CredentialsPath)) {
    throw "Credentials file not found: $CredentialsPath"
}

$creds = Get-Content $CredentialsPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($creds.username) -or [string]::IsNullOrWhiteSpace($creds.email) -or [string]::IsNullOrWhiteSpace($creds.password)) {
    throw "Credentials file must include username, email, and password"
}

$inboxProcess = $null
$authProcess = $null

try {
    $inboxProcess = Start-InboxIfNeeded -Url $InboxUrl
    $clear = Invoke-JsonRequest -Method 'POST' -Url "$InboxUrl/clear"
    Write-Host "[smoke-email-2fa] Inbox cleared: $($clear.Raw)"

    $authProcess = Start-AuthIfNeeded -Url $BaseUrl

    $login = Invoke-JsonRequest -Method 'POST' -Url "$BaseUrl/auth/login" -Body @{
        identifier = [string]$creds.email
        password   = [string]$creds.password
    }

    if ($login.StatusCode -eq 401) {
        $register = Invoke-JsonRequest -Method 'POST' -Url "$BaseUrl/auth/register" -Body @{
            username = [string]$creds.username
            email    = [string]$creds.email
            password = [string]$creds.password
        }
        if ($register.StatusCode -notin @(201, 409)) {
            $msg = if ($register.Json -and $register.Json.message) { [string]$register.Json.message } else { $register.Raw }
            throw "Register failed. status=$($register.StatusCode) message=$msg"
        }

        $login = Invoke-JsonRequest -Method 'POST' -Url "$BaseUrl/auth/login" -Body @{
            identifier = [string]$creds.email
            password   = [string]$creds.password
        }
    }

    if ($login.StatusCode -ne 200 -or -not $login.Json -or $login.Json.ok -ne $true) {
        $msg = if ($login.Json -and $login.Json.message) { [string]$login.Json.message } else { $login.Raw }
        throw "Login failed. status=$($login.StatusCode) message=$msg"
    }

    if (-not $login.Json.data.twofa_required) {
        throw "Login succeeded but did not require 2FA"
    }

    $mail = Get-LatestInboxCode -Url $InboxUrl -Email ([string]$creds.email) -TimeoutSeconds $CodeWaitSeconds
    Write-Host "[smoke-email-2fa] Captured message #$($mail.Id): $($mail.Subject)"

    if (-not $SkipNegativeChecks) {
        $wrongCode = if ($mail.Code -eq '000000') { '999999' } else { '000000' }
        $wrongVerify = Invoke-JsonRequest -Method 'POST' -Url "$BaseUrl/auth/verify-2fa" -Headers @{
            Authorization = "Bearer $([string]$login.Json.data.challenge_token)"
        } -Body @{
            code = $wrongCode
        }
        Assert-ResponseFailure -Response $wrongVerify -AllowedStatusCodes @(401) -Expectation 'Wrong-code verify was rejected'
    }

    $verify = Invoke-JsonRequest -Method 'POST' -Url "$BaseUrl/auth/verify-2fa" -Headers @{
        Authorization = "Bearer $([string]$login.Json.data.challenge_token)"
    } -Body @{
        code = [string]$mail.Code
    }

    if ($verify.StatusCode -ne 200 -or -not $verify.Json -or $verify.Json.ok -ne $true) {
        $msg = if ($verify.Json -and $verify.Json.message) { [string]$verify.Json.message } else { $verify.Raw }
        throw "2FA verify failed. status=$($verify.StatusCode) message=$msg"
    }

    Register-Pass 'Login challenge, email delivery, and verify-2fa all succeeded'
    if ($verify.Json.data -and $verify.Json.data.tokens) {
        Register-Pass 'Token pair issued after 2FA verification'
    }

    if (-not $SkipNegativeChecks) {
        $reuse = Invoke-JsonRequest -Method 'POST' -Url "$BaseUrl/auth/verify-2fa" -Headers @{
            Authorization = "Bearer $([string]$login.Json.data.challenge_token)"
        } -Body @{
            code = [string]$mail.Code
        }
        Assert-ResponseFailure -Response $reuse -AllowedStatusCodes @(400, 401) -Expectation 'Used code could not be reused'
    }

    Write-Summary -Passed $true
    exit 0
}
catch {
    Register-Fail 'Unhandled error'
    Write-Summary -Passed $false
    Write-Host "[smoke-email-2fa] Error: $_" -ForegroundColor Red
    exit 1
}
finally {
    if ($ResetAfter) {
        $resetScript = Join-Path $PSScriptRoot 'reset_dev_state.ps1'
        if (Test-Path $resetScript) {
            Write-Host "[smoke-email-2fa] Running post-run DB reset"
            & $resetScript -ErrorAction SilentlyContinue
        }
    }
    if ($authProcess -and -not $authProcess.HasExited) {
        Write-Host "[smoke-email-2fa] Stopping xcm_auth PID $($authProcess.Id)"
        Stop-Process -Id $authProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($inboxProcess -and -not $inboxProcess.HasExited) {
        Write-Host "[smoke-email-2fa] Stopping inbox service PID $($inboxProcess.Id)"
        Stop-Process -Id $inboxProcess.Id -Force -ErrorAction SilentlyContinue
    }
}