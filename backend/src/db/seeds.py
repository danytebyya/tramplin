from src.core.config import settings
from src.core.security import hash_password
from src.db.session import SessionLocal
from src.enums import UserRole, UserStatus
from src.models import CuratorProfile, User
from src.repositories import UserRepository


def seed_initial_admin() -> None:
    with SessionLocal() as db:
        repo = UserRepository(db)
        admin = repo.get_by_email(settings.initial_admin_email.lower())
        if admin is not None:
            return

        admin_user = User(
            email=settings.initial_admin_email.lower(),
            display_name=settings.initial_admin_display_name,
            password_hash=hash_password(settings.initial_admin_password),
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE,
            curator_profile=CuratorProfile(full_name=settings.initial_admin_display_name),
        )
        repo.add(admin_user)
        db.commit()


if __name__ == "__main__":
    seed_initial_admin()
