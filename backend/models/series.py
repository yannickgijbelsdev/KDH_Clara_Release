"""Show series and occurrence models."""
from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Literal


class ShowSeriesCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    default_start_time: str
    default_end_time: str
    recurrence_rule: Optional[str] = None
    is_active: bool = True
    recurrence_type: Optional[Literal["none", "weekly"]] = "weekly"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    interval_weeks: Optional[int] = 1
    days_of_week: Optional[List[int]] = None


class ShowSeriesUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    default_start_time: Optional[str] = None
    default_end_time: Optional[str] = None
    recurrence_rule: Optional[str] = None
    is_active: Optional[bool] = None
    recurrence_type: Optional[Literal["none", "weekly"]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    interval_weeks: Optional[int] = None
    days_of_week: Optional[List[int]] = None


class ShowSeriesResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: Optional[str] = None
    title: str
    description: str
    default_start_time: str
    default_end_time: str
    recurrence_rule: Optional[str] = None
    is_active: bool
    created_by: str
    created_at: str
    updated_at: str
    recurrence_type: Optional[str] = "weekly"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    interval_weeks: Optional[int] = 1
    days_of_week: Optional[List[int]] = None


class ShowOccurrenceCreate(BaseModel):
    show_series_id: Optional[str] = None
    title: str
    date: str
    start_time: str
    end_time: str
    status: Literal["draft", "scheduled", "completed"] = "draft"


class ShowOccurrenceUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[Literal["draft", "scheduled", "completed"]] = None


class ShowOccurrenceResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    team_id: Optional[str] = None
    show_series_id: Optional[str] = None
    title: str
    date: str
    start_time: str
    end_time: str
    status: str
    rundown_id: Optional[str] = None
    created_at: str
    updated_at: str


class RundownResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    occurrence_id: str
    created_at: str
    updated_at: str


class GenerateOccurrencesRequest(BaseModel):
    weeks_ahead: int = 8
