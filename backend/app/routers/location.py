from fastapi import APIRouter, Depends
from pydantic import BaseModel
from datetime import datetime, timezone

# IMPORTA tus deps reales:
from app.db import get_db
from app.auth import current_user  # <-- si esto no existe te digo qué hacer abajo
from app.realtime import broadcaster  # <-- tu broadcaster SSE ya existe por /events

router = APIRouter(prefix="/api", tags=["location"])

class LocationIn(BaseModel):
    lat: float
    lng: float

@router.post("/driver/location")
async def update_my_location(payload: LocationIn, user=Depends(current_user), db=Depends(get_db)):
    # user debe ser el driver logueado
    user.last_lat = payload.lat
    user.last_lng = payload.lng
    user.last_location_at = datetime.now(timezone.utc)

    db.add(user)
    db.commit()

    await broadcaster.publish({
        "type": "DRIVER_LOCATION",
        "driver_id": user.id,
        "lat": payload.lat,
        "lng": payload.lng,
        "at": user.last_location_at.isoformat(),
        "full_name": getattr(user, "full_name", ""),
        "username": getattr(user, "username", "")
    })

    return {"ok": True}
