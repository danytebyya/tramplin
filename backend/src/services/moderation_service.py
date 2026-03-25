from datetime import UTC, datetime, timedelta

from src.enums import EmployerVerificationStatus, UserRole
from src.enums.statuses import EmployerVerificationRequestStatus
from src.models import User
from src.models.opportunity import ModerationStatus, OpportunityType
from src.repositories import ModerationRepository
from src.schemas.moderation import (
    EmployerVerificationDocumentRead,
    EmployerVerificationRequestListResponse,
    EmployerVerificationRequestRead,
    EmployerVerificationReviewRequest,
)
from src.schemas.user import ModerationSettingsRead, ModerationSettingsUpdateRequest
from src.utils.errors import AppError


class ModerationService:
    def __init__(self, repo: ModerationRepository) -> None:
        self.repo = repo

    def get_dashboard(self, current_user: User) -> dict:
        if current_user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
            raise AppError(
                code="MODERATION_FORBIDDEN",
                message="Недостаточно прав для просмотра дашборда модерации",
                status_code=403,
            )

        now = datetime.now(UTC)
        verification_requests = self.repo.list_verification_requests()
        opportunities = self.repo.list_opportunities()
        moderation_settings = self._get_or_create_settings()
        employer_name_by_id = {
            str(employer.id): employer.display_name for employer in self.repo.list_employers()
        }

        verification_in_moderation = [
            request
            for request in verification_requests
            if request.status
            in {
                EmployerVerificationRequestStatus.PENDING,
                EmployerVerificationRequestStatus.UNDER_REVIEW,
            }
        ]
        opportunity_in_moderation = [
            opportunity
            for opportunity in opportunities
            if opportunity.moderation_status == ModerationStatus.PENDING_REVIEW
        ]
        reviewed_today = self._count_reviewed_today(
            now=now,
            verification_requests=verification_requests,
            opportunities=opportunities,
        )

        weekly_activity = self._build_weekly_activity(
            now=now,
            verification_requests=verification_requests,
            opportunities=opportunities,
        )

        return {
            "metrics": {
                "total_on_moderation": len(verification_in_moderation) + len(opportunity_in_moderation),
                "in_queue": len(opportunity_in_moderation)
                + len(
                    [
                        request
                        for request in verification_requests
                        if request.status == EmployerVerificationRequestStatus.PENDING
                    ]
                ),
                "reviewed_today": reviewed_today,
                "curators_online": self.repo.count_online_curators(now),
            },
            "weekly_activity": weekly_activity,
            "latest_activity": self._build_latest_activity(
                verification_requests=verification_requests,
                opportunities=opportunities,
                employer_name_by_id=employer_name_by_id,
            ),
            "urgent_task_groups": self._build_urgent_task_groups(
                now=now,
                verification_requests=verification_requests,
                opportunities=opportunities,
                moderation_settings=moderation_settings,
                employer_name_by_id=employer_name_by_id,
            ),
        }

    def get_settings(self, current_user: User) -> ModerationSettingsRead:
        self._ensure_moderation_access(current_user)
        return self._serialize_settings(self._get_or_create_settings())

    def list_employer_verification_requests(
        self,
        current_user: User,
        *,
        search: str | None,
        statuses: list[str] | None,
        period: str | None,
        page: int,
        page_size: int,
    ) -> EmployerVerificationRequestListResponse:
        self._ensure_moderation_access(current_user)
        requests = self.repo.list_verification_requests()
        employer_profiles = self.repo.list_employer_profiles()
        profile_by_inn = {profile.inn: profile for profile in employer_profiles}
        normalized_search = (search or "").strip().lower()
        normalized_statuses = {
            status
            for status in (statuses or [])
            if status in {member.value for member in EmployerVerificationRequestStatus}
        }
        now = datetime.now(UTC)

        filtered_requests = requests
        if normalized_search:
            filtered_requests = [
                request
                for request in filtered_requests
                if normalized_search in request.legal_name.lower()
                or normalized_search in request.inn.lower()
                or (
                    request.corporate_email is not None
                    and normalized_search in request.corporate_email.lower()
                )
            ]

        if normalized_statuses and "all" not in normalized_statuses:
            filtered_requests = [
                request for request in filtered_requests if request.status.value in normalized_statuses
            ]

        if period in {"today", "week", "month"}:
            threshold = (
                now - timedelta(days=1)
                if period == "today"
                else now - timedelta(days=7)
                if period == "week"
                else now - timedelta(days=30)
            )
            filtered_requests = [
                request
                for request in filtered_requests
                if self._normalize_datetime(request.submitted_at) >= threshold
            ]

        total = len(filtered_requests)
        start_index = max(page - 1, 0) * page_size
        end_index = start_index + page_size
        page_items = filtered_requests[start_index:end_index]

        return EmployerVerificationRequestListResponse(
            items=[
                self._serialize_verification_request(
                    request,
                    employer_profile=profile_by_inn.get(request.inn),
                )
                for request in page_items
            ],
            total=total,
            page=page,
            page_size=page_size,
        )

    def approve_employer_verification_request(
        self,
        current_user: User,
        request_id: str,
        payload: EmployerVerificationReviewRequest,
    ) -> EmployerVerificationRequestRead:
        self._ensure_moderation_access(current_user)
        verification_request = self._get_verification_request_or_raise(request_id)
        verification_request.status = EmployerVerificationRequestStatus.APPROVED
        verification_request.reviewed_by = current_user.id
        verification_request.reviewed_at = datetime.now(UTC)
        verification_request.moderator_comment = payload.moderator_comment
        verification_request.rejection_reason = None

        if verification_request.employer is not None:
            verification_request.employer.verification_status = EmployerVerificationRequestStatus.APPROVED
            verification_request.employer.verified_at = datetime.now(UTC)
            verification_request.employer.updated_by = current_user.id

        employer_profile = self._get_employer_profile_by_inn(verification_request.inn)
        if employer_profile is not None:
            employer_profile.verification_status = EmployerVerificationStatus.VERIFIED
            employer_profile.moderator_comment = payload.moderator_comment
            self.repo.db.add(employer_profile)

        self.repo.db.add(verification_request)
        self.repo.db.commit()
        self.repo.db.refresh(verification_request)
        return self._serialize_verification_request(verification_request, employer_profile=employer_profile)

    def reject_employer_verification_request(
        self,
        current_user: User,
        request_id: str,
        payload: EmployerVerificationReviewRequest,
    ) -> EmployerVerificationRequestRead:
        self._ensure_moderation_access(current_user)
        verification_request = self._get_verification_request_or_raise(request_id)
        verification_request.status = EmployerVerificationRequestStatus.REJECTED
        verification_request.reviewed_by = current_user.id
        verification_request.reviewed_at = datetime.now(UTC)
        verification_request.rejection_reason = payload.moderator_comment
        verification_request.moderator_comment = payload.moderator_comment

        if verification_request.employer is not None:
            verification_request.employer.verification_status = EmployerVerificationRequestStatus.REJECTED
            verification_request.employer.updated_by = current_user.id

        employer_profile = self._get_employer_profile_by_inn(verification_request.inn)
        if employer_profile is not None:
            employer_profile.verification_status = EmployerVerificationStatus.REJECTED
            employer_profile.moderator_comment = payload.moderator_comment
            self.repo.db.add(employer_profile)

        self.repo.db.add(verification_request)
        self.repo.db.commit()
        self.repo.db.refresh(verification_request)
        return self._serialize_verification_request(verification_request, employer_profile=employer_profile)

    def request_employer_verification_changes(
        self,
        current_user: User,
        request_id: str,
        payload: EmployerVerificationReviewRequest,
    ) -> EmployerVerificationRequestRead:
        self._ensure_moderation_access(current_user)
        verification_request = self._get_verification_request_or_raise(request_id)
        verification_request.status = EmployerVerificationRequestStatus.SUSPENDED
        verification_request.reviewed_by = current_user.id
        verification_request.reviewed_at = datetime.now(UTC)
        verification_request.moderator_comment = payload.moderator_comment
        verification_request.rejection_reason = None

        if verification_request.employer is not None:
            verification_request.employer.verification_status = EmployerVerificationRequestStatus.SUSPENDED
            verification_request.employer.updated_by = current_user.id

        employer_profile = self._get_employer_profile_by_inn(verification_request.inn)
        if employer_profile is not None:
            employer_profile.verification_status = EmployerVerificationStatus.CHANGES_REQUESTED
            employer_profile.moderator_comment = payload.moderator_comment
            self.repo.db.add(employer_profile)

        self.repo.db.add(verification_request)
        self.repo.db.commit()
        self.repo.db.refresh(verification_request)
        return self._serialize_verification_request(verification_request, employer_profile=employer_profile)

    def update_settings(
        self,
        current_user: User,
        payload: ModerationSettingsUpdateRequest,
    ) -> ModerationSettingsRead:
        self._ensure_moderation_access(current_user)
        settings = self._get_or_create_settings()
        updated_settings = self.repo.update_settings(
            settings,
            vacancy_review_hours=payload.vacancy_review_hours,
            internship_review_hours=payload.internship_review_hours,
            event_review_hours=payload.event_review_hours,
            mentorship_review_hours=payload.mentorship_review_hours,
            updated_by_user_id=current_user.id,
        )
        self.db_commit()
        self.repo.db.refresh(updated_settings)
        return self._serialize_settings(updated_settings)

    def _count_reviewed_today(
        self,
        *,
        now: datetime,
        verification_requests: list,
        opportunities: list,
    ) -> int:
        today = now.date()
        reviewed_verifications = [
            request
            for request in verification_requests
            if request.reviewed_at is not None and self._normalize_datetime(request.reviewed_at).date() == today
        ]
        reviewed_opportunities = [
            opportunity
            for opportunity in opportunities
            if opportunity.moderated_at is not None
            and opportunity.moderation_status != ModerationStatus.PENDING_REVIEW
            and self._normalize_datetime(opportunity.moderated_at).date() == today
        ]
        return len(reviewed_verifications) + len(reviewed_opportunities)

    def _build_weekly_activity(self, *, now: datetime, verification_requests: list, opportunities: list) -> dict:
        today = now.date()
        week_dates = [today - timedelta(days=offset) for offset in range(6, -1, -1)]
        day_labels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
        counts_by_date = {day: 0 for day in week_dates}
        category_counts = {
            "vacancy": 0,
            "internship": 0,
            "event": 0,
            "mentorship": 0,
        }

        for request in verification_requests:
            if request.reviewed_at is None:
                continue
            reviewed_at = self._normalize_datetime(request.reviewed_at).date()
            if reviewed_at in counts_by_date:
                counts_by_date[reviewed_at] += 1

        for opportunity in opportunities:
            if (
                opportunity.moderated_at is None
                or opportunity.moderation_status == ModerationStatus.PENDING_REVIEW
            ):
                continue
            reviewed_at = self._normalize_datetime(opportunity.moderated_at).date()
            if reviewed_at in counts_by_date:
                counts_by_date[reviewed_at] += 1
                category_counts[self._serialize_opportunity_kind(opportunity.opportunity_type)] += 1

        day_items = [
            {"label": day_labels[index], "count": counts_by_date[day]}
            for index, day in enumerate(week_dates)
        ]
        category_items = [
            {"label": "Вакансии", "count": category_counts["vacancy"]},
            {"label": "Стажировки", "count": category_counts["internship"]},
            {"label": "Мероприятия", "count": category_counts["event"]},
            {"label": "Менторства", "count": category_counts["mentorship"]},
        ]

        return {
            "total_reviewed": sum(item["count"] for item in day_items),
            "days": day_items,
            "categories": category_items,
        }

    def _build_latest_activity(
        self,
        *,
        verification_requests: list,
        opportunities: list,
        employer_name_by_id: dict[str, str],
    ) -> list[dict]:
        items: list[dict] = []

        for request in verification_requests:
            if request.reviewed_at is None:
                continue
            status_label, status_variant = self._serialize_verification_status(request.status)
            items.append(
                {
                    "id": f"verification:{request.id}",
                    "title": status_label,
                    "status_label": status_label,
                    "status_variant": status_variant,
                    "subject": employer_name_by_id.get(str(request.employer_id), request.legal_name),
                    "meta": "Верификация работодателя",
                    "created_at": self._normalize_datetime(request.reviewed_at).isoformat(),
                }
            )

        for opportunity in opportunities:
            if (
                opportunity.moderated_at is None
                or opportunity.moderation_status == ModerationStatus.PENDING_REVIEW
            ):
                continue
            status_label, status_variant = self._serialize_opportunity_status(
                opportunity.moderation_status
            )
            items.append(
                {
                    "id": f"opportunity:{opportunity.id}",
                    "title": status_label,
                    "status_label": status_label,
                    "status_variant": status_variant,
                    "subject": opportunity.title,
                    "meta": opportunity.employer.display_name if opportunity.employer else "Работодатель",
                    "created_at": self._normalize_datetime(opportunity.moderated_at).isoformat(),
                }
            )

        items.sort(key=lambda item: item["created_at"], reverse=True)
        return items[:6]

    def _build_urgent_task_groups(
        self,
        *,
        now: datetime,
        verification_requests: list,
        opportunities: list,
        moderation_settings,
        employer_name_by_id: dict[str, str],
    ) -> list[dict]:
        verification_overdue_threshold = now - timedelta(days=3)
        complaint_items: list[dict] = []
        overdue_items: list[dict] = []
        change_items: list[dict] = []

        for request in verification_requests:
            subject = employer_name_by_id.get(str(request.employer_id), request.legal_name)

            if request.status in {
                EmployerVerificationRequestStatus.PENDING,
                EmployerVerificationRequestStatus.UNDER_REVIEW,
            }:
                submitted_at = self._normalize_datetime(request.submitted_at)
                if submitted_at <= verification_overdue_threshold:
                    overdue_items.append(
                        {
                            "id": f"verification:{request.id}",
                            "subject": subject,
                            "meta": "Верификация работодателя",
                            "age_days": (now.date() - submitted_at.date()).days,
                        }
                    )

            if request.status == EmployerVerificationRequestStatus.REJECTED:
                complaint_items.append(
                    {
                        "id": f"verification:{request.id}",
                        "subject": subject,
                        "meta": "Отклонённая верификация",
                        "age_days": 0,
                    }
                )

            if request.status == EmployerVerificationRequestStatus.SUSPENDED:
                change_items.append(
                    {
                        "id": f"verification:{request.id}",
                        "subject": subject,
                        "meta": "Запрошены изменения",
                        "age_days": 0,
                    }
                )

        for opportunity in opportunities:
            meta = opportunity.employer.display_name if opportunity.employer else "Работодатель"

            if opportunity.moderation_status == ModerationStatus.PENDING_REVIEW:
                created_at = self._normalize_datetime(opportunity.created_at)
                if created_at <= self._get_opportunity_overdue_threshold(
                    now,
                    opportunity.opportunity_type,
                    moderation_settings,
                ):
                    overdue_items.append(
                        {
                            "id": f"opportunity:{opportunity.id}",
                            "subject": opportunity.title,
                            "meta": meta,
                            "age_days": (now.date() - created_at.date()).days,
                        }
                    )

            if opportunity.moderation_status == ModerationStatus.BLOCKED:
                complaint_items.append(
                    {
                        "id": f"opportunity:{opportunity.id}",
                        "subject": opportunity.title,
                        "meta": meta,
                        "age_days": 0,
                    }
                )

            if opportunity.moderation_status in {ModerationStatus.REJECTED, ModerationStatus.HIDDEN}:
                change_items.append(
                    {
                        "id": f"opportunity:{opportunity.id}",
                        "subject": opportunity.title,
                        "meta": meta,
                        "age_days": 0,
                    }
                )

        overdue_items.sort(key=lambda item: item["age_days"], reverse=True)
        return [
            {
                "title": "Жалобы",
                "accent": "danger",
                "items": complaint_items,
            },
            {
                "title": "Просрочено",
                "accent": "muted",
                "items": overdue_items,
            },
            {
                "title": "Изменения",
                "accent": "accent",
                "items": change_items,
            },
        ]

    def _get_or_create_settings(self):
        settings = self.repo.get_settings()
        if settings is None:
            settings = self.repo.create_settings()
            self.db_commit()
            self.repo.db.refresh(settings)
        return settings

    @staticmethod
    def _serialize_settings(settings) -> ModerationSettingsRead:
        return ModerationSettingsRead(
            vacancy_review_hours=settings.vacancy_review_hours,
            internship_review_hours=settings.internship_review_hours,
            event_review_hours=settings.event_review_hours,
            mentorship_review_hours=settings.mentorship_review_hours,
        )

    @staticmethod
    def _get_opportunity_overdue_threshold(now: datetime, opportunity_type: OpportunityType, settings) -> datetime:
        if opportunity_type == OpportunityType.INTERNSHIP:
            return now - timedelta(hours=settings.internship_review_hours)
        if opportunity_type == OpportunityType.CAREER_EVENT:
            return now - timedelta(hours=settings.event_review_hours)
        if opportunity_type == OpportunityType.MENTORSHIP_PROGRAM:
            return now - timedelta(hours=settings.mentorship_review_hours)
        return now - timedelta(hours=settings.vacancy_review_hours)

    @staticmethod
    def _ensure_moderation_access(current_user: User) -> None:
        if current_user.role not in {UserRole.CURATOR, UserRole.ADMIN}:
            raise AppError(
                code="MODERATION_FORBIDDEN",
                message="Недостаточно прав для просмотра дашборда модерации",
                status_code=403,
            )

    def db_commit(self) -> None:
        self.repo.db.commit()

    def _get_verification_request_or_raise(self, request_id: str):
        verification_request = self.repo.get_verification_request_by_id(request_id)
        if verification_request is None:
            raise AppError(
                code="MODERATION_VERIFICATION_REQUEST_NOT_FOUND",
                message="Заявка на верификацию не найдена",
                status_code=404,
            )
        return verification_request

    def _get_employer_profile_by_inn(self, inn: str):
        employer_profiles = self.repo.list_employer_profiles()
        return next((profile for profile in employer_profiles if profile.inn == inn), None)

    def _serialize_verification_request(
        self,
        request,
        *,
        employer_profile,
    ) -> EmployerVerificationRequestRead:
        documents = [
            EmployerVerificationDocumentRead(
                id=str(document.id),
                file_name=(
                    document.media_file.original_filename
                    if document.media_file is not None
                    else "Документ"
                ),
                file_size=document.media_file.file_size if document.media_file is not None else 0,
                mime_type=(
                    document.media_file.mime_type
                    if document.media_file is not None
                    else "application/octet-stream"
                ),
                file_url=(
                    document.media_file.public_url
                    if document.media_file is not None
                    else document.source_url
                ),
            )
            for document in request.documents
        ]
        return EmployerVerificationRequestRead(
            id=str(request.id),
            employer_name=request.legal_name,
            inn=request.inn,
            corporate_email=request.corporate_email,
            website_url=(
                request.employer.website_url
                if request.employer is not None and request.employer.website_url
                else employer_profile.website if employer_profile is not None else None
            ),
            employer_type=request.employer_type.value,
            submitted_at=self._normalize_datetime(request.submitted_at).isoformat(),
            status=request.status,
            moderator_comment=request.moderator_comment,
            rejection_reason=request.rejection_reason,
            documents=documents,
        )

    @staticmethod
    def _serialize_opportunity_kind(opportunity_type: OpportunityType) -> str:
        if opportunity_type == OpportunityType.INTERNSHIP:
            return "internship"
        if opportunity_type == OpportunityType.CAREER_EVENT:
            return "event"
        if opportunity_type == OpportunityType.MENTORSHIP_PROGRAM:
            return "mentorship"
        return "vacancy"

    @staticmethod
    def _serialize_opportunity_status(status: ModerationStatus) -> tuple[str, str]:
        if status == ModerationStatus.APPROVED:
            return "Одобрена публикация", "approved"
        if status in {ModerationStatus.REJECTED, ModerationStatus.BLOCKED}:
            return "Отклонена публикация", "rejected"
        if status == ModerationStatus.HIDDEN:
            return "Снято с публикации", "unpublished"
        return "На модерации", "pending-review"

    @staticmethod
    def _serialize_verification_status(status: EmployerVerificationRequestStatus) -> tuple[str, str]:
        if status == EmployerVerificationRequestStatus.APPROVED:
            return "Верифицирована компания", "verified"
        if status == EmployerVerificationRequestStatus.REJECTED:
            return "Отклонена верификация", "rejected"
        if status == EmployerVerificationRequestStatus.SUSPENDED:
            return "Нужны уточнения", "info-request"
        return "На рассмотрении", "pending-review"

    @staticmethod
    def _normalize_datetime(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
