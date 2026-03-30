import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import verifiedIcon from "../../assets/icons/verified.svg";
import {
  buildApplicantProfileMenuItems,
  buildEmployerProfileMenuItems,
  Header,
} from "../../widgets/header";
import { Footer } from "../../widgets/footer";
import {
  getEmployerAccessState,
  publicUserProfileRequest,
  readAccessTokenPayload,
  useAuthStore,
  type ApplicantDashboardAchievement,
  type ApplicantDashboardCertificate,
  type ApplicantDashboardProject,
  type ApplicantDashboardResponse,
} from "../../features/auth";
import { resolveAvatarIcon, resolveAvatarUrl } from "../../shared/lib";
import { Badge, Container } from "../../shared/ui";
import "../seeker-dashboard/seeker-dashboard.css";
import "../employer-dashboard/employer-dashboard.css";
import "./public-profile.css";

type SeekerLevel = "Junior" | "Middle" | "Senior";

type ApplicantViewState = {
  publicId: string;
  displayName: string;
  preferredCity: string;
  isOnline: boolean;
  profile: {
    about: string;
    university: string;
    studyCourse: string;
    graduationYear: string;
    level: SeekerLevel;
    hardSkills: string[];
    softSkills: string[];
    languages: string[];
    githubUrl: string;
    gitlabUrl: string;
    bitbucketUrl: string;
    linkedinUrl: string;
    portfolioUrl: string;
    habrUrl: string;
    resumeUrl: string;
    desiredSalaryFrom: string;
    preferredLocation: string;
    employmentTypes: string[];
    workFormats: string[];
  };
  stats: {
    profileViewsCount: number;
    applicationsCount: number;
    responsesCount: number;
    invitationsCount: number;
    recommendationsCount: number;
  };
  projects: Array<{
    id: string;
    title: string;
    description: string;
    technologies: string;
    periodLabel: string;
    roleName: string;
    repositoryUrl: string;
  }>;
  achievements: Array<{
    id: string;
    title: string;
    eventName: string;
    projectName: string;
    award: string;
  }>;
  certificates: Array<{
    id: string;
    title: string;
    organizationName: string;
    issuedAt: string;
    credentialUrl: string;
  }>;
};

function normalizeStringArray(value?: string[] | null) {
  return (value ?? []).map((item) => item.trim()).filter(Boolean);
}

function mapProject(item: ApplicantDashboardProject) {
  return {
    id: item.id,
    title: item.title ?? "",
    description: item.description?.trim() ?? "",
    technologies: item.technologies?.trim() ?? "",
    periodLabel: item.period_label?.trim() ?? "",
    roleName: item.role_name?.trim() ?? "",
    repositoryUrl: item.repository_url?.trim() ?? "",
  };
}

function mapAchievement(item: ApplicantDashboardAchievement) {
  return {
    id: item.id,
    title: item.title ?? "",
    eventName: item.event_name?.trim() ?? "",
    projectName: item.project_name?.trim() ?? "",
    award: item.award?.trim() ?? "",
  };
}

function mapCertificate(item: ApplicantDashboardCertificate) {
  return {
    id: item.id,
    title: item.title ?? "",
    organizationName: item.organization_name?.trim() ?? "",
    issuedAt: item.issued_at?.trim() ?? "",
    credentialUrl: item.credential_url?.trim() ?? "",
  };
}

