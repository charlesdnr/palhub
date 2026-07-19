# Un tick de sync PalHub : YorkHost -> API Render. Lancé par la tâche PalhubSync.
# Logge une ligne par run dans logs\agent.log (borné à 400 lignes).
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

$logDir = Join-Path $here 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory $logDir | Out-Null }
$log = Join-Path $logDir 'agent.log'

$out = & "$here\.venv\Scripts\palhub-agent.exe" --once --state-file "$here\palhub-agent.state.json" 2>&1
$last = ($out | Select-Object -Last 1)
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
Add-Content -Path $log -Value "$stamp [$LASTEXITCODE] $last"

# borne le log
$lines = Get-Content $log
if ($lines.Count -gt 400) { $lines | Select-Object -Last 400 | Set-Content $log }
