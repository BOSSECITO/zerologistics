from sqlalchemy.orm import Session
from sqlalchemy import func
from . import models

def next_zero_code(db: Session) -> str:
    max_code = db.query(func.max(models.Package.code)).scalar()
    if not max_code or not str(max_code).startswith("ZERO"):
        return "ZERO0001"
    try:
        n = int(str(max_code)[4:])
    except Exception:
        n = 0
    return f"ZERO{n+1:04d}"