function buildApplicantViewState(
  publicId: string,
  displayName: string,
  preferredCity: string | null | undefined,
  isOnline: boolean,
  dashboard: ApplicantDashboardResponse["data"] | null | undefined,
): ApplicantViewState {
  const profile = dashboard?.profile;

  return {
    publicId,
    displayName,
    preferredCity:
      dashboard?.career_interests?.preferred_city?.trim() ||
      dashboard?.preferred_city?.trim() ||
      preferredCity?.trim() ||
      "",
    isOnline,
    profile: {
      about: profile?.about?.trim() ?? "",
      university: profile?.university?.trim() ?? "",
      studyCourse: profile?.study_course ? String(profile.study_course) : "",
      graduationYear: profile?.graduation_year ? String(profile.graduation_year) : "",
      level: ((profile?.level?.trim() as SeekerLevel | undefined) || "Junior"),
      hardSkills: normalizeStringArray(profile?.hard_skills),
      softSkills: normalizeStringArray(profile?.soft_skills),
      languages: normalizeStringArray(profile?.languages),
      githubUrl: dashboard?.links?.github_url?.trim() ?? profile?.github_url?.trim() ?? "",
      gitlabUrl: dashboard?.links?.gitlab_url?.trim() ?? profile?.gitlab_url?.trim() ?? "",
      bitbucketUrl: dashboard?.links?.bitbucket_url?.trim() ?? profile?.bitbucket_url?.trim() ?? "",
      linkedinUrl: dashboard?.links?.linkedin_url?.trim() ?? profile?.linkedin_url?.trim() ?? "",
      portfolioUrl: dashboard?.links?.portfolio_url?.trim() ?? profile?.portfolio_url?.trim() ?? "",
      habrUrl: dashboard?.links?.habr_url?.trim() ?? profile?.habr_url?.trim() ?? "",
      resumeUrl: dashboard?.links?.resume_url?.trim() ?? profile?.resume_url?.trim() ?? "",
      desiredSalaryFrom:
        dashboard?.career_interests?.desired_salary_from != null
          ? String(dashboard.career_interests.desired_salary_from)
          : profile?.desired_salary_from != null
            ? String(profile.desired_salary_from)
            : "",
      preferredLocation:
        dashboard?.career_interests?.preferred_location?.trim() ??
        profile?.preferred_location?.trim() ??
        "",
      employmentTypes: normalizeStringArray(dashboard?.career_interests?.employment_types ?? profile?.employment_types),
      workFormats: normalizeStringArray(dashboard?.career_interests?.work_formats ?? profile?.work_formats),
    },
    stats: {
      profileViewsCount: dashboard?.stats?.profile_views_count ?? profile?.profile_views_count ?? 0,
      applicationsCount: dashboard?.stats?.applications_count ?? 0,
      responsesCount: dashboard?.stats?.responses_count ?? 0,
      invitationsCount: dashboard?.stats?.invitations_count ?? 0,
      recommendationsCount: dashboard?.stats?.recommendations_count ?? profile?.recommendations_count ?? 0,
    },
    projects: (dashboard?.projects ?? []).map(mapProject),
    achievements: (dashboard?.achievements ?? []).map(mapAchievement),
    certificates: (dashboard?.certificates ?? []).map(mapCertificate),
  };
}

function calculateApplicantProfileCompletion(state: ApplicantViewState) {
  const weightedFields = [
    { filled: state.displayName.trim().length > 0, weight: 1 },
    { filled: state.profile.university.trim().length > 0, weight: 1 },
    { filled: state.profile.studyCourse.trim().length > 0, weight: 1 },
    { filled: state.profile.graduationYear.trim().length > 0, weight: 1 },
    { filled: state.preferredCity.trim().length > 0, weight: 1 },
    { filled: state.profile.about.trim().length > 0, weight: 2 },
    { filled: state.profile.level.trim().length > 0, weight: 1 },
    { filled: state.profile.hardSkills.length > 0, weight: 2 },
    { filled: state.profile.softSkills.length > 0, weight: 2 },
    { filled: state.profile.languages.length > 0, weight: 2 },
    { filled: state.profile.githubUrl.trim().length > 0, weight: 1 },
    { filled: state.profile.gitlabUrl.trim().length > 0, weight: 1 },
    { filled: state.profile.bitbucketUrl.trim().length > 0, weight: 1 },
    { filled: state.profile.linkedinUrl.trim().length > 0, weight: 1 },
    { filled: state.profile.portfolioUrl.trim().length > 0, weight: 1 },
    { filled: state.profile.habrUrl.trim().length > 0, weight: 1 },
    { filled: state.profile.resumeUrl.trim().length > 0, weight: 1 },
    { filled: state.profile.desiredSalaryFrom.trim().length > 0, weight: 2 },
    { filled: state.profile.preferredLocation.trim().length > 0, weight: 2 },
    { filled: state.profile.employmentTypes.length > 0, weight: 2 },
    { filled: state.profile.workFormats.length > 0, weight: 2 },
    { filled: state.projects.length > 0, weight: 4 },
    { filled: state.achievements.length > 0, weight: 3 },
    { filled: state.certificates.length > 0, weight: 3 },
  ];
  const totalWeight = weightedFields.reduce((sum, item) => sum + item.weight, 0);
  const filledWeight = weightedFields.reduce((sum, item) => sum + (item.filled ? item.weight : 0), 0);
  return Math.round((filledWeight / totalWeight) * 100);
}

