from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "ZERO LOGÍSTICA"
    SECRET_KEY: str = "dev-secret"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    DATABASE_URL: str = "postgresql+psycopg2://zero:zero@db:5432/zero"
    UPLOAD_DIR: str = "/data/uploads"

    # Demo admin
    ADMIN_USER: str = "admin"
    ADMIN_PASSWORD: str = "admin123"
    ADMIN_NAME: str = "Admin ZERO"

settings = Settings()
