# Tramplin Database Architecture

## 1. Краткая архитектурная идея БД

БД строится вокруг `users` как единой auth/access-сущности и набора доменных расширений по ролям и предметным областям. Соискатель, работодатель, куратор и администратор не смешиваются в одну плоскую таблицу профиля: общие auth-данные хранятся в `users`, а роль-специфичные данные вынесены в `applicant_profiles`, `employers`, `employer_memberships` и смежные таблицы. Это дает нормализацию, безопасную авторизацию, удобный RBAC и прогнозируемое расширение под новые сценарии.

Карьерные возможности моделируются как единая сущность `opportunities` с отдельными слоями для бизнес-статуса, модерации, компенсации, тегов, навыков, внешних ссылок, медиа и геолокации. Поверх базового каталога добавлены полноценные слои откликов, networking, избранного, верификации работодателей, приватности, модерации и аудита. Схема ориентирована на PostgreSQL: используются `UUID`, `TIMESTAMPTZ`, `CITEXT`, `JSONB` только там, где это оправдано для аудита, и `POINT` + `GIST` индекс для карты.

## 2. Перечень всех сущностей по доменам

### Auth and access
- `users`: учетные записи, роли, статусы, email verification state, soft delete.
- `email_verifications`: OTP/email verification и аудит подтверждений.
- `refresh_sessions`: refresh tokens и активные login sessions.

### Users and profiles
- `applicant_profiles`: профиль соискателя.
- `applicant_privacy_settings`: настройки приватности.
- `education_records`: образование.
- `resumes`: логическая сущность резюме.
- `resume_versions`: версии резюме для snapshot при отклике.
- `applicant_external_links`: внешние ссылки соискателя.
- `applicant_projects`: проекты и портфолио.
- `applicant_skills`: навыки с уровнем владения.
- `applicant_interest_tags`: карьерные интересы.

### Employers and verification
- `employers`: карточка работодателя или ИП.
- `employer_memberships`: привязка пользователей к работодателю.
- `employer_external_links`: сайт и соцсети работодателя.
- `employer_verification_requests`: заявки на верификацию.
- `employer_verification_reviews`: история проверок.
- `employer_verification_documents`: документы и ссылки для верификации.
- `employer_media_files`: логотипы и медиаматериалы работодателя.

### Opportunities
- `opportunities`: единая сущность возможности.
- `opportunity_compensations`: зарплата/стипендия.
- `opportunity_external_links`: внешние ресурсы.
- `opportunity_tags`: теги карточки.
- `opportunity_skill_requirements`: требуемые навыки.
- `opportunity_media_files`: медиа вложения карточки.

### Tags and classification
- `tags`: системные и предложенные теги с типизацией и модерацией.

### Applications
- `applications`: отклики.
- `application_status_history`: история статусов отклика.

### Networking
- `contact_requests`: заявки в контакты.
- `applicant_contacts`: подтвержденные контакты.
- `opportunity_recommendations`: рекомендации между соискателями.

### Favorites
- `favorite_opportunities`: избранные возможности.
- `favorite_employers`: избранные работодатели.

### Geo
- `locations`: единая модель адресов и геоданных.

### Media
- `media_files`: универсальный каталог файлов.

### Moderation and audit
- `moderation_cases`: кейсы модерации по сущностям.
- `moderation_actions`: история действий модераторов.
- `audit_log`: аудит критичных операций.

## 3. Полный список таблиц

### `users`
- Назначение: auth-аккаунт, роль, статус, lifecycle.
- Поля: `id uuid`, `email citext`, `display_name varchar(120)`, `password_hash varchar(255)`, `role user_role`, `status user_status`, `email_verified_at timestamptz`, `last_login_at timestamptz`, `blocked_at timestamptz`, `deactivated_at timestamptz`, `created_by uuid`, `updated_by uuid`, `created_at timestamptz`, `updated_at timestamptz`, `deleted_at timestamptz`.
- PK: `id`.
- FK: `created_by -> users.id`, `updated_by -> users.id`.
- Unique: partial unique index `uq_users_email_active`.
- Check: display name min length, email contains `@`.
- Индексы: email, `role+status`, `created_at`.
- Soft delete / timestamps: да.
- Бизнес-логика: единая точка входа для RBAC и блокировок.

