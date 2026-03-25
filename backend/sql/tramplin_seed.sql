INSERT INTO users (id, email, display_name, password_hash, role, status, email_verified_at, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'admin@tramplin.ru', 'Platform Admin', '$demo$admin_hash', 'admin', 'active', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000002', 'curator@tramplin.ru', 'Lead Curator', '$pbkdf2-sha256$29000$ZUwJoVTqXev9XytF6J2zNg$5J.hHC8Bj1ADDWDREmnrRGCZicVgGxU5vpErKB6Kv64', 'curator', 'active', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000003', 'hr@acme.example', 'Acme Recruiter', '$demo$employer_hash', 'employer', 'active', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000004', 'alice@student.example', 'Alice', '$demo$applicant_hash', 'applicant', 'active', NOW(), NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000005', 'bob@student.example', 'Bob', '$demo$applicant_hash', 'applicant', 'active', NOW(), NOW(), NOW());

INSERT INTO curator_profiles (user_id, full_name, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000002', 'Lead Curator', NOW(), NOW());

INSERT INTO locations (id, country_code, country_name, region, city, formatted_address, latitude, longitude, timezone, created_at, updated_at)
VALUES
    ('10000000-0000-0000-0000-000000000001', 'RU', 'Russia', 'Moscow', 'Moscow', 'Moscow, Russia', 55.755800, 37.617300, 'Europe/Moscow', NOW(), NOW()),
    ('10000000-0000-0000-0000-000000000002', 'RU', 'Russia', 'Saint Petersburg', 'Saint Petersburg', 'Saint Petersburg, Russia', 59.934300, 30.335100, 'Europe/Moscow', NOW(), NOW());

INSERT INTO applicant_profiles (user_id, full_name, headline, university_name, study_course, graduation_year, primary_location_id, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000004', 'Alice Ivanova', 'Junior Python Developer', 'MIPT', 4, 2027, '10000000-0000-0000-0000-000000000001', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000005', 'Bob Petrov', 'Product Analytics Student', 'ITMO', 3, 2028, '10000000-0000-0000-0000-000000000002', NOW(), NOW());

INSERT INTO applicant_privacy_settings (user_id, profile_visibility, resume_visibility, applications_visibility, contacts_visibility, career_interests_visibility, created_at, updated_at)
VALUES
    ('00000000-0000-0000-0000-000000000004', 'authenticated', 'contacts_only', 'private', 'contacts_only', 'contacts_only', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'private', 'contacts_only', 'authenticated', NOW(), NOW());

INSERT INTO employers (
    id,
    employer_type,
    display_name,
    legal_name,
    inn,
    description_short,
    description_full,
    website_url,
    corporate_email,
    headquarters_location_id,
    verification_status,
    verified_at,
    created_by,
    updated_by,
    created_at,
    updated_at
)
VALUES
    (
        '20000000-0000-0000-0000-000000000001',
        'company',
        'Acme Tech',
        'OOO Acme Tech',
        '7707083893',
        'Employer focused on backend and analytics roles.',
        'Acme Tech runs internship, vacancy and event programs for students and graduates.',
        'https://acme.example',
        'hr@acme.example',
        '10000000-0000-0000-0000-000000000001',
        'approved',
        NOW(),
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001',
        NOW(),
        NOW()
    );

INSERT INTO employer_memberships (id, employer_id, user_id, membership_role, is_primary, created_at, updated_at)
VALUES
    ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'owner', TRUE, NOW(), NOW());

INSERT INTO employer_verification_requests (
    id,
    employer_id,
    legal_name,
    employer_type,
    inn,
    corporate_email,
    status,
    submitted_by,
    submitted_at,
    reviewed_by,
    reviewed_at,
    moderator_comment,
    created_at,
    updated_at
)
VALUES
    (
        '22000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        'OOO Acme Tech',
        'company',
        '7707083893',
        'hr@acme.example',
        'approved',
        '00000000-0000-0000-0000-000000000003',
        NOW() - INTERVAL '5 days',
        '00000000-0000-0000-0000-000000000002',
        NOW() - INTERVAL '4 days',
        'Documents verified successfully.',
        NOW() - INTERVAL '5 days',
        NOW() - INTERVAL '4 days'
    );

INSERT INTO employer_verification_reviews (id, verification_request_id, status, reviewer_user_id, comment, created_at)
VALUES
    ('22100000-0000-0000-0000-000000000001', '22000000-0000-0000-0000-000000000001', 'under_review', '00000000-0000-0000-0000-000000000002', 'Request accepted for review.', NOW() - INTERVAL '5 days'),
    ('22100000-0000-0000-0000-000000000002', '22000000-0000-0000-0000-000000000001', 'approved', '00000000-0000-0000-0000-000000000002', 'Verification approved.', NOW() - INTERVAL '4 days');

