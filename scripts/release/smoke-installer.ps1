param(
  [string]$Installer = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Installer)) {
  $version = (Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json).version
  $installers = @(Get-ChildItem -LiteralPath "release" -Filter "*-Setup-$version.exe" -File)
  if ($installers.Count -ne 1) {
    throw "Expected exactly one installer, found $($installers.Count)"
  }
  $Installer = $installers[0].FullName
}

$temporaryRoot = if ([string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) { $env:TEMP } else { $env:RUNNER_TEMP }
$smokeRoot = Join-Path $temporaryRoot "mist-chronicle-installer-smoke"
$installRoot = Join-Path $smokeRoot "app"
$userData = Join-Path $smokeRoot "user-data"
New-Item -ItemType Directory -Force -Path $installRoot, $userData | Out-Null

$install = Start-Process -FilePath $Installer -ArgumentList @("/S", "/D=$installRoot") -PassThru -Wait
if ($install.ExitCode -ne 0) { throw "Silent installer failed with exit code $($install.ExitCode)" }

$appExe = Get-ChildItem -LiteralPath $installRoot -Filter "MistChronicle.exe" -Recurse -File | Select-Object -First 1
if (-not $appExe) { throw "Installed application executable was not found" }

$env:GMZZ_NO_WINDOW = "1"
$env:GMZZ_USER_DATA = $userData
$process = Start-Process -FilePath $appExe.FullName -PassThru
$log = Join-Path $userData "gmzz-server.log"
$deadline = (Get-Date).AddSeconds(75)
$ready = $false

try {
  while ((Get-Date) -lt $deadline) {
    $process.Refresh()
    if ($process.HasExited) { throw "Installed application exited before becoming ready" }
    if (Test-Path -LiteralPath $log) {
      $content = Get-Content -LiteralPath $log -Raw
      if ($content -match "GMZZ_READY") { $ready = $true; break }
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Installed application did not become ready within 75 seconds" }
  $deployedSeed = Join-Path $userData "rag/index/seed-manifest.json"
  if (-not (Test-Path -LiteralPath $deployedSeed)) { throw "Bundled knowledge seed was not deployed on first launch" }
} finally {
  if (-not $process.HasExited) {
    & taskkill /PID $process.Id /T /F | Out-Null
  }
}

Write-Output "Installer smoke test passed: server ready and knowledge seed deployed."