### `email_verifications`
- Назначение: подтверждение email и OTP flow.
- Поля: `id`, `user_id`, `email`, `purpose`, `code_hash`, `status`, `attempts_left`, `expires_at`, `requested_ip`, `requested_user_agent`, `verified_at`, `consumed_at`, `created_at`.
- PK: `id`.
- FK: `user_id -> users.id`.
- Unique: нет.
- Check: `attempts_left >= 0`.
- Индексы: `(email, purpose, status)`, `expires_at`.
- Soft delete / timestamps: только `created_at`.
- Бизнес-логика: хранит историю email verification отдельно от user.

### `refresh_sessions`
- Назначение: refresh-token sessions.
- Поля: `id`, `user_id`, `token_hash`, `jti`, `user_agent`, `ip_address`, `expires_at`, `revoked_at`, `created_at`, `updated_at`.
- PK: `id`.
- FK: `user_id -> users.id`.
- Unique: `token_hash`, `jti`.
- Check: нет.
- Индексы: активные сессии по `user_id`.
- Soft delete / timestamps: revoked lifecycle, timestamps.
- Бизнес-логика: поддержка rotation/revocation.

### `media_files`
- Назначение: универсальный каталог файлов.
- Поля: `id`, `storage_key`, `original_filename`, `mime_type`, `file_size`, `checksum_sha256`, `storage_provider`, `public_url`, `uploaded_by_user_id`, `created_at`.
- PK: `id`.
- FK: `uploaded_by_user_id -> users.id`.
- Unique: `storage_key`.
- Check: `file_size >= 0`.
- Индексы: uploader + created.
- Soft delete / timestamps: `created_at`.
- Бизнес-логика: отделяет метаданные файла от доменных сущностей.

### `locations`
- Назначение: адреса и геоданные для работодателей и возможностей.
- Поля: `id`, `country_code`, `country_name`, `region`, `city`, `postal_code`, `address_line1`, `address_line2`, `formatted_address`, `latitude`, `longitude`, `coordinates generated point`, `timezone`, `created_at`, `updated_at`.
- PK: `id`.
- FK: нет.
- Unique: нет.
- Check: координаты валидны и заполняются парой.
- Индексы: `country_code+city`, `region+city`, `GIST(coordinates)`.
- Soft delete / timestamps: timestamps.
- Бизнес-логика: reuse location across domains, карта и city filtering.

### `tags`
- Назначение: типизированные и модерируемые теги.
- Поля: `id`, `slug`, `name`, `description`, `tag_type`, `parent_id`, `moderation_status`, `is_system`, `created_by`, `reviewed_by`, `reviewed_at`, `created_at`, `updated_at`, `deleted_at`.
- PK: `id`.
- FK: `parent_id -> tags.id`, `created_by -> users.id`, `reviewed_by -> users.id`.
- Unique: partial unique `slug`, partial unique `(tag_type, lower(name))`.
- Check: min length for `slug` and `name`.
- Индексы: parent, moderation + type.
- Soft delete / timestamps: да.
- Бизнес-логика: стартовый системный словарь + пользовательские предложения.

### `applicant_profiles`
- Назначение: личный профиль соискателя.
- Поля: `user_id`, `full_name`, `headline`, `about`, `university_name`, `study_course`, `graduation_year`, `primary_location_id`, `open_to_work`, `created_at`, `updated_at`, `deleted_at`.
- PK: `user_id`.
- FK: `user_id -> users.id`, `primary_location_id -> locations.id`.
- Unique: PK.
- Check: курс и год выпуска в разумных пределах.
- Индексы: location.
- Soft delete / timestamps: да.
- Бизнес-логика: не смешивает auth user и applicant profile.

