param(
  [Parameter(Mandatory = $true)]
  [string]$File,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedSignerThumbprint,

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

if (-not ("OfflineAuthenticodeNative" -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class OfflineAuthenticodeNative
{
    private const uint WTD_UI_NONE = 2;
    private const uint WTD_REVOKE_NONE = 0;
    private const uint WTD_CHOICE_FILE = 1;
    private const uint WTD_STATEACTION_IGNORE = 0;
    private const uint WTD_REVOCATION_CHECK_NONE = 0x10;
    private const uint WTD_CACHE_ONLY_URL_RETRIEVAL = 0x1000;
    private const uint WTD_DISABLE_MD2_MD4 = 0x2000;
    private const uint WTD_UICONTEXT_EXECUTE = 0;

    private const uint CERT_QUERY_OBJECT_FILE = 1;
    private const uint CERT_QUERY_CONTENT_FLAG_PKCS7_SIGNED_EMBED = 1u << 10;
    private const uint CERT_QUERY_FORMAT_FLAG_BINARY = 2;
    private const uint CMSG_ENCODED_MESSAGE = 29;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WINTRUST_FILE_INFO
    {
        public uint cbStruct;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pcwszFilePath;
        public IntPtr hFile;
        public IntPtr pgKnownSubject;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WINTRUST_DATA
    {
        public uint cbStruct;
        public IntPtr pPolicyCallbackData;
        public IntPtr pSIPClientData;
        public uint dwUIChoice;
        public uint fdwRevocationChecks;
        public uint dwUnionChoice;
        public IntPtr pFile;
        public uint dwStateAction;
        public IntPtr hWVTStateData;
        public IntPtr pwszURLReference;
        public uint dwProvFlags;
        public uint dwUIContext;
        public IntPtr pSignatureSettings;
    }

    [DllImport("wintrust.dll", ExactSpelling = true, PreserveSig = true)]
    private static extern int WinVerifyTrust(
        IntPtr hwnd,
        [In] ref Guid pgActionID,
        [In] ref WINTRUST_DATA pWVTData);

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

    public static int VerifyEmbeddedSignatureOffline(string filePath)
    {
        var fileInfo = new WINTRUST_FILE_INFO
        {
            cbStruct = (uint)Marshal.SizeOf(typeof(WINTRUST_FILE_INFO)),
            pcwszFilePath = filePath,
            hFile = IntPtr.Zero,
            pgKnownSubject = IntPtr.Zero
        };

        IntPtr fileInfoPointer = Marshal.AllocCoTaskMem(Marshal.SizeOf(fileInfo));
        try
        {
            Marshal.StructureToPtr(fileInfo, fileInfoPointer, false);
            var trustData = new WINTRUST_DATA
            {
                cbStruct = (uint)Marshal.SizeOf(typeof(WINTRUST_DATA)),
                pPolicyCallbackData = IntPtr.Zero,
                pSIPClientData = IntPtr.Zero,
                dwUIChoice = WTD_UI_NONE,
                fdwRevocationChecks = WTD_REVOKE_NONE,
                dwUnionChoice = WTD_CHOICE_FILE,
                pFile = fileInfoPointer,
                dwStateAction = WTD_STATEACTION_IGNORE,
                hWVTStateData = IntPtr.Zero,
                pwszURLReference = IntPtr.Zero,
                dwProvFlags = WTD_REVOCATION_CHECK_NONE |
                              WTD_CACHE_ONLY_URL_RETRIEVAL |
                              WTD_DISABLE_MD2_MD4,
                dwUIContext = WTD_UICONTEXT_EXECUTE,
                pSignatureSettings = IntPtr.Zero
            };
            var action = new Guid("00AAC56B-CD44-11d0-8CC2-00C04FC295EE");
            return WinVerifyTrust(IntPtr.Zero, ref action, ref trustData);
        }
        finally
        {
            Marshal.DestroyStructure<WINTRUST_FILE_INFO>(fileInfoPointer);
            Marshal.FreeCoTaskMem(fileInfoPointer);
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

$trustResult = [OfflineAuthenticodeNative]::VerifyEmbeddedSignatureOffline($resolvedFile)
if ($trustResult -ne 0) {
  throw "Offline WinVerifyTrust failed for $resolvedFile with HRESULT 0x$($trustResult.ToString('X8'))"
}

$encodedMessage = [OfflineAuthenticodeNative]::ReadEmbeddedPkcs7($resolvedFile)
$signedCms = [Security.Cryptography.Pkcs.SignedCms]::new()
$signedCms.Decode($encodedMessage)
$signedCms.CheckSignature($true)

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
    if (-not (Test-CertificateEku -Certificate $timestampCertificate -RequiredOid "1.3.6.1.5.5.7.3.8")) {
      throw "RFC3161 signer does not contain the Time Stamping EKU"
    }
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
  timestampAuthorities = $timestampAuthorities
  verificationApi = "WinVerifyTrust + CryptQueryObject + SignedCms"
  verificationMode = "OFFLINE_CACHE_ONLY_NO_REVOCATION_NETWORK"
  onlineRevocationCheck = "NOT_RUN"
}

$evidence | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
$evidence | ConvertTo-Json -Depth 8
