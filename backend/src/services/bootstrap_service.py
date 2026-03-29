import logging

from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.security import hash_password
from src.enums import UserRole, UserStatus
from src.models import CuratorProfile, User
from src.repositories import UserRepository


logger = logging.getLogger(__name__)


class BootstrapService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.user_repo = UserRepository(db)

    def ensure_initial_staff_accounts(self) -> None:
        self._ensure_staff_account(
            email=settings.initial_admin_email,
            password=settings.initial_admin_password,
            display_name=settings.initial_admin_display_name,
            role=UserRole.ADMIN,
        )
        self._ensure_staff_account(
            email=settings.initial_curator_email,
            password=settings.initial_curator_password,
            display_name=settings.initial_curator_display_name,
            role=UserRole.CURATOR,
        )

    def _ensure_staff_account(
        self,
        *,
        email: str | None,
        password: str | None,
        display_name: str,
        role: UserRole,
    ) -> None:
        normalized_email = (email or "").strip().lower()
        normalized_password = password or ""

        if not normalized_email or not normalized_password:
            return

        existing_user = self.user_repo.get_by_email(normalized_email, with_profiles=True)
        if existing_user is not None and existing_user.role not in {role}:
            logger.warning(
                "bootstrap.staff_account_conflict email=%s existing_role=%s requested_role=%s",
                normalized_email,
                existing_user.role.value,
                role.value,
            )
            return

        if existing_user is None:
            user = User(
                email=normalized_email,
                display_name=display_name.strip() or normalized_email,
                password_hash=hash_password(normalized_password),
                role=role,
                status=UserStatus.ACTIVE,
            )
            user.curator_profile = CuratorProfile(full_name=user.display_name)
            self.user_repo.add(user)
            self.db.commit()
            logger.info("bootstrap.staff_account_created email=%s role=%s", normalized_email, role.value)
            return

        existing_user.display_name = display_name.strip() or existing_user.display_name
        existing_user.password_hash = hash_password(normalized_password)
        existing_user.status = UserStatus.ACTIVE
        existing_user.role = role

        if existing_user.curator_profile is None:
            existing_user.curator_profile = CuratorProfile(full_name=existing_user.display_name)
        else:
            existing_user.curator_profile.full_name = existing_user.display_name

        self.user_repo.add(existing_user)
        self.db.commit()
        logger.info("bootstrap.staff_account_updated email=%s role=%s", normalized_email, role.value)
