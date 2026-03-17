param(
    [string]$DbPath = (Join-Path $PSScriptRoot "..\xcm_auth_dev.db"),
    [string]$WorkspaceRoot = (Join-Path $PSScriptRoot "..\..\..")
)

$ErrorActionPreference = 'Stop'

$dbResolved = (Resolve-Path $DbPath).Path
$workspaceRootResolved = (Resolve-Path $WorkspaceRoot).Path
$pythonExe = Join-Path $workspaceRootResolved ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    throw "Python executable not found: $pythonExe"
}

$script = @'
import sqlite3
import sys

db_path = sys.argv[1]
conn = sqlite3.connect(db_path)
try:
    cur = conn.cursor()
    statements = [
        "DELETE FROM sessions",
        "DELETE FROM devices",
        "DELETE FROM twofa_codes",
        "DELETE FROM audit_log",
        "DELETE FROM rate_limits",
        "DELETE FROM ip_records",
    ]
    counts = {}
    for sql in statements:
        table = sql.split()[-1]
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        counts[table] = cur.fetchone()[0]
        cur.execute(sql)
    conn.commit()
    for table, count in counts.items():
        print(f"{table}={count}")
finally:
    conn.close()
'@

Write-Host "[reset-dev-state] Cleaning runtime tables in $dbResolved"
& $pythonExe -c $script $dbResolved
if ($LASTEXITCODE -ne 0) {
    throw "Failed to reset dev state"
}
Write-Host "[reset-dev-state] PASS: Runtime tables cleared."