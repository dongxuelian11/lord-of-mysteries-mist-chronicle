[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Add", "Remove", "AssertAbsent")]
  [string]$Action,
  [Parameter(Mandatory = $true)]
  [ValidateSet("Root", "TrustedPublisher")]
  [string]$StoreName,
  [Parameter(Mandatory = $true)]
  [string]$ExpectedThumbprint,
  [string]$CertificateFile
)

$ErrorActionPreference = "Stop"
if (-not $IsWindows) {
  throw "Windows certificate-store management is only available on Windows"
}
$normalizedThumbprint = $ExpectedThumbprint.Replace(" ", "").ToUpperInvariant()
if ($normalizedThumbprint -notmatch "^[0-9A-F]{40}$") {
  throw "Expected signer thumbprint must be a SHA-1 certificate thumbprint"
}

$certificate = $null
$store = $null
$openFlags = if ($Action -eq "AssertAbsent") {
  [Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly
} else {
  [Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite
}

try {
  if ($Action -eq "Add") {
    if ([string]::IsNullOrWhiteSpace($CertificateFile)) {
      throw "CertificateFile is required when Action is Add"
    }
    $resolvedCertificateFile = (Resolve-Path -LiteralPath $CertificateFile).Path
    $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
      $resolvedCertificateFile
    )
    if ($certificate.Thumbprint.ToUpperInvariant() -ne $normalizedThumbprint) {
      throw "Certificate file thumbprint does not match the expected thumbprint"
    }
    if ($certificate.HasPrivateKey) {
      throw "Public test certificate unexpectedly contains a private key"
    }
  }

  $store = [Security.Cryptography.X509Certificates.X509Store]::new(
    $StoreName,
    [Security.Cryptography.X509Certificates.StoreLocation]::CurrentUser
  )
  $store.Open($openFlags)
  $matches = $store.Certificates.Find(
    [Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
    $normalizedThumbprint,
    $false
  )

  switch ($Action) {
    "AssertAbsent" {
      if ($matches.Count -ne 0) {
        throw "Certificate $normalizedThumbprint unexpectedly exists in CurrentUser/$StoreName"
      }
    }
    "Add" {
      if ($matches.Count -ne 0) {
        throw "Certificate $normalizedThumbprint already exists in CurrentUser/$StoreName"
      }
      $store.Add($certificate)
      $added = $store.Certificates.Find(
        [Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
        $normalizedThumbprint,
        $false
      )
      if ($added.Count -ne 1) {
        foreach ($candidate in $added) {
          $store.Remove($candidate)
        }
        throw "Certificate was not added exactly once to CurrentUser/$StoreName"
      }
    }
    "Remove" {
      foreach ($match in $matches) {
        $store.Remove($match)
      }
      $remaining = $store.Certificates.Find(
        [Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
        $normalizedThumbprint,
        $false
      )
      if ($remaining.Count -ne 0) {
        throw "Certificate $normalizedThumbprint remained in CurrentUser/$StoreName"
      }
    }
  }

  [ordered]@{
    action = $Action
    store = "CurrentUser/$StoreName"
    thumbprint = $normalizedThumbprint
    status = "PASS"
  } | ConvertTo-Json -Compress
} finally {
  if ($null -ne $certificate) { $certificate.Dispose() }
  if ($null -ne $store) { $store.Dispose() }
}
