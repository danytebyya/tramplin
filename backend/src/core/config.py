from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False
    )

    app_name: str = Field(default="Tramplin API", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    app_debug: bool = Field(default=True, alias="APP_DEBUG")
    api_v1_prefix: str = Field(default="/api/v1", alias="API_V1_PREFIX")

    database_url: str = Field(
        default="postgresql+psycopg://tramplin_user:tramplin_password@localhost:5432/tramplin",
        alias="DATABASE_URL",
    )

    jwt_secret_key: str = Field(default="change_me", alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(
        default=60, alias="JWT_ACCESS_TOKEN_EXPIRE_MINUTES"
    )
    jwt_refresh_token_expire_days: int = Field(default=14, alias="JWT_REFRESH_TOKEN_EXPIRE_DAYS")
    jwt_issuer: str = Field(default="tramplin-api", alias="JWT_ISSUER")

    initial_admin_email: str = Field(default="admin@tramplin.local", alias="INITIAL_ADMIN_EMAIL")
    initial_admin_password: str = Field(default="ChangeMe123", alias="INITIAL_ADMIN_PASSWORD")
    initial_admin_display_name: str = Field(
        default="Platform Admin", alias="INITIAL_ADMIN_DISPLAY_NAME"
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
