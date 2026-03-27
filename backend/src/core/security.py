import hashlib
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext

from src.core.config import settings
from src.enums import TokenType

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


class TokenPayloadError(ValueError):
    pass


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_access_token(subject: str, role: str, session_jti: str | None = None) -> tuple[str, datetime]:
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    payload = {
        "sub": subject,
        "role": role,
        "type": TokenType.ACCESS,
        "iss": settings.jwt_issuer,
        "exp": expires_at,
        "iat": datetime.now(UTC),
    }
    if session_jti:
        payload["jti"] = session_jti
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expires_at


def create_refresh_token(subject: str) -> tuple[str, datetime, str]:
    expires_at = datetime.now(UTC) + timedelta(days=settings.jwt_refresh_token_expire_days)
    jti = uuid4().hex
    payload = {
        "sub": subject,
        "jti": jti,
        "type": TokenType.REFRESH,
        "iss": settings.jwt_issuer,
        "exp": expires_at,
        "iat": datetime.now(UTC),
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, expires_at, jti


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
        )
    except JWTError as exc:
        raise TokenPayloadError("Токен недействителен или срок его действия истек") from exc
    return payload


def ensure_token_type(payload: dict, token_type: TokenType) -> dict:
    raw_type = payload.get("type")
    if raw_type != token_type:
        raise TokenPayloadError("Некорректный тип токена")
    return payload
