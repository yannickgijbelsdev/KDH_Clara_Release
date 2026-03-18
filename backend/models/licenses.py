"""License management models."""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class LicensePackageCreate(BaseModel):
    """Model for creating a license package."""
    name: str
    slug: str
    description: Optional[str] = None
    features: List[str] = []
    monthly_price: float = 0.0
    yearly_price: float = 0.0
    currency: str = "EUR"
    is_active: bool = True
    sort_order: int = 0


class LicensePackageUpdate(BaseModel):
    """Model for updating a license package."""
    name: Optional[str] = None
    description: Optional[str] = None
    features: Optional[List[str]] = None
    monthly_price: Optional[float] = None
    yearly_price: Optional[float] = None
    currency: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class LicenseAssignmentCreate(BaseModel):
    """Model for assigning a license to a main site."""
    main_site_id: str
    package_id: str
    billing_cycle: str = "monthly"  # monthly, yearly, lifetime
    status: str = "active"
    notes: Optional[str] = None


class LicenseAssignmentUpdate(BaseModel):
    """Model for updating a license assignment."""
    package_id: Optional[str] = None
    billing_cycle: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
