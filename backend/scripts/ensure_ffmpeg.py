#!/usr/bin/env python3
"""Ensure ffmpeg is installed for audio processing.

This script checks if ffmpeg is available and attempts to install it
if not present. It's designed to run at application startup.
"""

import subprocess
import shutil
import logging
import sys

logger = logging.getLogger(__name__)


def check_ffmpeg_installed() -> bool:
    """Check if ffmpeg is installed and accessible."""
    return shutil.which("ffmpeg") is not None


def install_ffmpeg() -> bool:
    """Attempt to install ffmpeg using apt-get.
    
    Returns True if installation successful, False otherwise.
    """
    try:
        logger.info("FFmpeg not found. Attempting to install...")
        
        # Update package lists first
        result = subprocess.run(
            ["apt-get", "update"],
            capture_output=True,
            timeout=60
        )
        
        # Install ffmpeg
        result = subprocess.run(
            ["apt-get", "install", "-y", "ffmpeg"],
            capture_output=True,
            timeout=120
        )
        
        if result.returncode == 0:
            logger.info("FFmpeg installed successfully")
            return True
        else:
            logger.error(f"FFmpeg installation failed: {result.stderr.decode()[:500]}")
            return False
            
    except subprocess.TimeoutExpired:
        logger.error("FFmpeg installation timed out")
        return False
    except Exception as e:
        logger.error(f"Error installing ffmpeg: {e}")
        return False


def ensure_ffmpeg() -> bool:
    """Ensure ffmpeg is available, installing if necessary.
    
    Returns True if ffmpeg is available (either already installed or
    successfully installed), False otherwise.
    """
    if check_ffmpeg_installed():
        logger.info("FFmpeg is available")
        return True
    
    # Try to install
    if install_ffmpeg():
        return check_ffmpeg_installed()
    
    return False


# Module-level variable to cache ffmpeg availability
_ffmpeg_available = None


def is_ffmpeg_available() -> bool:
    """Check if ffmpeg is available (cached).
    
    This function caches the result to avoid repeated system calls.
    Call ensure_ffmpeg() first during startup to attempt installation.
    """
    global _ffmpeg_available
    if _ffmpeg_available is None:
        _ffmpeg_available = check_ffmpeg_installed()
    return _ffmpeg_available


def reset_ffmpeg_cache():
    """Reset the ffmpeg availability cache.
    
    Call this after attempting to install ffmpeg.
    """
    global _ffmpeg_available
    _ffmpeg_available = None


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    if ensure_ffmpeg():
        print("FFmpeg is ready")
        sys.exit(0)
    else:
        print("FFmpeg is NOT available")
        sys.exit(1)
