from datetime import UTC, datetime, timedelta
from dataclasses import dataclass
import logging

from sqlalchemy.exc import ProgrammingError

from src.enums import EmployerVerificationStatus, UserRole
from src.enums.notifications import NotificationKind, NotificationSeverity
from src.enums.statuses import EmployerVerificationRequestStatus
from src.models import User
from src.models.opportunity import ModerationStatus, OpportunityType
from src.repositories import ModerationRepository
from src.core.security import hash_password
from src.models import UserNotificationPreference
from src.schemas.moderation import (
    CuratorCreateRequest,
    CuratorManagementItemRead,
    CuratorManagementListResponse,
    CuratorManagementMetricsRead,
    EmployerVerificationDocumentRead,
    EmployerVerificationRequestListResponse,
    EmployerVerificationRequestRead,
    EmployerVerificationReviewRequest,
)
from src.realtime.notification_hub import notification_hub
from src.services.email_service import send_email
from src.services.notification_service import NotificationService
from src.schemas.user import ModerationSettingsRead, ModerationSettingsUpdateRequest
from src.utils.errors import AppError


@dataclass(frozen=True)
class ModerationSettingsFallback:
    vacancy_review_hours: int = 24
    internship_review_hours: int = 24
    event_review_hours: int = 24
    mentorship_review_hours: int = 24


