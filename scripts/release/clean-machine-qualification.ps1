param(
  [Parameter(Mandatory = $true)][string]$DeliveryRoot,
  [Parameter(Mandatory = $true)][string]$ExpectedSourceCommit,
  [Parameter(Mandatory = $true)][string]$ExpectedArtifactSha256,
  [Parameter(Mandatory = $true)][long]$ExpectedArtifactBytes,
  [Parameter(Mandatory = $true)][string]$BuildMachineId,
  [Parameter(Mandatory = $true)][string]$SourceRef,
  [string]$EvidenceFile = ""
)

$ErrorActionPreference = "Stop"

if ($ExpectedSourceCommit -notmatch '^[0-9a-fA-F]{40,64}$') {
  throw "ExpectedSourceCommit must be a full Git commit SHA"
}
if ($ExpectedArtifactSha256 -notmatch '^[0-9a-fA-F]{64}$') {
  throw "ExpectedArtifactSha256 must be a SHA-256 digest"
}
if ($ExpectedArtifactBytes -le 0) {
  throw "ExpectedArtifactBytes must be positive"
}
if ([string]::IsNullOrWhiteSpace($BuildMachineId) -or [string]::IsNullOrWhiteSpace($SourceRef)) {
  throw "BuildMachineId and SourceRef are required"
}

$delivery = [IO.Path]::GetFullPath($DeliveryRoot)
if (-not (Test-Path -LiteralPath $delivery -PathType Container)) {
  throw "Transferred delivery root does not exist: $delivery"
}

if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_WORKSPACE)) {
  $checkoutMarker = Join-Path $env:GITHUB_WORKSPACE ".git"
  if (Test-Path -LiteralPath $checkoutMarker) {
    throw "Clean-machine job must not contain a source checkout"
  }
}

$dependencyDirectories = @(Get-ChildItem -LiteralPath $delivery -Directory -Filter "node_modules" -Recurse -ErrorAction SilentlyContinue)
if ($dependencyDirectories.Count -ne 0) {
  throw "Transferred delivery must not contain node_modules"
}

$nodeVersion = (& node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(?<major>\d+)\.') {
  throw "The clean-machine runner does not provide a usable Node.js runtime"
}
if ([int]$Matches.major -lt 22) {
  throw "The clean-machine runner must provide Node.js 22 or newer, received $nodeVersion"
}

$executionMachineId = "$env:COMPUTERNAME|$env:RUNNER_NAME|$env:ImageOS"
if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME) -or $executionMachineId -eq $BuildMachineId) {
  throw "Clean-machine execution identity must differ from the build machine"
}

$releaseRoot = Join-Path $delivery "release"
$installers = @(Get-ChildItem -LiteralPath $releaseRoot -Filter "*-Setup-*.exe" -File)
if ($installers.Count -ne 1) {
  throw "Expected exactly one transferred installer, found $($installers.Count)"
}
$installer = $installers[0]
$provenancePath = Join-Path $releaseRoot "provenance.json"
if (-not (Test-Path -LiteralPath $provenancePath -PathType Leaf)) {
  throw "Transferred provenance.json is missing"
}
$provenance = Get-Content -LiteralPath $provenancePath -Raw | ConvertFrom-Json
$actualSha256 = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$expectedSha256 = $ExpectedArtifactSha256.ToLowerInvariant()

if ($actualSha256 -ne $expectedSha256) {
  throw "Transferred installer SHA-256 does not match Job A output"
}
if ($installer.Length -ne $ExpectedArtifactBytes) {
  throw "Transferred installer byte count does not match Job A output"
}
if ([string]$provenance.sourceCommit -ne $ExpectedSourceCommit) {
  throw "Transferred provenance sourceCommit does not match the exact build commit"
}
if ([string]$provenance.installer.file -ne $installer.Name) {
  throw "Transferred provenance installer filename does not match the artifact"
}
if ([string]$provenance.installer.sha256 -ne $actualSha256) {
  throw "Transferred provenance installer SHA-256 does not match the artifact"
}
if ([long]$provenance.installer.bytes -ne $installer.Length) {
  throw "Transferred provenance installer byte count does not match the artifact"
}

$smoke = Join-Path $delivery "scripts/release/smoke-installer.ps1"
if (-not (Test-Path -LiteralPath $smoke -PathType Leaf)) {
  throw "Transferred installer smoke probe is missing"
}
& $smoke -Installer $installer.FullName
if ($LASTEXITCODE -ne 0) {
  throw "Transferred installer smoke probe failed with exit code $LASTEXITCODE"
}

if ([string]::IsNullOrWhiteSpace($EvidenceFile)) {
  $EvidenceFile = Join-Path $delivery "clean-machine-evidence.json"
}
$observedAt = (Get-Date).ToUniversalTime().ToString("o")
$manifest = [ordered]@{
  schemaVersion = 1
  application = [string]$provenance.application
  generatedAt = $observedAt
  source = [ordered]@{
    commit = $ExpectedSourceCommit
    branch = $SourceRef
    worktreeStatus = "clean"
    machineId = $BuildMachineId
  }
  claims = @(
    [ordered]@{
      id = "release.clean-machine-installer"
      status = "PASS"
      evidenceLevel = "clean-machine"
      summary = "Transferred installer started without a source checkout or dependency installation, deployed its knowledge seed, and qualified SQLite WAL persistence."
      observedAt = $observedAt
      evidence = @(
        [ordered]@{
          type = "artifact"
          path = "release/$($installer.Name)"
          sha256 = $actualSha256
          bytes = $installer.Length
        },
        [ordered]@{
          type = "provenance"
          value = "release/provenance.json"
          artifactSha256 = $actualSha256
          sourceCommit = $ExpectedSourceCommit
        },
        [ordered]@{
          type = "command"
          value = "powershell clean-machine-qualification.ps1 (transferred probe)"
        }
      )
      environment = [ordered]@{
        machineId = $executionMachineId
        sourceCheckout = "ABSENT"
        dependencyInstall = "NOT_RUN"
        artifactTransferVerified = $true
        nodeVersion = $nodeVersion
      }
    }
  )
}

$evidenceParent = Split-Path -Parent $EvidenceFile
if (-not [string]::IsNullOrWhiteSpace($evidenceParent)) {
  New-Item -ItemType Directory -Force -Path $evidenceParent | Out-Null
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $EvidenceFile -Encoding utf8
Write-Output "Clean-machine qualification passed: $EvidenceFile"
