@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0export-pdf.ps1" -Page "arabic.html" -OutputName "resume-studio-demo-cv-ar.pdf"
