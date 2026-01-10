"""Routers initialization."""
from routers.auth import auth_router
from routers.teams import teams_router
from routers.users import users_router
from routers.shows import shows_router
from routers.content import content_router
from routers.wordpress import wordpress_router
from routers.series import series_router
from routers.occurrences import occurrences_router
from routers.chat import chat_router
from routers.media import media_router

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
