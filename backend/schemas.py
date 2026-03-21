from pydantic import BaseModel, EmailStr
from datetime import datetime

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    credits: int
    is_admin: bool
    radar_frequency: str | None = "weekly"
    radar_time: str | None = "03:00"
    radar_email_alerts: bool | None = True

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class AreaBase(BaseModel):
    name: str
    geojson_data: str
    is_monitoring: bool = False

class AreaCreate(AreaBase):
    pass

class UserRadarSettings(BaseModel):
    radar_frequency: str
    radar_time: str
    radar_email_alerts: bool

class AreaUpdateMonitor(BaseModel):
    is_monitoring: bool

class AreaResponse(AreaBase):
    id: int
    user_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class MonitoringHistoryResponse(BaseModel):
    id: int
    area_id: int
    report_text: str
    chart_data_json: str
    embedding: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True
