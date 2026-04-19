"""Main Site (Organization) models for multisite architecture."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# Available features that can be enabled per main site
AVAILABLE_FEATURES = [
    # Shows group
    {"id": "shows", "name": "Shows", "group": "shows"},
    {"id": "calendar", "name": "Calendar", "group": "shows"},
    {"id": "show_management", "name": "Show Management", "group": "shows"},
    
    # Content group
    {"id": "content_library", "name": "Content Library", "group": "content"},
    {"id": "media_library", "name": "Media Library", "group": "content"},
    {"id": "content_approval", "name": "Content Approval", "group": "content"},
    {"id": "trash", "name": "Trash", "group": "content"},
    
    # Communication group
    {"id": "team_chat", "name": "Team Chat", "group": "communication"},
    
    # RDS & Streaming group
    {"id": "rds_settings", "name": "RDS Settings", "group": "streaming"},
    {"id": "rds_builder", "name": "RDS Builder", "group": "streaming"},
    {"id": "rds_monitor", "name": "RDS Monitor", "group": "streaming"},
    {"id": "stream_monitor", "name": "Stream Monitor", "group": "streaming"},
    {"id": "call_studio", "name": "Call Studio", "group": "streaming"},
    
    # Sites group (mini sites)
    {"id": "sites", "name": "Sites", "group": "sites"},
    
    # Administration group
    {"id": "team_settings", "name": "Team Settings", "group": "admin"},
    {"id": "firewall", "name": "Firewall", "group": "admin"},
    {"id": "wordpress", "name": "WordPress", "group": "admin"},
    {"id": "activity_logs", "name": "Activity Logs", "group": "admin"},
    
    # Technical group
    {"id": "zerotier", "name": "ZeroTier Monitor", "group": "technical"},

    # Server group
    {"id": "xml_imports", "name": "XML Imports", "group": "server"},
    {"id": "server_api_keys", "name": "API Keys", "group": "server"},
    {"id": "vmix_director", "name": "vMix Director", "group": "server"},
    {"id": "canva_director", "name": "Canva Director", "group": "server"},
    {"id": "radioplayer", "name": "Radioplayer", "group": "server"},
    {"id": "radio_automation", "name": "Radio Automation", "group": "server"},

    # Task management group
    {"id": "task_boards", "name": "Task Boards", "group": "tasks"},

    # WP Security group
    {"id": "wp_security_dashboard", "name": "WP Security Dashboard", "group": "wp_security"},
    {"id": "wp_waf_rules", "name": "WAF Rules", "group": "wp_security"},
    {"id": "wp_ip_blocklist", "name": "IP Blocklist", "group": "wp_security"},
    {"id": "wp_login_protection", "name": "Login Protection", "group": "wp_security"},

    # Code Studio group
    {"id": "code_studio", "name": "Code Studio", "group": "code_studio"},
]


class MainSiteCreate(BaseModel):
    """Model for creating a new main site."""
    name: str
    slug: str  # URL path, e.g., "radiogroep" for /radiogroep
    description: Optional[str] = None
    enabled_features: List[str] = []  # List of feature IDs
    site_type: str = "radio"  # "radio", "technical", "server", or "task_scheduler"
    linked_main_site_id: Optional[str] = None  # For server sites: linked parent main site
    is_demo: bool = False  # Demo sites bypass license requirements
    environment_id: Optional[str] = None  # Assign to specific environment
    require_2fa: bool = False  # Require 2FA for all users of this site
    clara_enterprise: bool = False  # Enable Clara Enterprise features


class MainSiteUpdate(BaseModel):
    """Model for updating a main site."""
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    enabled_features: Optional[List[str]] = None
    linked_main_site_id: Optional[str] = None
    is_demo: Optional[bool] = None
    require_2fa: Optional[bool] = None
    clara_enterprise: Optional[bool] = None


class MainSiteResponse(BaseModel):
    """Model for main site response."""
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    enabled_features: List[str] = []
    site_type: str = "radio"
    linked_main_site_id: Optional[str] = None
    linked_main_site_name: Optional[str] = None
    site_count: int = 0
    user_count: int = 0
    cloned_from: Optional[str] = None
    is_demo: bool = False
    require_2fa: bool = False
    clara_enterprise: bool = False
    environment_id: Optional[str] = None
    environment_name: Optional[str] = None
    environment_color: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class MainSiteListResponse(BaseModel):
    """Simplified response for listing main sites."""
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    logo_url: Optional[str] = None
    enabled_features: List[str] = []
    site_type: str = "radio"
    linked_main_site_id: Optional[str] = None
    linked_main_site_name: Optional[str] = None
    site_count: int = 0
    user_count: int = 0
    cloned_from: Optional[str] = None
    is_demo: bool = False
    require_2fa: bool = False
    environment_id: Optional[str] = None
    environment_name: Optional[str] = None
    environment_color: Optional[str] = None


class MainSiteUserCreate(BaseModel):
    """Model for adding a user to a main site."""
    user_id: str
    role: str = "viewer"  # admin, editor, presenter, viewer


class MainSiteUserUpdate(BaseModel):
    """Model for updating a user's role on a main site."""
    role: str


class MainSiteUserResponse(BaseModel):
    """Model for main site user response."""
    id: str
    main_site_id: str
    user_id: str
    user_name: str
    user_email: str
    role: str
    created_at: str
    avatar_url: Optional[str] = None


class AvailableFeaturesResponse(BaseModel):
    """Response with all available features."""
    features: List[dict]
