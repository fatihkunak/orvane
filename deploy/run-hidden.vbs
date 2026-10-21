' Task Scheduler sarmalayıcısı: .cmd'yi pencere açmadan çalıştırır (wscript'in konsolu yok -> pencere flaşı olmaz).
' Kullanım: wscript //nologo run-hidden.vbs "C:\yol\betik.cmd"
Option Explicit
If WScript.Arguments.Count < 1 Then WScript.Quit 1
Dim sh
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c """ & WScript.Arguments(0) & """", 0, False
