from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models import EmailVerificationState


class EmailVerificationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_email_and_purpose(self, email: str, purpose: str) -> EmailVerificationState | None:
        stmt = select(EmailVerificationState).where(
            EmailVerificationState.email == email,
            EmailVerificationState.purpose == purpose,
        )
        return self.db.execute(stmt).scalar_one_or_none()

    def get_or_create(self, email: str, purpose: str) -> EmailVerificationState:
        state = self.get_by_email_and_purpose(email, purpose)
        if state is not None:
            return state

        state = EmailVerificationState(email=email, purpose=purpose)
        self.db.add(state)
        self.db.flush()
        return state
