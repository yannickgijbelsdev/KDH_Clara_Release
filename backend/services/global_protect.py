"""Clara Global Protect - File scanning service for upload security.

Scans all files before they reach S3 storage:
1. File extension validation
2. MIME type verification (magic bytes)
3. File size limits
4. Content scanning (malware signatures, embedded scripts, suspicious patterns)
"""

import re
import uuid
import logging
import struct
from datetime import datetime, timezone
from typing import Optional
from database import db

logger = logging.getLogger("global_protect")

# Try python-magic for MIME detection
try:
    import magic
    _magic = magic.Magic(mime=True)
    HAS_MAGIC = True
except Exception:
    HAS_MAGIC = False
    _magic = None


def _now():
    return datetime.now(timezone.utc).isoformat()


# ==================== CONFIGURATION ====================

# Allowed MIME types grouped by category
ALLOWED_MIMES = {
    "image": [
        "image/jpeg", "image/png", "image/gif", "image/webp",
        "image/svg+xml", "image/heic", "image/heif", "image/bmp", "image/tiff",
    ],
    "video": [
        "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
        "video/mpeg", "video/ogg", "video/x-matroska",
    ],
    "audio": [
        "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/m4a",
        "audio/x-m4a", "audio/aac", "audio/flac", "audio/x-wav",
        "audio/webm", "audio/mp4",
    ],
    "document": [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain", "text/csv",
    ],
}

ALL_ALLOWED_MIMES = set()
for mimes in ALLOWED_MIMES.values():
    ALL_ALLOWED_MIMES.update(mimes)

# Blocked extensions (executables, scripts, system files)
BLOCKED_EXTENSIONS = {
    # Executables
    "exe", "msi", "dll", "com", "scr", "pif", "cpl", "sys", "drv",
    # Scripts
    "bat", "cmd", "sh", "bash", "ps1", "psm1", "vbs", "vbe", "js",
    "jse", "wsh", "wsf", "py", "rb", "pl", "php", "cgi",
    # Compiled / bytecode
    "class", "jar", "pyc", "pyo",
    # Archives that can contain executables
    "iso", "img", "dmg",
    # Shortcut / link files
    "lnk", "url", "scf",
    # Registry
    "reg",
    # Macro-enabled Office
    "docm", "xlsm", "pptm", "dotm", "xltm", "potm",
    # Other dangerous
    "hta", "inf", "msp", "mst", "sct", "wsc",
}

# Allowed extensions (whitelist approach)
ALLOWED_EXTENSIONS = {
    # Images
    "jpg", "jpeg", "png", "gif", "webp", "svg", "heic", "heif", "bmp", "tiff", "tif", "ico",
    # Video
    "mp4", "webm", "mov", "avi", "mkv", "mpeg", "mpg", "ogv",
    # Audio
    "mp3", "wav", "ogg", "m4a", "aac", "flac", "wma",
    # Documents
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "rtf",
    # Font
    "woff", "woff2", "ttf", "otf", "eot",
}

# File size limits (in bytes)
SIZE_LIMITS = {
    "image": 15 * 1024 * 1024,      # 15 MB
    "video": 150 * 1024 * 1024,      # 150 MB
    "audio": 100 * 1024 * 1024,      # 100 MB
    "document": 25 * 1024 * 1024,    # 25 MB
    "default": 10 * 1024 * 1024,     # 10 MB
}

# Known malware signatures (magic bytes / hex patterns)
MALWARE_SIGNATURES = [
    # PE executables (Windows)
    (b"MZ", "PE executable (Windows)"),
    # ELF executables (Linux)
    (b"\x7fELF", "ELF executable (Linux)"),
    # Mach-O executables (macOS)
    (b"\xfe\xed\xfa\xce", "Mach-O executable (macOS 32-bit)"),
    (b"\xfe\xed\xfa\xcf", "Mach-O executable (macOS 64-bit)"),
    (b"\xce\xfa\xed\xfe", "Mach-O executable (macOS 32-bit reversed)"),
    (b"\xcf\xfa\xed\xfe", "Mach-O executable (macOS 64-bit reversed)"),
    # Java class files
    (b"\xca\xfe\xba\xbe", "Java class file"),
    # Shell scripts
    (b"#!/bin/sh", "Shell script"),
    (b"#!/bin/bash", "Bash script"),
    (b"#!/usr/bin/env", "Script with env shebang"),
    # PowerShell
    (b"#!/usr/bin/pwsh", "PowerShell script"),
    # Python
    (b"#!/usr/bin/python", "Python script"),
    (b"#!/usr/bin/env python", "Python script"),
]

