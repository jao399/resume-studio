param(
  [string]$Page = "index.html",
  [string]$OutputName = "resume-studio-demo-cv.pdf"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..")
$basePdf = Join-Path $root $OutputName
$python = "C:\Users\amgd3\AppData\Local\Programs\Python\Python313\python.exe"
$edgeCandidates = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
)

$browser = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  throw "Edge or Chrome was not found."
}

function Get-AvailablePdfPath {
  param([string]$PreferredPath)

  $directory = Split-Path -Parent $PreferredPath
  $name = [System.IO.Path]::GetFileNameWithoutExtension($PreferredPath)
  $extension = [System.IO.Path]::GetExtension($PreferredPath)

  try {
    $lockProbe = [System.IO.File]::Open($PreferredPath, "OpenOrCreate", "ReadWrite", "None")
    $lockProbe.Close()
    return $PreferredPath
  }
  catch {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    return (Join-Path $directory "$name-$stamp$extension")
  }
}

$pdf = Get-AvailablePdfPath -PreferredPath $basePdf
$server = Start-Process -FilePath $python -ArgumentList "-m", "http.server", "8766", "--bind", "127.0.0.1" -WorkingDirectory $root -PassThru -WindowStyle Hidden

try {
  Start-Sleep -Seconds 2
  & $browser --headless --disable-gpu "--print-to-pdf=$pdf" "http://127.0.0.1:8766/$Page" | Out-Null
  Start-Sleep -Seconds 1
  Write-Output "Saved PDF: $pdf"
  Start-Process $pdf
}
finally {
  if ($server -and -not $server.HasExited) {
    Stop-Process -Id $server.Id -Force
  }
}
