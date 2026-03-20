from sqlalchemy.orm import Session

from src.enums import EmployerVerificationStatus, UserRole
from src.models import EmployerProfile, User
from src.schemas.company import EmployerOnboardingRequest
from src.utils.errors import AppError


class EmployerService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def upsert_profile(self, current_user: User, payload: EmployerOnboardingRequest) -> EmployerProfile:
        if current_user.role != UserRole.EMPLOYER:
            raise AppError(
                code="EMPLOYER_PROFILE_FORBIDDEN",
                message="Профиль работодателя доступен только работодателям",
                status_code=403,
            )

        employer_profile = current_user.employer_profile

        if employer_profile is None:
            employer_profile = EmployerProfile(
                user_id=current_user.id,
                employer_type=payload.employer_type,
                company_name=payload.company_name,
                inn=payload.inn,
                corporate_email=payload.corporate_email,
                website=payload.website,
                verification_status=EmployerVerificationStatus.UNVERIFIED,
            )
            self.db.add(employer_profile)
        else:
            employer_profile.employer_type = payload.employer_type
            employer_profile.company_name = payload.company_name
            employer_profile.inn = payload.inn
            employer_profile.corporate_email = payload.corporate_email
            employer_profile.website = payload.website

        self.db.commit()
        self.db.refresh(employer_profile)
        return employer_profile