# Suspicious content patterns (regex on decoded text)
SUSPICIOUS_PATTERNS = [
    (re.compile(rb"<script[\s>]", re.IGNORECASE), "Embedded <script> tag"),
    (re.compile(rb"javascript:", re.IGNORECASE), "JavaScript protocol handler"),
    (re.compile(rb"vbscript:", re.IGNORECASE), "VBScript protocol handler"),
    (re.compile(rb"on(?:error|load|click|mouseover)\s*=", re.IGNORECASE), "Inline event handler"),
    (re.compile(rb"eval\s*\(", re.IGNORECASE), "eval() call detected"),
    (re.compile(rb"document\.(?:cookie|write|exec)", re.IGNORECASE), "DOM manipulation"),
    (re.compile(rb"(?:cmd|powershell|bash)\s+/c\s+", re.IGNORECASE), "Command execution pattern"),
    (re.compile(rb"(?:base64_decode|fromCharCode|atob)\s*\(", re.IGNORECASE), "Encoded payload pattern"),
    (re.compile(rb"(?:EICAR-STANDARD-ANTIVIRUS-TEST-FILE)", re.IGNORECASE), "EICAR test signature"),
]

# Double extension attacks
DOUBLE_EXT_PATTERNS = [
    re.compile(r"\.(?:jpg|png|gif|pdf|doc|mp3|wav)\.(exe|bat|sh|cmd|ps1|vbs|js|php|py|html|hta)$", re.IGNORECASE),
]


# ==================== SCANNER ====================

class ScanResult:
    def __init__(self):
        self.passed = True
        self.threats = []
        self.warnings = []
        self.file_type = None
        self.detected_mime = None
        self.file_size = 0
        self.scan_time_ms = 0

    def fail(self, threat: str):
        self.passed = False
        self.threats.append(threat)

    def warn(self, message: str):
        self.warnings.append(message)

    def to_dict(self):
        return {
            "passed": self.passed,
            "threats": self.threats,
            "warnings": self.warnings,
            "file_type": self.file_type,
            "detected_mime": self.detected_mime,
            "file_size": self.file_size,
        }


async def scan_file(
    file_content: bytes,
    filename: str,
    claimed_content_type: Optional[str] = None,
    main_site_id: Optional[str] = None,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
) -> ScanResult:
    """
    Comprehensive file scan before upload.
    Returns ScanResult with pass/fail and threat details.
    """
    import time
    start = time.monotonic()
    result = ScanResult()
    result.file_size = len(file_content)

    # Get extension
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # 1. Extension validation
    _check_extension(result, filename, ext)

    # 2. MIME type detection and verification
    _check_mime_type(result, file_content, ext, claimed_content_type)

    # 3. File size check
    _check_file_size(result, file_content, ext)

    # 4. Malware signature scan
    _check_malware_signatures(result, file_content)

    # 5. Content pattern scan (for text-like files and SVGs)
    _check_suspicious_patterns(result, file_content, ext, claimed_content_type)

    # 6. Double extension check
    _check_double_extension(result, filename)

    result.scan_time_ms = round((time.monotonic() - start) * 1000, 2)

    # Log scan result
    await _log_scan(result, filename, main_site_id, user_id, user_name)

    if not result.passed:
        logger.warning(f"Global Protect BLOCKED: {filename} — {', '.join(result.threats)}")
    else:
        logger.info(f"Global Protect PASSED: {filename} ({result.detected_mime}, {result.file_size}b)")

    return result


def _check_extension(result: ScanResult, filename: str, ext: str):
    if not ext:
        result.warn("File has no extension")
        return

    if ext in BLOCKED_EXTENSIONS:
        result.fail(f"Blocked file extension: .{ext}")
        return

    if ext not in ALLOWED_EXTENSIONS:
        result.warn(f"Uncommon file extension: .{ext}")


def _check_mime_type(result: ScanResult, content: bytes, ext: str, claimed_mime: Optional[str]):
    detected = None

    # Use python-magic for real MIME detection
    if HAS_MAGIC and _magic and len(content) > 0:
        try:
            detected = _magic.from_buffer(content[:8192])
            result.detected_mime = detected
        except Exception:
            pass

    # Fallback: basic magic byte detection
    if not detected:
        detected = _detect_mime_basic(content)
        result.detected_mime = detected

    # Determine file type category
    if detected:
        for category, mimes in ALLOWED_MIMES.items():
            if detected in mimes:
                result.file_type = category
                break

    # MIME mismatch detection (spoofing)
    if detected and claimed_mime:
        claimed_base = claimed_mime.split("/")[0] if "/" in claimed_mime else ""
        detected_base = detected.split("/")[0] if "/" in detected else ""

        # Flag if claimed category doesn't match detected
        if claimed_base and detected_base and claimed_base != detected_base:
            if detected_base in ("application",) and claimed_base in ("image", "audio", "video"):
                result.fail(f"MIME type mismatch: claimed {claimed_mime} but detected {detected}")
            elif detected in ("application/x-executable", "application/x-dosexec", "application/x-sharedlib"):
                result.fail(f"Executable masquerading as {claimed_mime}")

    # Block known dangerous MIME types
    dangerous_mimes = {
        "application/x-executable", "application/x-dosexec", "application/x-sharedlib",
        "application/x-mach-binary", "application/java-archive", "application/x-java-applet",
        "application/x-msdownload", "application/x-msdos-program",
    }
    if detected in dangerous_mimes:
        result.fail(f"Dangerous file type detected: {detected}")


