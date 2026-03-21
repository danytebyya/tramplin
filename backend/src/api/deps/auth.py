from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from src.core.security import TokenPayloadError, decode_token, ensure_token_type
from src.db import get_db
from src.enums import TokenType
from src.models import User
from src.repositories import UserRepository
from src.utils.errors import AppError

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise AppError(code="AUTH_UNAUTHORIZED", message="Требуется access token", status_code=401)

    token = credentials.credentials

    try:
        payload = ensure_token_type(decode_token(token), TokenType.ACCESS)
    except TokenPayloadError as exc:
        raise AppError(code="AUTH_UNAUTHORIZED", message=str(exc), status_code=401) from exc

    user_id = payload.get("sub")
    if user_id is None:
        raise AppError(code="AUTH_UNAUTHORIZED", message="Некорректный токен доступа", status_code=401)

    user = UserRepository(db).get_by_id(user_id)
    if user is None:
        raise AppError(code="AUTH_UNAUTHORIZED", message="Пользователь не найден", status_code=401)

    return user
