"""Routers initialization."""
from .auth import auth_router
from .teams import teams_router
from .users import users_router
from .shows import shows_router
from .content import content_router
from .wordpress import wordpress_router
from .series import series_router
from .occurrences import occurrences_router
from .chat import chat_router
from .media import media_router

__all__ = [
    "auth_router",
    "teams_router", 
    "users_router",
    "shows_router",
    "content_router",
    "wordpress_router",
    "series_router",
    "occurrences_router",
    "chat_router",
    "media_router",
]