### `applicant_privacy_settings`
- Назначение: приватность профиля, резюме, откликов, контактов и интересов.
- Поля: `user_id`, `profile_visibility`, `resume_visibility`, `applications_visibility`, `contacts_visibility`, `career_interests_visibility`, `created_at`, `updated_at`.
- PK: `user_id`.
- FK: `user_id -> users.id`.
- Unique: PK.
- Check: нет.
- Индексы: не требуются.
- Soft delete / timestamps: timestamps.
- Бизнес-логика: явная конфигурация приватности, не набор булевых флагов в профиле.

### `education_records`
- Назначение: образование.
- Поля: `id`, `applicant_user_id`, `institution_name`, `degree_name`, `field_of_study`, `start_year`, `end_year`, `is_current`, `description`, `created_at`, `updated_at`, `deleted_at`.
- PK: `id`.
- FK: `applicant_user_id -> users.id`.
- Unique: нет.
- Check: диапазоны лет и порядок лет.
- Индексы: applicant + start year.
- Soft delete / timestamps: да.

### `resumes`
- Назначение: контейнер резюме.
- Поля: `id`, `applicant_user_id`, `title`, `is_primary`, `created_at`, `updated_at`, `deleted_at`.
- PK: `id`.
- FK: `applicant_user_id -> users.id`.
- Unique: partial unique primary resume per applicant.
- Check: нет.
- Индексы: applicant.
- Soft delete / timestamps: да.

### `resume_versions`
- Назначение: версии резюме.
- Поля: `id`, `resume_id`, `version_number`, `summary`, `file_media_id`, `is_current`, `created_by`, `created_at`, `deleted_at`.
- PK: `id`.
- FK: `resume_id -> resumes.id`, `file_media_id -> media_files.id`, `created_by -> users.id`.
- Unique: `(resume_id, version_number)`, partial unique current version per resume.
- Check: `version_number >= 1`.
- Индексы: unique set above.
- Soft delete / timestamps: created + deleted.
- Бизнес-логика: позволяет фиксировать snapshot при отклике.

### `applicant_external_links`
- Назначение: внешние ссылки профиля.
- Поля: `id`, `applicant_user_id`, `link_type`, `label`, `url`, `display_order`, `is_public`, `created_at`, `updated_at`, `deleted_at`.
- PK: `id`.
- FK: `applicant_user_id -> users.id`.
- Check: `display_order >= 0`.
- Индексы: applicant + order.
- Soft delete / timestamps: да.

### `applicant_projects`
- Назначение: проекты и портфолио.
- Поля: `id`, `applicant_user_id`, `title`, `description`, `repository_url`, `demo_url`, `started_at`, `finished_at`, `is_public`, `created_at`, `updated_at`, `deleted_at`.
- PK: `id`.
- FK: `applicant_user_id -> users.id`.
- Check: finish date >= start date.
- Индексы: applicant + created.
- Soft delete / timestamps: да.

### `applicant_skills`
- Назначение: навыки соискателя.
- Поля: `id`, `applicant_user_id`, `tag_id`, `proficiency`, `years_experience`, `is_primary`, `created_at`, `updated_at`.
- PK: `id`.
- FK: `applicant_user_id -> users.id`, `tag_id -> tags.id`.
- Unique: `(applicant_user_id, tag_id)`.
- Check: proficiency 1..5, experience >= 0.
- Индексы: by `tag_id`.
- Soft delete / timestamps: timestamps.

### `applicant_interest_tags`
- Назначение: карьерные интересы.
- Поля: `applicant_user_id`, `tag_id`, `created_at`.
- PK: `(applicant_user_id, tag_id)`.
- FK: applicant -> users, tag -> tags.
- Индексы: PK.
- Soft delete / timestamps: created.

