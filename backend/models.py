from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base
import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    credits = Column(Integer, default=5) # Sistema de pedágio do SaaS - 5 grátis
    is_admin = Column(Boolean, default=False)
    radar_frequency = Column(String, default="weekly")
    radar_time = Column(String, default="03:00")
    radar_email_alerts = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    areas = relationship("Area", back_populates="owner")

class Area(Base):
    __tablename__ = "areas"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String, index=True)
    geojson_data = Column(Text) # GeoJSON stringificado
    is_monitoring = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    owner = relationship("User", back_populates="areas")
    history = relationship("MonitoringHistory", back_populates="area", cascade="all, delete-orphan")

class MonitoringHistory(Base):
    __tablename__ = "monitoring_history"

    id = Column(Integer, primary_key=True, index=True)
    area_id = Column(Integer, ForeignKey("areas.id"))
    report_text = Column(Text)
    chart_data_json = Column(Text) # JSON stringificado dos dados do gráfico e eventos
    embedding = Column(Text) # Vetor [x1, x2, ...] stringificado
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    area = relationship("Area", back_populates="history")
