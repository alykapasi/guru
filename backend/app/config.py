# app/config.py

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    openrouter_api_key: str
    voyage_api_key: str
    llm_smart: str = "gemma3:12b-it-qat"
    llm_fast: str = "phi3:mini"
    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket: str = "guru-materials"
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 10080
    redis_url: str = "redis://localhost:6379"

settings = Settings()