def _detect_mime_basic(content: bytes) -> Optional[str]:
    """Basic MIME detection from magic bytes."""
    if len(content) < 4:
        return None

    # JPEG
    if content[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    # PNG
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    # GIF
    if content[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    # WebP
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    # PDF
    if content[:5] == b"%PDF-":
        return "application/pdf"
    # MP3
    if content[:3] == b"ID3" or content[:2] == b"\xff\xfb":
        return "audio/mpeg"
    # WAV
    if content[:4] == b"RIFF" and content[8:12] == b"WAVE":
        return "audio/wav"
    # MP4
    if content[4:8] in (b"ftyp", b"moov", b"mdat"):
        return "video/mp4"
    # OGG
    if content[:4] == b"OggS":
        return "audio/ogg"
    # FLAC
    if content[:4] == b"fLaC":
        return "audio/flac"
    # ZIP (also docx, xlsx, pptx)
    if content[:2] == b"PK":
        return "application/zip"
    # SVG
    if b"<svg" in content[:1000]:
        return "image/svg+xml"
    return None


def _check_file_size(result: ScanResult, content: bytes, ext: str):
    size = len(content)
    category = result.file_type or "default"
    limit = SIZE_LIMITS.get(category, SIZE_LIMITS["default"])

    if size > limit:
        limit_mb = limit / (1024 * 1024)
        size_mb = size / (1024 * 1024)
        result.fail(f"File too large: {size_mb:.1f}MB (max {limit_mb:.0f}MB for {category})")

    if size == 0:
        result.fail("Empty file (0 bytes)")


def _check_malware_signatures(result: ScanResult, content: bytes):
    header = content[:64]
    for sig, description in MALWARE_SIGNATURES:
        if header.startswith(sig):
            result.fail(f"Malware signature: {description}")
            return


def _check_suspicious_patterns(result: ScanResult, content: bytes, ext: str, mime: Optional[str]):
    # Only scan text-like files and SVGs for embedded code
    scannable_exts = {"svg", "html", "htm", "xml", "txt", "csv", "rtf"}
    scannable_mimes = {"image/svg+xml", "text/html", "text/xml", "text/plain", "text/csv"}

    should_scan = ext in scannable_exts or (mime and mime in scannable_mimes)

    # Also scan first 4KB of any file for hidden scripts
    scan_data = content if should_scan else content[:4096]

    for pattern, description in SUSPICIOUS_PATTERNS:
        if pattern.search(scan_data):
            if should_scan:
                result.fail(f"Suspicious content: {description}")
            else:
                result.warn(f"Suspicious pattern in header: {description}")
            return


def _check_double_extension(result: ScanResult, filename: str):
    for pattern in DOUBLE_EXT_PATTERNS:
        if pattern.search(filename):
            result.fail(f"Double extension attack detected: {filename}")
            return


async def _log_scan(result: ScanResult, filename: str, main_site_id: Optional[str],
                    user_id: Optional[str], user_name: Optional[str]):
    """Log scan result to database."""
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "filename": filename,
            "file_size": result.file_size,
            "file_type": result.file_type,
            "detected_mime": result.detected_mime,
            "passed": result.passed,
            "threats": result.threats,
            "warnings": result.warnings,
            "scan_time_ms": result.scan_time_ms,
            "main_site_id": main_site_id,
            "user_id": user_id,
            "user_name": user_name or "",
            "scanned_at": _now(),
            "action": "allowed" if result.passed else "blocked",
        }
        await db.global_protect_logs.insert_one({**doc})
    except Exception as e:
        logger.error(f"Failed to log scan result: {e}")


# ==================== CONVENIENCE ====================

async def check_and_raise(
    file_content: bytes,
    filename: str,
    content_type: Optional[str] = None,
    main_site_id: Optional[str] = None,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
):
    """Scan file and raise HTTPException if blocked."""
    from fastapi import HTTPException

    result = await scan_file(
        file_content, filename, content_type,
        main_site_id, user_id, user_name,
    )

    if not result.passed:
        threat_summary = "; ".join(result.threats)
        raise HTTPException(
            status_code=403,
            detail=f"Blocked by Clara Global Protect: {threat_summary}"
        )

    return result