function formatSalary(value: string) {
  const digits = value.replace(/\D+/g, "");
  if (!digits) {
    return "Не указана";
  }

  const amount = Number(digits);
  return `от ${amount.toLocaleString("ru-RU")} ₽`;
}

function formatLinkLabel(value: string, fallback: string) {
  return value.trim() || fallback;
}

function formatVerificationLabel(
  value: "unverified" | "pending_review" | "verified" | "rejected" | "changes_requested" | undefined,
) {
  switch (value) {
    case "verified":
      return "Верифицировано";
    case "pending_review":
      return "На проверке";
    case "changes_requested":
      return "Нужны правки";
    case "rejected":
      return "Отклонено";
    default:
      return "Не верифицировано";
  }
}

function formatVerificationClassName(
  value: "unverified" | "pending_review" | "verified" | "rejected" | "changes_requested" | undefined,
) {
  switch (value) {
    case "pending_review":
      return "employer-dashboard__summary-value employer-dashboard__summary-value--pending-review";
    case "verified":
      return "employer-dashboard__summary-value employer-dashboard__summary-value--verified";
    case "rejected":
      return "employer-dashboard__summary-value employer-dashboard__summary-value--rejected";
    case "changes_requested":
      return "employer-dashboard__summary-value employer-dashboard__summary-value--info-request";
    default:
      return "employer-dashboard__summary-value employer-dashboard__summary-value--unpublished";
  }
}

function resolveLevelStatusVariant(level: SeekerLevel) {
  if (level === "Middle") {
    return "warning" as const;
  }

  if (level === "Senior") {
    return "danger" as const;
  }

  return "success" as const;
}

function renderExternalLink(label: string, value: string, fallback: string) {
  return (
    <div className="seeker-dashboard__link-block" key={label}>
      <span className="seeker-dashboard__link-label">{label}</span>
      {value ? (
        <a href={value} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
          {formatLinkLabel(value, fallback)}
        </a>
      ) : (
        <span className="public-profile-page__muted-value">Не указано</span>
      )}
    </div>
  );
}

