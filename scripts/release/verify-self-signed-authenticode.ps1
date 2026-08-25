param(
  [Parameter(Mandatory = $true)]
  [string]$File,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedSignerThumbprint,

  [Parameter(Mandatory = $true)]
  [string]$TrustedRootCertificateFile,

  [Parameter(Mandatory = $true)]
  [string]$EvidencePath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($env:OS -ne "Windows_NT") {
  throw "Offline Authenticode verification requires Windows"
}

$resolvedFile = (Resolve-Path -LiteralPath $File).Path
$normalizedThumbprint = ($ExpectedSignerThumbprint -replace "\s", "").ToUpperInvariant()
if ($normalizedThumbprint -notmatch "^[0-9A-F]{40}$") {
  throw "Expected signer thumbprint must be a SHA-1 certificate thumbprint"
}

Write-Host "AUTHENTICODE_PHASE=start file=$([IO.Path]::GetFileName($resolvedFile))"

if (-not ("OfflineAuthenticodeNative" -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;

public static class OfflineAuthenticodeNative
{
    private const uint CERT_QUERY_OBJECT_FILE = 1;
    private const uint CERT_QUERY_CONTENT_FLAG_PKCS7_SIGNED_EMBED = 1u << 10;
    private const uint CERT_QUERY_FORMAT_FLAG_BINARY = 2;
    private const uint CMSG_ENCODED_MESSAGE = 29;
    [DllImport("wintrust.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptCATAdminAcquireContext2(
        out IntPtr catalogAdmin,
        IntPtr subsystem,
        string hashAlgorithm,
        IntPtr strongHashPolicy,
        uint flags);

    [DllImport("wintrust.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptCATAdminCalcHashFromFileHandle2(
        IntPtr catalogAdmin,
        IntPtr fileHandle,
        ref uint hashByteCount,
        [Out] byte[] hash,
        uint flags);

    [DllImport("wintrust.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptCATAdminReleaseContext(IntPtr catalogAdmin, uint flags);

    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptQueryObject(
        uint dwObjectType,
        IntPtr pvObject,
        uint dwExpectedContentTypeFlags,
        uint dwExpectedFormatTypeFlags,
        uint dwFlags,
        out uint pdwMsgAndCertEncodingType,
        out uint pdwContentType,
        out uint pdwFormatType,
        out IntPtr phCertStore,
        out IntPtr phMsg,
        out IntPtr ppvContext);

    [DllImport("crypt32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptMsgGetParam(
        IntPtr hCryptMsg,
        uint dwParamType,
        uint dwIndex,
        [Out] byte[] pvData,
        ref uint pcbData);

    [DllImport("crypt32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptMsgClose(IntPtr hCryptMsg);

    [DllImport("crypt32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CertCloseStore(IntPtr hCertStore, uint dwFlags);

    private static string HashAlgorithmFromOid(string algorithmOid)
    {
        switch (algorithmOid)
        {
            case "1.3.14.3.2.26": return "SHA1";
            case "2.16.840.1.101.3.4.2.1": return "SHA256";
            case "2.16.840.1.101.3.4.2.2": return "SHA384";
            case "2.16.840.1.101.3.4.2.3": return "SHA512";
            default: throw new NotSupportedException("Unsupported Authenticode digest OID: " + algorithmOid);
        }
    }

    public static byte[] ComputeAuthenticodeDigest(string filePath, string algorithmOid)
    {
        IntPtr catalogAdmin;
        if (!CryptCATAdminAcquireContext2(
            out catalogAdmin,
            IntPtr.Zero,
            HashAlgorithmFromOid(algorithmOid),
            IntPtr.Zero,
            0))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "CryptCATAdminAcquireContext2 failed");
        }
        try
        {
            using (var file = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                uint hashByteCount = 0;
                if (!CryptCATAdminCalcHashFromFileHandle2(
                    catalogAdmin,
                    file.SafeFileHandle.DangerousGetHandle(),
                    ref hashByteCount,
                    null,
                    0))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Catalog hash size query failed");
                }
                var hash = new byte[hashByteCount];
                if (!CryptCATAdminCalcHashFromFileHandle2(
                    catalogAdmin,
                    file.SafeFileHandle.DangerousGetHandle(),
                    ref hashByteCount,
                    hash,
                    0))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error(), "Catalog hash calculation failed");
                }
                if (hashByteCount != hash.Length) Array.Resize(ref hash, (int)hashByteCount);
                return hash;
            }
        }
        finally
        {
            CryptCATAdminReleaseContext(catalogAdmin, 0);
        }
    }

    public static byte[] ReadEmbeddedPkcs7(string filePath)
    {
        IntPtr filePathPointer = Marshal.StringToCoTaskMemUni(filePath);
        IntPtr certificateStore = IntPtr.Zero;
        IntPtr message = IntPtr.Zero;
        try
        {
            uint encodingType;
            uint contentType;
            uint formatType;
            IntPtr context;
            bool queried = CryptQueryObject(
                CERT_QUERY_OBJECT_FILE,
                filePathPointer,
                CERT_QUERY_CONTENT_FLAG_PKCS7_SIGNED_EMBED,
                CERT_QUERY_FORMAT_FLAG_BINARY,
                0,
                out encodingType,
                out contentType,
                out formatType,
                out certificateStore,
                out message,
                out context);
            if (!queried)
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CryptQueryObject failed");
            }

            uint byteCount = 0;
            if (!CryptMsgGetParam(message, CMSG_ENCODED_MESSAGE, 0, null, ref byteCount))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CryptMsgGetParam size query failed");
            }
            var encoded = new byte[byteCount];
            if (!CryptMsgGetParam(message, CMSG_ENCODED_MESSAGE, 0, encoded, ref byteCount))
            {
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CryptMsgGetParam read failed");
            }
            if (byteCount != encoded.Length)
            {
                Array.Resize(ref encoded, (int)byteCount);
            }
            return encoded;
        }
        finally
        {
            if (message != IntPtr.Zero) CryptMsgClose(message);
            if (certificateStore != IntPtr.Zero) CertCloseStore(certificateStore, 0);
            Marshal.FreeCoTaskMem(filePathPointer);
        }
    }
}
'@
}

Add-Type -AssemblyName System.Security.Cryptography.Pkcs
Add-Type -AssemblyName System.Formats.Asn1
Write-Host "AUTHENTICODE_PHASE=platform-types-ready"

function Test-CertificateEku {
  param(
    [Parameter(Mandatory = $true)]
    [Security.Cryptography.X509Certificates.X509Certificate2]$Certificate,
    [Parameter(Mandatory = $true)]
    [string]$RequiredOid
  )

  foreach ($extension in $Certificate.Extensions) {
    if ($extension.Oid.Value -ne "2.5.29.37") { continue }
    $eku = [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new(
      $extension,
      $extension.Critical
    )
    if (@($eku.EnhancedKeyUsages | Where-Object { $_.Value -eq $RequiredOid }).Count -gt 0) {
      return $true
    }
  }
  return $false
}

function Get-OfflineCertificateChainEvidence {
  param(
    [Parameter(Mandatory = $true)]
    [Security.Cryptography.X509Certificates.X509Certificate2]$Certificate,
    [Parameter(Mandatory = $true)]
    [string]$RequiredApplicationOid,
    [Parameter(Mandatory = $true)]
    [Security.Cryptography.X509Certificates.X509Certificate2]$TrustedRootCertificate,
    [Security.Cryptography.X509Certificates.X509Certificate2Collection]$ExtraCertificates
  )

  $chain = [Security.Cryptography.X509Certificates.X509Chain]::new()
  try {
    if (-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals(
      $Certificate.RawData,
      $TrustedRootCertificate.RawData
    )) {
      throw "Explicit custom root is not the exact embedded self-signed signer certificate"
    }
    $chain.ChainPolicy.RevocationMode = [Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
    $chain.ChainPolicy.DisableCertificateDownloads = $true
    $chain.ChainPolicy.TrustMode = [Security.Cryptography.X509Certificates.X509ChainTrustMode]::CustomRootTrust
    [void]$chain.ChainPolicy.CustomTrustStore.Add($TrustedRootCertificate)
    [void]$chain.ChainPolicy.ApplicationPolicy.Add([Security.Cryptography.Oid]::new($RequiredApplicationOid))
    if ($null -ne $ExtraCertificates) {
      $chain.ChainPolicy.ExtraStore.AddRange($ExtraCertificates)
    }
    if (-not $chain.Build($Certificate)) {
      $statuses = @($chain.ChainStatus | ForEach-Object { $_.Status.ToString() }) -join ","
      throw "Offline certificate chain validation failed: $statuses"
    }
    $root = $chain.ChainElements[$chain.ChainElements.Count - 1].Certificate
    return [ordered]@{
      rootSubject = $root.Subject
      rootThumbprint = $root.Thumbprint.ToUpperInvariant()
      revocationMode = "NoCheck"
      certificateDownloads = "DISABLED"
      trustMode = "CustomRootTrust"
      trustedRootMatchesSignerCertificate = $true
    }
  } finally {
    $chain.Dispose()
  }
}

$encodedMessage = [OfflineAuthenticodeNative]::ReadEmbeddedPkcs7($resolvedFile)
Write-Host "AUTHENTICODE_PHASE=embedded-pkcs7-read bytes=$($encodedMessage.Length)"
$signedCms = [Security.Cryptography.Pkcs.SignedCms]::new()
$signedCms.Decode($encodedMessage)
$signedCms.CheckSignature($true)
Write-Host "AUTHENTICODE_PHASE=cms-signature-valid"

$indirectDataReader = [Formats.Asn1.AsnReader]::new(
  [ReadOnlyMemory[byte]]::new($signedCms.ContentInfo.Content),
  [Formats.Asn1.AsnEncodingRules]::DER,
  [Formats.Asn1.AsnReaderOptions]::new()
)
$indirectData = $indirectDataReader.ReadSequence()
$fileType = $indirectData.ReadSequence()
[void]$fileType.ReadObjectIdentifier()
while ($fileType.HasData) { [void]$fileType.ReadEncodedValue() }
$digestInfo = $indirectData.ReadSequence()
$digestAlgorithm = $digestInfo.ReadSequence()
$digestAlgorithmOid = $digestAlgorithm.ReadObjectIdentifier()
while ($digestAlgorithm.HasData) { [void]$digestAlgorithm.ReadEncodedValue() }
$embeddedAuthenticodeDigest = $digestInfo.ReadOctetString()
if ($digestInfo.HasData -or $indirectData.HasData -or $indirectDataReader.HasData) {
  throw "Authenticode indirect-data digest is structurally ambiguous"
}
$computedAuthenticodeDigest = [OfflineAuthenticodeNative]::ComputeAuthenticodeDigest(
  $resolvedFile,
  $digestAlgorithmOid
)
if (-not [Security.Cryptography.CryptographicOperations]::FixedTimeEquals(
  $embeddedAuthenticodeDigest,
  $computedAuthenticodeDigest
)) {
  throw "Authenticode PE image digest does not match the embedded signed digest"
}
Write-Host "AUTHENTICODE_PHASE=pe-digest-valid"

$matchingSigners = @(
  $signedCms.SignerInfos |
    Where-Object {
      $null -ne $_.Certificate -and
      $_.Certificate.Thumbprint.ToUpperInvariant() -eq $normalizedThumbprint
    }
)
if ($matchingSigners.Count -ne 1) {
  throw "Expected exactly one embedded signer matching $normalizedThumbprint, found $($matchingSigners.Count)"
}

$signer = $matchingSigners[0]
if (-not (Test-CertificateEku -Certificate $signer.Certificate -RequiredOid "1.3.6.1.5.5.7.3.3")) {
  throw "Embedded signer does not contain the Code Signing EKU"
}
if ($signer.Certificate.HasPrivateKey) {
  throw "Embedded signer unexpectedly exposes a private key"
}
Write-Host "AUTHENTICODE_PHASE=signer-valid thumbprint=$normalizedThumbprint"
$trustedRootCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
  (Resolve-Path -LiteralPath $TrustedRootCertificateFile).Path
)
try {
  if ($trustedRootCertificate.Thumbprint.ToUpperInvariant() -ne $normalizedThumbprint) {
    throw "Trusted root certificate thumbprint does not match the expected signer"
  }
  if ($trustedRootCertificate.HasPrivateKey) {
    throw "Trusted root certificate unexpectedly contains a private key"
  }
  $signerTrustChain = Get-OfflineCertificateChainEvidence `
    -Certificate $signer.Certificate `
    -RequiredApplicationOid "1.3.6.1.5.5.7.3.3" `
    -TrustedRootCertificate $trustedRootCertificate `
    -ExtraCertificates $signedCms.Certificates
} finally {
  $trustedRootCertificate.Dispose()
}
if ($signerTrustChain.rootThumbprint -ne $normalizedThumbprint) {
  throw "Embedded signer does not terminate at the explicitly trusted self-signed certificate"
}
Write-Host "AUTHENTICODE_PHASE=signer-chain-valid"

$timestampAuthorities = @()
foreach ($attribute in $signer.UnsignedAttributes) {
  if ($attribute.Oid.Value -ne "1.3.6.1.4.1.311.3.3.1") { continue }
  foreach ($attributeValue in $attribute.Values) {
    $timestampToken = $null
    $bytesConsumed = 0
    $encodedToken = [ReadOnlyMemory[byte]]::new($attributeValue.RawData)
    if (-not [Security.Cryptography.Pkcs.Rfc3161TimestampToken]::TryDecode(
      $encodedToken,
      [ref]$timestampToken,
      [ref]$bytesConsumed
    ) -or $bytesConsumed -ne $attributeValue.RawData.Length) {
      throw "RFC3161 timestamp token is structurally incomplete"
    }
    $timestampCertificate = $null
    $timestampCms = $timestampToken.AsSignedCms()
    if (-not $timestampToken.VerifySignatureForSignerInfo(
      $signer,
      [ref]$timestampCertificate,
      $timestampCms.Certificates
    )) {
      throw "RFC3161 timestamp token is not bound to the Authenticode signer"
    }
    Write-Host "AUTHENTICODE_PHASE=timestamp-token-bound"
    if (-not (Test-CertificateEku -Certificate $timestampCertificate -RequiredOid "1.3.6.1.5.5.7.3.8")) {
      throw "RFC3161 signer does not contain the Time Stamping EKU"
    }
    # The token signature and its binding to this Authenticode signer are proven above.
    # Public TSA chain trust and revocation are outside this offline self-signed test layer.
    Write-Host "AUTHENTICODE_PHASE=timestamp-token-valid"
    $timestampAuthorities += [ordered]@{
      subject = $timestampCertificate.Subject
      thumbprint = $timestampCertificate.Thumbprint.ToUpperInvariant()
      timestampUtc = $timestampToken.TokenInfo.Timestamp.ToUniversalTime().ToString("o")
    }
  }
}

if ($timestampAuthorities.Count -lt 1) {
  throw "A cryptographically valid RFC3161 timestamp token is required"
}
Write-Host "AUTHENTICODE_PHASE=complete"

$targetEvidenceDirectory = Split-Path -Parent $EvidencePath
if (-not [string]::IsNullOrWhiteSpace($targetEvidenceDirectory)) {
  New-Item -ItemType Directory -Path $targetEvidenceDirectory -Force | Out-Null
}

$item = Get-Item -LiteralPath $resolvedFile
$evidence = [ordered]@{
  schemaVersion = 1
  file = $item.Name
  bytes = $item.Length
  sha256 = (Get-FileHash -LiteralPath $resolvedFile -Algorithm SHA256).Hash.ToLowerInvariant()
  signatureStatus = "Valid"
  signerThumbprint = $signer.Certificate.Thumbprint.ToUpperInvariant()
  signerSubject = $signer.Certificate.Subject
  codeSigningEkuPresent = $true
  embeddedPrivateKey = $false
  timestampPresent = $true
  timestampTokenSignatureValid = $true
  timestampAuthorityChainTrust = "NOT_RUN"
  timestampAuthorities = $timestampAuthorities
  signerTrustChain = $signerTrustChain
  authenticodeDigestAlgorithmOid = $digestAlgorithmOid
  authenticodeDigest = [Convert]::ToHexString($computedAuthenticodeDigest).ToLowerInvariant()
  verificationApi = "CryptCATAdminCalcHashFromFileHandle2 + CryptQueryObject + SignedCms"
  verificationMode = "OFFLINE_PE_DIGEST_CMS_AND_CUSTOM_ROOT_NO_TRUST_NETWORK"
  onlineRevocationCheck = "NOT_RUN"
}

$evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
$evidence | ConvertTo-Json -Depth 8
