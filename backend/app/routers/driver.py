import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..sse import broadcaster  # ✅ SSE broadcaster

from ..db import get_db
from ..deps import require_role
from .. import models
from ..schemas import PackageOut, DriverProgressOut
from ..settings import settings

router = APIRouter(prefix="/api/driver", tags=["driver"])

class LocationIn(BaseModel):
    lat: float
    lng: float

NON_DELIVERY_REASONS = [
    "Dirección incorrecta / incompleta",
    "Cliente no contactable",
    "Cliente no se encuentra",
    "Inaccesible",
    "Cliente solicita reprogramación",
    "Paquete fuera de ruta",
    "Paquete fuera de zona",
    "Revisión",
]

def _ensure_upload_dir():
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

def _pkg_out(request: Request, pkg: models.Package) -> PackageOut:
    base = str(request.base_url).rstrip("/")
    proofs = [{"id": pr.id, "proof_type": pr.proof_type.value, "url": f"{base}/uploads/{pr.filename}"} for pr in (pkg.proofs or [])]
    return PackageOut(
        id=pkg.id, code=pkg.code, recipient_name=pkg.recipient_name, address=pkg.address, phone=pkg.phone,
        driver_id=pkg.driver_id, status=pkg.status.value, pod_notes=pkg.pod_notes,
        non_delivery_reason=pkg.non_delivery_reason, closed_at=pkg.closed_at, proofs=proofs
    )

@router.get("/reasons", response_model=list[str])
def reasons(user=Depends(require_role("driver"))):
    return NON_DELIVERY_REASONS

@router.get("/packages", response_model=list[PackageOut])
def my_packages(request: Request, db: Session = Depends(get_db), user=Depends(require_role("driver"))):
    pkgs = db.query(models.Package).filter(models.Package.driver_id == user.id).order_by(models.Package.updated_at.desc()).all()
    return [_pkg_out(request, p) for p in pkgs]

@router.get("/packages/{package_id}", response_model=PackageOut)
def package_detail(package_id: int, request: Request, db: Session = Depends(get_db), user=Depends(require_role("driver"))):
    pkg = db.get(models.Package, package_id)
    if not pkg or pkg.driver_id != user.id:
        raise HTTPException(404, "Paquete no encontrado")
    return _pkg_out(request, pkg)

@router.get("/progress", response_model=DriverProgressOut)
def progress(db: Session = Depends(get_db), user=Depends(require_role("driver"))):
    pkgs = db.query(models.Package).filter(models.Package.driver_id == user.id).all()
    total = len(pkgs)
    closed = sum(1 for p in pkgs if p.status in (models.PackageStatus.delivered, models.PackageStatus.not_delivered))
    return DriverProgressOut(closed=closed, total=total, fraction=f"{closed}/{total}")


@router.post("/location", response_model=dict)
async def update_location(
    payload: LocationIn,
    user=Depends(require_role("driver")),
    db: Session = Depends(get_db),
):
    """Guarda última ubicación del driver (para mapa en admin)."""
    user.last_lat = float(payload.lat)
    user.last_lng = float(payload.lng)
    user.last_location_at = datetime.utcnow()
    db.add(user)
    db.commit()

    # SSE a admins
    await broadcaster.publish({
        "type": "DRIVER_LOCATION",
        "driver_id": user.id,
        "lat": user.last_lat,
        "lng": user.last_lng,
        "at": user.last_location_at.isoformat() if user.last_location_at else None,
        "full_name": user.full_name,
        "username": user.username,
    })

    return {"ok": True}

