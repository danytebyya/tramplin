import os
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select, update

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
    ChatConversation,
    ChatConversationReadState,
    ChatMessage,
    ChatUnreadReminderState,
    ChatUserKey,
    Employer,
    EmployerProfile,
    EmployerMembership,
    EmployerStaffInvitation,
    EmployerVerificationDocument,
    EmployerVerificationRequest,
    FavoriteOpportunity,
    MediaFile,
    Notification,
    Opportunity,
    OpportunityCompensation,
    OpportunityTag,
    RefreshSession,
    UserNotificationPreference,
)
from src.repositories.user_repository import UserRepository
from src.realtime import presence_hub
from src.schemas.user import (
    ApplicantDashboardRead,
    ApplicantDashboardStatsRead,
    ApplicantDashboardUpdateRequest,
    ApplicantPrivacySettingsRead,
    ApplicantPrivacySettingsUpdateRequest,
    EmployerProfileRead,
    EmployerPublicStatsRead,
    PublicUserProfileRead,
    UserNotificationPreferencesRead,
    UserNotificationPreferencesUpdateRequest,
    UserUpdateRequest,
)
from src.enums import MembershipRole, UserRole, UserStatus


class UserService:
    APPLICANT_AVATAR_PUBLIC_PREFIX = "/storage/applicant-avatars"

    def __init__(self, db) -> None:
        self.db = db
        self.user_repo = UserRepository(db)

    @staticmethod
    def _get_applicant_avatar_storage_dir() -> Path:
        configured_path = os.getenv("APPLICANT_AVATARS_STORAGE_DIR")
        if configured_path:
            return Path(configured_path).expanduser().resolve()
        return Path(__file__).resolve().parents[2] / "storage" / "applicant-avatars"

    @classmethod
    def _build_applicant_avatar_public_url(cls, file_name: str) -> str:
        return f"{cls.APPLICANT_AVATAR_PUBLIC_PREFIX}/{file_name}"

    @classmethod
    def _resolve_applicant_avatar_storage_path(cls, avatar_url: str | None) -> Path | None:
        if not avatar_url:
            return None

        if avatar_url.startswith(cls.APPLICANT_AVATAR_PUBLIC_PREFIX + "/"):
            file_name = avatar_url.removeprefix(cls.APPLICANT_AVATAR_PUBLIC_PREFIX + "/")
            return cls._get_applicant_avatar_storage_dir() / file_name

        candidate = Path(avatar_url)
        if candidate.is_absolute():
            return candidate

        return None

    def update_preferred_city(self, current_user: User, preferred_city: str) -> User:
        normalized_city = preferred_city.strip()
        updated_user = self.user_repo.update_preferred_city(current_user, normalized_city)
        self.db.commit()
        self.db.refresh(updated_user)
        return updated_user

    @staticmethod
    def _normalize_applicant_profile_visibility(value: str | None) -> str:
        normalized = (value or "public").strip().lower()
        return normalized if normalized in {"public", "authorized", "hidden"} else "public"

    @classmethod
    def _get_applicant_privacy_settings_from_profile(
        cls,
        profile: ApplicantProfile | None,
    ) -> ApplicantPrivacySettingsRead:
        if profile is None:
            return ApplicantPrivacySettingsRead()

        return ApplicantPrivacySettingsRead(
            profile_visibility=cls._normalize_applicant_profile_visibility(profile.profile_visibility),
            show_resume=bool(profile.show_resume),
        )

    @classmethod
    def _can_view_applicant_profile(
        cls,
        *,
        target_user: User,
        viewer: User | None = None,
    ) -> bool:
        if target_user.role != UserRole.APPLICANT:
            return True

        if viewer is not None and str(viewer.id) == str(target_user.id):
            return True

        settings = cls._get_applicant_privacy_settings_from_profile(target_user.applicant_profile)
        if settings.profile_visibility == "hidden":
            return False

        if settings.profile_visibility == "authorized":
            return viewer is not None

        return True

    def update_applicant_privacy_settings(
        self,
        current_user: User,
        payload: ApplicantPrivacySettingsUpdateRequest,
    ) -> ApplicantPrivacySettingsRead:
        if current_user.role != UserRole.APPLICANT:
            raise AppError(
                code="USER_ROLE_FORBIDDEN",
                message="Настройки приватности доступны только соискателю.",
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

        profile.profile_visibility = self._normalize_applicant_profile_visibility(payload.profile_visibility)
        profile.show_resume = payload.show_resume
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(profile)
        return self._get_applicant_privacy_settings_from_profile(profile)

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

    def upload_applicant_avatar(
        self,
        *,
        current_user: User,
        original_filename: str,
        mime_type: str,
        content: bytes,
    ) -> User:
        if current_user.role != UserRole.APPLICANT:
            raise AppError(
                code="USER_ROLE_FORBIDDEN",
                message="Профиль соискателя доступен только соискателю.",
                status_code=403,
            )

        if not mime_type.startswith("image/"):
            raise AppError(
                code="APPLICANT_AVATAR_INVALID_TYPE",
                message="Можно загрузить только изображение",
                status_code=400,
            )

        user = self.user_repo.get_by_id(current_user.id, with_profiles=True)
        if user is None:
            raise AppError(code="USER_NOT_FOUND", message="Пользователь не найден.", status_code=404)

        profile = user.applicant_profile
        if profile is None:
            profile = ApplicantProfile(user_id=user.id)
            user.applicant_profile = profile
            self.db.add(profile)

        storage_dir = self._get_applicant_avatar_storage_dir()
        storage_dir.mkdir(parents=True, exist_ok=True)

        suffix = Path(original_filename).suffix or ".png"
        target_path = storage_dir / f"{uuid4()}{suffix}"
        target_path.write_bytes(content)

        previous_file = self._resolve_applicant_avatar_storage_path(profile.avatar_url)
        if previous_file is not None and previous_file.exists() and previous_file.is_file():
            previous_file.unlink()

        profile.avatar_url = self._build_applicant_avatar_public_url(target_path.name)
        self.db.add(user)
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete_applicant_avatar(
        self,
        *,
        current_user: User,
    ) -> User:
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
            return user

        previous_file = self._resolve_applicant_avatar_storage_path(profile.avatar_url)
        if previous_file is not None and previous_file.exists() and previous_file.is_file():
            previous_file.unlink()

        profile.avatar_url = None
        self.db.add(user)
        self.db.add(profile)
        self.db.commit()
        self.db.refresh(user)
        return user

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
                    "avatar_url": profile.avatar_url,
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

    def get_public_profile(self, public_id: str, viewer: User | None = None) -> PublicUserProfileRead:
        normalized_public_id = public_id.strip()
        if not normalized_public_id:
            raise AppError(
                code="USER_PUBLIC_ID_REQUIRED",
                message="Нужно указать публичный идентификатор профиля.",
                status_code=400,
            )

        user = self.user_repo.get_by_public_id(normalized_public_id, with_profiles=True)
        if user is None:
            try:
                user = self.user_repo.get_by_id(normalized_public_id, with_profiles=True)
            except (ValueError, TypeError):
                user = None

        if user is None or user.deleted_at is not None:
            raise AppError(code="USER_NOT_FOUND", message="Пользователь не найден.", status_code=404)

        if not self._can_view_applicant_profile(target_user=user, viewer=viewer):
            raise AppError(code="USER_NOT_FOUND", message="Пользователь не найден.", status_code=404)

        self._register_public_profile_view(user)

        payload = {
            "public_id": user.public_id or normalized_public_id,
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
            employer_profile_payload = EmployerProfileRead.model_validate(
                user.employer_profile
            ).model_dump()
            corporate_email = (user.employer_profile.corporate_email or "").strip().lower()
            user_email = (user.email or "").strip().lower()
            if corporate_email and corporate_email == user_email:
                employer_profile_payload["corporate_email"] = None
            payload["employer_profile"] = employer_profile_payload
            payload["employer_stats"] = EmployerPublicStatsRead(
                active_opportunities_count=active_opportunities_count,
                responses_count=responses_count,
            )

        return PublicUserProfileRead.model_validate(payload)

    def _register_public_profile_view(self, user: User) -> None:
        if user.role == UserRole.APPLICANT and user.applicant_profile is not None:
            self.db.execute(
                update(ApplicantProfile)
                .where(ApplicantProfile.user_id == user.id)
                .values(
                    profile_views_count=func.coalesce(
                        ApplicantProfile.profile_views_count, 0
                    )
                    + 1
                )
            )
            self.db.commit()
            self.db.refresh(user.applicant_profile)
            return

        if user.role == UserRole.EMPLOYER and user.employer_profile is not None:
            self.db.execute(
                update(EmployerProfile)
                .where(EmployerProfile.user_id == user.id)
                .values(
                    profile_views_count=func.coalesce(
                        EmployerProfile.profile_views_count, 0
                    )
                    + 1
                )
            )
            self.db.commit()
            self.db.refresh(user.employer_profile)

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
            self._delete_owned_employers(
                employer_ids=primary_owned_employer_ids,
                owner_user_id=current_user.id,
            )

        self._archive_user_account(current_user_with_profiles, now=now)

        self.db.commit()

    def _delete_owned_employers(self, *, employer_ids: list, owner_user_id) -> None:
        if not employer_ids:
            return

        membership_rows = list(
            self.db.execute(
                select(EmployerMembership.id, EmployerMembership.user_id).where(
                    EmployerMembership.employer_id.in_(employer_ids)
                )
            ).all()
        )
        membership_ids = [row[0] for row in membership_rows]
        staff_user_ids = [row[1] for row in membership_rows if str(row[1]) != str(owner_user_id)]

        if membership_ids:
            self.db.execute(
                delete(RefreshSession).where(RefreshSession.active_membership_id.in_(membership_ids))
            )

        self.db.execute(
            delete(RefreshSession).where(RefreshSession.active_employer_id.in_(employer_ids))
        )
        self.db.execute(
            delete(EmployerStaffInvitation).where(EmployerStaffInvitation.employer_id.in_(employer_ids))
        )

        opportunity_ids = list(
            self.db.execute(
                select(Opportunity.id).where(Opportunity.employer_id.in_(employer_ids))
            ).scalars().all()
        )
        if opportunity_ids:
            self.db.execute(
                delete(FavoriteOpportunity).where(FavoriteOpportunity.opportunity_id.in_(opportunity_ids))
            )
            self.db.execute(delete(Application).where(Application.opportunity_id.in_(opportunity_ids)))
            self.db.execute(
                delete(OpportunityCompensation).where(
                    OpportunityCompensation.opportunity_id.in_(opportunity_ids)
                )
            )
            self.db.execute(delete(OpportunityTag).where(OpportunityTag.opportunity_id.in_(opportunity_ids)))
            self.db.execute(delete(Opportunity).where(Opportunity.id.in_(opportunity_ids)))

        conversation_ids = list(
            self.db.execute(
                select(ChatConversation.id).where(ChatConversation.employer_id.in_(employer_ids))
            ).scalars().all()
        )
        if conversation_ids:
            self.db.execute(
                delete(ChatConversationReadState).where(
                    ChatConversationReadState.conversation_id.in_(conversation_ids)
                )
            )
            self.db.execute(delete(ChatMessage).where(ChatMessage.conversation_id.in_(conversation_ids)))
            self.db.execute(delete(ChatConversation).where(ChatConversation.id.in_(conversation_ids)))

        self.db.execute(
            delete(ChatUnreadReminderState).where(ChatUnreadReminderState.employer_id.in_(employer_ids))
        )

        verification_requests = list(
            self.db.execute(
                select(EmployerVerificationRequest).where(
                    EmployerVerificationRequest.employer_id.in_(employer_ids)
                )
            ).scalars().all()
        )
        verification_request_ids = [item.id for item in verification_requests]
        if verification_request_ids:
            verification_documents = list(
                self.db.execute(
                    select(EmployerVerificationDocument).where(
                        EmployerVerificationDocument.verification_request_id.in_(verification_request_ids)
                    )
                ).scalars().all()
            )
            media_file_ids = []
            for document in verification_documents:
                if document.media_file_id is not None:
                    media_file_ids.append(document.media_file_id)

            if media_file_ids:
                media_files = list(
                    self.db.execute(select(MediaFile).where(MediaFile.id.in_(media_file_ids))).scalars().all()
                )
                for media_file in media_files:
                    if media_file.public_url:
                        file_path = Path(media_file.public_url)
                        if file_path.exists() and file_path.is_file():
                            file_path.unlink()

            self.db.execute(
                delete(EmployerVerificationDocument).where(
                    EmployerVerificationDocument.verification_request_id.in_(verification_request_ids)
                )
            )
            if media_file_ids:
                self.db.execute(delete(MediaFile).where(MediaFile.id.in_(media_file_ids)))
            self.db.execute(
                delete(EmployerVerificationRequest).where(
                    EmployerVerificationRequest.id.in_(verification_request_ids)
                )
            )

        self.db.execute(delete(EmployerMembership).where(EmployerMembership.employer_id.in_(employer_ids)))
        self.db.execute(delete(Employer).where(Employer.id.in_(employer_ids)))

        for staff_user_id in set(staff_user_ids):
            staff_user = self.user_repo.get_by_id(staff_user_id, with_profiles=True)
            if staff_user is None or staff_user.deleted_at is not None:
                continue
            if self._should_archive_staff_user_after_company_deletion(staff_user):
                self._archive_user_account(staff_user, now=datetime.now(UTC))

    def _should_archive_staff_user_after_company_deletion(self, user: User) -> bool:
        has_other_company_memberships = (
            self.db.execute(
                select(EmployerMembership.id).where(EmployerMembership.user_id == user.id)
            ).scalar_one_or_none()
            is not None
        )
        if has_other_company_memberships:
            return False

        if user.role == UserRole.APPLICANT or user.applicant_profile is not None:
            return False

        return True

    def _archive_user_account(self, user: User, *, now: datetime) -> None:
        self.db.execute(
            delete(EmployerStaffInvitation).where(
                EmployerStaffInvitation.invited_email == user.email,
                EmployerStaffInvitation.accepted_at.is_(None),
            )
        )
        self.db.execute(delete(EmployerMembership).where(EmployerMembership.user_id == user.id))
        self.db.execute(delete(Notification).where(Notification.user_id == user.id))
        self.db.execute(delete(FavoriteOpportunity).where(FavoriteOpportunity.user_id == user.id))
        self.db.execute(delete(Application).where(Application.applicant_user_id == user.id))
        self.db.execute(delete(UserNotificationPreference).where(UserNotificationPreference.user_id == user.id))
        self.db.execute(delete(ChatConversationReadState).where(ChatConversationReadState.user_id == user.id))
        self.db.execute(delete(ChatUnreadReminderState).where(ChatUnreadReminderState.user_id == user.id))
        self.db.execute(delete(ChatUserKey).where(ChatUserKey.user_id == user.id))

        conversation_ids = list(
            self.db.execute(
                select(ChatConversation.id).where(
                    (ChatConversation.applicant_user_id == user.id)
                    | (ChatConversation.employer_user_id == user.id)
                )
            ).scalars().all()
        )
        if conversation_ids:
            self.db.execute(
                delete(ChatConversationReadState).where(
                    ChatConversationReadState.conversation_id.in_(conversation_ids)
                )
            )
            self.db.execute(delete(ChatMessage).where(ChatMessage.conversation_id.in_(conversation_ids)))
            self.db.execute(delete(ChatConversation).where(ChatConversation.id.in_(conversation_ids)))

        self.db.execute(delete(RefreshSession).where(RefreshSession.user_id == user.id))
        self.db.execute(delete(AuthLoginEvent).where(AuthLoginEvent.user_id == user.id))
        self.db.execute(delete(ApplicantProject).where(ApplicantProject.applicant_user_id == user.id))
        self.db.execute(delete(ApplicantAchievement).where(ApplicantAchievement.applicant_user_id == user.id))
        self.db.execute(delete(ApplicantCertificate).where(ApplicantCertificate.applicant_user_id == user.id))

        applicant_avatar_path = self._resolve_applicant_avatar_storage_path(
            user.applicant_profile.avatar_url if user.applicant_profile is not None else None
        )
        if applicant_avatar_path is not None and applicant_avatar_path.exists() and applicant_avatar_path.is_file():
            applicant_avatar_path.unlink()

        if user.employer_profile is not None:
            from src.services.employer_service import EmployerService

            employer_avatar_path = EmployerService._resolve_avatar_storage_path(user.employer_profile.avatar_url)
            if employer_avatar_path is not None and employer_avatar_path.exists() and employer_avatar_path.is_file():
                employer_avatar_path.unlink()

        if user.applicant_profile is not None:
            self.db.delete(user.applicant_profile)
        if user.employer_profile is not None:
            self.db.delete(user.employer_profile)
        if user.curator_profile is not None:
            self.db.delete(user.curator_profile)

        user.email = f"deleted-{user.id}@deleted.local"
        user.display_name = "Удаленный аккаунт"
        user.password_hash = "deleted"
        user.preferred_city = None
        user.status = UserStatus.ARCHIVED
        user.deleted_at = now
        self.db.add(user)

    def _get_employer_public_stats(self, user_id: str | UUID) -> tuple[int, int]:
        active_statuses = ("active", "scheduled")
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