class ModerationService:
    DEFAULT_REQUEST_CHANGES_COMMENT = (
        "Требуется дополнить заявку: проверьте полноту заполнения данных, контактную информацию и приложенные документы."
    )
    DEFAULT_REJECTION_COMMENT = (
        "Верификация отклонена. При необходимости вы можете отправить заявку повторно."
    )
    SIDE_EFFECT_ACTION_APPROVE = "approve"
    SIDE_EFFECT_ACTION_REJECT = "reject"
    SIDE_EFFECT_ACTION_REQUEST_CHANGES = "request-changes"

    def __init__(self, repo: ModerationRepository) -> None:
        self.repo = repo
        self.logger = logging.getLogger(__name__)

    def get_dashboard(self, current_user: User) -> dict:
        if current_user.role not in {UserRole.JUNIOR, UserRole.CURATOR, UserRole.ADMIN}:
            raise AppError(
                code="MODERATION_FORBIDDEN",
                message="Недостаточно прав для просмотра дашборда модерации",
                status_code=403,
            )

        now = datetime.now(UTC)
        verification_requests = self.repo.list_verification_requests()
        opportunities = self.repo.list_opportunities()
        notifications = self.repo.list_notifications_by_kind(NotificationKind.EMPLOYER_VERIFICATION)
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
                notifications=notifications,
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

    def list_curators(self, current_user: User) -> CuratorManagementListResponse:
        if current_user.role != UserRole.ADMIN:
            raise AppError(
                code="MODERATION_FORBIDDEN",
                message="Недостаточно прав для управления кураторами",
                status_code=403,
            )

        now = datetime.now(UTC)
        curators = self.repo.list_curators()
        verification_requests = self.repo.list_verification_requests()
        opportunities = self.repo.list_opportunities()
        active_session_rows = self.repo.list_active_curator_session_rows(now)

        online_by_user_id = {
            str(user_id): self._normalize_datetime(last_seen_at)
            for user_id, last_seen_at in active_session_rows
        }
        today = now.date()
        queued_requests = len(
            [
                request
                for request in verification_requests
                if request.status
                in {
                    EmployerVerificationRequestStatus.PENDING,
                    EmployerVerificationRequestStatus.UNDER_REVIEW,
                }
            ]
        ) + len(
            [
                opportunity
                for opportunity in opportunities
                if opportunity.moderation_status == ModerationStatus.PENDING_REVIEW
            ]
        )

        items: list[CuratorManagementItemRead] = []
        reviewed_today_total = 0

        for curator in curators:
            curator_id = str(curator.id)
            verification_reviews = [
                request
                for request in verification_requests
                if request.reviewed_by is not None
                and str(request.reviewed_by) == curator_id
                and request.reviewed_at is not None
            ]
            opportunity_reviews = [
                opportunity
                for opportunity in opportunities
                if opportunity.moderated_by_user_id is not None
                and str(opportunity.moderated_by_user_id) == curator_id
                and opportunity.moderated_at is not None
            ]

            reviewed_today = len(
                [
                    request
                    for request in verification_reviews
                    if self._normalize_datetime(request.reviewed_at).date() == today
                ]
            ) + len(
                [
                    opportunity
                    for opportunity in opportunity_reviews
                    if self._normalize_datetime(opportunity.moderated_at).date() == today
                ]
            )
            last_activity_candidates = [
                online_by_user_id.get(curator_id),
                *[
                    self._normalize_datetime(request.reviewed_at)
                    for request in verification_reviews
                    if request.reviewed_at is not None
                ],
                *[
                    self._normalize_datetime(opportunity.moderated_at)
                    for opportunity in opportunity_reviews
                    if opportunity.moderated_at is not None
                ],
            ]
            last_activity = max(
                (item for item in last_activity_candidates if item is not None),
                default=None,
            )

            reviewed_today_total += reviewed_today
            items.append(
                CuratorManagementItemRead(
                    id=curator_id,
                    full_name=(
                        curator.curator_profile.full_name
                        if curator.curator_profile is not None and curator.curator_profile.full_name
                        else curator.display_name
                    ),
                    email=curator.email,
                    role=(
                        "admin"
                        if curator.role == UserRole.ADMIN
                        else "junior" if curator.role == UserRole.JUNIOR else "curator"
                    ),
                    reviewed_today=reviewed_today,
                    status="online" if curator_id in online_by_user_id else "offline",
                    last_activity_at=last_activity.isoformat() if last_activity is not None else None,
                )
            )

        items.sort(
            key=lambda item: (
                item.status != "online",
                item.full_name.lower(),
            )
        )

        return CuratorManagementListResponse(
            metrics=CuratorManagementMetricsRead(
                total_curators=len(curators),
                online_curators=len(online_by_user_id),
                queued_requests=queued_requests,
                reviewed_today=reviewed_today_total,
            ),
            items=items,
        )

    def create_curator(self, current_user: User, payload: CuratorCreateRequest) -> CuratorManagementItemRead:
        if current_user.role != UserRole.ADMIN:
            raise AppError(
                code="MODERATION_FORBIDDEN",
                message="Недостаточно прав для управления кураторами",
                status_code=403,
            )

        existing_user = self.repo.get_user_by_email(payload.email)
        if existing_user is not None:
            raise AppError(
                code="USER_EMAIL_ALREADY_EXISTS",
                message="Пользователь с таким email уже существует.",
                status_code=409,
            )

        next_role = (
            UserRole.ADMIN
            if payload.role == "admin"
            else UserRole.JUNIOR if payload.role == "junior" else UserRole.CURATOR
        )
        curator = self.repo.create_curator(
            full_name=payload.full_name,
            email=payload.email,
            password_hash=hash_password(payload.password),
            role=next_role,
        )
        self.repo.db.flush()

        preferences = UserNotificationPreference(user_id=curator.id)
        preferences.email_new_verification_requests = False
        preferences.email_content_complaints = False
        preferences.email_overdue_reviews = False
        preferences.email_company_profile_changes = False
        preferences.email_publication_changes = False
        preferences.email_daily_digest = False
        preferences.email_weekly_report = False
        preferences.push_new_verification_requests = False
        preferences.push_content_complaints = False
        preferences.push_overdue_reviews = False
        preferences.push_company_profile_changes = False
        preferences.push_publication_changes = False
        preferences.push_daily_digest = False
        preferences.push_weekly_report = False
        self.repo.db.add(preferences)
        self.repo.db.commit()
        self.repo.db.refresh(curator)

        return CuratorManagementItemRead(
            id=str(curator.id),
            full_name=payload.full_name,
            email=payload.email,
            role=payload.role,
            reviewed_today=0,
            status="offline",
            last_activity_at=None,
        )

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
        self._publish_verification_request_updated(verification_request)
        return self._serialize_verification_request(verification_request, employer_profile=employer_profile)

    def reject_employer_verification_request(
        self,
        current_user: User,
        request_id: str,
        payload: EmployerVerificationReviewRequest,
    ) -> EmployerVerificationRequestRead:
        self._ensure_moderation_access(current_user)
        verification_request = self._get_verification_request_or_raise(request_id)
        resolved_moderator_comment = self._resolve_rejection_comment(payload.moderator_comment)
        verification_request.status = EmployerVerificationRequestStatus.REJECTED
        verification_request.reviewed_by = current_user.id
        verification_request.reviewed_at = datetime.now(UTC)
        verification_request.rejection_reason = resolved_moderator_comment
        verification_request.moderator_comment = resolved_moderator_comment

        if verification_request.employer is not None:
            verification_request.employer.verified_at = None
            verification_request.employer.updated_by = current_user.id

        employer_profile = self._get_employer_profile_by_inn(verification_request.inn)
        if employer_profile is not None:
            employer_profile.verification_status = EmployerVerificationStatus.UNVERIFIED
            employer_profile.moderator_comment = resolved_moderator_comment
            self.repo.db.add(employer_profile)

        self.repo.db.add(verification_request)
        self.repo.db.commit()
        self.repo.db.refresh(verification_request)
        self._publish_verification_request_updated(verification_request)
        return self._serialize_verification_request(verification_request, employer_profile=employer_profile)

    def request_employer_verification_changes(
        self,
        current_user: User,
        request_id: str,
        payload: EmployerVerificationReviewRequest,
    ) -> EmployerVerificationRequestRead:
        self._ensure_moderation_access(current_user)
        verification_request = self._get_verification_request_or_raise(request_id)
        employer_profile = self._get_employer_profile_by_inn(verification_request.inn)
        resolved_moderator_comment = self._resolve_request_changes_comment(payload.moderator_comment)

        verification_request.status = EmployerVerificationRequestStatus.SUSPENDED
        verification_request.reviewed_by = current_user.id
        verification_request.reviewed_at = datetime.now(UTC)
        verification_request.moderator_comment = resolved_moderator_comment
        verification_request.rejection_reason = None

        if verification_request.employer is not None:
            verification_request.employer.verified_at = None
            verification_request.employer.updated_by = current_user.id

        if employer_profile is not None:
            employer_profile.verification_status = EmployerVerificationStatus.CHANGES_REQUESTED
            employer_profile.moderator_comment = resolved_moderator_comment
            self.repo.db.add(employer_profile)

        self.repo.db.add(verification_request)
        self.repo.db.commit()
        self.repo.db.refresh(verification_request)
        self._publish_verification_request_updated(verification_request)
        return self._serialize_verification_request(verification_request, employer_profile=employer_profile)

    def _publish_verification_request_updated(self, verification_request) -> None:
        moderator_user_ids = [str(user.id) for user in self.repo.list_curators()]
        if not moderator_user_ids:
            return

        notification_hub.publish_to_users_sync(
            moderator_user_ids,
            {
                "type": "moderation_employer_verification_updated",
                "verification_request_id": str(verification_request.id),
                "status": verification_request.status.value,
            },
        )

    def run_employer_verification_side_effects(self, *, action: str, request_id: str) -> None:
        try:
            verification_request = self._get_verification_request_or_raise(request_id)
            employer_profile = self._get_employer_profile_by_inn(verification_request.inn)

            if action == self.SIDE_EFFECT_ACTION_APPROVE:
                self._create_approved_notification(verification_request=verification_request)
            elif action == self.SIDE_EFFECT_ACTION_REJECT:
                self._send_rejection_email(
                    verification_request=verification_request,
                    employer_profile=employer_profile,
                    moderator_comment=verification_request.moderator_comment,
                )
                self._create_rejected_notification(
                    verification_request=verification_request,
                    moderator_comment=verification_request.moderator_comment,
                )
            elif action == self.SIDE_EFFECT_ACTION_REQUEST_CHANGES:
                try:
                    self._send_request_changes_email_with_retry(
                        verification_request=verification_request,
                        employer_profile=employer_profile,
                        moderator_comment=verification_request.moderator_comment,
                    )
                except Exception:
                    self.logger.warning(
                        "moderation.request_changes_email.failed_async request_id=%s",
                        verification_request.id,
                    )
                self._create_request_changes_notification(
                    verification_request=verification_request,
                    moderator_comment=verification_request.moderator_comment,
                )
            else:
                raise ValueError(f"Unsupported moderation side effect action: {action}")

            self.repo.db.commit()
        except Exception:
            self.repo.db.rollback()
            logging.getLogger(__name__).exception(
                "moderation.verification_side_effects.failed action=%s request_id=%s",
                action,
                request_id,
            )

    def _create_approved_notification(self, *, verification_request) -> None:
        if verification_request.submitted_by is None:
            return

        NotificationService(self.repo.db).create_notification(
            user_id=verification_request.submitted_by,
            kind=NotificationKind.EMPLOYER_VERIFICATION,
            severity=NotificationSeverity.SUCCESS,
            title="Верификация одобрена",
            message="Компания успешно прошла проверку.",
            action_label="Открыть дашборд",
            action_url="/dashboard/employer",
            payload={
                "verification_request_id": str(verification_request.id),
                "inn": verification_request.inn,
                "status": EmployerVerificationRequestStatus.APPROVED.value,
            },
            created_at=datetime.now(UTC),
        )

    def _create_rejected_notification(self, *, verification_request, moderator_comment: str | None) -> None:
        if verification_request.submitted_by is None:
            return

        NotificationService(self.repo.db).create_notification(
            user_id=verification_request.submitted_by,
            kind=NotificationKind.EMPLOYER_VERIFICATION,
            severity=NotificationSeverity.WARNING,
            title="Верификация отклонена",
            message=moderator_comment or self.DEFAULT_REJECTION_COMMENT,
            action_label="Исправить данные",
            action_url="/onboarding/employer?mode=rejected",
            payload={
                "verification_request_id": str(verification_request.id),
                "inn": verification_request.inn,
                "status": EmployerVerificationRequestStatus.REJECTED.value,
            },
            created_at=datetime.now(UTC),
        )

    def _create_request_changes_notification(
        self,
        *,
        verification_request,
        moderator_comment: str | None,
    ) -> None:
        if verification_request.submitted_by is None:
            return

        NotificationService(self.repo.db).create_notification(
            user_id=verification_request.submitted_by,
            kind=NotificationKind.EMPLOYER_VERIFICATION,
            severity=NotificationSeverity.WARNING,
            title="Запрос дополнительной информации",
            message=moderator_comment or self.DEFAULT_REQUEST_CHANGES_COMMENT,
            action_label="Открыть заявку",
            action_url="/onboarding/employer?mode=changes-requested",
            payload={
                "verification_request_id": str(verification_request.id),
                "inn": verification_request.inn,
                "status": EmployerVerificationRequestStatus.SUSPENDED.value,
            },
            created_at=datetime.now(UTC),
        )

    @classmethod
    def _resolve_request_changes_comment(cls, moderator_comment: str | None) -> str:
        normalized_comment = (moderator_comment or "").strip()
        return normalized_comment or cls.DEFAULT_REQUEST_CHANGES_COMMENT

    @classmethod
    def _resolve_rejection_comment(cls, moderator_comment: str | None) -> str:
        normalized_comment = (moderator_comment or "").strip()
        return normalized_comment or cls.DEFAULT_REJECTION_COMMENT

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
            {"label": day_labels[day.weekday()], "count": counts_by_date[day]}
            for day in week_dates
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
        notifications: list,
        employer_name_by_id: dict[str, str],
    ) -> list[dict]:
        items: list[dict] = []
        verification_request_by_id = {str(request.id): request for request in verification_requests}
        notification_backed_request_statuses: set[tuple[str, str]] = set()

        for notification in notifications:
            payload = notification.payload or {}
            request_id = payload.get("verification_request_id")
            payload_status = payload.get("status")
            if request_id is None or payload_status not in {
                EmployerVerificationRequestStatus.SUSPENDED.value,
                EmployerVerificationRequestStatus.REJECTED.value,
            }:
                continue

            request = verification_request_by_id.get(str(request_id))
            if request is None:
                continue

            status = EmployerVerificationRequestStatus(payload_status)
            status_label, status_variant = self._serialize_verification_status(status)
            notification_backed_request_statuses.add((str(request.id), payload_status))
            items.append(
                {
                    "id": f"verification-event:{notification.id}",
                    "title": status_label,
                    "status_label": status_label,
                    "status_variant": status_variant,
                    "subject": self._abbreviate_legal_entity_name(
                        employer_name_by_id.get(str(request.employer_id), request.legal_name)
                    ),
                    "meta": "Верификация работодателя",
                    "created_at": self._normalize_datetime(notification.created_at).isoformat(),
                }
            )

        for request in verification_requests:
            if request.reviewed_at is None or request.reviewed_by is None:
                continue
            if (
                request.status in {
                    EmployerVerificationRequestStatus.SUSPENDED,
                    EmployerVerificationRequestStatus.REJECTED,
                }
                and (str(request.id), request.status.value) in notification_backed_request_statuses
            ):
                continue
            status_label, status_variant = self._serialize_verification_status(request.status)
            items.append(
                {
                    "id": f"verification:{request.id}",
                    "title": status_label,
                    "status_label": status_label,
                    "status_variant": status_variant,
                    "subject": self._abbreviate_legal_entity_name(
                        employer_name_by_id.get(str(request.employer_id), request.legal_name)
                    ),
                    "meta": "Верификация работодателя",
                    "created_at": self._normalize_datetime(request.reviewed_at).isoformat(),
                }
            )

        for opportunity in opportunities:
            if (
                opportunity.moderated_at is None
                or opportunity.moderated_by_user_id is None
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
                    "meta": (
                        self._abbreviate_legal_entity_name(opportunity.employer.display_name)
                        if opportunity.employer
                        else "Работодатель"
                    ),
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
        changes_overdue_threshold = now - timedelta(days=1)
        complaint_items: list[dict] = []
        overdue_items: list[dict] = []
        change_items: list[dict] = []

        for request in verification_requests:
            subject = self._abbreviate_legal_entity_name(
                employer_name_by_id.get(str(request.employer_id), request.legal_name)
            )

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
                reviewed_at = (
                    self._normalize_datetime(request.reviewed_at)
                    if request.reviewed_at is not None
                    else self._normalize_datetime(request.submitted_at)
                )
                if reviewed_at <= changes_overdue_threshold:
                    change_items.append(
                        {
                            "id": f"verification:{request.id}",
                            "subject": subject,
                            "meta": "Запрошены изменения",
                            "age_days": (now.date() - reviewed_at.date()).days,
                        }
                    )

        for opportunity in opportunities:
            meta = (
                self._abbreviate_legal_entity_name(opportunity.employer.display_name)
                if opportunity.employer
                else "Работодатель"
            )

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
        try:
            settings = self.repo.get_settings()
        except ProgrammingError:
            self.repo.db.rollback()
            return ModerationSettingsFallback()

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
        if current_user.role not in {UserRole.JUNIOR, UserRole.CURATOR, UserRole.ADMIN}:
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

    @staticmethod
    def _abbreviate_legal_entity_name(value: str | None) -> str | None:
        if not value:
            return value

        normalized_value = " ".join(value.replace("\xa0", " ").split())
        replacements = (
            ("ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ ", "ООО "),
            ("ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО ", "ПАО "),
            ("НЕПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО ", "НАО "),
            ("АКЦИОНЕРНОЕ ОБЩЕСТВО ", "АО "),
            ("ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ ", "ИП "),
        )
        upper_value = normalized_value.upper()

        for full_prefix, abbreviated_prefix in replacements:
            if upper_value.startswith(full_prefix):
                return f"{abbreviated_prefix}{normalized_value[len(full_prefix):]}".strip()

        return normalized_value

    def _send_request_changes_email_with_retry(
        self,
        *,
        verification_request,
        employer_profile,
        moderator_comment: str | None,
    ) -> None:
        recipient = self._resolve_request_changes_email_recipient(
            verification_request=verification_request,
            employer_profile=employer_profile,
        )

        if recipient is None:
            raise AppError(
                code="MODERATION_REQUEST_CHANGES_EMAIL_MISSING",
                message="Не удалось определить email работодателя для запроса доп. информации.",
                status_code=503,
            )

        subject = "Трамплин: требуется дополнительная информация для верификации"
        body = self._build_request_changes_email_body(
            verification_request=verification_request,
            moderator_comment=moderator_comment,
        )

        last_error: Exception | None = None
        for attempt in range(1, 6):
            try:
                send_email(recipient=recipient, subject=subject, body=body)
                return
            except Exception as exc:
                last_error = exc
                self.logger.warning(
                    "moderation.request_changes_email.retry_failed request_id=%s attempt=%s recipient=%s",
                    verification_request.id,
                    attempt,
                    recipient,
                )

        if last_error is not None:
            raise last_error

    def _send_rejection_email(
        self,
        *,
        verification_request,
        employer_profile,
        moderator_comment: str | None,
    ) -> None:
        recipient = self._resolve_request_changes_email_recipient(
            verification_request=verification_request,
            employer_profile=employer_profile,
        )
        if recipient is None:
            return

        subject = "Трамплин: заявка на верификацию отклонена"
        body = self._build_rejection_email_body(
            verification_request=verification_request,
            moderator_comment=moderator_comment,
        )

        try:
            send_email(recipient=recipient, subject=subject, body=body)
        except Exception:
            self.logger.warning(
                "moderation.rejection_email.failed request_id=%s recipient=%s",
                verification_request.id,
                recipient,
            )

    def _resolve_request_changes_email_recipient(self, *, verification_request, employer_profile) -> str | None:
        if verification_request.submitted_by is not None:
            submitted_by_user = self.repo.db.get(User, verification_request.submitted_by)
            if submitted_by_user is not None and submitted_by_user.email:
                return submitted_by_user.email

        if verification_request.corporate_email:
            return verification_request.corporate_email

        if employer_profile is not None and employer_profile.corporate_email:
            return employer_profile.corporate_email

        return None

    @staticmethod
    def _build_request_changes_email_body(*, verification_request, moderator_comment: str | None) -> str:
        comment_section = (
            f"Комментарий куратора:\n{moderator_comment}\n\n"
            if moderator_comment
            else ""
        )
        return (
            "По вашей заявке на верификацию работодателя требуется дополнительная информация.\n\n"
            f"Компания: {verification_request.legal_name}\n"
            f"ИНН: {verification_request.inn}\n\n"
            f"{comment_section}"
            "Откройте раздел верификации работодателя в личном кабинете и загрузите обновлённые данные."
        )

    @staticmethod
    def _build_rejection_email_body(*, verification_request, moderator_comment: str | None) -> str:
        comment_section = (
            f"Причина:\n{moderator_comment}\n\n"
            if moderator_comment
            else ""
        )
        return (
            "Заявка на верификацию работодателя отклонена.\n\n"
            f"Компания: {verification_request.legal_name}\n"
            f"ИНН: {verification_request.inn}\n\n"
            f"{comment_section}"
            "Вы можете открыть раздел верификации работодателя в личном кабинете и подать заявку повторно."
        )

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
                    f"/api/v1/companies/verification-documents/{document.id}/file"
                    if document.media_file is not None
                    else document.source_url
                ),
            )
            for document in request.documents
        ]
        return EmployerVerificationRequestRead(
            id=str(request.id),
            employer_name=self._abbreviate_legal_entity_name(request.legal_name) or request.legal_name,
            inn=request.inn,
            corporate_email=request.corporate_email,
            website_url=(
                request.employer.website_url
                if request.employer is not None and request.employer.website_url
                else employer_profile.website if employer_profile is not None else None
            ),
            phone=(
                request.phone
                if request.phone
                else None
            ),
            social_link=(
                request.social_link
                if request.social_link
                else None
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
            return "Компания верифицирована", "verified"
        if status == EmployerVerificationRequestStatus.REJECTED:
            return "Отклонена верификация", "rejected"
        if status == EmployerVerificationRequestStatus.SUSPENDED:
            return "Запрос информации", "info-request"
        return "На рассмотрении", "pending-review"

    @staticmethod
    def _normalize_datetime(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
