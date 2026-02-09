from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..db import get_db
from .. import models
from ..schemas import LoginIn, TokenOut
from ..security import verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrecta")
    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return TokenOut(access_token=token, role=user.role.value, user_id=user.id, full_name=user.full_name)
