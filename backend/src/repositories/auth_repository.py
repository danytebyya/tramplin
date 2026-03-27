from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, not_, or_, select, update
from sqlalchemy.orm import Session

from src.models import AuthLoginEvent, RefreshSession


class AuthRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_session(self, session: RefreshSession) -> RefreshSession:
        self.db.add(session)
        return session

    def get_active_session_by_jti(self, user_id: str | UUID, jti: str) -> RefreshSession | None:
        normalized_user_id = UUID(str(user_id))
        stmt = select(RefreshSession).where(
            RefreshSession.user_id == normalized_user_id,
            RefreshSession.jti == jti,
            RefreshSession.revoked_at.is_(None),
            RefreshSession.expires_at > datetime.now(UTC),
        )
        return self.db.execute(stmt).scalar_one_or_none()

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

    def revoke_other_user_sessions(
        self,
        user_id: str | UUID,
        *,
        current_user_agent: str | None,
        current_ip_address: str | None,
    ) -> None:
        normalized_user_id = UUID(str(user_id))
        stmt = (
            update(RefreshSession)
            .where(
                RefreshSession.user_id == normalized_user_id,
                RefreshSession.revoked_at.is_(None),
                not_(
                    and_(
                        RefreshSession.user_agent == current_user_agent,
                        RefreshSession.ip_address == current_ip_address,
                    )
                ),
            )
            .values(revoked_at=datetime.now(UTC))
        )
        self.db.execute(stmt)

    def list_active_sessions_for_user(self, user_id: str | UUID) -> list[RefreshSession]:
        normalized_user_id = UUID(str(user_id))
        stmt = (
            select(RefreshSession)
            .where(
                RefreshSession.user_id == normalized_user_id,
                RefreshSession.revoked_at.is_(None),
                RefreshSession.expires_at > datetime.now(UTC),
            )
            .order_by(RefreshSession.created_at.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_active_session_for_user(
        self, user_id: str | UUID, session_id: str | UUID
    ) -> RefreshSession | None:
        normalized_user_id = UUID(str(user_id))
        normalized_session_id = UUID(str(session_id))
        stmt = select(RefreshSession).where(
            RefreshSession.id == normalized_session_id,
            RefreshSession.user_id == normalized_user_id,
            RefreshSession.revoked_at.is_(None),
            RefreshSession.expires_at > datetime.now(UTC),
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def create_login_event(self, event: AuthLoginEvent) -> AuthLoginEvent:
        self.db.add(event)
        return event

    def list_login_events_for_user(
        self, user_id: str | UUID, email: str, *, limit: int = 20
    ) -> list[AuthLoginEvent]:
        normalized_user_id = UUID(str(user_id))
        stmt = (
            select(AuthLoginEvent)
            .where(
                or_(
                    AuthLoginEvent.user_id == normalized_user_id,
                    and_(AuthLoginEvent.user_id.is_(None), AuthLoginEvent.email == email.lower()),
                )
            )
            .order_by(AuthLoginEvent.created_at.desc())
            .limit(limit)
        )
        return list(self.db.execute(stmt).scalars().all())
