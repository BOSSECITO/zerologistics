import os
from fastapi import Request
from fastapi.responses import StreamingResponse
from .sse import broadcaster
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .settings import settings
from .db import Base, engine, SessionLocal
from .routers.auth import router as auth_router
from .routers.admin import router as admin_router
from .routers.driver import router as driver_router
from . import models
from .security import hash_password
from sqlalchemy import text

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded evidence
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(driver_router)

@app.get("/events")
async def sse_events(request: Request):
    q = await broadcaster.register()

    async def event_generator():
        try:
            yield "event: hello\ndata: connected\n\n"

            while True:
                if await request.is_disconnected():
                    break
                data = await q.get()
                yield f"data: {data}\n\n"
        finally:
            await broadcaster.unregister(q)

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/health")
def health():
    return {"ok": True}

@app.on_event("startup")
def startup():
    # 1) crea tablas (si no existen)
    Base.metadata.create_all(bind=engine)

    # 2) "mini-migración" segura (para VPS ya en producción sin Alembic)
    #    Agrega columnas faltantes si la BD ya existía.
    with engine.begin() as conn:
        # users: ubicación repartidor
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMP"))
        # packages: ubicación capturada al cerrar
        conn.execute(text("ALTER TABLE packages ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION"))
        conn.execute(text("ALTER TABLE packages ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION"))
        conn.execute(text("ALTER TABLE packages ADD COLUMN IF NOT EXISTS location_at TIMESTAMP"))

    db = SessionLocal()
    try:
        if not db.query(models.User).filter(models.User.username == settings.ADMIN_USER).first():
            db.add(models.User(
                username=settings.ADMIN_USER,
                full_name=settings.ADMIN_NAME,
                password_hash=hash_password(settings.ADMIN_PASSWORD),
                role=models.Role.admin,
            ))
            db.commit()
    finally:
        db.close()
