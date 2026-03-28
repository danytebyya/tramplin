CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'user_role' AND e.enumlabel = 'junior'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'junior';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'user_status' AND e.enumlabel = 'deleted'
    ) THEN
        ALTER TYPE user_status ADD VALUE 'deleted';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_verification_purpose') THEN
        CREATE TYPE email_verification_purpose AS ENUM ('registration', 'login', 'password_reset', 'email_change');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_verification_status') THEN
        CREATE TYPE email_verification_status AS ENUM ('pending', 'verified', 'expired', 'consumed', 'canceled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employer_type') THEN
        CREATE TYPE employer_type AS ENUM ('company', 'sole_proprietor');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employer_verification_status_v2') THEN
        CREATE TYPE employer_verification_status_v2 AS ENUM ('pending', 'under_review', 'approved', 'rejected', 'suspended');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_role') THEN
        CREATE TYPE membership_role AS ENUM ('owner', 'recruiter', 'manager', 'viewer');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'moderation_status') THEN
        CREATE TYPE moderation_status AS ENUM ('pending_review', 'approved', 'rejected', 'hidden', 'blocked');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'moderation_target_type') THEN
        CREATE TYPE moderation_target_type AS ENUM ('user', 'applicant_profile', 'employer', 'employer_verification', 'opportunity', 'tag', 'media');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'moderation_action_type') THEN
        CREATE TYPE moderation_action_type AS ENUM ('created', 'submitted', 'approved', 'rejected', 'hidden', 'blocked', 'restored', 'edited');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'opportunity_type') THEN
        CREATE TYPE opportunity_type AS ENUM ('internship', 'vacancy', 'mentorship_program', 'career_event');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'opportunity_status') THEN
        CREATE TYPE opportunity_status AS ENUM ('draft', 'scheduled', 'active', 'closed', 'archived');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'work_format') THEN
        CREATE TYPE work_format AS ENUM ('office', 'hybrid', 'remote', 'online', 'offline');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_type') THEN
        CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'freelance', 'temporary', 'volunteer', 'project_based');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'opportunity_level') THEN
        CREATE TYPE opportunity_level AS ENUM ('student', 'entry', 'junior', 'middle', 'senior', 'lead', 'executive');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'salary_period') THEN
        CREATE TYPE salary_period AS ENUM ('hourly', 'daily', 'weekly', 'monthly', 'yearly', 'fixed', 'stipend');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'application_status') THEN
        CREATE TYPE application_status AS ENUM ('submitted', 'under_review', 'shortlisted', 'interview', 'offer', 'accepted', 'rejected', 'reserved', 'withdrawn', 'canceled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'contact_request_status') THEN
        CREATE TYPE contact_request_status AS ENUM ('pending', 'accepted', 'rejected', 'canceled', 'blocked');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recommendation_status') THEN
        CREATE TYPE recommendation_status AS ENUM ('pending', 'viewed', 'applied', 'dismissed', 'expired');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'privacy_visibility') THEN
        CREATE TYPE privacy_visibility AS ENUM ('private', 'contacts_only', 'authenticated', 'public');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tag_type') THEN
        CREATE TYPE tag_type AS ENUM ('technology', 'skill', 'level', 'employment_type', 'specialization', 'direction', 'format', 'industry', 'language', 'event_topic', 'benefit', 'location');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'link_type') THEN
        CREATE TYPE link_type AS ENUM ('portfolio', 'github', 'linkedin', 'website', 'telegram', 'behance', 'dribbble', 'repository', 'employer_site', 'event_page', 'other');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_document_type') THEN
        CREATE TYPE verification_document_type AS ENUM ('registration_certificate', 'tax_certificate', 'power_of_attorney', 'website_screenshot', 'employer_card', 'other');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_owner_kind') THEN
        CREATE TYPE media_owner_kind AS ENUM ('logo', 'cover', 'gallery', 'document', 'attachment');
    END IF;
END
$$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID NULL REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by UUID NULL REFERENCES users (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NULL REFERENCES users (id) ON DELETE CASCADE,
    email CITEXT NOT NULL,
    purpose email_verification_purpose NOT NULL,
    code_hash CHAR(64) NOT NULL,
    status email_verification_status NOT NULL DEFAULT 'pending',
    attempts_left SMALLINT NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    requested_ip INET NULL,
    requested_user_agent VARCHAR(500) NULL,
    verified_at TIMESTAMPTZ NULL,
    consumed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (attempts_left >= 0)
);

