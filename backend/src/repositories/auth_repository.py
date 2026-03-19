from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from src.models import RefreshSession


class AuthRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_session(self, session: RefreshSession) -> RefreshSession:
        self.db.add(session)
        return session

    def get_active_session_by_hash(self, token_hash: str) -> RefreshSession | None:
        stmt = select(RefreshSession).where(
            RefreshSession.token_hash == token_hash,
            RefreshSession.revoked_at.is_(None),
            RefreshSession.expires_at > datetime.now(UTC),
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def revoke_session(self, session_id: str | UUID) -> None:
        normalized_session_id = UUID(str(session_id))
        stmt = (
            update(RefreshSession)
            .where(RefreshSession.id == normalized_session_id, RefreshSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        self.db.execute(stmt)

    def revoke_all_user_sessions(self, user_id: str | UUID) -> None:
        normalized_user_id = UUID(str(user_id))
        stmt = (
            update(RefreshSession)
            .where(RefreshSession.user_id == normalized_user_id, RefreshSession.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        self.db.execute(stmt)
