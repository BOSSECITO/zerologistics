import enum
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Enum, ForeignKey, Text, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base

class Role(str, enum.Enum):
    admin = "admin"
    driver = "driver"

class PackageStatus(str, enum.Enum):
    assigned = "ASSIGNED"          # pendiente (en driver)
    delivered = "DELIVERED"        # exitoso
    not_delivered = "NOT_DELIVERED"# fallido

class ProofType(str, enum.Enum):
    delivered = "DELIVERED"
    not_delivered = "NOT_DELIVERED"

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # ✅ Última ubicación conocida del repartidor (para mapa admin)
    last_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_location_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    packages: Mapped[list["Package"]] = relationship(back_populates="driver")

class Package(Base):
    __tablename__ = "packages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)  # ZERO0001
    recipient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[str] = mapped_column(String(60), default="", nullable=False)

    driver_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    status: Mapped[PackageStatus] = mapped_column(Enum(PackageStatus), default=PackageStatus.assigned, nullable=False)

    pod_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)  # NOT NULL
    non_delivery_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # ✅ Coordenadas capturadas al cerrar (si el navegador dio permiso)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    driver: Mapped["User"] = relationship(back_populates="packages")
    proofs: Mapped[list["ProofImage"]] = relationship(back_populates="package", cascade="all,delete-orphan")

class ProofImage(Base):
    __tablename__ = "proof_images"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    package_id: Mapped[int] = mapped_column(Integer, ForeignKey("packages.id"), nullable=False)
    proof_type: Mapped[ProofType] = mapped_column(Enum(ProofType), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)  # stored file name only

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    package: Mapped["Package"] = relationship(back_populates="proofs")