### `employers`
- Назначение: компания/ИП.
- Поля: `id`, `employer_type`, `display_name`, `legal_name`, `inn`, `description_short`, `description_full`, `website_url`, `corporate_email`, `phone`, `headquarters_location_id`, `verification_status`, `verified_at`, `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at`.
- PK: `id`.
- FK: location, created_by, updated_by.
- Unique: partial unique `inn`.
- Check: `inn` numeric 10..12.
- Индексы: verification status, location.
- Soft delete / timestamps: да.
- Бизнес-логика: отдельная доменная сущность работодателя, не user-profile.

### `employer_memberships`
- Назначение: связь employer accounts с company.
- Поля: `id`, `employer_id`, `user_id`, `membership_role`, `is_primary`, `created_at`, `updated_at`.
- PK: `id`.
- FK: employer, user.
- Unique: `(employer_id, user_id)`, partial unique primary membership.
- Индексы: `user_id`.
- Soft delete / timestamps: timestamps.

### `employer_external_links`
- Назначение: публичные ссылки работодателя.
- Поля: `id`, `employer_id`, `link_type`, `label`, `url`, `display_order`, `created_at`, `updated_at`, `deleted_at`.
- PK: `id`.
- FK: `employer_id`.
- Check: non-negative order.
- Индексы: employer + order.
- Soft delete / timestamps: да.

### `employer_verification_requests`
- Назначение: заявки на верификацию.
- Поля: `id`, `employer_id`, `legal_name`, `employer_type`, `inn`, `corporate_email`, `status`, `submitted_by`, `submitted_at`, `reviewed_by`, `reviewed_at`, `rejection_reason`, `moderator_comment`, `created_at`, `updated_at`.
- PK: `id`.
- FK: employer, submitted_by, reviewed_by.
- Check: `inn` format.
- Индексы: employer + submitted, status + submitted.
- Soft delete / timestamps: timestamps.
- Бизнес-логика: статус компании хранится отдельно от истории проверок.

### `employer_verification_reviews`
- Назначение: история шагов проверки.
- Поля: `id`, `verification_request_id`, `status`, `reviewer_user_id`, `comment`, `rejection_reason`, `created_at`.
- PK: `id`.
- FK: request, reviewer.
- Индексы: request + created.
- Soft delete / timestamps: created.

### `employer_verification_documents`
- Назначение: документы и ссылки для верификации.
- Поля: `id`, `verification_request_id`, `media_file_id`, `document_type`, `source_url`, `created_at`.
- PK: `id`.
- FK: request, media_file.
- Check: заполнен либо файл, либо ссылка.
- Индексы: request.
- Soft delete / timestamps: created.

### `opportunities`
- Назначение: единая сущность карьерной возможности.
- Поля: `id`, `employer_id`, `created_by_user_id`, `updated_by_user_id`, `moderated_by_user_id`, `location_id`, `cover_media_id`, `title`, `short_description`, `description`, `opportunity_type`, `business_status`, `moderation_status`, `work_format`, `employment_type`, `level`, `contact_email`, `contact_phone`, `published_at`, `starts_at`, `ends_at`, `application_deadline`, `capacity`, `is_paid`, `moderated_at`, `moderation_reason`, `created_at`, `updated_at`, `deleted_at`.
- PK: `id`.
- FK: employer, users, location, media.
- Unique: нет.
- Check: capacity > 0, dates consistent.
- Индексы: feed, employer, location, dates.
- Soft delete / timestamps: да.
- Бизнес-логика: отдельно хранит бизнес lifecycle и moderation lifecycle.

### `opportunity_compensations`
- Назначение: compensation block.
- Поля: `id`, `opportunity_id`, `salary_from`, `salary_to`, `currency_code`, `salary_period`, `is_gross`, `stipend_text`, `created_at`, `updated_at`.
- PK: `id`.
- FK: `opportunity_id`.
- Unique: one-to-one `opportunity_id`.
- Check: salary range valid.
- Индексы: salary range.
- Soft delete / timestamps: timestamps.

