"""Pydantic models for the Radio Show Planner API."""
from models.auth import (
    TeamCreate, TeamResponse,
    UserCreate, UserLogin, UserResponse, UserWithTeamResponse,
    TokenResponse, InviteUserRequest, UpdateUserRoleRequest
)
from models.shows import (
    ShowCreate, ShowUpdate, ShowResponse,
    RundownItemCreate, RundownItemUpdate, RundownItemResponse,
    ReorderRequest, RundownItemWithContentResponse, AttachContentRequest
)
from models.content import (
    ContentItemCreate, ContentItemUpdate, ContentItemResponse,
    ContentPublishStatus, ContentPublishStatusWithImage,
    FeaturedImageResponse
)
from models.wordpress import (
    WordPressSiteCreate, WordPressSiteUpdate, WordPressSiteResponse,
    PublishTarget, PublishToWordPressRequest, PublishResult, PublishResponse,
    WordPressConnectionTestResponse
)
from models.series import (
    ShowSeriesCreate, ShowSeriesUpdate, ShowSeriesResponse,
    ShowOccurrenceCreate, ShowOccurrenceUpdate, ShowOccurrenceResponse,
    RundownResponse, GenerateOccurrencesRequest
)
from models.assignments import (
    ShowAssignmentCreate, ShowAssignmentResponse
)
from models.chat import (
    ChatThreadCreate, ChatThreadResponse,
    ChatMessageCreate, ChatMessageResponse
)
from models.media import (
    MediaAssetResponse, MediaAssetUpdate,
    AttachMediaRequest, ShowMediaResponse, RundownItemMediaResponse
)

__all__ = [
    # Auth
    "TeamCreate", "TeamResponse",
    "UserCreate", "UserLogin", "UserResponse", "UserWithTeamResponse",
    "TokenResponse", "InviteUserRequest", "UpdateUserRoleRequest",
    # Shows
    "ShowCreate", "ShowUpdate", "ShowResponse",
    "RundownItemCreate", "RundownItemUpdate", "RundownItemResponse",
    "ReorderRequest", "RundownItemWithContentResponse", "AttachContentRequest",
    # Content
    "ContentItemCreate", "ContentItemUpdate", "ContentItemResponse",
    "ContentPublishStatus", "ContentPublishStatusWithImage", "FeaturedImageResponse",
    # WordPress
    "WordPressSiteCreate", "WordPressSiteUpdate", "WordPressSiteResponse",
    "PublishTarget", "PublishToWordPressRequest", "PublishResult", "PublishResponse",
    # Series
    "ShowSeriesCreate", "ShowSeriesUpdate", "ShowSeriesResponse",
    "ShowOccurrenceCreate", "ShowOccurrenceUpdate", "ShowOccurrenceResponse",
    "RundownResponse", "GenerateOccurrencesRequest",
    # Assignments
    "ShowAssignmentCreate", "ShowAssignmentResponse",
    # Chat
    "ChatThreadCreate", "ChatThreadResponse",
    "ChatMessageCreate", "ChatMessageResponse",
    # Media
    "MediaAssetResponse", "MediaAssetUpdate",
    "AttachMediaRequest", "ShowMediaResponse", "RundownItemMediaResponse",
]