CREATE INDEX IF NOT EXISTS ix_email_verifications_lookup ON email_verifications (email, purpose, status);
CREATE INDEX IF NOT EXISTS ix_email_verifications_expires_at ON email_verifications (expires_at);

CREATE TABLE IF NOT EXISTS media_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_key VARCHAR(255) NOT NULL UNIQUE,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_size BIGINT NOT NULL,
    checksum_sha256 CHAR(64) NOT NULL,
    storage_provider VARCHAR(50) NOT NULL DEFAULT 'local',
    public_url VARCHAR(500) NULL,
    uploaded_by_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (file_size >= 0)
);

CREATE INDEX IF NOT EXISTS ix_media_files_uploaded_by ON media_files (uploaded_by_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code CHAR(2) NOT NULL,
    country_name VARCHAR(120) NOT NULL,
    region VARCHAR(120) NULL,
    city VARCHAR(120) NOT NULL,
    postal_code VARCHAR(20) NULL,
    address_line1 VARCHAR(255) NULL,
    address_line2 VARCHAR(255) NULL,
    formatted_address VARCHAR(500) NULL,
    latitude NUMERIC(9, 6) NULL,
    longitude NUMERIC(9, 6) NULL,
    coordinates POINT GENERATED ALWAYS AS (
        CASE
            WHEN latitude IS NULL OR longitude IS NULL THEN NULL
            ELSE POINT(longitude::DOUBLE PRECISION, latitude::DOUBLE PRECISION)
        END
    ) STORED,
    timezone VARCHAR(64) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (
            latitude BETWEEN -90 AND 90
            AND longitude BETWEEN -180 AND 180
        )
    )
);

CREATE INDEX IF NOT EXISTS ix_locations_city ON locations (country_code, city);
CREATE INDEX IF NOT EXISTS ix_locations_region_city ON locations (region, city);
CREATE INDEX IF NOT EXISTS ix_locations_coordinates ON locations USING GIST (coordinates);

