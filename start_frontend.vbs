Set WshShell = CreateObject("WScript.Shell")
projectPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c cd /d """ & projectPath & "\frontend"" && npm run dev", 0, False