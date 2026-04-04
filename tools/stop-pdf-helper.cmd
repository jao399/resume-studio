@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'python' -and $_.CommandLine -match 'pdf-helper.py' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
