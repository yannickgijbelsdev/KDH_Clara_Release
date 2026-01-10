"""Pydantic models for the Radio Show Planner API."""
from .auth import (
    TeamCreate, TeamResponse,
    UserCreate, UserLogin, UserResponse, UserWithTeamResponse,
    TokenResponse, InviteUserRequest, UpdateUserRoleRequest
)
from .shows import (
    ShowCreate, ShowUpdate, ShowResponse,
    RundownItemCreate, RundownItemUpdate, RundownItemResponse,
    ReorderRequest, RundownItemWithContentResponse, AttachContentRequest
)
from .content import (
    ContentItemCreate, ContentItemUpdate, ContentItemResponse,
    ContentPublishStatus, ContentPublishStatusWithImage,
    FeaturedImageResponse
)
from .wordpress import (
    WordPressSiteCreate, WordPressSiteUpdate, WordPressSiteResponse,
    PublishTarget, PublishToWordPressRequest, PublishResult, PublishResponse
)
from .series import (
    ShowSeriesCreate, ShowSeriesUpdate, ShowSeriesResponse,
    ShowOccurrenceCreate, ShowOccurrenceUpdate, ShowOccurrenceResponse,
    RundownResponse, GenerateOccurrencesRequest
)
from .assignments import (
    ShowAssignmentCreate, ShowAssignmentResponse
)
from .chat import (
    ChatThreadCreate, ChatThreadResponse,
    ChatMessageCreate, ChatMessageResponse
)
from .media import (
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
