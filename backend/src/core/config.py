from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
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

    otp_code_length: int = Field(default=6, alias="OTP_CODE_LENGTH")
    otp_code_ttl_seconds: int = Field(default=900, alias="OTP_CODE_TTL_SECONDS")
    otp_request_limit: int = Field(default=3, alias="OTP_REQUEST_LIMIT")
    otp_request_window_seconds: int = Field(default=900, alias="OTP_REQUEST_WINDOW_SECONDS")
    otp_verify_attempt_limit: int = Field(default=5, alias="OTP_VERIFY_ATTEMPT_LIMIT")

    auth_email_check_limit: int = Field(default=20, alias="AUTH_EMAIL_CHECK_LIMIT")
    auth_email_check_window_seconds: int = Field(
        default=300,
        alias="AUTH_EMAIL_CHECK_WINDOW_SECONDS",
    )
    auth_login_attempt_limit: int = Field(default=5, alias="AUTH_LOGIN_ATTEMPT_LIMIT")
    auth_login_attempt_window_seconds: int = Field(
        default=900,
        alias="AUTH_LOGIN_ATTEMPT_WINDOW_SECONDS",
    )
    auth_login_block_seconds: int = Field(default=900, alias="AUTH_LOGIN_BLOCK_SECONDS")
    auth_login_ip_attempt_limit: int = Field(default=20, alias="AUTH_LOGIN_IP_ATTEMPT_LIMIT")
    auth_login_ip_attempt_window_seconds: int = Field(
        default=900,
        alias="AUTH_LOGIN_IP_ATTEMPT_WINDOW_SECONDS",
    )
    auth_login_ip_block_seconds: int = Field(default=900, alias="AUTH_LOGIN_IP_BLOCK_SECONDS")

    email_sender_name: str = Field(default="Tramplin", alias="EMAIL_SENDER_NAME")

    @field_validator("jwt_secret_key")
    @classmethod
    def validate_jwt_secret_key(cls, value: str) -> str:
        normalized_value = value.strip()
        if len(normalized_value) < 32:
            raise ValueError("JWT secret key must contain at least 32 characters")
        if normalized_value.lower() in {"change_me", "changeme", "secret", "jwt_secret"}:
            raise ValueError("JWT secret key must not use an insecure placeholder value")
        return normalized_value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
