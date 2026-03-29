from src.models import User
from src.realtime import presence_hub
from src.schemas.user import (
    ApplicantProfileRead,
    CuratorProfileRead,
    EmployerProfileRead,
    UserPresenceRead,
    UserRead,
)


def serialize_user(user: User) -> dict:
    return UserRead(
        id=user.id,
        public_id=user.public_id,
        email=user.email,
        display_name=user.display_name,
        preferred_city=user.preferred_city,
        role=user.role,
        status=user.status,
        created_at=user.created_at,
        presence=UserPresenceRead(
            is_online=presence_hub.is_user_online(user.id),
            last_seen_at=user.last_seen_at,
        ),
        applicant_profile=(
            ApplicantProfileRead.model_validate(user.applicant_profile)
            if user.role.value == "applicant" and user.applicant_profile is not None
            else None
        ),
        employer_profile=(
            EmployerProfileRead.model_validate(user.employer_profile)
            if user.role.value == "employer" and user.employer_profile is not None
            else None
        ),
        curator_profile=(
            CuratorProfileRead.model_validate(user.curator_profile)
            if user.role.value == "curator" and user.curator_profile is not None
            else None
        ),
    ).model_dump(mode="json")
