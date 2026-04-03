from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from src.enums import MembershipRole, NotificationKind, NotificationSeverity, UserRole
from src.models import (
    Application,
    ApplicationStatus,
    Employer,
    EmployerMembership,
    Opportunity,
    User,
    WorkFormat,
)
from src.models.profile import ApplicantProfile
from src.models.opportunity import EmploymentType, ModerationStatus, OpportunityStatus, OpportunityType
from src.realtime import presence_hub
from src.repositories.user_repository import UserRepository
from src.schemas.application import (
    ApplicationApplicantRead,
    ApplicationDetailsRead,
    ApplicationOpportunityRead,
    ApplicationSubmitRead,
    ApplicationSubmitRequest,
    EmployerApplicationListResponse,
    EmployerApplicationStatusUpdateRequest,
    MyApplicationIdsResponse,
    MyApplicationsResponse,
)
from src.services.notification_service import NotificationService
from src.services.email_service import send_email
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
                Application.status != ApplicationStatus.CANCELED,
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
                action_label="Открыть отклики",
                action_url="/employer/responses",
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

    def withdraw(self, current_user: User, opportunity_id: str) -> ApplicationSubmitRead:
        if current_user.role != UserRole.APPLICANT:
            raise AppError(
                code="APPLICATION_FORBIDDEN",
                message="Отзыв отклика доступен только соискателям",
                status_code=403,
            )

        application = self.db.execute(
            select(Application).where(
                Application.opportunity_id == UUID(opportunity_id),
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
        if application is None:
            raise AppError(
                code="APPLICATION_NOT_FOUND",
                message="Активный отклик не найден",
                status_code=404,
            )

        if application.status in {
            ApplicationStatus.INTERVIEW,
            ApplicationStatus.OFFER,
            ApplicationStatus.ACCEPTED,
            ApplicationStatus.REJECTED,
        }:
            raise AppError(
                code="APPLICATION_WITHDRAW_FORBIDDEN",
                message="Этот отклик уже нельзя отозвать",
                status_code=409,
            )

        now = datetime.now(UTC)
        application.status = ApplicationStatus.WITHDRAWN
        application.status_changed_at = now
        application.last_activity_at = now

        self.db.commit()
        self.db.refresh(application)

        return ApplicationSubmitRead(
            id=str(application.id),
            opportunity_id=str(application.opportunity_id),
            applicant_user_id=str(application.applicant_user_id),
            status=application.status.value,
            submitted_at=application.submitted_at.isoformat(),
        )

    def list_mine(self, current_user: User) -> MyApplicationsResponse:
        if current_user.role != UserRole.APPLICANT:
            return MyApplicationsResponse(items=[])

        items = self.db.execute(
            select(Application)
            .where(
                Application.applicant_user_id == current_user.id,
                Application.deleted_at.is_(None),
                Application.status != ApplicationStatus.CANCELED,
            )
            .order_by(Application.status_changed_at.desc(), Application.submitted_at.desc())
        ).scalars().all()

        return MyApplicationsResponse(items=[self._build_application_details(item) for item in items])

    def list_for_employer(
        self,
        current_user: User,
        *,
        access_payload: dict | None = None,
    ) -> EmployerApplicationListResponse:
        employer, membership = self._resolve_employer_access(
            current_user=current_user,
            access_payload=access_payload,
        )
        self._ensure_view_responses_allowed(membership)

        items = self.db.execute(
            select(Application)
            .join(Opportunity, Application.opportunity_id == Opportunity.id)
            .options(
                selectinload(Application.applicant).selectinload(User.applicant_profile),
                selectinload(Application.opportunity).selectinload(Opportunity.location),
            )
            .where(
                Opportunity.employer_id == employer.id,
                Opportunity.deleted_at.is_(None),
                Application.deleted_at.is_(None),
                Application.status.not_in(
                    [
                        ApplicationStatus.WITHDRAWN,
                        ApplicationStatus.CANCELED,
                    ]
                ),
            )
            .order_by(Opportunity.published_at.desc().nullslast(), Application.submitted_at.desc())
        ).scalars().all()

        return EmployerApplicationListResponse(items=[self._build_application_details(item, include_applicant=True, include_opportunity=True) for item in items])

    def update_employer_response(
        self,
        application_id: str,
        current_user: User,
        payload: EmployerApplicationStatusUpdateRequest,
        *,
        access_payload: dict | None = None,
    ) -> ApplicationDetailsRead:
        employer, membership = self._resolve_employer_access(
            current_user=current_user,
            access_payload=access_payload,
        )
        self._ensure_view_responses_allowed(membership)

        application = self.db.execute(
            select(Application)
            .join(Opportunity, Application.opportunity_id == Opportunity.id)
            .options(
                selectinload(Application.applicant).selectinload(User.applicant_profile),
                selectinload(Application.opportunity).selectinload(Opportunity.location),
            )
            .where(
                Application.id == UUID(application_id),
                Application.deleted_at.is_(None),
                Application.status.not_in(
                    [
                        ApplicationStatus.WITHDRAWN,
                        ApplicationStatus.CANCELED,
                    ]
                ),
                Opportunity.employer_id == employer.id,
                Opportunity.deleted_at.is_(None),
            )
        ).scalar_one_or_none()
        if application is None:
            raise AppError(
                code="APPLICATION_NOT_FOUND",
                message="Отклик не найден",
                status_code=404,
            )

        now = datetime.now(UTC)
        next_status = self._resolve_employer_status(payload.status)
        application.status = next_status
        application.employer_comment = payload.employer_comment
        application.status_changed_at = now
        application.last_activity_at = now

        if next_status == ApplicationStatus.INTERVIEW:
            application.interview_date = self._parse_optional_datetime(payload.interview_date)
            application.interview_start_time = payload.interview_start_time
            application.interview_end_time = payload.interview_end_time
            application.interview_format = payload.interview_format
            application.meeting_link = payload.meeting_link
            application.contact_email = payload.contact_email
            application.checklist = payload.checklist
        else:
            application.interview_date = None
            application.interview_start_time = None
            application.interview_end_time = None
            application.interview_format = None
            application.meeting_link = None
            application.contact_email = None
            application.checklist = None

        self._notify_applicant_about_status_change(application=application, created_at=now)

        self.db.commit()
        self.db.refresh(application)

        return self._build_application_details(application, include_applicant=True, include_opportunity=True)

    def _build_application_details(
        self,
        application: Application,
        *,
        include_applicant: bool = False,
        include_opportunity: bool = False,
    ) -> ApplicationDetailsRead:
        applicant = self._build_applicant_read(application.applicant, application.opportunity) if include_applicant else None
        opportunity = self._build_opportunity_read(application.opportunity) if include_opportunity else None

        return ApplicationDetailsRead(
            id=str(application.id),
            opportunity_id=str(application.opportunity_id),
            applicant_user_id=str(application.applicant_user_id),
            status=application.status.value,
            submitted_at=application.submitted_at.isoformat(),
            status_changed_at=application.status_changed_at.isoformat(),
            employer_comment=application.employer_comment,
            interview_date=application.interview_date.isoformat() if application.interview_date is not None else None,
            interview_start_time=application.interview_start_time,
            interview_end_time=application.interview_end_time,
            interview_format=application.interview_format,
            meeting_link=application.meeting_link,
            contact_email=application.contact_email,
            checklist=application.checklist,
            applicant=applicant,
            opportunity=opportunity,
        )

    def _build_applicant_read(self, user: User | None, opportunity: Opportunity | None) -> ApplicationApplicantRead | None:
        if user is None:
            return None

        profile = user.applicant_profile
        tags: list[str] = []
        if profile is not None and profile.level:
            tags.append(profile.level.capitalize())
        tags.extend((profile.hard_skills or [])[:4] if profile is not None else [])

        city = (
            user.preferred_city
            or (profile.preferred_location if profile is not None else None)
            or (opportunity.location.city if opportunity is not None and opportunity.location is not None else None)
            or "Город не указан"
        )
        work_formats = profile.work_formats if profile is not None and profile.work_formats else []
        work_format_label = self._format_label(
            next(
                (
                    self._normalize_work_format_token(item)
                    for item in work_formats
                    if self._normalize_work_format_token(item) is not None
                ),
                self._normalize_format(opportunity.work_format) if opportunity is not None else None,
            )
            or (self._normalize_format(opportunity.work_format) if opportunity is not None else None)
            or "remote"
        )
        employment_label = (
            (profile.employment_types or [])[0]
            if profile is not None and profile.employment_types
            else self._employment_label(
                opportunity.employment_type if opportunity is not None else None,
                opportunity_type=opportunity.opportunity_type if opportunity is not None else None,
            )
        )

        return ApplicationApplicantRead(
            user_id=str(user.id),
            public_id=user.public_id,
            display_name=user.display_name,
            subtitle=self._build_candidate_subtitle(profile),
            is_online=presence_hub.is_user_online(user.id),
            city=city,
            salary_label=self._build_candidate_salary_label(profile),
            format_label=work_format_label,
            employment_label=employment_label,
            tags=tags[:5],
        )

    @staticmethod
    def _build_opportunity_read(opportunity: Opportunity | None) -> ApplicationOpportunityRead | None:
        if opportunity is None:
            return None

        return ApplicationOpportunityRead(
            id=str(opportunity.id),
            title=opportunity.title,
            kind=ApplicationService._serialize_opportunity_kind(opportunity.opportunity_type),
            published_at=opportunity.published_at.isoformat() if opportunity.published_at is not None else None,
        )

    def _resolve_employer_access(
        self,
        *,
        current_user: User,
        access_payload: dict | None,
    ) -> tuple[Employer, EmployerMembership | None]:
        effective_role = (access_payload or {}).get("active_role") or current_user.role.value
        if effective_role != UserRole.EMPLOYER.value:
            raise AppError(
                code="EMPLOYER_APPLICATION_FORBIDDEN",
                message="Управление откликами доступно только работодателям",
                status_code=403,
            )

        active_employer_id = (access_payload or {}).get("active_employer_id")
        active_membership_id = (access_payload or {}).get("active_membership_id")

        if active_employer_id:
            employer = self.db.execute(
                select(Employer).where(Employer.id == UUID(str(active_employer_id)))
            ).scalar_one_or_none()
            if employer is None:
                raise AppError(code="EMPLOYER_NOT_FOUND", message="Компания не найдена", status_code=404)

            membership = None
            if active_membership_id:
                membership = self.db.execute(
                    select(EmployerMembership).where(
                        EmployerMembership.id == UUID(str(active_membership_id)),
                        EmployerMembership.employer_id == employer.id,
                        EmployerMembership.user_id == current_user.id,
                    )
                ).scalar_one_or_none()
            return employer, membership

        employer_profile = current_user.employer_profile
        if employer_profile is None or not employer_profile.inn:
            raise AppError(
                code="EMPLOYER_PROFILE_REQUIRED",
                message="Сначала заполните профиль работодателя",
                status_code=400,
            )

        employer = self.db.execute(
            select(Employer).where(Employer.inn == employer_profile.inn)
        ).scalar_one_or_none()
        if employer is None:
            raise AppError(
                code="EMPLOYER_NOT_FOUND",
                message="Компания ещё не создана в системе",
                status_code=404,
            )

        membership = self.db.execute(
            select(EmployerMembership).where(
                EmployerMembership.employer_id == employer.id,
                EmployerMembership.user_id == current_user.id,
            )
        ).scalar_one_or_none()
        return employer, membership

    def _ensure_view_responses_allowed(self, membership: EmployerMembership | None) -> None:
        if membership is None:
            return

        permission_keys = membership.permissions or self._default_membership_permissions(membership.membership_role)
        if "view_responses" not in permission_keys:
            raise AppError(
                code="EMPLOYER_APPLICATION_VIEW_FORBIDDEN",
                message="Нет доступа к просмотру откликов этой компании",
                status_code=403,
            )

    @staticmethod
    def _default_membership_permissions(role: MembershipRole) -> list[str]:
        if role == MembershipRole.OWNER:
            return [
                "view_responses",
                "manage_opportunities",
                "manage_company_profile",
                "manage_staff",
                "access_chat",
            ]
        return [
            "view_responses",
            "manage_opportunities",
            "access_chat",
        ]

    @staticmethod
    def _parse_optional_datetime(value: str | None) -> datetime | None:
        if value is None:
            return None
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed

    @staticmethod
    def _resolve_employer_status(status: str) -> ApplicationStatus:
        return {
            "new": ApplicationStatus.SUBMITTED,
            "accepted": ApplicationStatus.INTERVIEW,
            "reserve": ApplicationStatus.RESERVED,
            "rejected": ApplicationStatus.REJECTED,
        }[status]

    @staticmethod
    def _serialize_opportunity_kind(opportunity_type: OpportunityType) -> str:
        return {
            OpportunityType.VACANCY: "vacancy",
            OpportunityType.INTERNSHIP: "internship",
            OpportunityType.CAREER_EVENT: "event",
            OpportunityType.MENTORSHIP_PROGRAM: "mentorship",
        }[opportunity_type]

    @staticmethod
    def _build_candidate_subtitle(profile: ApplicantProfile | None) -> str:
        if profile is None:
            return "Соискатель платформы"
        if profile.university and profile.graduation_year:
            return f"{profile.university}, выпуск {profile.graduation_year}"
        if profile.university:
            return profile.university
        if profile.about:
            return profile.about[:120]
        return "Соискатель платформы"

    @staticmethod
    def _build_candidate_salary_label(profile: ApplicantProfile | None) -> str:
        if profile is None or profile.desired_salary_from is None:
            return "Зарплата не указана"
        formatted_salary = f"{profile.desired_salary_from:,}".replace(",", " ")
        return f"от {formatted_salary} ₽"

    @staticmethod
    def _normalize_match_token(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower().replace("ё", "е")
        return normalized or None

    def _normalize_work_format_token(self, value: str | None) -> str | None:
        normalized = self._normalize_match_token(value)
        if normalized is None:
            return None
        if normalized in {"offline", "office", "офлайн", "офис", "в офисе"}:
            return "offline"
        if normalized in {"hybrid", "гибрид"}:
            return "hybrid"
        if normalized in {"remote", "online", "удаленно", "удалённо", "онлайн"}:
            return "remote"
        return None

    @staticmethod
    def _normalize_format(value: WorkFormat | None) -> str | None:
        if value is None:
            return None
        if value in {WorkFormat.OFFICE, WorkFormat.OFFLINE}:
            return "offline"
        if value == WorkFormat.HYBRID:
            return "hybrid"
        return "remote"

    @staticmethod
    def _format_label(value: str | None) -> str:
        return {
            "offline": "Офлайн",
            "hybrid": "Гибрид",
            "remote": "Удаленно",
        }.get(value or "", "Удаленно")

    @staticmethod
    def _employment_label(
        value: EmploymentType | None,
        *,
        opportunity_type: OpportunityType | None = None,
    ) -> str:
        if opportunity_type == OpportunityType.CAREER_EVENT:
            return "Участие в мероприятии"
        if opportunity_type == OpportunityType.MENTORSHIP_PROGRAM:
            return "Гибкий график"
        if value == EmploymentType.PART_TIME:
            return "Частичная занятость"
        if value == EmploymentType.CONTRACT:
            return "Контракт"
        if value == EmploymentType.FREELANCE:
            return "Проектная работа"
        if value == EmploymentType.TEMPORARY:
            return "Временная занятость"
        if value == EmploymentType.VOLUNTEER:
            return "Волонтерство"
        if value == EmploymentType.PROJECT_BASED:
            return "Проектная занятость"
        return "Полная занятость"

    @staticmethod
    def _resolve_status_notification_severity(status: ApplicationStatus) -> NotificationSeverity:
        if status == ApplicationStatus.INTERVIEW:
            return NotificationSeverity.SUCCESS
        if status == ApplicationStatus.REJECTED:
            return NotificationSeverity.ATTENTION
        if status == ApplicationStatus.RESERVED:
            return NotificationSeverity.WARNING
        return NotificationSeverity.INFO

    @staticmethod
    def _build_status_notification_title(status: ApplicationStatus) -> str:
        if status == ApplicationStatus.INTERVIEW:
            return "Вас пригласили на собеседование"
        if status == ApplicationStatus.RESERVED:
            return "Ваш отклик переведен в резерв"
        if status == ApplicationStatus.REJECTED:
            return "По отклику обновился статус"
        return "По отклику обновился статус"

    @staticmethod
    def _build_status_notification_message(application: Application) -> str:
        opportunity_title = application.opportunity.title if application.opportunity is not None else "возможности"
        if application.status == ApplicationStatus.INTERVIEW:
            return f"Работодатель пригласил вас на следующий этап по возможности «{opportunity_title}»."
        if application.status == ApplicationStatus.RESERVED:
            return f"Ваш отклик по возможности «{opportunity_title}» переведен в резерв."
        if application.status == ApplicationStatus.REJECTED:
            return f"Работодатель обновил статус отклика по возможности «{opportunity_title}»."
        return f"Работодатель обновил статус отклика по возможности «{opportunity_title}»."

    def _notify_applicant_about_status_change(self, *, application: Application, created_at: datetime) -> None:
        preferences = UserRepository(self.db).get_notification_preferences(application.applicant_user_id)
        title = self._build_status_notification_title(application.status)
        message = self._build_status_notification_message(application)

        if preferences is not None and preferences.push_publication_changes:
            NotificationService(self.db).create_notification(
                user_id=application.applicant_user_id,
                kind=NotificationKind.APPLICATION,
                severity=self._resolve_status_notification_severity(application.status),
                title=title,
                message=message,
                action_label="Открыть мои отклики",
                action_url="/applications",
                payload={
                    "application_id": str(application.id),
                    "opportunity_id": str(application.opportunity_id),
                    "status": application.status.value,
                },
                created_at=created_at,
                profile_scope={"profile_role": UserRole.APPLICANT.value},
            )

        if preferences is not None and preferences.email_publication_changes:
            applicant = self.db.execute(select(User).where(User.id == application.applicant_user_id)).scalar_one_or_none()
            if applicant is not None and applicant.email:
                try:
                    send_email(
                        recipient=applicant.email,
                        subject=f"Трамплин: {title}",
                        body=(
                            f"{message}\n\n"
                            "Перейдите в раздел «Мои отклики», чтобы посмотреть детали: /applications"
                        ),
                    )
                except Exception:
                    return
