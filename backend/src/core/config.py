import json
from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_DEV_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]


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
    allowed_origins: list[str] = Field(default_factory=list, alias="ALLOWED_ORIGINS")

    database_url: str = Field(
        default="postgresql+psycopg://tramplin_user:tramplin_password@localhost:5432/tramplin",
        alias="DATABASE_URL",
    )

    jwt_secret_key: str = Field(default="change_me", alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_access_token_expire_minutes: int = Field(
        default=60, alias="JWT_ACCESS_TOKEN_EXPIRE_MINUTES"
    )
    jwt_refresh_token_expire_days: int = Field(default=30, alias="JWT_REFRESH_TOKEN_EXPIRE_DAYS")
    jwt_issuer: str = Field(default="tramplin-api", alias="JWT_ISSUER")

    initial_admin_email: str = Field(default="admin@tramplin.local", alias="INITIAL_ADMIN_EMAIL")
    initial_admin_password: str = Field(default="ChangeMe123", alias="INITIAL_ADMIN_PASSWORD")
    initial_admin_display_name: str = Field(
        default="Platform Admin", alias="INITIAL_ADMIN_DISPLAY_NAME"
    )

    otp_code_length: int = Field(default=6, alias="OTP_CODE_LENGTH")
    otp_code_ttl_seconds: int = Field(default=900, alias="OTP_CODE_TTL_SECONDS")
    otp_request_limit: int = Field(default=5, alias="OTP_REQUEST_LIMIT")
    otp_request_window_seconds: int = Field(default=900, alias="OTP_REQUEST_WINDOW_SECONDS")
    otp_verify_attempt_limit: int = Field(default=10, alias="OTP_VERIFY_ATTEMPT_LIMIT")
    otp_verify_window_seconds: int = Field(default=900, alias="OTP_VERIFY_WINDOW_SECONDS")
    otp_verify_block_seconds: int = Field(default=900, alias="OTP_VERIFY_BLOCK_SECONDS")

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

    email_transport: str = Field(default="log", alias="EMAIL_TRANSPORT")
    email_sender_name: str = Field(default="Tramplin", alias="EMAIL_SENDER_NAME")
    email_sender_address: str | None = Field(default=None, alias="EMAIL_SENDER_ADDRESS")
    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_username: str | None = Field(default=None, alias="SMTP_USERNAME")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASSWORD")
    smtp_use_tls: bool = Field(default=True, alias="SMTP_USE_TLS")
    smtp_use_ssl: bool = Field(default=False, alias="SMTP_USE_SSL")
    smtp_timeout_seconds: int = Field(default=10, alias="SMTP_TIMEOUT_SECONDS")
    frontend_base_url: str = Field(default="http://localhost:5173", alias="FRONTEND_BASE_URL")
    dadata_api_key: str | None = Field(default=None, alias="DADATA_API_KEY")
    dadata_suggestions_url: str = Field(
        default="https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party",
        alias="DADATA_SUGGESTIONS_URL",
    )
    dadata_timeout_seconds: int = Field(default=5, alias="DADATA_TIMEOUT_SECONDS")

    @field_validator("jwt_secret_key")
    @classmethod
    def validate_jwt_secret_key(cls, value: str) -> str:
        normalized_value = value.strip()
        if len(normalized_value) < 32:
            raise ValueError("JWT secret key must contain at least 32 characters")
        if normalized_value.lower() in {"change_me", "changeme", "secret", "jwt_secret"}:
            raise ValueError("JWT secret key must not use an insecure placeholder value")
        return normalized_value

    @field_validator("email_transport")
    @classmethod
    def validate_email_transport(cls, value: str) -> str:
        normalized_value = value.strip().lower()
        if normalized_value not in {"log", "smtp"}:
            raise ValueError("EMAIL_TRANSPORT must be either 'log' or 'smtp'")
        return normalized_value

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def validate_allowed_origins(cls, value: str | list[str] | None) -> list[str]:
        if value is None or value == "":
            return []

        if isinstance(value, list):
            return [item.strip() for item in value if item.strip()]

        normalized_value = value.strip()
        if not normalized_value:
            return []

        if normalized_value.startswith("["):
            parsed_value = json.loads(normalized_value)
            if not isinstance(parsed_value, list):
                raise ValueError("ALLOWED_ORIGINS must be a JSON array or comma-separated string")
            return [str(item).strip() for item in parsed_value if str(item).strip()]

        return [item.strip() for item in normalized_value.split(",") if item.strip()]

    @model_validator(mode="after")
    def apply_default_allowed_origins_for_dev(self) -> "Settings":
        if self.allowed_origins:
            return self

        if self.app_env.lower() in {"development", "dev", "local"} or self.app_debug:
            self.allowed_origins = DEFAULT_DEV_ALLOWED_ORIGINS.copy()

        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
