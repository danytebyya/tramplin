from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import delete, func, select

from src.utils.errors import AppError
from src.models import User
from src.models import (
    ApplicantAchievement,
    ApplicantCertificate,
    ApplicantProfile,
    ApplicantProject,
    Application,
    ApplicationStatus,
    AuthLoginEvent,
    Employer,
    EmployerMembership,
    EmployerStaffInvitation,
    FavoriteOpportunity,
    Notification,
    Opportunity,
    RefreshSession,
    UserNotificationPreference,
)
from src.repositories.user_repository import UserRepository
from src.realtime import presence_hub
from src.schemas.user import (
    ApplicantDashboardRead,
    ApplicantDashboardStatsRead,
    ApplicantDashboardUpdateRequest,
    EmployerPublicStatsRead,
    PublicUserProfileRead,
    UserNotificationPreferencesRead,
    UserNotificationPreferencesUpdateRequest,
    UserUpdateRequest,
)
from src.enums import MembershipRole, UserRole, UserStatus


class UserService:
    def __init__(self, db) -> None:
        self.db = db
        self.user_repo = UserRepository(db)

    def update_preferred_city(self, current_user: User, preferred_city: str) -> User:
        normalized_city = preferred_city.strip()
        updated_user = self.user_repo.update_preferred_city(current_user, normalized_city)
        self.db.commit()
        self.db.refresh(updated_user)
        return updated_user

    def update_profile(self, current_user: User, payload: UserUpdateRequest) -> User:
        normalized_email = payload.email.lower().strip()
        normalized_display_name = payload.display_name.strip()

        existing_user = self.user_repo.get_by_email(normalized_email, with_profiles=False)
        if existing_user is not None and str(existing_user.id) != str(current_user.id):
            raise AppError(
                code="USER_EMAIL_ALREADY_EXISTS",
                message="Пользователь с таким email уже существует.",
                status_code=409,
            )

        updated_user = self.user_repo.update_profile(
            current_user,
            email=normalized_email,
            display_name=normalized_display_name,
        )
        self.db.commit()
        self.db.refresh(updated_user)
        return updated_user

    def get_applicant_dashboard(self, current_user: User) -> ApplicantDashboardRead:
        if current_user.role != UserRole.APPLICANT:
            raise AppError(
                code="USER_ROLE_FORBIDDEN",
                message="Профиль соискателя доступен только соискателю.",
                status_code=403,
            )

        user = self.user_repo.get_by_id(current_user.id, with_profiles=True)
        if user is None:
            raise AppError(code="USER_NOT_FOUND", message="Пользователь не найден.", status_code=404)

        profile = user.applicant_profile or ApplicantProfile()
        applications_count, responses_count, invitations_count = self._get_applicant_stats(user.id)

        return ApplicantDashboardRead.model_validate(
            {
                "profile": {
                    "full_name": profile.full_name,
                    "university": profile.university,
                    "about": profile.about,
                    "study_course": profile.study_course,
                    "graduation_year": profile.graduation_year,
                    "resume_url": profile.resume_url,
                    "portfolio_url": profile.portfolio_url,
                    "level": profile.level,
                    "desired_salary_from": profile.desired_salary_from,
                    "preferred_location": profile.preferred_location,
                    "employment_types": profile.employment_types or [],
                    "work_formats": profile.work_formats or [],
                    "hard_skills": profile.hard_skills or [],
                    "soft_skills": profile.soft_skills or [],
                    "languages": profile.languages or [],
                    "github_url": profile.github_url,
                    "gitlab_url": profile.gitlab_url,
                    "bitbucket_url": profile.bitbucket_url,
                    "linkedin_url": profile.linkedin_url,
                    "habr_url": profile.habr_url,
                    "profile_views_count": profile.profile_views_count or 0,
                    "recommendations_count": profile.recommendations_count or 0,
                },
                "preferred_city": user.preferred_city,
                "stats": ApplicantDashboardStatsRead(
                    profile_views_count=profile.profile_views_count or 0,
                    applications_count=applications_count,
                    responses_count=responses_count,
                    invitations_count=invitations_count,
                    recommendations_count=profile.recommendations_count or 0,
                ),
                "links": {
                    "github_url": profile.github_url,
                    "gitlab_url": profile.gitlab_url,
                    "bitbucket_url": profile.bitbucket_url,
                    "linkedin_url": profile.linkedin_url,
                    "portfolio_url": profile.portfolio_url,
                    "habr_url": profile.habr_url,
                    "resume_url": profile.resume_url,
                },
                "career_interests": {
                    "desired_salary_from": profile.desired_salary_from,
                    "preferred_city": user.preferred_city,
                    "preferred_location": profile.preferred_location,
                    "employment_types": profile.employment_types or [],
                    "work_formats": profile.work_formats or [],
                },
                "projects": [
                    {
                        "id": project.id,
                        "title": project.title,
                        "description": project.description,
                        "technologies": project.technologies,
                        "period_label": project.period_label,
                        "role_name": project.role_name,
                        "repository_url": project.repository_url,
                    }
                    for project in user.applicant_projects
                ],
                "achievements": [
                    {
                        "id": achievement.id,
                        "title": achievement.title,
                        "event_name": achievement.event_name,
                        "project_name": achievement.project_name,
                        "award": achievement.award,
                    }
                    for achievement in user.applicant_achievements
                ],
                "certificates": [
                    {
                        "id": certificate.id,
                        "title": certificate.title,
                        "organization_name": certificate.organization_name,
                        "issued_at": certificate.issued_at.isoformat() if certificate.issued_at else None,
                        "credential_url": certificate.credential_url,
                    }
                    for certificate in user.applicant_certificates
                ],
            }
        )

    def get_public_profile(self, public_id: str) -> PublicUserProfileRead:
        normalized_public_id = public_id.strip()
        if not normalized_public_id:
            raise AppError(
                code="USER_PUBLIC_ID_REQUIRED",
                message="Нужно указать публичный идентификатор профиля.",
                status_code=400,
            )

        user = self.user_repo.get_by_public_id(normalized_public_id, with_profiles=True)
        if user is None or user.deleted_at is not None:
            raise AppError(code="USER_NOT_FOUND", message="Пользователь не найден.", status_code=404)

        payload = {
            "public_id": normalized_public_id,
            "display_name": user.display_name,
            "preferred_city": user.preferred_city,
            "role": user.role,
            "presence": {
                "is_online": presence_hub.is_user_online(user.id),
                "last_seen_at": user.last_seen_at,
            },
            "applicant_dashboard": None,
            "employer_profile": None,
            "employer_stats": None,
        }

        if user.role == UserRole.APPLICANT:
            payload["applicant_dashboard"] = self.get_applicant_dashboard(user)
        elif user.role == UserRole.EMPLOYER and user.employer_profile is not None:
            active_opportunities_count, responses_count = self._get_employer_public_stats(user.id)
            payload["employer_profile"] = user.employer_profile
            payload["employer_stats"] = EmployerPublicStatsRead(
                active_opportunities_count=active_opportunities_count,
                responses_count=responses_count,
            )

        return PublicUserProfileRead.model_validate(payload)

    def update_applicant_dashboard(
        self,
        current_user: User,
        payload: ApplicantDashboardUpdateRequest,
    ) -> ApplicantDashboardRead:
        if current_user.role != UserRole.APPLICANT:
            raise AppError(
                code="USER_ROLE_FORBIDDEN",
                message="Профиль соискателя доступен только соискателю.",
                status_code=403,
            )

        user = self.user_repo.get_by_id(current_user.id, with_profiles=True)
        if user is None:
            raise AppError(code="USER_NOT_FOUND", message="Пользователь не найден.", status_code=404)

        profile = user.applicant_profile
        if profile is None:
            profile = ApplicantProfile(user_id=user.id)
            user.applicant_profile = profile
            self.db.add(profile)

        profile.full_name = payload.full_name
        profile.university = payload.university
        profile.about = payload.about
        profile.study_course = payload.study_course
        profile.graduation_year = payload.graduation_year
        profile.level = payload.level
        profile.hard_skills = payload.hard_skills
        profile.soft_skills = payload.soft_skills
        profile.languages = payload.languages
        profile.github_url = payload.links.github_url
        profile.gitlab_url = payload.links.gitlab_url
        profile.bitbucket_url = payload.links.bitbucket_url
        profile.linkedin_url = payload.links.linkedin_url
        profile.portfolio_url = payload.links.portfolio_url
        profile.habr_url = payload.links.habr_url
        profile.resume_url = payload.links.resume_url
        profile.desired_salary_from = payload.career_interests.desired_salary_from
        profile.preferred_location = self._normalize_optional_string(
            payload.career_interests.preferred_location
        )
        profile.employment_types = payload.career_interests.employment_types
        profile.work_formats = payload.career_interests.work_formats

        normalized_city = (payload.career_interests.preferred_city or "").strip()
        user.preferred_city = normalized_city or None

        normalized_name = (payload.full_name or "").strip()
        if normalized_name:
            user.display_name = normalized_name

        self._replace_projects(user, payload)
        self._replace_achievements(user, payload)
        self._replace_certificates(user, payload)

        self.db.add(user)
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(user)
        return self.get_applicant_dashboard(user)

    def delete_account(self, current_user: User) -> None:
        now = datetime.now(UTC)
        current_user_with_profiles = self.user_repo.get_by_id(current_user.id, with_profiles=True)
        if current_user_with_profiles is None:
            raise AppError(
                code="USER_NOT_FOUND",
                message="Пользователь не найден.",
                status_code=404,
            )

        primary_owned_employer_ids = list(
            self.db.execute(
                select(EmployerMembership.employer_id).where(
                    EmployerMembership.user_id == current_user.id,
                    EmployerMembership.is_primary.is_(True),
                    EmployerMembership.membership_role == MembershipRole.OWNER,
                )
            ).scalars().all()
        )

        if primary_owned_employer_ids:
            has_other_staff = self.db.execute(
                select(EmployerMembership.id).where(
                    EmployerMembership.employer_id.in_(primary_owned_employer_ids),
                    EmployerMembership.user_id != current_user.id,
                )
            ).scalar_one_or_none()
            if has_other_staff is not None:
                raise AppError(
                    code="USER_DELETE_HAS_EMPLOYEES",
                    message="Удаление невозможно, пока в компании есть сотрудники.",
                    status_code=409,
                )

            self.db.execute(
                delete(EmployerStaffInvitation).where(
                    EmployerStaffInvitation.employer_id.in_(primary_owned_employer_ids)
                )
            )
            self.db.execute(
                delete(EmployerMembership).where(
                    EmployerMembership.employer_id.in_(primary_owned_employer_ids)
                )
            )

            owned_employers = list(
                self.db.execute(
                    select(Employer).where(Employer.id.in_(primary_owned_employer_ids))
                ).scalars().all()
            )
            for employer in owned_employers:
                employer.deleted_at = now
                self.db.add(employer)

            owned_opportunities = list(
                self.db.execute(
                    select(Opportunity).where(
                        Opportunity.employer_id.in_(primary_owned_employer_ids),
                        Opportunity.deleted_at.is_(None),
                    )
                ).scalars().all()
            )
            for opportunity in owned_opportunities:
                opportunity.deleted_at = now
                self.db.add(opportunity)

        self.db.execute(
            delete(EmployerStaffInvitation).where(
                EmployerStaffInvitation.invited_email == current_user.email,
                EmployerStaffInvitation.accepted_at.is_(None),
            )
        )
        self.db.execute(delete(EmployerMembership).where(EmployerMembership.user_id == current_user.id))
        self.db.execute(delete(Notification).where(Notification.user_id == current_user.id))
        self.db.execute(delete(FavoriteOpportunity).where(FavoriteOpportunity.user_id == current_user.id))
        self.db.execute(delete(UserNotificationPreference).where(UserNotificationPreference.user_id == current_user.id))
        self.db.execute(delete(RefreshSession).where(RefreshSession.user_id == current_user.id))
        self.db.execute(delete(AuthLoginEvent).where(AuthLoginEvent.user_id == current_user.id))

        if current_user_with_profiles.applicant_profile is not None:
            self.db.delete(current_user_with_profiles.applicant_profile)
        if current_user_with_profiles.employer_profile is not None:
            self.db.delete(current_user_with_profiles.employer_profile)
        if current_user_with_profiles.curator_profile is not None:
            self.db.delete(current_user_with_profiles.curator_profile)

        current_user_with_profiles.email = f"deleted-{current_user.id}@deleted.local"
        current_user_with_profiles.display_name = "Удаленный аккаунт"
        current_user_with_profiles.password_hash = "deleted"

    def _get_employer_public_stats(self, user_id: str | UUID) -> tuple[int, int]:
        active_statuses = ("active", "planned")
        active_opportunities_count = self.db.execute(
            select(func.count(Opportunity.id)).where(
                Opportunity.created_by_user_id == UUID(str(user_id)),
                Opportunity.deleted_at.is_(None),
                Opportunity.business_status.in_(active_statuses),
            )
        ).scalar_one()
        responses_count = self.db.execute(
            select(func.count(Application.id)).join(
                Opportunity,
                Application.opportunity_id == Opportunity.id,
            ).where(
                Opportunity.created_by_user_id == UUID(str(user_id)),
                Opportunity.deleted_at.is_(None),
            )
        ).scalar_one()
        return active_opportunities_count or 0, responses_count or 0
        current_user_with_profiles.preferred_city = None
        current_user_with_profiles.status = UserStatus.ARCHIVED
        current_user_with_profiles.deleted_at = now
        self.db.add(current_user_with_profiles)

        self.db.commit()

    def _get_applicant_stats(self, user_id) -> tuple[int, int, int]:
        applications_count = (
            self.db.execute(
                select(func.count(Application.id)).where(
                    Application.applicant_user_id == user_id,
                    Application.deleted_at.is_(None),
                )
            ).scalar_one()
            or 0
        )
        responses_count = (
            self.db.execute(
                select(func.count(Application.id)).where(
                    Application.applicant_user_id == user_id,
                    Application.deleted_at.is_(None),
                    Application.status.notin_(
                        [ApplicationStatus.SUBMITTED, ApplicationStatus.WITHDRAWN, ApplicationStatus.CANCELED]
                    ),
                )
            ).scalar_one()
            or 0
        )
        invitations_count = (
            self.db.execute(
                select(func.count(Application.id)).where(
                    Application.applicant_user_id == user_id,
                    Application.deleted_at.is_(None),
                    Application.status.in_(
                        [
                            ApplicationStatus.SHORTLISTED,
                            ApplicationStatus.INTERVIEW,
                            ApplicationStatus.OFFER,
                            ApplicationStatus.ACCEPTED,
                        ]
                    ),
                )
            ).scalar_one()
            or 0
        )
        return applications_count, responses_count, invitations_count

    def _replace_projects(self, user: User, payload: ApplicantDashboardUpdateRequest) -> None:
        existing_by_id = {str(item.id): item for item in user.applicant_projects}
        keep_projects: list[ApplicantProject] = []

        for item in payload.projects:
            project = existing_by_id.get(str(item.id)) if item.id else None
            if project is None:
                project = ApplicantProject(applicant_user_id=user.id)
                self.db.add(project)

            project.title = item.title.strip()
            project.description = self._normalize_optional_string(item.description)
            project.technologies = self._normalize_optional_string(item.technologies)
            project.period_label = self._normalize_optional_string(item.period_label)
            project.role_name = self._normalize_optional_string(item.role_name)
            project.repository_url = self._normalize_optional_string(item.repository_url)
            project.applicant = user
            self.db.add(project)
            keep_projects.append(project)

        for project in list(user.applicant_projects):
            if project not in keep_projects:
                self.db.delete(project)

    def _replace_achievements(self, user: User, payload: ApplicantDashboardUpdateRequest) -> None:
        existing_by_id = {str(item.id): item for item in user.applicant_achievements}
        keep_achievements: list[ApplicantAchievement] = []

        for item in payload.achievements:
            achievement = existing_by_id.get(str(item.id)) if item.id else None
            if achievement is None:
                achievement = ApplicantAchievement(applicant_user_id=user.id)
                self.db.add(achievement)

            achievement.title = item.title.strip()
            achievement.event_name = self._normalize_optional_string(item.event_name)
            achievement.project_name = self._normalize_optional_string(item.project_name)
            achievement.award = self._normalize_optional_string(item.award)
            achievement.applicant = user
            self.db.add(achievement)
            keep_achievements.append(achievement)

        for achievement in list(user.applicant_achievements):
            if achievement not in keep_achievements:
                self.db.delete(achievement)

    def _replace_certificates(self, user: User, payload: ApplicantDashboardUpdateRequest) -> None:
        existing_by_id = {str(item.id): item for item in user.applicant_certificates}
        keep_certificates: list[ApplicantCertificate] = []

        for item in payload.certificates:
            certificate = existing_by_id.get(str(item.id)) if item.id else None
            if certificate is None:
                certificate = ApplicantCertificate(applicant_user_id=user.id)
                self.db.add(certificate)

            certificate.title = item.title.strip()
            certificate.organization_name = self._normalize_optional_string(item.organization_name)
            certificate.issued_at = self._parse_optional_date(item.issued_at)
            certificate.credential_url = self._normalize_optional_string(item.credential_url)
            certificate.applicant = user
            self.db.add(certificate)
            keep_certificates.append(certificate)

        for certificate in list(user.applicant_certificates):
            if certificate not in keep_certificates:
                self.db.delete(certificate)

    @staticmethod
    def _normalize_optional_string(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @staticmethod
    def _parse_optional_date(value: str | None) -> date | None:
        normalized = (value or "").strip()
        if not normalized:
            return None
        try:
            return date.fromisoformat(normalized)
        except ValueError as exc:
            raise AppError(
                code="USER_INVALID_DATE",
                message="Некорректная дата сертификата.",
                status_code=422,
            ) from exc

    def get_notification_preferences(self, current_user: User) -> UserNotificationPreferencesRead:
        preferences = self.user_repo.get_notification_preferences(current_user.id)
        if preferences is None:
            preferences = self.user_repo.create_notification_preferences(current_user.id)
            self._apply_default_notification_preferences(preferences, current_user.role)
            self.db.commit()
            self.db.refresh(preferences)
        elif self._upgrade_legacy_notification_preferences(preferences, current_user.role):
            self.db.commit()
            self.db.refresh(preferences)
        return self._serialize_notification_preferences(preferences)

    def update_notification_preferences(
        self,
        current_user: User,
        payload: UserNotificationPreferencesUpdateRequest,
    ) -> UserNotificationPreferencesRead:
        preferences = self.user_repo.get_notification_preferences(current_user.id)
        if preferences is None:
            preferences = self.user_repo.create_notification_preferences(current_user.id)
            self._apply_default_notification_preferences(preferences, current_user.role)
        updated_preferences = self.user_repo.update_notification_preferences(
            preferences,
            email_notifications=payload.email_notifications.model_dump(),
            push_notifications=payload.push_notifications.model_dump(),
        )
        self.db.commit()
        self.db.refresh(updated_preferences)
        return self._serialize_notification_preferences(updated_preferences)

    @staticmethod
    def _apply_default_notification_preferences(preferences, role: UserRole) -> None:
        if role == UserRole.EMPLOYER:
            preferences.email_new_verification_requests = True
            preferences.email_content_complaints = False
            preferences.email_overdue_reviews = False
            preferences.email_company_profile_changes = True
            preferences.email_publication_changes = False
            preferences.email_chat_reminders = True
            preferences.email_daily_digest = False
            preferences.email_weekly_report = False
            preferences.push_new_verification_requests = True
            preferences.push_content_complaints = False
            preferences.push_overdue_reviews = False
            preferences.push_company_profile_changes = True
            preferences.push_publication_changes = False
            preferences.push_chat_reminders = True
            preferences.push_daily_digest = False
            preferences.push_weekly_report = False
            return

        if role not in {UserRole.JUNIOR, UserRole.CURATOR, UserRole.ADMIN}:
            return

        preferences.email_new_verification_requests = False
        preferences.email_content_complaints = False
        preferences.email_overdue_reviews = False
        preferences.email_company_profile_changes = False
        preferences.email_publication_changes = False
        preferences.email_chat_reminders = False
        preferences.email_daily_digest = False
        preferences.email_weekly_report = False
        preferences.push_new_verification_requests = False
        preferences.push_content_complaints = False
        preferences.push_overdue_reviews = False
        preferences.push_company_profile_changes = False
        preferences.push_publication_changes = False
        preferences.push_chat_reminders = False
        preferences.push_daily_digest = False
        preferences.push_weekly_report = False

    @classmethod
    def _upgrade_legacy_notification_preferences(cls, preferences, role: UserRole) -> bool:
        if role != UserRole.EMPLOYER:
            return False

        if not cls._matches_legacy_employer_defaults(preferences):
            return False

        cls._apply_default_notification_preferences(preferences, role)
        return True

    @staticmethod
    def _matches_legacy_employer_defaults(preferences) -> bool:
        return (
            preferences.email_new_verification_requests is True
            and preferences.email_content_complaints is False
            and preferences.email_overdue_reviews is False
            and preferences.email_company_profile_changes is False
            and preferences.email_publication_changes is False
            and preferences.email_chat_reminders is False
            and preferences.email_daily_digest is False
            and preferences.email_weekly_report is False
            and preferences.push_new_verification_requests is True
            and preferences.push_content_complaints is False
            and preferences.push_overdue_reviews is False
            and preferences.push_company_profile_changes is False
            and preferences.push_publication_changes is False
            and preferences.push_chat_reminders is False
            and preferences.push_daily_digest is False
            and preferences.push_weekly_report is False
        )

    @staticmethod
    def _serialize_notification_preferences(preferences) -> UserNotificationPreferencesRead:
        return UserNotificationPreferencesRead.model_validate(
            {
                "email_notifications": {
                    "new_verification_requests": preferences.email_new_verification_requests,
                    "content_complaints": preferences.email_content_complaints,
                    "overdue_reviews": preferences.email_overdue_reviews,
                    "company_profile_changes": preferences.email_company_profile_changes,
                    "publication_changes": preferences.email_publication_changes,
                    "chat_reminders": preferences.email_chat_reminders,
                    "daily_digest": preferences.email_daily_digest,
                    "weekly_report": preferences.email_weekly_report,
                },
                "push_notifications": {
                    "new_verification_requests": preferences.push_new_verification_requests,
                    "content_complaints": preferences.push_content_complaints,
                    "overdue_reviews": preferences.push_overdue_reviews,
                    "company_profile_changes": preferences.push_company_profile_changes,
                    "publication_changes": preferences.push_publication_changes,
                    "chat_reminders": preferences.push_chat_reminders,
                    "daily_digest": preferences.push_daily_digest,
                    "weekly_report": preferences.push_weekly_report,
                },
            }
        )
