$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $workspaceRoot ".local-trash\runtime"
$serverPort = 4173
$serverUrl = "http://127.0.0.1:$serverPort/index.html"
$helperUrl = "http://127.0.0.1:8767/health"
$reportPath = Join-Path $runtimeDir "analysis-ui-last-run.json"
$startedServer = $null
$startedHelper = $null

function Test-ServerReady {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (-not (Test-Path (Join-Path $runtimeDir "node_modules\@playwright\test"))) {
  Push-Location $runtimeDir
  try {
    npm install @playwright/test@1.59.1 --no-save | Out-Host
  } finally {
    Pop-Location
  }
}

if (-not (Test-ServerReady -Url $serverUrl)) {
  $startedServer = Start-Process -FilePath "python" -ArgumentList "-m", "http.server", "$serverPort" -WorkingDirectory $workspaceRoot -PassThru
  Start-Sleep -Seconds 2
}

if (-not (Test-ServerReady -Url $helperUrl)) {
  $startedHelper = Start-Process -FilePath "python" -ArgumentList "tools/pdf-helper.py" -WorkingDirectory $workspaceRoot -PassThru
  Start-Sleep -Seconds 2
}

try {
  if (-not (Test-ServerReady -Url $serverUrl)) {
    throw "Local resume app did not start on $serverUrl"
  }

  if (-not (Test-ServerReady -Url $helperUrl)) {
    throw "Local PDF helper did not start on $helperUrl"
  }

  Push-Location $runtimeDir
  try {
    $startedAt = Get-Date
    & npx playwright test analysis-ui.spec.js -c .
    $exitCode = $LASTEXITCODE
    $report = [ordered]@{
      verifiedAt = (Get-Date).ToString("o")
      startedAt = $startedAt.ToString("o")
      workspace = $workspaceRoot
      appUrl = $serverUrl
      helperUrl = $helperUrl
      command = "npx playwright test analysis-ui.spec.js -c ."
      status = $(if ($exitCode -eq 0) { "passed" } else { "failed" })
      exitCode = $exitCode
    }
    $report | ConvertTo-Json | Set-Content -Encoding UTF8 $reportPath
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  } finally {
    Pop-Location
  }
} finally {
  if ($startedHelper -and -not $startedHelper.HasExited) {
    Stop-Process -Id $startedHelper.Id -Force
  }
  if ($startedServer -and -not $startedServer.HasExited) {
    Stop-Process -Id $startedServer.Id -Force
  }
}
