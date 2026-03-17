param(
    [string]$BaseUrl = "http://127.0.0.1:9100",
    [string]$CredentialsPath = (Join-Path $PSScriptRoot "..\dev-credentials.json")
)

$ErrorActionPreference = 'Stop'

function Invoke-JsonPost {
    param(
        [string]$Url,
        [hashtable]$Body
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -Method Post -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 6) -UseBasicParsing
        $raw = $response.Content
        $statusCode = [int]$response.StatusCode
    }
    catch {
        $statusCode = 0
        $raw = ''

        if ($_.Exception.Response) {
            try {
                $statusCode = [int]$_.Exception.Response.StatusCode
            } catch {
                $statusCode = 0
            }

            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $raw = $reader.ReadToEnd()
                $reader.Dispose()
            } catch {
                $raw = ''
            }
        }
    }

    $json = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        try { $json = $raw | ConvertFrom-Json } catch { $json = $null }
    }

    return [PSCustomObject]@{
        StatusCode = $statusCode
        Json = $json
        Raw = $raw
    }
}

if (-not (Test-Path $CredentialsPath)) {
    throw "Credentials file not found: $CredentialsPath"
}

$creds = Get-Content $CredentialsPath -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($creds.username) -or [string]::IsNullOrWhiteSpace($creds.email) -or [string]::IsNullOrWhiteSpace($creds.password)) {
    throw "Credentials file must include username, email, and password"
}

Write-Host "[smoke] Target: $BaseUrl"
Write-Host "[smoke] User: $($creds.username) / $($creds.email)"

$loginBody = @{
    identifier = [string]$creds.email
    password   = [string]$creds.password
}

$login = Invoke-JsonPost -Url "$BaseUrl/auth/login" -Body $loginBody

if ($login.StatusCode -eq 200 -and $login.Json -and $login.Json.ok -eq $true) {
    $twofa = $false
    if ($login.Json.data -and $null -ne $login.Json.data.twofa_required) {
        $twofa = [bool]$login.Json.data.twofa_required
    }

    if ($twofa) {
        Write-Host "[smoke] PASS: Login accepted and 2FA challenge issued."
    } else {
        Write-Host "[smoke] PASS: Login accepted and session tokens issued."
    }
    exit 0
}

Write-Host "[smoke] Initial login failed with status $($login.StatusCode). Attempting register + login..."

$registerBody = @{
    username = [string]$creds.username
    email    = [string]$creds.email
    password = [string]$creds.password
}

$register = Invoke-JsonPost -Url "$BaseUrl/auth/register" -Body $registerBody

if ($register.StatusCode -notin @(201, 409)) {
    $msg = if ($register.Json -and $register.Json.message) { [string]$register.Json.message } else { "register failed" }
    throw "Register step failed. status=$($register.StatusCode) message=$msg"
}

$login2 = Invoke-JsonPost -Url "$BaseUrl/auth/login" -Body $loginBody
if ($login2.StatusCode -eq 200 -and $login2.Json -and $login2.Json.ok -eq $true) {
    $twofa = $false
    if ($login2.Json.data -and $null -ne $login2.Json.data.twofa_required) {
        $twofa = [bool]$login2.Json.data.twofa_required
    }

    if ($twofa) {
        Write-Host "[smoke] PASS: Register/Login worked with 2FA challenge."
    } else {
        Write-Host "[smoke] PASS: Register/Login worked and tokens were issued."
    }
    exit 0
}

$msg2 = if ($login2.Json -and $login2.Json.message) { [string]$login2.Json.message } else { "login failed" }
throw "Login failed after register. status=$($login2.StatusCode) message=$msg2"
