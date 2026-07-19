' Lance run_agent.ps1 sans fenêtre (pour la tâche planifiée PalhubSync)
Set shell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & scriptDir & "\run_agent.ps1""", 0, False
