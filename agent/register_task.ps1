# Enregistre la tâche planifiée PalhubSync (à lancer en administrateur).
$vbs = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'run_agent.vbs'

$action   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbs + '"')
$trigger  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName 'PalhubSync' -Action $action -Trigger $trigger -Settings $settings -Force

Write-Host ''
Write-Host 'Tâche PalhubSync enregistrée (un run toutes les 5 minutes).' -ForegroundColor Green
Write-Host 'Tu peux fermer cette fenêtre.'
pause