export function PublicProfilePage() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const role = useAuthStore((state) => state.role);
  const activeRole = readAccessTokenPayload(accessToken)?.active_role ?? role;
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const employerAccess = getEmployerAccessState(role, accessToken);
  const profileMenuItems =
    activeRole === "employer"
      ? buildEmployerProfileMenuItems(navigate, employerAccess)
      : buildApplicantProfileMenuItems(navigate);

  const profileQuery = useQuery({
    queryKey: ["public-profile", publicId],
    queryFn: async () => {
      if (!publicId) {
        throw new Error("publicId is required");
      }
      return publicUserProfileRequest(publicId);
    },
    enabled: Boolean(publicId),
    retry: false,
  });

  const profile = profileQuery.data?.data;
  const applicantState = useMemo(() => {
    if (!profile?.public_id || !profile?.display_name || profile.role !== "applicant") {
      return null;
    }

    return buildApplicantViewState(
      profile.public_id,
      profile.display_name,
      profile.preferred_city,
      Boolean(profile.presence?.is_online),
      profile.applicant_dashboard,
    );
  }, [profile]);

  if (!publicId) {
    return <Navigate to="/" replace />;
  }

  if (profileQuery.isError) {
    return (
      <main className="public-profile-page public-profile-page--error">
        <Header profileMenuItems={profileMenuItems} theme="applicant" isAuthenticated={isAuthenticated} showSearch={false} />
        <Container className="public-profile-page__status-container">
          <div className="public-profile-page__status-card">
            <h1 className="public-profile-page__status-title">Профиль не найден</h1>
            <p className="public-profile-page__status-text">Проверьте идентификатор профиля или попробуйте открыть его позже.</p>
            <Link to="/" className="public-profile-page__status-link">Вернуться на главную</Link>
          </div>
        </Container>
        <Footer theme="applicant" />
      </main>
    );
  }

  if (profileQuery.isPending || !profile) {
    return (
      <main className="public-profile-page">
        <Header profileMenuItems={profileMenuItems} theme="applicant" isAuthenticated={isAuthenticated} showSearch={false} />
        <Container className="public-profile-page__status-container">
          <div className="public-profile-page__status-card">
            <h1 className="public-profile-page__status-title">Загружаем профиль</h1>
            <p className="public-profile-page__status-text">Подготавливаем данные соискателя или работодателя.</p>
          </div>
        </Container>
        <Footer theme="applicant" />
      </main>
    );
  }

  if (profile.role === "applicant" && applicantState) {
    const completion = calculateApplicantProfileCompletion(applicantState);

    return (
      <main className="seeker-dashboard public-profile-page public-profile-page--applicant">
        <Header
          profileMenuItems={profileMenuItems}
          theme="applicant"
          isAuthenticated={isAuthenticated}
          showSearch={false}
          bottomContent={null}
        />

        <Container className="seeker-dashboard__container">
          <section className="seeker-dashboard__hero">
            <div className="seeker-dashboard__hero-grid">
              <section className="seeker-dashboard__profile-card">
                <div className="seeker-dashboard__profile-card-head">
                  <div className="seeker-dashboard__identity-block">
                    <div className="seeker-dashboard__avatar-shell">
                      <img src={resolveAvatarIcon("applicant")} alt="" aria-hidden="true" className="seeker-dashboard__avatar-image" />
                    </div>
                    <div className="seeker-dashboard__identity-copy">
                      <p className="seeker-dashboard__profile-id">ID: {applicantState.publicId}</p>
                      <h1 className="seeker-dashboard__profile-name">{applicantState.displayName}</h1>
                      <p className="public-profile-page__presence">
                        <span className={`public-profile-page__presence-dot${applicantState.isOnline ? " public-profile-page__presence-dot--online" : ""}`} />
                        {applicantState.isOnline ? "Online" : "Недавно в сети"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="seeker-dashboard__profile-grid">
                  <div className="seeker-dashboard__field">
                    <span className="seeker-dashboard__field-label">Университет</span>
                    <p className="seeker-dashboard__paragraph">{applicantState.profile.university || "Не указан"}</p>
                  </div>
                  <div className="seeker-dashboard__field">
                    <span className="seeker-dashboard__field-label">Курс</span>
                    <p className="seeker-dashboard__paragraph">{applicantState.profile.studyCourse || "Не указан"}</p>
                  </div>
                  <div className="seeker-dashboard__field">
                    <span className="seeker-dashboard__field-label">Год выпуска</span>
                    <p className="seeker-dashboard__paragraph">{applicantState.profile.graduationYear || "Не указан"}</p>
                  </div>
                  <div className="seeker-dashboard__field">
                    <span className="seeker-dashboard__field-label">Город</span>
                    <p className="seeker-dashboard__paragraph">{applicantState.preferredCity || "Не указан"}</p>
                  </div>
                </div>
              </section>

              <aside className="seeker-dashboard__summary-column">
                <article className="seeker-dashboard__summary-card">
                  <div className="seeker-dashboard__summary-progress-head">
                    <p className="seeker-dashboard__summary-title">{`Профиль заполнен на ${completion}%`}</p>
                    <div className="seeker-dashboard__progress">
                      <span className="seeker-dashboard__progress-bar" style={{ width: `${Math.min(Math.max(completion, 6), 100)}%` }} />
                    </div>
                  </div>
                  <dl className="seeker-dashboard__metrics">
                    <div className="seeker-dashboard__metric-row">
                      <dt>Просмотров профиля:</dt>
                      <dd>{applicantState.stats.profileViewsCount}</dd>
                    </div>
                    <div className="seeker-dashboard__metric-row">
                      <dt>Отправлено откликов:</dt>
                      <dd>{applicantState.stats.applicationsCount}</dd>
                    </div>
                    <div className="seeker-dashboard__metric-row">
                      <dt>Получено ответов:</dt>
                      <dd>{applicantState.stats.responsesCount}</dd>
                    </div>
                    <div className="seeker-dashboard__metric-row">
                      <dt>Приглашений:</dt>
                      <dd>{applicantState.stats.invitationsCount}</dd>
                    </div>
                    <div className="seeker-dashboard__metric-row">
                      <dt>Рекомендаций:</dt>
                      <dd>{applicantState.stats.recommendationsCount}</dd>
                    </div>
                  </dl>
                </article>

                <article className="seeker-dashboard__summary-card">
                  <div className="seeker-dashboard__summary-head">
                    <h2 className="seeker-dashboard__summary-section-title">
                      Карьерные <span className="seeker-dashboard__summary-section-title-accent">интересы</span>
                    </h2>
                  </div>
                  <div className="seeker-dashboard__interest-list">
                    <div className="seeker-dashboard__interest-card">
                      <span className="seeker-dashboard__interest-label">Ожидаемая зарплата</span>
                      <strong className="seeker-dashboard__interest-value">{formatSalary(applicantState.profile.desiredSalaryFrom)}</strong>
                    </div>
                    <div className="seeker-dashboard__interest-card">
                      <span className="seeker-dashboard__interest-label">Предпочитаемая локация</span>
                      <strong className="seeker-dashboard__interest-value">{applicantState.profile.preferredLocation || "Не указана"}</strong>
                    </div>
                    <div className="seeker-dashboard__interest-card">
                      <span className="seeker-dashboard__interest-label">Тип занятости</span>
                      <strong className="seeker-dashboard__interest-value">{applicantState.profile.employmentTypes.join(", ") || "Не указано"}</strong>
                    </div>
                    <div className="seeker-dashboard__interest-card">
                      <span className="seeker-dashboard__interest-label">Формат работы</span>
                      <strong className="seeker-dashboard__interest-value">{applicantState.profile.workFormats.join(", ") || "Не указано"}</strong>
                    </div>
                  </div>
                </article>
              </aside>
            </div>
          </section>

          <section className="seeker-dashboard__section">
            <h2 className="seeker-dashboard__section-title">Портфолио</h2>
            <div className="seeker-dashboard__portfolio-grid">
              <article className="seeker-dashboard__content-card seeker-dashboard__content-card--links">
                <div className="seeker-dashboard__content-card-head">
                  <h3 className="seeker-dashboard__content-card-title">О себе</h3>
                </div>
                <div className="seeker-dashboard__content-card-body">
                  {applicantState.profile.about ? (
                    applicantState.profile.about.split(/\n+/).map((paragraph) => (
                      <p key={paragraph} className="seeker-dashboard__paragraph">{paragraph}</p>
                    ))
                  ) : (
                    <p className="seeker-dashboard__paragraph">Пока ничего не добавлено.</p>
                  )}
                </div>
              </article>

              <article className="seeker-dashboard__content-card">
                <div className="seeker-dashboard__content-card-head">
                  <h3 className="seeker-dashboard__content-card-title">Навыки</h3>
                </div>
                <div className="seeker-dashboard__content-card-body seeker-dashboard__content-card-body--stacked">
                  <div className="seeker-dashboard__skill-group">
                    <span className="seeker-dashboard__skill-title">Уровень</span>
                    <Badge variant={resolveLevelStatusVariant(applicantState.profile.level)} className="seeker-dashboard__level-badge">
                      {applicantState.profile.level}
                    </Badge>
                  </div>
                  <div className="seeker-dashboard__skill-group">
                    <span className="seeker-dashboard__skill-title">Hard skills</span>
                    <div className="seeker-dashboard__tag-list">
                      {applicantState.profile.hardSkills.length > 0 ? applicantState.profile.hardSkills.map((item) => (
                        <Badge key={item} variant="secondary">{item}</Badge>
                      )) : <span className="public-profile-page__muted-value">Не указаны</span>}
                    </div>
                  </div>
                  <div className="seeker-dashboard__skill-group">
                    <span className="seeker-dashboard__skill-title">Soft skills</span>
                    <div className="seeker-dashboard__tag-list">
                      {applicantState.profile.softSkills.length > 0 ? applicantState.profile.softSkills.map((item) => (
                        <Badge key={item} variant="secondary">{item}</Badge>
                      )) : <span className="public-profile-page__muted-value">Не указаны</span>}
                    </div>
                  </div>
                  <div className="seeker-dashboard__skill-group">
                    <span className="seeker-dashboard__skill-title">Языки</span>
                    <div className="seeker-dashboard__tag-list">
                      {applicantState.profile.languages.length > 0 ? applicantState.profile.languages.map((item) => (
                        <Badge key={item} variant="secondary">{item}</Badge>
                      )) : <span className="public-profile-page__muted-value">Не указаны</span>}
                    </div>
                  </div>
                </div>
              </article>

              <article className="seeker-dashboard__content-card">
                <div className="seeker-dashboard__content-card-head">
                  <h3 className="seeker-dashboard__content-card-title">Ссылки на репозитории</h3>
                </div>
                <div className="seeker-dashboard__content-card-body seeker-dashboard__content-card-body--stacked">
                  {renderExternalLink("GitHub", applicantState.profile.githubUrl, "github.com")}
                  {renderExternalLink("GitLab", applicantState.profile.gitlabUrl, "gitlab.com")}
                  {renderExternalLink("Bitbucket", applicantState.profile.bitbucketUrl, "bitbucket.org")}
                  {renderExternalLink("LinkedIn", applicantState.profile.linkedinUrl, "linkedin.com")}
                  {renderExternalLink("Портфолио", applicantState.profile.portfolioUrl, "portfolio.example")}
                  {renderExternalLink("Хабр", applicantState.profile.habrUrl, "habr.com")}
                  {renderExternalLink("Резюме", applicantState.profile.resumeUrl, "resume.example")}
                </div>
              </article>
            </div>
          </section>

          <section className="seeker-dashboard__section seeker-dashboard__section--combined">
            <div className="seeker-dashboard__collection seeker-dashboard__collection--combined">
              <div className="seeker-dashboard__collection-section">
                <h2 className="seeker-dashboard__section-title">Опыт проектов</h2>
              </div>
              <div className="seeker-dashboard__collection-grid">
                {applicantState.projects.length > 0 ? applicantState.projects.map((project) => (
                  <article key={project.id} className="seeker-dashboard__collection-card">
                    <div className="seeker-dashboard__collection-card-head">
                      <h3 className="seeker-dashboard__collection-card-title">{project.title}</h3>
                    </div>
                    <div className="seeker-dashboard__collection-card-body">
                      <div className="seeker-dashboard__collection-card-detail">
                        <span className="seeker-dashboard__collection-card-label">Описание:</span>
                        <p className="seeker-dashboard__paragraph">{project.description || "Не указано"}</p>
                      </div>
                      <div className="seeker-dashboard__collection-card-detail">
                        <span className="seeker-dashboard__collection-card-label">Технологии:</span>
                        <p className="seeker-dashboard__paragraph">{project.technologies || "Не указаны"}</p>
                      </div>
                      <div className="seeker-dashboard__collection-card-detail">
                        <span className="seeker-dashboard__collection-card-label">Период:</span>
                        <p className="seeker-dashboard__paragraph">{project.periodLabel || "Не указан"}</p>
                      </div>
                      <div className="seeker-dashboard__collection-card-detail">
                        <span className="seeker-dashboard__collection-card-label">Роль:</span>
                        <p className="seeker-dashboard__paragraph">{project.roleName || "Не указана"}</p>
                      </div>
                      <div className="seeker-dashboard__collection-card-detail">
                        <span className="seeker-dashboard__collection-card-label">Ссылка:</span>
                        {project.repositoryUrl ? (
                          <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                            {project.repositoryUrl}
                          </a>
                        ) : (
                          <span className="public-profile-page__muted-value">Не указана</span>
                        )}
                      </div>
                    </div>
                  </article>
                )) : <p className="public-profile-page__empty-block">Проекты не добавлены.</p>}
              </div>
            </div>

            <div className="seeker-dashboard__collection seeker-dashboard__collection--combined">
              <div className="seeker-dashboard__collection-section">
                <h2 className="seeker-dashboard__section-title">Достижения</h2>
              </div>
              <div className="seeker-dashboard__collection-grid">
                {applicantState.achievements.length > 0 ? applicantState.achievements.map((item) => (
                  <article key={item.id} className="seeker-dashboard__collection-card">
                    <div className="seeker-dashboard__collection-card-head">
                      <h3 className="seeker-dashboard__collection-card-title">{item.title}</h3>
                    </div>
                    <div className="seeker-dashboard__collection-card-body">
                      <div className="seeker-dashboard__collection-card-detail">
                        <span className="seeker-dashboard__collection-card-label">Мероприятие:</span>
                        <p className="seeker-dashboard__paragraph">{item.eventName || "Не указано"}</p>
                      </div>
                      <div className="seeker-dashboard__collection-card-detail">
                        <span className="seeker-dashboard__collection-card-label">Проект:</span>
                        <p className="seeker-dashboard__paragraph">{item.projectName || "Не указан"}</p>
                      </div>
                      <div className="seeker-dashboard__collection-card-detail">
                        <span className="seeker-dashboard__collection-card-label">Награда:</span>
                        <p className="seeker-dashboard__paragraph">{item.award || "Не указана"}</p>
                      </div>
                    </div>
                  </article>
                )) : <p className="public-profile-page__empty-block">Достижения не добавлены.</p>}
              </div>
            </div>

            <div className="seeker-dashboard__collection seeker-dashboard__collection--combined">
              <div className="seeker-dashboard__collection-section">
                <h2 className="seeker-dashboard__section-title">Сертификаты</h2>
              </div>
              <div className="seeker-dashboard__collection-grid">
                {applicantState.certificates.length > 0 ? applicantState.certificates.map((item) => (
                  <article key={item.id} className="seeker-dashboard__collection-card">
                    <div className="seeker-dashboard__collection-card-head">
                      <h3 className="seeker-dashboard__collection-card-title">{item.title}</h3>
                    </div>
                    <div className="seeker-dashboard__collection-card-body">
                      <div className="seeker-dashboard__collection-card-detail">
                        <span className="seeker-dashboard__collection-card-label">Организация:</span>
                        <p className="seeker-dashboard__paragraph">{item.organizationName || "Не указана"}</p>
                      </div>
                      <div className="seeker-dashboard__collection-card-detail">
                        <span className="seeker-dashboard__collection-card-label">Дата:</span>
                        <p className="seeker-dashboard__paragraph">{item.issuedAt || "Не указана"}</p>
                      </div>
                      <div className="seeker-dashboard__collection-card-detail">
                        <span className="seeker-dashboard__collection-card-label">Ссылка:</span>
                        {item.credentialUrl ? (
                          <a href={item.credentialUrl} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                            {item.credentialUrl}
                          </a>
                        ) : (
                          <span className="public-profile-page__muted-value">Не указана</span>
                        )}
                      </div>
                    </div>
                  </article>
                )) : <p className="public-profile-page__empty-block">Сертификаты не добавлены.</p>}
              </div>
            </div>
          </section>
        </Container>

        <Footer theme="applicant" />
      </main>
    );
  }

  const employerProfile = profile.employer_profile;
  const employerStats = profile.employer_stats;
  const verificationStatus = employerProfile?.verification_status;
  const theme = profile.role === "employer" ? "employer" : "applicant";
  const profileCompletionFields = [
    employerProfile?.company_name,
    employerProfile?.inn,
    employerProfile?.corporate_email,
    employerProfile?.short_description,
    employerProfile?.organization_size,
    employerProfile?.foundation_year ? String(employerProfile.foundation_year) : "",
    employerProfile?.website,
    employerProfile?.social_link,
    employerProfile?.office_addresses?.some((item) => item.trim()),
    employerProfile?.activity_areas?.some((item) => item.trim()),
  ];
  const employerCompletion = Math.round(
    (profileCompletionFields.filter((item) => typeof item === "string" ? Boolean(item.trim()) : Boolean(item)).length / profileCompletionFields.length) * 100,
  );

  return (
    <main className="employer-dashboard public-profile-page public-profile-page--employer">
      <Header
        profileMenuItems={profileMenuItems}
        theme={theme}
        isAuthenticated={isAuthenticated}
        showSearch={false}
        bottomContent={null}
      />

      <Container className="employer-dashboard__container">
        <section className="employer-dashboard__profile-grid">
          <div className="employer-dashboard__form-panel">
            <div className="employer-dashboard__identity">
              <div className="employer-dashboard__avatar-block">
                {profile.public_id ? <p className="employer-dashboard__profile-id">ID: {profile.public_id}</p> : null}
                <div className="employer-dashboard__avatar-shell">
                  <img
                    src={resolveAvatarUrl(employerProfile?.avatar_url) ?? resolveAvatarIcon("employer")}
                    alt=""
                    aria-hidden="true"
                    className="employer-dashboard__avatar-image"
                  />
                </div>
              </div>
            </div>

            <div className="employer-dashboard__form-grid">
              <div className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Наименование компании</span>
                <p className="public-profile-page__field-value">{employerProfile?.company_name || profile.display_name || "Не указано"}</p>
              </div>

              <div className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Краткое описание</span>
                <p className="public-profile-page__field-value public-profile-page__field-value--multiline">{employerProfile?.short_description || "Не указано"}</p>
              </div>

              <div className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Адреса офисов</span>
                <div className="employer-dashboard__office-list">
                  {(employerProfile?.office_addresses ?? []).length > 0 ? (
                    employerProfile?.office_addresses?.map((address, index) => (
                      <div key={`${address}-${index}`} className="employer-dashboard__office-item">
                        <p className="public-profile-page__field-value">{address}</p>
                      </div>
                    ))
                  ) : (
                    <p className="public-profile-page__muted-value">Не указаны</p>
                  )}
                </div>
              </div>

              <div className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Сфера деятельности</span>
                <div className="employer-dashboard__office-list">
                  {(employerProfile?.activity_areas ?? []).length > 0 ? (
                    employerProfile?.activity_areas?.map((area, index) => (
                      <div key={`${area}-${index}`} className="employer-dashboard__office-item">
                        <p className="public-profile-page__field-value">{area}</p>
                      </div>
                    ))
                  ) : (
                    <p className="public-profile-page__muted-value">Не указана</p>
                  )}
                </div>
              </div>

              <div className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Корпоративная почта</span>
                <p className="public-profile-page__field-value">{employerProfile?.corporate_email || "Не указана"}</p>
              </div>

              <div className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Сайт</span>
                {employerProfile?.website ? (
                  <a href={employerProfile.website} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                    {employerProfile.website}
                  </a>
                ) : (
                  <p className="public-profile-page__muted-value">Не указан</p>
                )}
              </div>

              <div className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">VK</span>
                {employerProfile?.social_link ? (
                  <a href={employerProfile.social_link} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                    {employerProfile.social_link}
                  </a>
                ) : (
                  <p className="public-profile-page__muted-value">Не указан</p>
                )}
              </div>

              <div className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">MAX</span>
                {employerProfile?.max_link ? (
                  <a href={employerProfile.max_link} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                    {employerProfile.max_link}
                  </a>
                ) : (
                  <p className="public-profile-page__muted-value">Не указан</p>
                )}
              </div>

              <div className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">RUTUBE</span>
                {employerProfile?.rutube_link ? (
                  <a href={employerProfile.rutube_link} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                    {employerProfile.rutube_link}
                  </a>
                ) : (
                  <p className="public-profile-page__muted-value">Не указан</p>
                )}
              </div>
            </div>
          </div>

          <aside className="employer-dashboard__summary">
            <article className="employer-dashboard__summary-card employer-dashboard__summary-card--progress">
              <div className="employer-dashboard__summary-progress-head">
                <p className="employer-dashboard__summary-heading">Профиль заполнен на {employerCompletion}%</p>
                <div className="employer-dashboard__progress-track" aria-hidden="true">
                  <span className="employer-dashboard__progress-value" style={{ width: `${Math.min(Math.max(employerCompletion, 6), 100)}%` }} />
                </div>
              </div>
              <div className="employer-dashboard__summary-progress-meta">
                <div className="employer-dashboard__summary-progress-item">
                  <p className="employer-dashboard__summary-meta">Просмотров профиля: {employerProfile?.profile_views_count ?? 0}</p>
                </div>
                <div className="employer-dashboard__summary-progress-item">
                  <p className="employer-dashboard__summary-meta">Размещено возможностей: {employerStats?.active_opportunities_count ?? 0}</p>
                </div>
                <div className="employer-dashboard__summary-progress-item">
                  <p className="employer-dashboard__summary-meta">Получено откликов: {employerStats?.responses_count ?? 0}</p>
                </div>
              </div>
            </article>

            <article className="employer-dashboard__summary-card">
              <p className="employer-dashboard__summary-label">Статус:</p>
              <div className="employer-dashboard__status-row">
                <strong className={formatVerificationClassName(verificationStatus)}>
                  {formatVerificationLabel(verificationStatus)}
                </strong>
                {verificationStatus === "verified" ? (
                  <img src={verifiedIcon} alt="" aria-hidden="true" className="public-profile-page__verified-icon" />
                ) : null}
              </div>
            </article>

            <article className="employer-dashboard__summary-card">
              <p className="employer-dashboard__summary-label">ИНН:</p>
              <strong className="employer-dashboard__summary-value">{employerProfile?.inn || "Не указан"}</strong>
            </article>

            <article className="employer-dashboard__summary-card">
              <p className="employer-dashboard__summary-label">Размер организации:</p>
              <div className="employer-dashboard__summary-value-row">
                <strong className="employer-dashboard__summary-value">{employerProfile?.organization_size?.trim() || "Не указано"}</strong>
              </div>
            </article>

            <article className="employer-dashboard__summary-card">
              <p className="employer-dashboard__summary-label">Год основания:</p>
              <div className="employer-dashboard__summary-value-row">
                <strong className="employer-dashboard__summary-value">{employerProfile?.foundation_year ? String(employerProfile.foundation_year) : "Не указан"}</strong>
              </div>
            </article>
          </aside>
        </section>
      </Container>

      <Footer theme="employer" />
    </main>
  );
}
