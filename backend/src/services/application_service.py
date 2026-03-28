from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.enums import NotificationKind, NotificationSeverity, UserRole
from src.models import Application, ApplicationStatus, Opportunity, User
from src.models.opportunity import ModerationStatus, OpportunityStatus
from src.schemas.application import ApplicationSubmitRead, ApplicationSubmitRequest, MyApplicationIdsResponse
from src.services.notification_service import NotificationService
from src.utils.errors import AppError


class ApplicationService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def submit(self, current_user: User, payload: ApplicationSubmitRequest) -> ApplicationSubmitRead:
        if current_user.role != UserRole.APPLICANT:
            raise AppError(
                code="APPLICATION_FORBIDDEN",
                message="Отклик доступен только соискателям",
                status_code=403,
            )

        opportunity = self.db.execute(
            select(Opportunity).where(
                Opportunity.id == UUID(payload.opportunity_id),
                Opportunity.deleted_at.is_(None),
                Opportunity.business_status == OpportunityStatus.ACTIVE,
                Opportunity.moderation_status == ModerationStatus.APPROVED,
            )
        ).scalar_one_or_none()
        if opportunity is None:
            raise AppError(
                code="OPPORTUNITY_NOT_FOUND",
                message="Возможность не найдена или недоступна для отклика",
                status_code=404,
            )

        existing_application = self.db.execute(
            select(Application).where(
                Application.opportunity_id == opportunity.id,
                Application.applicant_user_id == current_user.id,
                Application.deleted_at.is_(None),
                Application.status.not_in(
                    [
                        ApplicationStatus.WITHDRAWN,
                        ApplicationStatus.REJECTED,
                        ApplicationStatus.CANCELED,
                    ]
                ),
            )
        ).scalar_one_or_none()
        if existing_application is not None:
            raise AppError(
                code="APPLICATION_ALREADY_EXISTS",
                message="Вы уже откликнулись на эту возможность",
                status_code=409,
            )

        now = datetime.now(UTC)
        application = Application(
            opportunity_id=opportunity.id,
            applicant_user_id=current_user.id,
            status=ApplicationStatus.SUBMITTED,
            status_changed_at=now,
            submitted_at=now,
            last_activity_at=now,
        )
        self.db.add(application)

        if opportunity.created_by_user_id is not None:
            NotificationService(self.db).create_notification(
                user_id=opportunity.created_by_user_id,
                kind=NotificationKind.APPLICATION,
                severity=NotificationSeverity.INFO,
                title="Новый отклик по вакансии",
                message=f"{current_user.display_name} откликнулся на возможность «{opportunity.title}».",
                action_label="Открыть вакансии",
                action_url="/employer/opportunities",
                payload={"opportunity_id": str(opportunity.id), "application_id": str(application.id)},
                created_at=now,
                profile_scope={"profile_role": UserRole.EMPLOYER.value, "employer_id": str(opportunity.employer_id)},
            )

        self.db.commit()
        self.db.refresh(application)

        return ApplicationSubmitRead(
            id=str(application.id),
            opportunity_id=str(application.opportunity_id),
            applicant_user_id=str(application.applicant_user_id),
            status=application.status.value,
            submitted_at=application.submitted_at.isoformat(),
        )

    def list_my_opportunity_ids(self, current_user: User) -> MyApplicationIdsResponse:
        if current_user.role != UserRole.APPLICANT:
            return MyApplicationIdsResponse(opportunity_ids=[])

        rows = self.db.execute(
            select(Application.opportunity_id).where(
                Application.applicant_user_id == current_user.id,
                Application.deleted_at.is_(None),
                Application.status.not_in(
                    [
                        ApplicationStatus.WITHDRAWN,
                        ApplicationStatus.REJECTED,
                        ApplicationStatus.CANCELED,
                    ]
                ),
            )
        ).scalars().all()
        return MyApplicationIdsResponse(opportunity_ids=[str(item) for item in rows])
