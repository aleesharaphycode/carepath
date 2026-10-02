from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class FamilyMemberProfile(BaseModel):
    id: str
    patient_id: str
    full_name: str
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    relationship: str
    role: str
    can_view_records: bool
    access_status: str
    is_current_user: bool = False
    created_at: str


class FamilyGroupItem(BaseModel):
    id: str
    name: str
    created_by: str
    is_owner: bool
    members: List[FamilyMemberProfile] = Field(default_factory=list)
    created_at: str


class FamilyDashboardResponse(BaseModel):
    groups: List[FamilyGroupItem] = Field(default_factory=list)
    patient_id: str


class CreateFamilyGroupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100, description="Family group display name")


class AddFamilyMemberRequest(BaseModel):
    family_group_id: str
    full_name: str = Field(min_length=2, max_length=100)
    relationship: str = Field(description="e.g. Spouse, Child, Parent, Sibling, Guardian, Other")
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    target_email: Optional[str] = None
    can_view_records: bool = False


class UpdateFamilyMemberRequest(BaseModel):
    relationship: Optional[str] = None
    can_view_records: Optional[bool] = None
    access_status: Optional[str] = None


class FamilyInvitationItem(BaseModel):
    id: str  # membership_id OR invitation_id
    family_group_id: str
    group_name: str
    inviter_name: str
    relationship: str
    status: str
    created_at: str
    is_registered: bool


class FamilyInvitationsResponse(BaseModel):
    invitations: List[FamilyInvitationItem] = Field(default_factory=list)

