"""Site/Landing Page models."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class FormField(BaseModel):
    """Custom form field configuration."""
    id: str
    label: str
    type: str = "text"  # text, email, tel, textarea, select
    required: bool = False
    options: Optional[List[str]] = None  # For select fields


class SiteCreate(BaseModel):
    """Model for creating a new site."""
    name: str
    slug: str  # URL path, e.g., "radio123" for /radio123
    

class SiteUpdate(BaseModel):
    """Model for updating a site."""
    name: Optional[str] = None
    slug: Optional[str] = None
    
    # Logo
    logo_url: Optional[str] = None
    
    # Header image (shows above audio player if no video)
    header_image_url: Optional[str] = None
    
    # Audio settings
    audio_enabled: Optional[bool] = None
    audio_type: Optional[str] = None  # "stream" or "file"
    audio_url: Optional[str] = None  # Stream URL or uploaded file URL
    audio_format: Optional[str] = None  # "mp3" or "aac"
    
    # Video settings
    video_enabled: Optional[bool] = None
    video_type: Optional[str] = None  # "youtube", "vimeo", "twitch", "hls"
    video_url: Optional[str] = None
    
    # Form settings
    form_enabled: Optional[bool] = None
    form_fields: Optional[List[FormField]] = None
    
    # Password protection
    password_protected: Optional[bool] = None
    password: Optional[str] = None  # Plain password, will be hashed


class SiteResponse(BaseModel):
    """Model for site response."""
    id: str
    team_id: str
    name: str
    slug: str
    logo_url: Optional[str] = None
    
    # Audio
    audio_enabled: bool = False
    audio_type: Optional[str] = None
    audio_url: Optional[str] = None
    audio_format: Optional[str] = None
    
    # Video
    video_enabled: bool = False
    video_type: Optional[str] = None
    video_url: Optional[str] = None
    
    # Form
    form_enabled: bool = False
    form_fields: List[FormField] = []
    
    # Password
    password_protected: bool = False
    
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SitePublicResponse(BaseModel):
    """Public site data (no sensitive info)."""
    name: str
    slug: str
    logo_url: Optional[str] = None
    
    audio_enabled: bool = False
    audio_type: Optional[str] = None
    audio_url: Optional[str] = None
    audio_format: Optional[str] = None
    
    video_enabled: bool = False
    video_type: Optional[str] = None
    video_url: Optional[str] = None
    
    form_enabled: bool = False
    form_fields: List[FormField] = []
    
    password_protected: bool = False


class SiteSubmissionCreate(BaseModel):
    """Model for form submission."""
    name: str
    phone: Optional[str] = None
    message: Optional[str] = None
    custom_fields: Optional[dict] = None


class SiteSubmissionResponse(BaseModel):
    """Model for submission response."""
    id: str
    site_id: str
    name: str
    phone: Optional[str] = None
    message: Optional[str] = None
    custom_fields: Optional[dict] = None
    created_at: str


class SiteUserRole(BaseModel):
    """Model for assigning users to sites."""
    user_id: str
    role: str = "viewer"  # "editor" or "viewer"


class SitePasswordCheck(BaseModel):
    """Model for password verification."""
    password: str