@router.post("/packages/{package_id}/close_delivered", response_model=PackageOut)
async def close_delivered(
    package_id: int,
    request: Request,
    pod_notes: str = Form(...),
    images: list[UploadFile] = File(...),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    db: Session = Depends(get_db),
    user=Depends(require_role("driver"))
):
    if not pod_notes.strip():
        raise HTTPException(400, "Notas obligatorias")
    if len(images) < 2:
        raise HTTPException(400, "Mínimo 2 fotos")

    pkg = db.get(models.Package, package_id)
    if not pkg or pkg.driver_id != user.id:
        raise HTTPException(404, "Paquete no encontrado")
    if pkg.status in (models.PackageStatus.delivered, models.PackageStatus.not_delivered):
        raise HTTPException(400, "Paquete ya cerrado")

    _ensure_upload_dir()
    for img in images:
        ext = os.path.splitext(img.filename or "")[1].lower() or ".jpg"
        fname = f"{pkg.code}_{int(datetime.utcnow().timestamp())}_{os.urandom(4).hex()}{ext}"
        fpath = os.path.join(settings.UPLOAD_DIR, fname)
        with open(fpath, "wb") as f:
            f.write(await img.read())
        db.add(models.ProofImage(package_id=pkg.id, proof_type=models.ProofType.delivered, filename=fname))

    pkg.status = models.PackageStatus.delivered
    pkg.pod_notes = pod_notes.strip()
    pkg.closed_at = datetime.utcnow()
    pkg.non_delivery_reason = None

    # ✅ ubicación capturada al cierre (si el navegador dio permiso)
    if lat is not None and lng is not None:
        pkg.lat = float(lat)
        pkg.lng = float(lng)
        pkg.location_at = datetime.utcnow()

    db.commit()
    db.refresh(pkg)

    # ✅ Emit SSE event for admin realtime updates
    await broadcaster.publish({
        "type": "PACKAGE_CLOSED",
        "package_id": pkg.id,
        "code": pkg.code,
        "status": pkg.status.value,  # "delivered"
        "driver_id": pkg.driver_id,
        "closed_at": pkg.closed_at.isoformat() if pkg.closed_at else None
    })

    return _pkg_out(request, pkg)

@router.post("/packages/{package_id}/close_not_delivered", response_model=PackageOut)
async def close_not_delivered(
    package_id: int,
    request: Request,
    pod_notes: str = Form(...),
    reason: str = Form(...),
    images: list[UploadFile] = File(...),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    db: Session = Depends(get_db),
    user=Depends(require_role("driver"))
):
    if not pod_notes.strip():
        raise HTTPException(400, "Notas obligatorias")
    if reason not in NON_DELIVERY_REASONS:
        raise HTTPException(400, "Motivo inválido")
    if len(images) < 2:
        raise HTTPException(400, "Mínimo 2 fotos")

    pkg = db.get(models.Package, package_id)
    if not pkg or pkg.driver_id != user.id:
        raise HTTPException(404, "Paquete no encontrado")
    if pkg.status in (models.PackageStatus.delivered, models.PackageStatus.not_delivered):
        raise HTTPException(400, "Paquete ya cerrado")

    _ensure_upload_dir()
    for img in images:
        ext = os.path.splitext(img.filename or "")[1].lower() or ".jpg"
        fname = f"{pkg.code}_{int(datetime.utcnow().timestamp())}_{os.urandom(4).hex()}{ext}"
        fpath = os.path.join(settings.UPLOAD_DIR, fname)
        with open(fpath, "wb") as f:
            f.write(await img.read())
        db.add(models.ProofImage(package_id=pkg.id, proof_type=models.ProofType.not_delivered, filename=fname))

    pkg.status = models.PackageStatus.not_delivered
    pkg.pod_notes = pod_notes.strip()
    pkg.closed_at = datetime.utcnow()
    pkg.non_delivery_reason = reason

    # ✅ ubicación capturada al cierre (si el navegador dio permiso)
    if lat is not None and lng is not None:
        pkg.lat = float(lat)
        pkg.lng = float(lng)
        pkg.location_at = datetime.utcnow()

    db.commit()
    db.refresh(pkg)

    # ✅ Emit SSE event for admin realtime updates
    await broadcaster.publish({
        "type": "PACKAGE_CLOSED",
        "package_id": pkg.id,
        "code": pkg.code,
        "status": pkg.status.value,  # "not_delivered"
        "driver_id": pkg.driver_id,
        "closed_at": pkg.closed_at.isoformat() if pkg.closed_at else None
    })

    return _pkg_out(request, pkg)
