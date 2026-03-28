import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import select

from src.enums import MembershipRole, NotificationKind, NotificationSeverity, UserRole, UserStatus
from src.models import (
    Employer,
    EmployerMembership,
    Location,
    Opportunity,
    OpportunityCompensation,
    OpportunityLevel,
    OpportunityStatus,
    OpportunityTag,
    OpportunityType,
    Tag,
    TagType,
    User,
    WorkFormat,
)
from src.models.opportunity import EmploymentType, ModerationStatus
from src.repositories import OpportunityRepository
from src.schemas.opportunity import EmployerOpportunityRead, EmployerOpportunityUpsertRequest
from src.services.notification_service import NotificationService
from src.realtime.notification_hub import notification_hub
from src.utils.errors import AppError


class OpportunityService:
    def __init__(self, repo: OpportunityRepository) -> None:
        self.repo = repo
        self.logger = logging.getLogger(__name__)

    def list_public_feed(self) -> list[dict]:
        opportunities = self.repo.list_public_feed()
        return [self._serialize_public_opportunity(opportunity, index) for index, opportunity in enumerate(opportunities)]

    def list_employer_items(self, current_user: User, *, access_payload: dict | None = None) -> list[EmployerOpportunityRead]:
        employer, membership = self._resolve_employer_access(current_user=current_user, access_payload=access_payload)
        self._ensure_manage_opportunities_allowed(membership)
        opportunities = self.repo.list_by_employer_id(str(employer.id))
        response_counts = self.repo.count_active_applications_by_opportunity_ids(
            [str(opportunity.id) for opportunity in opportunities]
        )
        return [
            self._serialize_employer_opportunity(
                opportunity,
                responses_count=response_counts.get(str(opportunity.id), 0),
            )
            for opportunity in opportunities
        ]

    def create_employer_item(
        self,
        current_user: User,
        payload: EmployerOpportunityUpsertRequest,
        *,
        access_payload: dict | None = None,
    ) -> EmployerOpportunityRead:
        employer, membership = self._resolve_employer_access(current_user=current_user, access_payload=access_payload)
        self._ensure_manage_opportunities_allowed(membership)

        opportunity = Opportunity(
            employer_id=employer.id,
            created_by_user_id=current_user.id,
            updated_by_user_id=current_user.id,
            title=payload.title,
            short_description=self._build_short_description(payload.description),
            description=payload.description,
            opportunity_type=self._resolve_opportunity_type(payload.opportunity_type),
            business_status=OpportunityStatus.DRAFT,
            moderation_status=ModerationStatus.PENDING_REVIEW,
            work_format=self._resolve_work_format(payload),
            employment_type=self._resolve_employment_type(payload),
            level=self._resolve_level(payload),
            contact_email=current_user.email or employer.corporate_email,
            starts_at=payload.planned_publish_at,
            application_deadline=self._resolve_application_deadline(payload.planned_publish_at),
            is_paid=self._resolve_is_paid(payload),
        )
        self.repo.db.add(opportunity)
        self.repo.db.flush()

        opportunity.location = self._build_location(payload)
        opportunity.compensation = self._build_compensation(payload, opportunity_id=opportunity.id)
        self._replace_opportunity_tags(opportunity, payload)

        self.repo.db.add(opportunity)
        self.repo.db.commit()
        self.repo.db.refresh(opportunity)
        self._publish_content_moderation_updated(opportunity)
        self._run_notification_side_effects(
            lambda: self._notify_moderators_about_submission(opportunity, employer=employer),
            action="create",
            opportunity_id=str(opportunity.id),
        )
        return self._serialize_employer_opportunity(opportunity)

    def update_employer_item(
        self,
        current_user: User,
        opportunity_id: str,
        payload: EmployerOpportunityUpsertRequest,
        *,
        access_payload: dict | None = None,
    ) -> EmployerOpportunityRead:
        employer, membership = self._resolve_employer_access(current_user=current_user, access_payload=access_payload)
        self._ensure_manage_opportunities_allowed(membership)

        opportunity = self.repo.get_by_id(opportunity_id)
        if opportunity is None or str(opportunity.employer_id) != str(employer.id):
            raise AppError(
                code="OPPORTUNITY_NOT_FOUND",
                message="Возможность не найдена",
                status_code=404,
            )

        opportunity.updated_by_user_id = current_user.id
        opportunity.title = payload.title
        opportunity.short_description = self._build_short_description(payload.description)
        opportunity.description = payload.description
        opportunity.opportunity_type = self._resolve_opportunity_type(payload.opportunity_type)
        opportunity.work_format = self._resolve_work_format(payload)
        opportunity.employment_type = self._resolve_employment_type(payload)
        opportunity.level = self._resolve_level(payload)
        opportunity.contact_email = current_user.email or employer.corporate_email
        opportunity.starts_at = payload.planned_publish_at
        opportunity.application_deadline = self._resolve_application_deadline(payload.planned_publish_at)
        opportunity.is_paid = self._resolve_is_paid(payload)
        opportunity.business_status = OpportunityStatus.DRAFT
        opportunity.moderation_status = ModerationStatus.PENDING_REVIEW
        opportunity.moderated_by_user_id = None
        opportunity.moderated_at = None
        opportunity.moderation_reason = None
        opportunity.published_at = None

        opportunity.location = self._build_location(payload, location=opportunity.location)
        opportunity.compensation = self._build_compensation(payload, opportunity_id=opportunity.id, compensation=opportunity.compensation)
        self._replace_opportunity_tags(opportunity, payload)

        self.repo.db.add(opportunity)
        self.repo.db.commit()
        self.repo.db.refresh(opportunity)
        self._publish_content_moderation_updated(opportunity)
        self._run_notification_side_effects(
            lambda: self._notify_moderators_about_resubmission(opportunity, employer=employer),
            action="update",
            opportunity_id=str(opportunity.id),
        )
        return self._serialize_employer_opportunity(opportunity)

    def delete_employer_item(
        self,
        current_user: User,
        opportunity_id: str,
        *,
        access_payload: dict | None = None,
    ) -> None:
        employer, membership = self._resolve_employer_access(current_user=current_user, access_payload=access_payload)
        self._ensure_manage_opportunities_allowed(membership)

        opportunity = self.repo.get_by_id(opportunity_id)
        if opportunity is None or str(opportunity.employer_id) != str(employer.id):
            raise AppError(
                code="OPPORTUNITY_NOT_FOUND",
                message="Возможность не найдена",
                status_code=404,
            )

        opportunity.deleted_at = datetime.now(UTC)
        opportunity.updated_by_user_id = current_user.id
        self.repo.db.add(opportunity)
        self.repo.db.commit()
        self._publish_content_moderation_updated(opportunity, status="deleted")

    def _serialize_public_opportunity(self, opportunity: Opportunity, index: int) -> dict:
        tags = [link.tag.name for link in opportunity.tag_links if link.tag is not None][:6]
        location = opportunity.location
        format_value = self._normalize_format(opportunity.work_format)
        city = location.city if location and location.city else "Россия"
        kind = self._kind_value(opportunity.opportunity_type)

        return {
            "id": str(opportunity.id),
            "employer_id": str(opportunity.employer_id),
            "title": opportunity.title,
            "company_name": opportunity.employer.display_name,
            "company_verified": opportunity.employer.verified_at is not None,
            "company_rating": self._company_rating(index),
            "company_reviews_count": self._company_reviews_count(index),
            "salary_label": self._build_salary_label(opportunity),
            "location_label": f"{city}, {self._format_label(format_value)}",
            "format": format_value,
            "kind": kind,
            "level_label": self._level_label(opportunity.level),
            "employment_label": self._employment_label(opportunity.employment_type, opportunity_type=opportunity.opportunity_type),
            "description": opportunity.description,
            "tags": tags,
            "latitude": float(location.latitude or Decimal("56.130000")),
            "longitude": float(location.longitude or Decimal("47.250000")),
            "accent": self._accent_value(kind, index),
            "business_status": self._resolve_public_business_status(opportunity).value,
            "moderation_status": opportunity.moderation_status.value,
            "responses_count": 0,
        }

    def _serialize_employer_opportunity(
        self,
        opportunity: Opportunity,
        *,
        responses_count: int = 0,
    ) -> EmployerOpportunityRead:
        location = opportunity.location
        tags = [link.tag.name for link in opportunity.tag_links if link.tag is not None]
        opportunity_type = self._kind_value(opportunity.opportunity_type)
        event_type = self._extract_first_matching(tags, self._event_type_names())
        mentorship_direction = self._extract_first_matching(tags, self._mentorship_direction_names())
        clean_tags = [
            item
            for item in tags
            if item != event_type and item != mentorship_direction
        ]
        starts_at = self._normalize_datetime(opportunity.starts_at)
        active_until = self._normalize_datetime(opportunity.application_deadline)
        published_at = self._normalize_datetime(opportunity.published_at)

        return EmployerOpportunityRead(
            id=str(opportunity.id),
            title=opportunity.title,
            company_name=opportunity.employer.display_name if opportunity.employer is not None else "Компания",
            author_email=opportunity.contact_email,
            opportunity_type=opportunity_type,
            kind=opportunity_type,
            salary_label=self._build_salary_label(opportunity),
            address=location.formatted_address if location and location.formatted_address else "",
            city=location.city if location and location.city else "",
            location_label=self._build_management_location_label(opportunity),
            tags=clean_tags,
            level_label=self._level_label(opportunity.level),
            employment_label=self._employment_label(opportunity.employment_type, opportunity_type=opportunity.opportunity_type),
            format=self._normalize_format(opportunity.work_format),
            format_label=self._format_label(self._normalize_format(opportunity.work_format)),
            description=opportunity.description,
            status=self._serialize_management_status(opportunity),
            moderation_comment=opportunity.moderation_reason,
            submitted_at=self._normalize_datetime(opportunity.created_at).isoformat(),
            published_at=published_at.isoformat() if published_at is not None else None,
            active_until=active_until.isoformat() if active_until is not None else None,
            planned_publish_at=starts_at.isoformat() if starts_at is not None else None,
            latitude=float(location.latitude or Decimal("56.130000")) if location is not None else 56.13,
            longitude=float(location.longitude or Decimal("47.250000")) if location is not None else 47.25,
            responses_count=responses_count,
            event_type=event_type,
            mentorship_direction=mentorship_direction,
            mentor_experience=self._level_label(opportunity.level) if opportunity.opportunity_type == OpportunityType.MENTORSHIP_PROGRAM else None,
        )

    def _build_management_location_label(self, opportunity: Opportunity) -> str:
        location = opportunity.location
        if location is None:
            return self._format_label(self._normalize_format(opportunity.work_format))

        address = location.formatted_address or location.city or "Россия"
        if opportunity.opportunity_type == OpportunityType.CAREER_EVENT:
            return address

        return f"{address} ({self._format_label(self._normalize_format(opportunity.work_format))})"

    def _serialize_management_status(self, opportunity: Opportunity) -> str:
        if opportunity.moderation_status == ModerationStatus.REJECTED:
            return "rejected"
        if opportunity.moderation_status == ModerationStatus.HIDDEN:
            return "changes_requested"
        if opportunity.moderation_status == ModerationStatus.PENDING_REVIEW:
            return "pending_review"

        effective_business_status = self._resolve_public_business_status(opportunity)
        if effective_business_status == OpportunityStatus.SCHEDULED:
            return "planned"
        if effective_business_status in {OpportunityStatus.CLOSED, OpportunityStatus.ARCHIVED}:
            return "removed"
        return "active"

    def _resolve_public_business_status(self, opportunity: Opportunity) -> OpportunityStatus:
        starts_at = self._normalize_datetime(opportunity.starts_at)
        if opportunity.business_status == OpportunityStatus.SCHEDULED and starts_at is not None:
            if starts_at <= datetime.now(UTC):
                return OpportunityStatus.ACTIVE
        return opportunity.business_status

    def _build_location(self, payload: EmployerOpportunityUpsertRequest, *, location: Location | None = None) -> Location:
        target = location or Location(
            country_code="RU",
            country_name="Россия",
            city=payload.city,
        )
        target.country_code = "RU"
        target.country_name = "Россия"
        target.city = payload.city
        target.formatted_address = payload.address
        target.latitude = Decimal(str(payload.latitude))
        target.longitude = Decimal(str(payload.longitude))
        return target

    def _build_compensation(
        self,
        payload: EmployerOpportunityUpsertRequest,
        *,
        opportunity_id,
        compensation: OpportunityCompensation | None = None,
    ) -> OpportunityCompensation:
        target = compensation or OpportunityCompensation(opportunity_id=opportunity_id)
        target.salary_from = None
        target.salary_to = None
        target.currency_code = "RUB"
        target.stipend_text = payload.salary_label
        return target

    def _replace_opportunity_tags(self, opportunity: Opportunity, payload: EmployerOpportunityUpsertRequest) -> None:
        existing_links = list(opportunity.tag_links)
        for link in existing_links:
            self.repo.db.delete(link)
        opportunity.tag_links.clear()

        next_tags = payload.tags[:]
        if payload.event_type:
            next_tags.append(payload.event_type)
        if payload.mentorship_direction:
            next_tags.append(payload.mentorship_direction)

        seen_names: set[str] = set()
        for name in next_tags:
            normalized_name = name.strip()
            if not normalized_name:
                continue
            lowered_name = normalized_name.lower()
            if lowered_name in seen_names:
                continue
            seen_names.add(lowered_name)
            tag = self._get_or_create_tag(
                normalized_name,
                tag_type=self._resolve_tag_type(normalized_name, payload),
            )
            opportunity.tag_links.append(
                OpportunityTag(
                    opportunity_id=opportunity.id,
                    tag_id=tag.id,
                    tag=tag,
                    created_at=datetime.now(UTC),
                )
            )

    def _get_or_create_tag(self, name: str, *, tag_type: TagType) -> Tag:
        existing_tag = self.repo.db.execute(
            select(Tag).where(Tag.name == name, Tag.deleted_at.is_(None))
        ).scalar_one_or_none()
        if existing_tag is not None:
            return existing_tag

        tag = Tag(
            id=uuid4(),
            slug=self._slugify(name),
            name=name,
            tag_type=tag_type,
            moderation_status=ModerationStatus.APPROVED,
            is_system=False,
        )
        self.repo.db.add(tag)
        self.repo.db.flush()
        return tag

    def _notify_moderators_about_submission(self, opportunity: Opportunity, *, employer: Employer) -> None:
        notification_service = NotificationService(self.repo.db)
        for moderator in self._list_active_moderators():
            notification_service.create_notification(
                user_id=moderator.id,
                kind=NotificationKind.OPPORTUNITY,
                severity=NotificationSeverity.INFO,
                title="Новая возможность на модерации",
                message=f"Работодатель «{employer.display_name}» отправил «{opportunity.title}» на проверку.",
                action_label="Открыть модерацию",
                action_url="/moderation/content",
                payload={"opportunity_id": str(opportunity.id), "event": "submitted"},
                created_at=datetime.now(UTC),
                profile_scope={"profile_role": moderator.role.value},
            )

    def _notify_moderators_about_resubmission(self, opportunity: Opportunity, *, employer: Employer) -> None:
        notification_service = NotificationService(self.repo.db)
        for moderator in self._list_active_moderators():
            notification_service.create_notification(
                user_id=moderator.id,
                kind=NotificationKind.OPPORTUNITY,
                severity=NotificationSeverity.INFO,
                title="Возможность отправлена повторно",
                message=f"Работодатель «{employer.display_name}» обновил «{opportunity.title}» и отправил на повторную проверку.",
                action_label="Открыть модерацию",
                action_url="/moderation/content",
                payload={"opportunity_id": str(opportunity.id), "event": "resubmitted"},
                created_at=datetime.now(UTC),
                profile_scope={"profile_role": moderator.role.value},
            )

    def _run_notification_side_effects(
        self,
        callback,
        *,
        action: str,
        opportunity_id: str,
    ) -> None:
        try:
            callback()
            self.repo.db.commit()
        except Exception:
            self.repo.db.rollback()
            self.logger.exception(
                "opportunity.notification_side_effects_failed action=%s opportunity_id=%s",
                action,
                opportunity_id,
            )

    def _list_active_moderators(self) -> list[User]:
        return list(
            self.repo.db.execute(
                select(User).where(
                    User.deleted_at.is_(None),
                    User.status == UserStatus.ACTIVE,
                    User.role.in_([UserRole.JUNIOR, UserRole.CURATOR, UserRole.ADMIN]),
                )
            ).scalars().all()
        )

    def _publish_content_moderation_updated(
        self,
        opportunity: Opportunity,
        *,
        status: str | None = None,
    ) -> None:
        moderator_user_ids = [str(user.id) for user in self._list_active_moderators()]
        if not moderator_user_ids:
            return

        notification_hub.publish_to_users_sync(
            moderator_user_ids,
            {
                "type": "content_moderation_updated",
                "opportunity_id": str(opportunity.id),
                "status": status or opportunity.moderation_status.value,
            },
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
                code="EMPLOYER_OPPORTUNITY_FORBIDDEN",
                message="Управление возможностями доступно только работодателям",
                status_code=403,
            )

        active_employer_id = (access_payload or {}).get("active_employer_id")
        active_membership_id = (access_payload or {}).get("active_membership_id")

        if active_employer_id:
            employer = self.repo.db.execute(
                select(Employer).where(Employer.id == UUID(str(active_employer_id)))
            ).scalar_one_or_none()
            if employer is None:
                raise AppError(code="EMPLOYER_NOT_FOUND", message="Компания не найдена", status_code=404)
            membership = None
            if active_membership_id:
                membership = self.repo.db.execute(
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

        employer = self.repo.db.execute(
            select(Employer).where(Employer.inn == employer_profile.inn)
        ).scalar_one_or_none()
        if employer is None:
            raise AppError(
                code="EMPLOYER_NOT_FOUND",
                message="Компания ещё не создана в системе",
                status_code=404,
            )

        membership = self.repo.db.execute(
            select(EmployerMembership).where(
                EmployerMembership.employer_id == employer.id,
                EmployerMembership.user_id == current_user.id,
            )
        ).scalar_one_or_none()
        return employer, membership

    def _ensure_manage_opportunities_allowed(self, membership: EmployerMembership | None) -> None:
        if membership is None:
            return

        permission_keys = membership.permissions or self._default_membership_permissions(membership.membership_role)
        if "manage_opportunities" not in permission_keys:
            raise AppError(
                code="EMPLOYER_OPPORTUNITY_MANAGEMENT_FORBIDDEN",
                message="Нет доступа к управлению возможностями этой компании",
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
    def _build_short_description(description: str) -> str:
        normalized = description.strip()
        return normalized[:500]

    @staticmethod
    def _resolve_opportunity_type(value: str) -> OpportunityType:
        return {
            "vacancy": OpportunityType.VACANCY,
            "internship": OpportunityType.INTERNSHIP,
            "event": OpportunityType.CAREER_EVENT,
            "mentorship": OpportunityType.MENTORSHIP_PROGRAM,
        }[value]

    @staticmethod
    def _resolve_work_format(payload: EmployerOpportunityUpsertRequest) -> WorkFormat:
        if payload.opportunity_type == "mentorship":
            return WorkFormat.ONLINE
        if payload.opportunity_type == "event":
            return WorkFormat.OFFLINE
        return {
            "offline": WorkFormat.OFFICE,
            "hybrid": WorkFormat.HYBRID,
            "online": WorkFormat.REMOTE,
        }[payload.format]

    @staticmethod
    def _resolve_employment_type(payload: EmployerOpportunityUpsertRequest) -> EmploymentType | None:
        if payload.opportunity_type in {"event", "mentorship"}:
            return None
        return {
            "Full-time": EmploymentType.FULL_TIME,
            "Part-time": EmploymentType.PART_TIME,
            "Project": EmploymentType.PROJECT_BASED,
            "Проектная работа": EmploymentType.PROJECT_BASED,
            "full-time": EmploymentType.FULL_TIME,
            "part-time": EmploymentType.PART_TIME,
            "project": EmploymentType.PROJECT_BASED,
        }.get(payload.employment_label or "full-time", EmploymentType.FULL_TIME)

    @staticmethod
    def _resolve_level(payload: EmployerOpportunityUpsertRequest) -> OpportunityLevel | None:
        source = payload.mentor_experience if payload.opportunity_type == "mentorship" else payload.level_label
        if not source:
            return None
        return {
            "Junior": OpportunityLevel.JUNIOR,
            "Middle": OpportunityLevel.MIDDLE,
            "Senior": OpportunityLevel.SENIOR,
            "Junior+": OpportunityLevel.JUNIOR,
            "Middle+": OpportunityLevel.MIDDLE,
            "Senior+": OpportunityLevel.SENIOR,
            "junior": OpportunityLevel.JUNIOR,
            "middle": OpportunityLevel.MIDDLE,
            "senior": OpportunityLevel.SENIOR,
        }.get(source, OpportunityLevel.MIDDLE)

    @staticmethod
    def _resolve_application_deadline(planned_publish_at: datetime | None) -> datetime | None:
        if planned_publish_at is None:
            return None
        return planned_publish_at + timedelta(days=30)

    @staticmethod
    def _resolve_is_paid(payload: EmployerOpportunityUpsertRequest) -> bool:
        if payload.opportunity_type != "event":
            return True
        normalized_value = payload.salary_label.lower()
        return "бесплат" not in normalized_value and normalized_value != "0"

    @staticmethod
    def _resolve_tag_type(name: str, payload: EmployerOpportunityUpsertRequest) -> TagType:
        if payload.event_type and name == payload.event_type:
            return TagType.EVENT_TOPIC
        if payload.mentorship_direction and name == payload.mentorship_direction:
            return TagType.DIRECTION
        return TagType.SKILL

    @staticmethod
    def _event_type_names() -> set[str]:
        return {
            "День открытых дверей",
            "Хакатон",
            "Лекция/воркшоп",
            "Конференция",
            "Карьерный день",
            "Другое",
        }

    @staticmethod
    def _mentorship_direction_names() -> set[str]:
        return {
            "Карьерный рост",
            "Технические навыки",
            "Подготовка к собеседованиям",
            "Soft skills",
            "Code review",
            "Другое",
        }

    @staticmethod
    def _extract_first_matching(items: list[str], allowed_values: set[str]) -> str | None:
        for item in items:
            if item in allowed_values:
                return item
        return None

    @staticmethod
    def _normalize_datetime(value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    @staticmethod
    def _slugify(value: str) -> str:
        return "-".join(value.lower().replace("/", " ").split())

    @staticmethod
    def _build_salary_label(opportunity: Opportunity) -> str:
        compensation = opportunity.compensation
        if compensation is None:
            if opportunity.opportunity_type == OpportunityType.CAREER_EVENT:
                return "Бесплатно" if not opportunity.is_paid else "Стоимость уточняется"
            return "По договоренности"

        salary_from = compensation.salary_from
        salary_to = compensation.salary_to

        if salary_from is not None and salary_to is not None:
            amount_from = int(salary_from)
            amount_to = int(salary_to)

            if amount_from == amount_to:
                return f"{amount_from:,} ₽".replace(",", " ")

            return f"{amount_from:,} - {amount_to:,} ₽".replace(",", " ")

        if salary_from is not None:
            amount = int(salary_from)
            return f"от {amount:,} ₽".replace(",", " ")

        if salary_to is not None:
            amount = int(salary_to)
            return f"до {amount:,} ₽".replace(",", " ")

        if compensation.stipend_text:
            return compensation.stipend_text

        if opportunity.opportunity_type == OpportunityType.CAREER_EVENT:
            return "Бесплатно" if not opportunity.is_paid else "Стоимость уточняется"

        return "По договоренности"

    @staticmethod
    def _normalize_format(value: str | WorkFormat) -> str:
        normalized = value.value if isinstance(value, WorkFormat) else value
        if normalized in {"office", "offline"}:
            return "offline"
        if normalized == "hybrid":
            return "hybrid"
        return "online"

    @staticmethod
    def _kind_value(value: OpportunityType) -> str:
        if value == OpportunityType.INTERNSHIP:
            return "internship"
        if value == OpportunityType.CAREER_EVENT:
            return "event"
        if value == OpportunityType.MENTORSHIP_PROGRAM:
            return "mentorship"
        return "vacancy"

    @staticmethod
    def _accent_value(kind: str, index: int) -> str:
        if kind == "internship":
            return "amber"
        if kind == "event":
            return "slate"
        if kind == "mentorship":
            return "blue"
        return ["cyan", "blue", "amber"][index % 3]

    @staticmethod
    def _format_label(value: str) -> str:
        return {
            "offline": "Офлайн",
            "hybrid": "Гибрид",
            "online": "Онлайн",
        }[value]

    @staticmethod
    def _level_label(value: OpportunityLevel | str | None) -> str:
        normalized = value.value if isinstance(value, OpportunityLevel) else value
        mapping = {
            "intern": "Intern",
            "entry": "Junior",
            "junior": "Junior",
            "middle": "Middle",
            "senior": "Senior",
            "lead": "Lead",
            "student": "Student",
            "executive": "Executive",
        }
        if normalized is None:
            return "Middle"
        return mapping.get(normalized, normalized.replace("_", " ").title())

    @staticmethod
    def _employment_label(value: EmploymentType | str | None, *, opportunity_type: OpportunityType) -> str:
        if opportunity_type == OpportunityType.MENTORSHIP_PROGRAM:
            return "Менторство"
        if opportunity_type == OpportunityType.CAREER_EVENT:
            return "Разовое участие"

        normalized = value.value if isinstance(value, EmploymentType) else value
        mapping = {
            "full_time": "Full-time",
            "part_time": "Part-time",
            "project_based": "Project",
            "project": "Project",
            "contract": "Contract",
            "freelance": "Freelance",
            "temporary": "Temporary",
            "volunteer": "Volunteer",
        }
        if normalized is None:
            return "Full-time"
        return mapping.get(normalized, normalized.replace("_", " ").title())

    @staticmethod
    def _company_rating(index: int) -> float:
        return round(4.3 + (index % 5) * 0.1, 1)

    @staticmethod
    def _company_reviews_count(index: int) -> int:
        return 7 + (index % 6) * 3
