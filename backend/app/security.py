from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext
from .settings import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"

def _trim72(s: str) -> str:
    b = s.encode("utf-8")
    if len(b) > 72:
        b = b[:72]
    return b.decode("utf-8", errors="ignore")

def hash_password(password: str) -> str:
    return pwd_context.hash(_trim72(password))

def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(_trim72(password), hashed)

def create_access_token(data: dict, expires_minutes: int | None = None) -> str:
    to_encode = dict(data)
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
