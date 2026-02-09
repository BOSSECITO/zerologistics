from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List

class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=255)

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    full_name: str

class DriverCreate(BaseModel):
    username: str = Field(min_length=2, max_length=120)
    full_name: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=4, max_length=255)

class DriverOut(BaseModel):
    id: int
    username: str
    full_name: str
    class Config:
        from_attributes = True

class DriverStatsOut(BaseModel):
    id: int
    username: str
    full_name: str
    delivered: int
    failed: int
    closed: int
    effectiveness: float  # 0..1
    class Config:
        from_attributes = True

class PackageCreate(BaseModel):
    recipient_name: str = Field(min_length=1, max_length=255)
    address: str = Field(min_length=1, max_length=2000)
    phone: Optional[str] = ""
    driver_id: int

class ProofOut(BaseModel):
    id: int
    proof_type: str
    url: str
    class Config:
        from_attributes = True

class PackageOut(BaseModel):
    id: int
    code: str
    recipient_name: str
    address: str
    phone: str
    driver_id: int
    status: str
    pod_notes: str
    non_delivery_reason: Optional[str]
    closed_at: Optional[datetime]
    proofs: List[ProofOut] = []
    class Config:
        from_attributes = True

class PackageAssignIn(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    driver_id: int

class DriverProgressOut(BaseModel):
    closed: int
    total: int
    fraction: str
