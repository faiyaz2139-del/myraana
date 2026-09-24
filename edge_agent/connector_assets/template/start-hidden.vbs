' Print2Go Connector - hidden launcher (no console window)
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = here
' Run the connector fully hidden (window style 0), do not wait.
sh.Run """" & here & "\runtime\python.exe"" """ & here & "\agent.py""", 0, False
