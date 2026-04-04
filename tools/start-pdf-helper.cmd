@echo off
setlocal
set "SCRIPT=%~dp0pdf-helper.py"

where py >nul 2>nul
if %errorlevel%==0 (
  start "Resume PDF Helper" py -3 "%SCRIPT%"
) else (
  start "Resume PDF Helper" python "%SCRIPT%"
)