INSERT INTO tags (id, slug, name, tag_type, moderation_status, is_system, created_at, updated_at)
VALUES
    ('30000000-0000-0000-0000-000000000001', 'python', 'Python', 'technology', 'approved', TRUE, NOW(), NOW()),
    ('30000000-0000-0000-0000-000000000002', 'sql', 'SQL', 'technology', 'approved', TRUE, NOW(), NOW()),
    ('30000000-0000-0000-0000-000000000003', 'junior', 'Junior', 'level', 'approved', TRUE, NOW(), NOW()),
    ('30000000-0000-0000-0000-000000000004', 'full-time', 'Full-time', 'employment_type', 'approved', TRUE, NOW(), NOW()),
    ('30000000-0000-0000-0000-000000000005', 'analytics', 'Analytics', 'specialization', 'approved', TRUE, NOW(), NOW()),
    ('30000000-0000-0000-0000-000000000006', 'backend', 'Backend', 'direction', 'approved', TRUE, NOW(), NOW()),
    ('30000000-0000-0000-0000-000000000007', 'remote', 'Remote', 'format', 'approved', TRUE, NOW(), NOW());

INSERT INTO applicant_skills (id, applicant_user_id, tag_id, proficiency, years_experience, is_primary, created_at, updated_at)
VALUES
    ('31000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 4, 2.0, TRUE, NOW(), NOW()),
    ('31000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', 3, 1.5, FALSE, NOW(), NOW()),
    ('31000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000005', 4, 1.0, TRUE, NOW(), NOW());

INSERT INTO applicant_interest_tags (applicant_user_id, tag_id, created_at)
VALUES
    ('00000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000006', NOW()),
    ('00000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000005', NOW());

INSERT INTO resumes (id, applicant_user_id, title, is_primary, created_at, updated_at)
VALUES
    ('32000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'Alice Main Resume', TRUE, NOW(), NOW()),
    ('32000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005', 'Bob Main Resume', TRUE, NOW(), NOW());

INSERT INTO resume_versions (id, resume_id, version_number, summary, is_current, created_by, created_at)
VALUES
    ('32100000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', 1, 'Python backend internship focused resume.', TRUE, '00000000-0000-0000-0000-000000000004', NOW()),
    ('32100000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000002', 1, 'Analytics and event participation resume.', TRUE, '00000000-0000-0000-0000-000000000005', NOW());

INSERT INTO opportunities (
    id,
    employer_id,
    created_by_user_id,
    updated_by_user_id,
    moderated_by_user_id,
    location_id,
    title,
    short_description,
    description,
    opportunity_type,
    business_status,
    moderation_status,
    work_format,
    employment_type,
    level,
    contact_email,
    published_at,
    starts_at,
    ends_at,
    application_deadline,
    capacity,
    is_paid,
    moderated_at,
    created_at,
    updated_at
)
VALUES
    (
        '40000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        'Python Backend Internship',
        'Paid internship for backend students.',
        'Three month internship with mentor support and production tasks.',
        'internship',
        'active',
        'approved',
        'hybrid',
        'full_time',
        'student',
        'hr@acme.example',
        NOW() - INTERVAL '10 days',
        NOW() + INTERVAL '20 days',
        NOW() + INTERVAL '110 days',
        NOW() + INTERVAL '14 days',
        8,
        TRUE,
        NOW() - INTERVAL '11 days',
        NOW() - INTERVAL '12 days',
        NOW() - INTERVAL '10 days'
    ),
    (
        '40000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        'Junior Backend Engineer',
        'Full-time backend position for graduates.',
        'Production backend role with Python, PostgreSQL and API design.',
        'vacancy',
        'active',
        'approved',
        'office',
        'full_time',
        'junior',
        'hr@acme.example',
        NOW() - INTERVAL '7 days',
        NOW() + INTERVAL '7 days',
        NOW() + INTERVAL '180 days',
        NOW() + INTERVAL '21 days',
        3,
        TRUE,
        NOW() - INTERVAL '8 days',
        NOW() - INTERVAL '9 days',
        NOW() - INTERVAL '7 days'
    ),
    (
        '40000000-0000-0000-0000-000000000003',
        '20000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        'Career Day: Backend and Data',
        'Offline career event for students.',
        'One-day event with talks, CV review and recruiting sessions.',
        'career_event',
        'scheduled',
        'approved',
        'offline',
        NULL,
        NULL,
        'events@acme.example',
        NOW() - INTERVAL '2 days',
        NOW() + INTERVAL '30 days',
        NOW() + INTERVAL '30 days' + INTERVAL '8 hours',
        NOW() + INTERVAL '29 days',
        150,
        FALSE,
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '3 days',
        NOW() - INTERVAL '2 days'
    );

INSERT INTO opportunity_compensations (id, opportunity_id, salary_from, salary_to, currency_code, salary_period, is_gross, created_at, updated_at)
VALUES
    ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 60000, 80000, 'RUB', 'monthly', TRUE, NOW(), NOW()),
    ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 140000, 190000, 'RUB', 'monthly', TRUE, NOW(), NOW());