ALTER TABLE applicant_profiles ADD COLUMN IF NOT EXISTS headline VARCHAR(180) NULL;
ALTER TABLE applicant_profiles ADD COLUMN IF NOT EXISTS about TEXT NULL;
ALTER TABLE applicant_profiles ADD COLUMN IF NOT EXISTS primary_location_id UUID NULL REFERENCES locations (id) ON DELETE SET NULL;
ALTER TABLE applicant_profiles ADD COLUMN IF NOT EXISTS open_to_work BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE applicant_profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(120) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT NULL,
    tag_type tag_type NOT NULL,
    parent_id UUID NULL REFERENCES tags (id) ON DELETE SET NULL,
    moderation_status moderation_status NOT NULL DEFAULT 'approved',
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    reviewed_by UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CHECK (char_length(slug) >= 2),
    CHECK (char_length(name) >= 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_slug_active ON tags (slug) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_type_name_active ON tags (tag_type, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_tags_parent_id ON tags (parent_id);
CREATE INDEX IF NOT EXISTS ix_tags_moderation ON tags (moderation_status, tag_type) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS applicant_privacy_settings (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    profile_visibility privacy_visibility NOT NULL DEFAULT 'authenticated',
    resume_visibility privacy_visibility NOT NULL DEFAULT 'contacts_only',
    applications_visibility privacy_visibility NOT NULL DEFAULT 'private',
    contacts_visibility privacy_visibility NOT NULL DEFAULT 'contacts_only',
    career_interests_visibility privacy_visibility NOT NULL DEFAULT 'contacts_only',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS education_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    institution_name VARCHAR(255) NOT NULL,
    degree_name VARCHAR(255) NULL,
    field_of_study VARCHAR(255) NULL,
    start_year SMALLINT NULL,
    end_year SMALLINT NULL,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CHECK (start_year IS NULL OR start_year BETWEEN 1980 AND 2100),
    CHECK (end_year IS NULL OR end_year BETWEEN 1980 AND 2100),
    CHECK (start_year IS NULL OR end_year IS NULL OR end_year >= start_year)
);

CREATE INDEX IF NOT EXISTS ix_education_records_applicant ON education_records (applicant_user_id, start_year DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS resumes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_resumes_applicant ON resumes (applicant_user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_resumes_primary_per_applicant ON resumes (applicant_user_id) WHERE is_primary IS TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS resume_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resume_id UUID NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    summary TEXT NULL,
    file_media_id UUID NULL REFERENCES media_files (id) ON DELETE SET NULL,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CHECK (version_number >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_versions_number ON resume_versions (resume_id, version_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_versions_current ON resume_versions (resume_id) WHERE is_current IS TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS applicant_external_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    link_type link_type NOT NULL,
    label VARCHAR(120) NULL,
    url VARCHAR(500) NOT NULL,
    display_order SMALLINT NOT NULL DEFAULT 0,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS ix_applicant_links_user ON applicant_external_links (applicant_user_id, display_order) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS applicant_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL,
    description TEXT NULL,
    repository_url VARCHAR(500) NULL,
    demo_url VARCHAR(500) NULL,
    started_at DATE NULL,
    finished_at DATE NULL,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX IF NOT EXISTS ix_applicant_projects_user ON applicant_projects (applicant_user_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS applicant_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags (id) ON DELETE RESTRICT,
    proficiency SMALLINT NULL,
    years_experience NUMERIC(4, 1) NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (applicant_user_id, tag_id),
    CHECK (proficiency IS NULL OR proficiency BETWEEN 1 AND 5),
    CHECK (years_experience IS NULL OR years_experience >= 0)
);

CREATE INDEX IF NOT EXISTS ix_applicant_skills_tag ON applicant_skills (tag_id);

CREATE TABLE IF NOT EXISTS applicant_interest_tags (
    applicant_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (applicant_user_id, tag_id)
);

CREATE TABLE IF NOT EXISTS employers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employer_type employer_type NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255) NOT NULL,
    inn VARCHAR(12) NOT NULL,
    description_short VARCHAR(500) NULL,
    description_full TEXT NULL,
    website_url VARCHAR(500) NULL,
    corporate_email CITEXT NULL,
    phone VARCHAR(32) NULL,
    headquarters_location_id UUID NULL REFERENCES locations (id) ON DELETE SET NULL,
    verification_status employer_verification_status_v2 NOT NULL DEFAULT 'pending',
    verified_at TIMESTAMPTZ NULL,
    created_by UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    updated_by UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CHECK (inn ~ '^[0-9]{10,12}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employers_inn_active ON employers (inn) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_employers_verification_status ON employers (verification_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_employers_location ON employers (headquarters_location_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS employer_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employer_id UUID NOT NULL REFERENCES employers (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    membership_role membership_role NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (employer_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employer_primary_membership ON employer_memberships (employer_id) WHERE is_primary IS TRUE;
CREATE INDEX IF NOT EXISTS ix_employer_memberships_user ON employer_memberships (user_id);

CREATE TABLE IF NOT EXISTS employer_external_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employer_id UUID NOT NULL REFERENCES employers (id) ON DELETE CASCADE,
    link_type link_type NOT NULL,
    label VARCHAR(120) NULL,
    url VARCHAR(500) NOT NULL,
    display_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS ix_employer_links_employer ON employer_external_links (employer_id, display_order) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS employer_verification_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employer_id UUID NOT NULL REFERENCES employers (id) ON DELETE CASCADE,
    legal_name VARCHAR(255) NOT NULL,
    employer_type employer_type NOT NULL,
    inn VARCHAR(12) NOT NULL,
    corporate_email CITEXT NULL,
    status employer_verification_status_v2 NOT NULL DEFAULT 'pending',
    submitted_by UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ NULL,
    rejection_reason TEXT NULL,
    moderator_comment TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (inn ~ '^[0-9]{10,12}$')
);

CREATE INDEX IF NOT EXISTS ix_employer_verification_requests_employer ON employer_verification_requests (employer_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS ix_employer_verification_requests_status ON employer_verification_requests (status, submitted_at DESC);

CREATE TABLE IF NOT EXISTS employer_verification_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_request_id UUID NOT NULL REFERENCES employer_verification_requests (id) ON DELETE CASCADE,
    status employer_verification_status_v2 NOT NULL,
    reviewer_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    comment TEXT NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_employer_verification_reviews_request ON employer_verification_reviews (verification_request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS employer_verification_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_request_id UUID NOT NULL REFERENCES employer_verification_requests (id) ON DELETE CASCADE,
    media_file_id UUID NULL REFERENCES media_files (id) ON DELETE CASCADE,
    document_type verification_document_type NOT NULL,
    source_url VARCHAR(500) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (media_file_id IS NOT NULL OR source_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ix_employer_verification_documents_request ON employer_verification_documents (verification_request_id);

CREATE TABLE IF NOT EXISTS opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employer_id UUID NOT NULL REFERENCES employers (id) ON DELETE CASCADE,
    created_by_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    updated_by_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    moderated_by_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    location_id UUID NULL REFERENCES locations (id) ON DELETE SET NULL,
    cover_media_id UUID NULL REFERENCES media_files (id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    short_description VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    opportunity_type opportunity_type NOT NULL,
    business_status opportunity_status NOT NULL DEFAULT 'draft',
    moderation_status moderation_status NOT NULL DEFAULT 'pending_review',
    work_format work_format NOT NULL,
    employment_type employment_type NULL,
    level opportunity_level NULL,
    contact_email CITEXT NULL,
    contact_phone VARCHAR(32) NULL,
    published_at TIMESTAMPTZ NULL,
    starts_at TIMESTAMPTZ NULL,
    ends_at TIMESTAMPTZ NULL,
    application_deadline TIMESTAMPTZ NULL,
    capacity INTEGER NULL,
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    moderated_at TIMESTAMPTZ NULL,
    moderation_reason TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL,
    CHECK (capacity IS NULL OR capacity > 0),
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
    CHECK (application_deadline IS NULL OR ends_at IS NULL OR application_deadline <= ends_at)
);

CREATE INDEX IF NOT EXISTS ix_opportunities_feed ON opportunities (business_status, moderation_status, opportunity_type, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_opportunities_employer ON opportunities (employer_id, business_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_opportunities_location ON opportunities (location_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_opportunities_dates ON opportunities (published_at DESC, application_deadline, starts_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS opportunity_compensations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
    salary_from NUMERIC(12, 2) NULL,
    salary_to NUMERIC(12, 2) NULL,
    currency_code CHAR(3) NULL,
    salary_period salary_period NULL,
    is_gross BOOLEAN NOT NULL DEFAULT TRUE,
    stipend_text VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (opportunity_id),
    CHECK (salary_from IS NULL OR salary_from >= 0),
    CHECK (salary_to IS NULL OR salary_to >= 0),
    CHECK (salary_from IS NULL OR salary_to IS NULL OR salary_to >= salary_from)
);

CREATE INDEX IF NOT EXISTS ix_opportunity_compensations_range ON opportunity_compensations (salary_from, salary_to);

CREATE TABLE IF NOT EXISTS opportunity_external_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
    link_type link_type NOT NULL,
    label VARCHAR(120) NULL,
    url VARCHAR(500) NOT NULL,
    display_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS ix_opportunity_links_opportunity ON opportunity_external_links (opportunity_id, display_order);

CREATE TABLE IF NOT EXISTS opportunity_tags (
    opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (opportunity_id, tag_id)
);

CREATE INDEX IF NOT EXISTS ix_opportunity_tags_tag_id ON opportunity_tags (tag_id);

CREATE TABLE IF NOT EXISTS opportunity_skill_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags (id) ON DELETE RESTRICT,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    priority SMALLINT NOT NULL DEFAULT 1,
    notes VARCHAR(255) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (opportunity_id, tag_id),
    CHECK (priority BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS ix_opportunity_skill_requirements_tag ON opportunity_skill_requirements (tag_id, priority);

CREATE TABLE IF NOT EXISTS opportunity_media_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
    media_file_id UUID NOT NULL REFERENCES media_files (id) ON DELETE CASCADE,
    owner_kind media_owner_kind NOT NULL DEFAULT 'gallery',
    display_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (opportunity_id, media_file_id),
    CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS ix_opportunity_media_opportunity ON opportunity_media_files (opportunity_id, display_order);

CREATE TABLE IF NOT EXISTS employer_media_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employer_id UUID NOT NULL REFERENCES employers (id) ON DELETE CASCADE,
    media_file_id UUID NOT NULL REFERENCES media_files (id) ON DELETE CASCADE,
    owner_kind media_owner_kind NOT NULL DEFAULT 'gallery',
    display_order SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (employer_id, media_file_id),
    CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS ix_employer_media_employer ON employer_media_files (employer_id, display_order);

CREATE TABLE IF NOT EXISTS favorite_opportunities (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS ix_favorite_opportunities_opportunity ON favorite_opportunities (opportunity_id);

CREATE TABLE IF NOT EXISTS favorite_employers (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    employer_id UUID NOT NULL REFERENCES employers (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, employer_id)
);

CREATE INDEX IF NOT EXISTS ix_favorite_employers_employer ON favorite_employers (employer_id);

CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
    applicant_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    resume_version_id UUID NULL REFERENCES resume_versions (id) ON DELETE SET NULL,
    cover_letter TEXT NULL,
    status application_status NOT NULL DEFAULT 'submitted',
    status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_hidden_by_applicant BOOLEAN NOT NULL DEFAULT FALSE,
    employer_comment TEXT NULL,
    curator_comment TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_applications_opportunity_status ON applications (opportunity_id, status, submitted_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_applications_applicant_status ON applications (applicant_user_id, status, submitted_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_single_active ON applications (opportunity_id, applicant_user_id)
WHERE deleted_at IS NULL
  AND status NOT IN ('withdrawn', 'rejected', 'canceled');

CREATE TABLE IF NOT EXISTS application_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
    status application_status NOT NULL,
    changed_by_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    comment TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_application_status_history_application ON application_status_history (application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS contact_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status contact_request_status NOT NULL DEFAULT 'pending',
    message TEXT NULL,
    responded_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (sender_user_id <> recipient_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_requests_active_pair ON contact_requests (
    LEAST(sender_user_id, recipient_user_id),
    GREATEST(sender_user_id, recipient_user_id)
)
WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS ix_contact_requests_recipient ON contact_requests (recipient_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS applicant_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_low_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_high_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_from_request_id UUID NULL REFERENCES contact_requests (id) ON DELETE SET NULL,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (user_low_id <> user_high_id),
    CHECK (user_low_id < user_high_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_applicant_contacts_pair ON applicant_contacts (user_low_id, user_high_id);
CREATE INDEX IF NOT EXISTS ix_applicant_contacts_lookup_low ON applicant_contacts (user_low_id);
CREATE INDEX IF NOT EXISTS ix_applicant_contacts_lookup_high ON applicant_contacts (user_high_id);

CREATE TABLE IF NOT EXISTS opportunity_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommender_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES opportunities (id) ON DELETE CASCADE,
    comment TEXT NULL,
    status recommendation_status NOT NULL DEFAULT 'pending',
    used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (recommender_user_id <> recipient_user_id),
    UNIQUE (recommender_user_id, recipient_user_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS ix_opportunity_recommendations_recipient ON opportunity_recommendations (recipient_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS moderation_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type moderation_target_type NOT NULL,
    target_id UUID NOT NULL,
    status moderation_status NOT NULL DEFAULT 'pending_review',
    assigned_to_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    opened_by_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    resolved_by_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    resolution_reason TEXT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_moderation_cases_target ON moderation_cases (target_type, target_id);
CREATE INDEX IF NOT EXISTS ix_moderation_cases_status ON moderation_cases (status, opened_at DESC);

CREATE TABLE IF NOT EXISTS moderation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    moderation_case_id UUID NOT NULL REFERENCES moderation_cases (id) ON DELETE CASCADE,
    action moderation_action_type NOT NULL,
    actor_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    from_status moderation_status NULL,
    to_status moderation_status NULL,
    comment TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_moderation_actions_case ON moderation_actions (moderation_case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID NULL REFERENCES users (id) ON DELETE SET NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    ip_address INET NULL,
    user_agent VARCHAR(500) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_audit_log_entity ON audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_log_actor ON audit_log (actor_user_id, created_at DESC);
