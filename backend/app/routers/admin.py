from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from ..db import get_db
from ..deps import require_role
from .. import models
from ..schemas import DriverCreate, DriverOut, DriverStatsOut, PackageCreate, PackageOut, PackageAssignIn
from ..security import hash_password
from ..utils import next_zero_code

router = APIRouter(prefix="/api/admin", tags=["admin"])

def _pkg_to_out(request: Request, pkg: models.Package) -> PackageOut:
    proofs = []
    for pr in (pkg.proofs or []):
        proofs.append({
            "id": pr.id,
            "proof_type": pr.proof_type.value,
            "url": str(request.base_url).rstrip("/") + f"/uploads/{pr.filename}"
        })
    return PackageOut(
        id=pkg.id,
        code=pkg.code,
        recipient_name=pkg.recipient_name,
        address=pkg.address,
        phone=pkg.phone,
        driver_id=pkg.driver_id,
        status=pkg.status.value,
        pod_notes=pkg.pod_notes,
        non_delivery_reason=pkg.non_delivery_reason,
        closed_at=pkg.closed_at,
        proofs=proofs,
    )

@router.get("/drivers", response_model=list[DriverOut])
def list_drivers(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    return db.query(models.User).filter(models.User.role == models.Role.driver).order_by(models.User.id.desc()).all()

@router.get("/drivers_stats", response_model=list[DriverStatsOut])
def drivers_stats(db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    # counts by driver_id
    delivered = func.sum(case((models.Package.status == models.PackageStatus.delivered, 1), else_=0))
    failed = func.sum(case((models.Package.status == models.PackageStatus.not_delivered, 1), else_=0))
    closed = delivered + failed

    rows = (
        db.query(
            models.User.id,
            models.User.username,
            models.User.full_name,
            func.coalesce(delivered, 0).label("delivered"),
            func.coalesce(failed, 0).label("failed"),
            func.coalesce(closed, 0).label("closed"),
        )
        .outerjoin(models.Package, models.Package.driver_id == models.User.id)
        .filter(models.User.role == models.Role.driver)
        .group_by(models.User.id)
        .order_by(models.User.id.desc())
        .all()
    )
    out = []
    for r in rows:
        closed_n = int(r.closed or 0)
        eff = (float(r.delivered or 0) / closed_n) if closed_n else 0.0
        out.append(DriverStatsOut(
            id=r.id, username=r.username, full_name=r.full_name,
            delivered=int(r.delivered or 0), failed=int(r.failed or 0),
            closed=closed_n, effectiveness=eff
        ))
    return out

@router.post("/drivers", response_model=DriverOut)
def create_driver(payload: DriverCreate, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(400, "Username ya existe")
    d = models.User(
        username=payload.username,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=models.Role.driver
    )
    db.add(d); db.commit(); db.refresh(d)
    return d

@router.post("/packages", response_model=PackageOut)
def create_package(payload: PackageCreate, request: Request, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    driver = db.get(models.User, payload.driver_id)
    if not driver or driver.role != models.Role.driver:
        raise HTTPException(400, "Driver inválido")
    code = next_zero_code(db)
    p = models.Package(
        code=code,
        recipient_name=payload.recipient_name,
        address=payload.address,
        phone=payload.phone or "",
        driver_id=payload.driver_id,
        status=models.PackageStatus.assigned,
    )
    db.add(p); db.commit(); db.refresh(p)
    return _pkg_to_out(request, p)

@router.get("/drivers/{driver_id}/packages", response_model=list[PackageOut])
def driver_packages(driver_id: int, status: str | None = None, request: Request = None, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    driver = db.get(models.User, driver_id)
    if not driver or driver.role != models.Role.driver:
        raise HTTPException(404, "Driver no encontrado")

    q = db.query(models.Package).filter(models.Package.driver_id == driver_id)
    if status:
        s = status.upper()
        if s == "ASSIGNED":
            q = q.filter(models.Package.status == models.PackageStatus.assigned)
        elif s == "DELIVERED":
            q = q.filter(models.Package.status == models.PackageStatus.delivered)
        elif s == "NOT_DELIVERED":
            q = q.filter(models.Package.status == models.PackageStatus.not_delivered)
        else:
            raise HTTPException(400, "status inválido")

    pkgs = q.order_by(models.Package.updated_at.desc()).all()
    return [_pkg_to_out(request, p) for p in pkgs]

@router.post("/packages/assign_by_code", response_model=dict)
def assign_by_code(payload: PackageAssignIn, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    code = payload.code.strip().upper()
    pkg = db.query(models.Package).filter(models.Package.code == code).first()
    if not pkg:
        raise HTTPException(404, "Paquete no encontrado")
    driver = db.get(models.User, payload.driver_id)
    if not driver or driver.role != models.Role.driver:
        raise HTTPException(400, "Driver inválido")
    pkg.driver_id = payload.driver_id
    pkg.status = models.PackageStatus.assigned
    db.commit()
    return {"assigned": code, "driver_id": payload.driver_id}


@router.get("/map_data", response_model=dict)
def map_data(request: Request, db: Session = Depends(get_db), _=Depends(require_role("admin"))):
    """Datos para el mapa admin.

    - drivers: última ubicación conocida (si existe)
    - packages: paquetes con coordenadas capturadas al cerrar (si el navegador permitió GPS)
    """
    # Drivers
    drivers = (
        db.query(models.User)
        .filter(models.User.role == models.Role.driver)
        .order_by(models.User.id.desc())
        .all()
    )
    drivers_out = []
    for d in drivers:
        if d.last_lat is None or d.last_lng is None:
            continue
        drivers_out.append({
            "id": d.id,
            "full_name": d.full_name,
            "username": d.username,
            "lat": d.last_lat,
            "lng": d.last_lng,
            "at": d.last_location_at.isoformat() if d.last_location_at else None,
        })

    # Packages (solo los que tienen coordenadas)
    base = str(request.base_url).rstrip("/")
    pkgs = (
        db.query(models.Package)
        .filter(models.Package.lat.isnot(None), models.Package.lng.isnot(None))
        .order_by(models.Package.updated_at.desc())
        .all()
    )
    packages_out = []
    for p in pkgs:
        packages_out.append({
            "id": p.id,
            "code": p.code,
            "status": p.status.value,
            "recipient_name": p.recipient_name,
            "address": p.address,
            "driver_id": p.driver_id,
            "lat": p.lat,
            "lng": p.lng,
            "at": p.location_at.isoformat() if p.location_at else None,
        })

    return {"drivers": drivers_out, "packages": packages_out}