### `opportunity_external_links`
- Назначение: ссылки карточки.
- Поля: `id`, `opportunity_id`, `link_type`, `label`, `url`, `display_order`, `created_at`, `updated_at`.
- PK: `id`.
- FK: `opportunity_id`.
- Check: order >= 0.
- Индексы: opportunity + order.

### `opportunity_tags`
- Назначение: m2m opportunity <-> tags.
- Поля: `opportunity_id`, `tag_id`, `created_at`.
- PK: `(opportunity_id, tag_id)`.
- FK: opportunity, tag.
- Индексы: `tag_id`.

### `opportunity_skill_requirements`
- Назначение: отдельный набор required skills.
- Поля: `id`, `opportunity_id`, `tag_id`, `is_required`, `priority`, `notes`, `created_at`.
- PK: `id`.
- FK: opportunity, tag.
- Unique: `(opportunity_id, tag_id)`.
- Check: `priority 1..5`.
- Индексы: tag + priority.

### `opportunity_media_files`
- Назначение: медиа карточки возможности.
- Поля: `id`, `opportunity_id`, `media_file_id`, `owner_kind`, `display_order`, `created_at`.
- PK: `id`.
- FK: opportunity, media.
- Unique: `(opportunity_id, media_file_id)`.
- Check: order >= 0.
- Индексы: opportunity + order.

### `employer_media_files`
- Назначение: логотипы и медиа работодателя.
- Поля: `id`, `employer_id`, `media_file_id`, `owner_kind`, `display_order`, `created_at`.
- PK: `id`.
- FK: employer, media.
- Unique: `(employer_id, media_file_id)`.
- Check: order >= 0.
- Индексы: employer + order.

### `favorite_opportunities`
- Назначение: избранные возможности.
- Поля: `user_id`, `opportunity_id`, `created_at`.
- PK: `(user_id, opportunity_id)`.
- FK: user, opportunity.
- Индексы: by opportunity.
- Soft delete / timestamps: created.

### `favorite_employers`
- Назначение: избранные работодатели.
- Поля: `user_id`, `employer_id`, `created_at`.
- PK: `(user_id, employer_id)`.
- FK: user, employer.
- Индексы: by employer.
- Soft delete / timestamps: created.

### `applications`
- Назначение: отклики на возможности.
- Поля: `id`, `opportunity_id`, `applicant_user_id`, `resume_version_id`, `cover_letter`, `status`, `status_changed_at`, `submitted_at`, `last_activity_at`, `is_hidden_by_applicant`, `employer_comment`, `curator_comment`, `created_at`, `updated_at`, `deleted_at`.
- PK: `id`.
- FK: opportunity, applicant user, resume version.
- Unique: partial unique active application per opportunity + applicant.
- Check: бизнес-правило через partial unique.
- Индексы: opportunity+status, applicant+status.
- Soft delete / timestamps: да.
- Бизнес-логика: snapshot resume version и история статусов хранятся отдельно.

### `application_status_history`
- Назначение: история смены статусов отклика.
- Поля: `id`, `application_id`, `status`, `changed_by_user_id`, `comment`, `created_at`.
- PK: `id`.
- FK: application, user.
- Индексы: application + created desc.
- Soft delete / timestamps: created.

### `contact_requests`
- Назначение: заявки в профессиональные контакты.
- Поля: `id`, `sender_user_id`, `recipient_user_id`, `status`, `message`, `responded_at`, `created_at`, `updated_at`.
- PK: `id`.
- FK: sender, recipient.
- Unique: partial unique active request pair.
- Check: sender != recipient.
- Индексы: recipient + status + created.

### `applicant_contacts`
- Назначение: подтвержденные контакты.
- Поля: `id`, `user_low_id`, `user_high_id`, `created_from_request_id`, `connected_at`, `created_at`.
- PK: `id`.
- FK: users, request.
- Unique: pair `(user_low_id, user_high_id)`.
- Check: users differ.
- Индексы: both directions lookup.

