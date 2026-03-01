"""Two-Factor Authentication service using TOTP."""
import pyotp
import qrcode
import io
import base64
import secrets
import string
from typing import Optional, List, Tuple

# App name shown in authenticator apps
APP_NAME = "Clara Global Protect"


def generate_totp_secret() -> str:
    """Generate a new TOTP secret key."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str) -> str:
    """Get the provisioning URI for QR code generation."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=APP_NAME)


def generate_qr_code_base64(secret: str, email: str) -> str:
    """Generate a QR code as base64 encoded PNG."""
    uri = get_totp_uri(secret, email)
    
    # Create QR code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(uri)
    qr.make(fit=True)
    
    # Create image
    img = qr.make_image(fill_color="black", back_color="white")
    
    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)
    
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def verify_totp(secret: str, code: str) -> bool:
    """Verify a TOTP code.
    
    Args:
        secret: The user's TOTP secret
        code: The 6-digit code to verify
        
    Returns:
        True if the code is valid, False otherwise
    """
    if not secret or not code:
        return False
    
    # Remove any spaces from the code
    code = code.replace(" ", "").replace("-", "")
    
    # Verify with a window of 1 (allows for slight time drift)
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def generate_backup_codes(count: int = 10) -> List[str]:
    """Generate a list of backup codes.
    
    Backup codes are 8-character alphanumeric strings that can be used
    once each to bypass 2FA if the user loses access to their authenticator.
    
    Args:
        count: Number of backup codes to generate
        
    Returns:
        List of backup codes
    """
    alphabet = string.ascii_uppercase + string.digits
    # Remove ambiguous characters (0, O, I, 1, L)
    alphabet = alphabet.replace('0', '').replace('O', '').replace('I', '').replace('1', '').replace('L', '')
    
    codes = []
    for _ in range(count):
        # Generate 8-character code in format XXXX-XXXX
        code = ''.join(secrets.choice(alphabet) for _ in range(8))
        formatted = f"{code[:4]}-{code[4:]}"
        codes.append(formatted)
    
    return codes


def hash_backup_code(code: str) -> str:
    """Hash a backup code for storage.
    
    We store hashed versions of backup codes so they can't be stolen from the database.
    """
    import hashlib
    # Normalize the code (remove dashes, uppercase)
    normalized = code.replace("-", "").upper()
    return hashlib.sha256(normalized.encode()).hexdigest()


def verify_backup_code(code: str, hashed_codes: List[str]) -> Tuple[bool, Optional[str]]:
    """Verify a backup code against a list of hashed codes.
    
    Args:
        code: The backup code to verify
        hashed_codes: List of hashed backup codes
        
    Returns:
        Tuple of (is_valid, matched_hash) - matched_hash is used to remove the used code
    """
    if not code or not hashed_codes:
        return False, None
    
    hashed = hash_backup_code(code)
    
    if hashed in hashed_codes:
        return True, hashed
    
    return False, None