INSERT INTO opportunity_tags (opportunity_id, tag_id, created_at)
VALUES
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000006', NOW()),
    ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000007', NOW()),
    ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000006', NOW()),
    ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000005', NOW());

INSERT INTO opportunity_skill_requirements (id, opportunity_id, tag_id, is_required, priority, created_at)
VALUES
    ('42000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', TRUE, 1, NOW()),
    ('42000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', FALSE, 3, NOW()),
    ('42000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', TRUE, 1, NOW());

INSERT INTO applications (
    id,
    opportunity_id,
    applicant_user_id,
    resume_version_id,
    cover_letter,
    status,
    status_changed_at,
    submitted_at,
    last_activity_at,
    employer_comment,
    created_at,
    updated_at
)
VALUES
    (
        '50000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000004',
        '32100000-0000-0000-0000-000000000001',
        'I want to join the backend internship and grow in API development.',
        'shortlisted',
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '3 days',
        NOW() - INTERVAL '1 day',
        'Strong fit for first interview.',
        NOW() - INTERVAL '3 days',
        NOW() - INTERVAL '1 day'
    ),
    (
        '50000000-0000-0000-0000-000000000002',
        '40000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000005',
        '32100000-0000-0000-0000-000000000002',
        'Interested in analytics track and networking.',
        'submitted',
        NOW() - INTERVAL '12 hours',
        NOW() - INTERVAL '12 hours',
        NOW() - INTERVAL '12 hours',
        NULL,
        NOW() - INTERVAL '12 hours',
        NOW() - INTERVAL '12 hours'
    );

INSERT INTO application_status_history (id, application_id, status, changed_by_user_id, comment, created_at)
VALUES
    ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'submitted', '00000000-0000-0000-0000-000000000004', 'Application created.', NOW() - INTERVAL '3 days'),
    ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'under_review', '00000000-0000-0000-0000-000000000003', 'Resume reviewed by recruiter.', NOW() - INTERVAL '2 days'),
    ('51000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'shortlisted', '00000000-0000-0000-0000-000000000003', 'Candidate moved to shortlist.', NOW() - INTERVAL '1 day'),
    ('51000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000002', 'submitted', '00000000-0000-0000-0000-000000000005', 'Application created.', NOW() - INTERVAL '12 hours');

INSERT INTO favorite_opportunities (user_id, opportunity_id, created_at)
VALUES
    ('00000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', NOW()),
    ('00000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000001', NOW());

INSERT INTO favorite_employers (user_id, employer_id, created_at)
VALUES
    ('00000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', NOW());

INSERT INTO contact_requests (id, sender_user_id, recipient_user_id, status, message, responded_at, created_at, updated_at)
VALUES
    ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', 'accepted', 'Let us connect on backend and analytics opportunities.', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day');

INSERT INTO applicant_contacts (id, user_low_id, user_high_id, created_from_request_id, connected_at, created_at)
VALUES
    ('61000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000001', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day');

INSERT INTO opportunity_recommendations (id, recommender_user_id, recipient_user_id, opportunity_id, comment, status, created_at, updated_at)
VALUES
    ('62000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', 'This event matches your analytics interests.', 'viewed', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '2 hours');

INSERT INTO moderation_cases (id, target_type, target_id, status, assigned_to_user_id, opened_by_user_id, resolved_by_user_id, resolution_reason, opened_at, resolved_at, created_at, updated_at)
VALUES
    ('70000000-0000-0000-0000-000000000001', 'employer_verification', '22000000-0000-0000-0000-000000000001', 'approved', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Company verification approved.', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days'),
    ('70000000-0000-0000-0000-000000000002', 'opportunity', '40000000-0000-0000-0000-000000000001', 'approved', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'Opportunity approved for publication.', NOW() - INTERVAL '12 days', NOW() - INTERVAL '11 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '11 days');

INSERT INTO moderation_actions (id, moderation_case_id, action, actor_user_id, from_status, to_status, comment, created_at)
VALUES
    ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'approved', '00000000-0000-0000-0000-000000000002', 'pending_review', 'approved', 'Verification approved.', NOW() - INTERVAL '4 days'),
    ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', 'approved', '00000000-0000-0000-0000-000000000002', 'pending_review', 'approved', 'Opportunity content is valid.', NOW() - INTERVAL '11 days');

INSERT INTO audit_log (id, actor_user_id, entity_type, entity_id, action, payload, created_at)
VALUES
    ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'employer_verification_request', '22000000-0000-0000-0000-000000000001', 'approve', '{"status":"approved"}', NOW() - INTERVAL '4 days'),
    ('80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'opportunity', '40000000-0000-0000-0000-000000000001', 'publish', '{"business_status":"active","moderation_status":"approved"}', NOW() - INTERVAL '10 days');