### `opportunity_recommendations`
- Назначение: рекомендации возможностей между соискателями.
- Поля: `id`, `recommender_user_id`, `recipient_user_id`, `opportunity_id`, `comment`, `status`, `used_at`, `created_at`, `updated_at`.
- PK: `id`.
- FK: recommender, recipient, opportunity.
- Unique: `(recommender_user_id, recipient_user_id, opportunity_id)`.
- Check: recommender != recipient.
- Индексы: recipient + status + created.

### `moderation_cases`
- Назначение: общий реестр модерации сущностей.
- Поля: `id`, `target_type`, `target_id`, `status`, `assigned_to_user_id`, `opened_by_user_id`, `resolved_by_user_id`, `resolution_reason`, `opened_at`, `resolved_at`, `created_at`, `updated_at`.
- PK: `id`.
- FK: users on assigned/opened/resolved.
- Индексы: target lookup, status queue.
- Soft delete / timestamps: timestamps.

### `moderation_actions`
- Назначение: история действий модератора.
- Поля: `id`, `moderation_case_id`, `action`, `actor_user_id`, `from_status`, `to_status`, `comment`, `created_at`.
- PK: `id`.
- FK: case, actor.
- Индексы: case + created desc.
- Soft delete / timestamps: created.

### `audit_log`
- Назначение: аудит критичных операций.
- Поля: `id`, `actor_user_id`, `entity_type`, `entity_id`, `action`, `payload jsonb`, `ip_address`, `user_agent`, `created_at`.
- PK: `id`.
- FK: actor user.
- Индексы: entity, actor.
- Soft delete / timestamps: created.
- Бизнес-логика: `JSONB` здесь допустим как неизбыточный event payload.

## 4. Связи между таблицами

- `users` 1:1 `applicant_profiles`.
- `users` 1:1 `applicant_privacy_settings`.
- `users` 1:N `email_verifications`.
- `users` 1:N `refresh_sessions`.
- `users` N:M `employers` через `employer_memberships`.
- `users` 1:N `education_records`, `applicant_external_links`, `applicant_projects`, `applicant_skills`, `applications`, `contact_requests`, `opportunity_recommendations`.
- `resumes` 1:N `resume_versions`.
- `employers` 1:N `employer_verification_requests`, `opportunities`, `employer_external_links`, `employer_media_files`.
- `employer_verification_requests` 1:N `employer_verification_reviews`, `employer_verification_documents`.
- `opportunities` 1:1 `opportunity_compensations`.
- `opportunities` N:M `tags` через `opportunity_tags`.
- `opportunities` N:M `tags` как skills через `opportunity_skill_requirements`.
- `users` N:M `opportunities` через `favorite_opportunities`.
- `users` N:M `employers` через `favorite_employers`.
- `applications` 1:N `application_status_history`.
- `contact_requests` 0..1 -> `applicant_contacts`.
- `locations` переиспользуются `applicant_profiles`, `employers`, `opportunities`.

## 5. Предлагаемые enum/справочники

- `user_role`: guest, applicant, employer, curator, admin
- `user_status`: pending, active, blocked, archived, deleted
- `email_verification_purpose`: registration, login, password_reset, email_change
- `email_verification_status`: pending, verified, expired, consumed, canceled
- `employer_type`: company, sole_proprietor
- `employer_verification_status`: pending, under_review, approved, rejected, suspended
- `membership_role`: owner, recruiter, manager, viewer
- `moderation_status`: pending_review, approved, rejected, hidden, blocked
- `moderation_target_type`: user, applicant_profile, employer, employer_verification, opportunity, tag, media
- `moderation_action_type`: created, submitted, approved, rejected, hidden, blocked, restored, edited
- `opportunity_type`: internship, vacancy, mentorship_program, career_event
- `opportunity_status`: draft, scheduled, active, closed, archived
- `work_format`: office, hybrid, remote, online, offline
- `employment_type`: full_time, part_time, contract, freelance, temporary, volunteer, project_based
- `opportunity_level`: student, entry, junior, middle, senior, lead, executive
- `salary_period`: hourly, daily, weekly, monthly, yearly, fixed, stipend
- `application_status`: submitted, under_review, shortlisted, interview, offer, accepted, rejected, reserved, withdrawn, canceled
- `contact_request_status`: pending, accepted, rejected, canceled, blocked
- `recommendation_status`: pending, viewed, applied, dismissed, expired
- `privacy_visibility`: private, contacts_only, authenticated, public
- `tag_type`: technology, skill, level, employment_type, specialization, direction, format, industry, language, event_topic, benefit, location
- `link_type`: portfolio, github, linkedin, website, telegram, behance, dribbble, repository, employer_site, event_page, other
- `verification_document_type`: registration_certificate, tax_certificate, power_of_attorney, website_screenshot, employer_card, other
- `media_owner_kind`: logo, cover, gallery, document, attachment

## 6. SQL DDL для PostgreSQL

- Полный исполняемый DDL вынесен в [backend/sql/tramplin_postgres_schema.sql](/Users/den4ick/Desktop/Tramplin/backend/sql/tramplin_postgres_schema.sql).
- Скрипт включает `CREATE EXTENSION`, `CREATE TYPE`, `CREATE TABLE`, `CHECK`, `FK`, `partial indexes`, `GIST` index и audit/moderation/history tables.

## 7. Seed-данные

- Seed вынесен в [backend/sql/tramplin_seed.sql](/Users/den4ick/Desktop/Tramplin/backend/sql/tramplin_seed.sql).
- Включены:
  - 1 администратор
  - 1 куратор
  - 1 employer-account
  - 1 подтвержденный работодатель
  - 2 соискателя
  - набор тегов
  - 3 возможности разных типов
  - отклики и история статусов
  - moderation cases/actions

## 8. Индексация и производительность

- `uq_users_email_active`: уникальность email без блокировки soft-deleted пользователей.
- `ix_locations_coordinates` (`GIST`): карта, bbox и nearby-фильтрация.
- `ix_locations_city`, `ix_employers_location`, `ix_opportunities_location`: фильтры по городу и работодателю.
- `ix_opportunities_feed`: основная лента по статусам и типам.
- `ix_opportunity_tags_tag_id`, `ix_opportunity_skill_requirements_tag`: фильтрация по тегам и навыкам.
- `ix_applications_opportunity_status`: список откликнувшихся по возможности.
- `ix_applications_applicant_status`: история заявок пользователя.
- partial unique `uq_applications_single_active`: защита от дубля активного отклика.
- `ix_moderation_cases_status`: очередь модерации.
- `ix_audit_log_entity`: разбор истории изменений конкретной сущности.

## 9. Потенциальные расширения

- Уведомления: `notifications`, `notification_deliveries`, `notification_preferences`.
- Чат: `conversations`, `conversation_members`, `messages`, `message_attachments`.
- Рекомендации: отдельный scoring layer `recommendation_candidates`, `recommendation_scores`.
- Аналитика: event tables и materialized views под product analytics.
- Интеграция с вузами: `universities`, `university_domains`, `curator_university_scopes`.
- Импорт вакансий: `import_sources`, `import_jobs`, `imported_records`.
- Карта с кластеризацией: materialized view/denormalized projection по `opportunities + locations`.
- Файловое хранилище: S3/minio metadata уже отделены через `media_files`.

## 10. Финальный вывод

Эта схема лучше примитивного варианта, потому что она разделяет auth, роли, профили, работодателей, верификацию, возможности, модерацию, отклики, networking и аудит на самостоятельные нормализованные домены. Она не упирается в одну плоскую таблицу и не прячет бизнес-логику в `json`/строковые поля.

Для production MVP схема подходит тем, что уже учитывает реальную модерацию, версионность резюме, историю статусов откликов, карту, избранное, soft delete, audit trail и расширяемость под новые сервисы без разрушения базовой модели.
