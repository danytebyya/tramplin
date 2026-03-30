import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import verifiedIcon from "../../assets/icons/verified.svg";
import { listOpportunitiesRequest } from "../../entities/opportunity/api";
import {
  CitySelection,
  readSelectedCityCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import {
  buildApplicantProfileMenuItems,
  buildEmployerProfileMenuItems,
  Header,
} from "../../widgets/header";
import { Footer } from "../../widgets/footer";
import { OpportunityFilters } from "../../widgets/filters";
import { MapView } from "../../widgets/map-view";
import { OpportunityList } from "../../widgets/opportunity-list";
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
    level: SeekerLevel | "";
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

function normalizeStringValue(value?: string | null) {
  return value?.trim() ?? "";
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
      level: (profile?.level?.trim() as SeekerLevel | undefined) ?? "",
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
  if (!value) {
    return null;
  }

  return (
    <div className="seeker-dashboard__link-block" key={label}>
      <span className="seeker-dashboard__link-label">{label}</span>
      <a href={value} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
        {formatLinkLabel(value, fallback)}
      </a>
    </div>
  );
}

export function PublicProfilePage() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
  const [selectedEmployerOpportunityId, setSelectedEmployerOpportunityId] = useState<string | null>(null);
  const [employerOpportunityViewMode, setEmployerOpportunityViewMode] = useState<"map" | "list">("map");
  const accessToken = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.role);
  const activeRole = readAccessTokenPayload(accessToken)?.active_role ?? role;
  const employerAccess = getEmployerAccessState(role, accessToken);
  const profileMenuItems =
    activeRole === "employer"
      ? buildEmployerProfileMenuItems(navigate, employerAccess)
      : buildApplicantProfileMenuItems(navigate);
  const fallbackHeaderTheme = activeRole === "employer" ? "employer" : "applicant";
  const fallbackHeaderContainerClassName =
    fallbackHeaderTheme === "employer" ? "employer-dashboard__header-container" : "home-page__container";

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
  const employerOpportunitiesQuery = useQuery({
    queryKey: ["public-profile", "employer-opportunities", publicId],
    queryFn: listOpportunitiesRequest,
    enabled: profile?.role === "employer",
    staleTime: 60_000,
  });
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [publicId]);

  const handleCityChange = (nextCity: CitySelection) => {
    setSelectedCity(nextCity.name);
    writeSelectedCityCookie(nextCity.name);
  };

  if (!publicId) {
    return <Navigate to="/" replace />;
  }

  if (profileQuery.isError) {
    return (
      <main className="public-profile-page public-profile-page--error">
        <Header
          containerClassName={fallbackHeaderContainerClassName}
          profileMenuItems={profileMenuItems}
          theme={fallbackHeaderTheme}
          city={selectedCity}
          onCityChange={handleCityChange}
        />
        <Container className="public-profile-page__status-container">
          <div className="public-profile-page__status-card">
            <h1 className="public-profile-page__status-title">Профиль временно недоступен</h1>
            <p className="public-profile-page__status-text">Не удалось открыть страницу профиля. Попробуйте обновить страницу или открыть профиль чуть позже.</p>
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
        <Header
          containerClassName={fallbackHeaderContainerClassName}
          profileMenuItems={profileMenuItems}
          theme={fallbackHeaderTheme}
          city={selectedCity}
          onCityChange={handleCityChange}
        />
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
    const hasCareerInterests = Boolean(
      applicantState.profile.desiredSalaryFrom ||
      applicantState.profile.preferredLocation ||
      applicantState.profile.employmentTypes.length > 0 ||
      applicantState.profile.workFormats.length > 0,
    );
    const hasPortfolioSection = Boolean(
      applicantState.profile.about ||
      applicantState.profile.level ||
      applicantState.profile.hardSkills.length > 0 ||
      applicantState.profile.softSkills.length > 0 ||
      applicantState.profile.languages.length > 0 ||
      applicantState.profile.githubUrl ||
      applicantState.profile.gitlabUrl ||
      applicantState.profile.bitbucketUrl ||
      applicantState.profile.linkedinUrl ||
      applicantState.profile.portfolioUrl ||
      applicantState.profile.habrUrl ||
      applicantState.profile.resumeUrl,
    );

    return (
      <main className="seeker-dashboard public-profile-page public-profile-page--applicant">
        <Header
          containerClassName="home-page__container"
          profileMenuItems={profileMenuItems}
          theme="applicant"
          city={selectedCity}
          onCityChange={handleCityChange}
        />

        <Container className="seeker-dashboard__container">
          <section className="seeker-dashboard__profile">
            <div className="seeker-dashboard__profile-grid">
              <section className="seeker-dashboard__form-panel">
                <div className="seeker-dashboard__identity">
                  <p className="seeker-dashboard__profile-id">{`ID:${applicantState.publicId}`}</p>
                  <div className="seeker-dashboard__avatar-block">
                    <span className="seeker-dashboard__avatar-shell">
                      <img src={resolveAvatarIcon("applicant")} alt="" aria-hidden="true" className="seeker-dashboard__avatar-image" />
                    </span>
                    <h1 className="public-profile-page__company-name">{applicantState.displayName}</h1>
                    <p className="public-profile-page__presence">
                      <span className={`public-profile-page__presence-dot${applicantState.isOnline ? " public-profile-page__presence-dot--online" : ""}`} />
                      {applicantState.isOnline ? "Online" : "Недавно в сети"}
                    </p>
                  </div>
                </div>

                <div className="seeker-dashboard__form-grid">
                  {applicantState.profile.university ? (
                    <div className="seeker-dashboard__field">
                      <span className="seeker-dashboard__field-label">ВУЗ</span>
                      <p className="seeker-dashboard__paragraph">{applicantState.profile.university}</p>
                    </div>
                  ) : null}
                  {applicantState.profile.studyCourse ? (
                    <div className="seeker-dashboard__field">
                      <span className="seeker-dashboard__field-label">Курс</span>
                      <p className="seeker-dashboard__paragraph">{applicantState.profile.studyCourse}</p>
                    </div>
                  ) : null}
                  {applicantState.profile.graduationYear ? (
                    <div className="seeker-dashboard__field">
                      <span className="seeker-dashboard__field-label">Год выпуска</span>
                      <p className="seeker-dashboard__paragraph">{applicantState.profile.graduationYear}</p>
                    </div>
                  ) : null}
                  {applicantState.preferredCity ? (
                    <div className="seeker-dashboard__field">
                      <span className="seeker-dashboard__field-label">Город</span>
                      <p className="seeker-dashboard__paragraph">{applicantState.preferredCity}</p>
                    </div>
                  ) : null}
                </div>
              </section>

              <aside className="seeker-dashboard__summary-column">
                {hasCareerInterests ? (
                  <article className="seeker-dashboard__summary-card">
                    <div className="seeker-dashboard__summary-head">
                      <h2 className="seeker-dashboard__summary-section-title">
                        Карьерные <span className="seeker-dashboard__summary-section-title-accent">интересы</span>
                      </h2>
                    </div>
                    <div className="seeker-dashboard__interest-list">
                      {applicantState.profile.desiredSalaryFrom ? (
                        <div className="seeker-dashboard__interest-card">
                          <span className="seeker-dashboard__interest-label">Ожидаемая зарплата</span>
                          <strong className="seeker-dashboard__interest-value">{formatSalary(applicantState.profile.desiredSalaryFrom)}</strong>
                        </div>
                      ) : null}
                      {applicantState.profile.preferredLocation ? (
                        <div className="seeker-dashboard__interest-card">
                          <span className="seeker-dashboard__interest-label">Предпочитаемая локация</span>
                          <strong className="seeker-dashboard__interest-value">{applicantState.profile.preferredLocation}</strong>
                        </div>
                      ) : null}
                      {applicantState.profile.employmentTypes.length > 0 ? (
                        <div className="seeker-dashboard__interest-card">
                          <span className="seeker-dashboard__interest-label">Тип занятости</span>
                          <strong className="seeker-dashboard__interest-value">{applicantState.profile.employmentTypes.join(", ")}</strong>
                        </div>
                      ) : null}
                      {applicantState.profile.workFormats.length > 0 ? (
                        <div className="seeker-dashboard__interest-card">
                          <span className="seeker-dashboard__interest-label">Формат работы</span>
                          <strong className="seeker-dashboard__interest-value">{applicantState.profile.workFormats.join(", ")}</strong>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ) : null}
              </aside>
            </div>
          </section>

          {hasPortfolioSection ? (
            <section className="seeker-dashboard__section">
              <h2 className="seeker-dashboard__section-title">Портфолио</h2>
              <div className="seeker-dashboard__portfolio-grid">
                {applicantState.profile.about ? (
                  <article className="seeker-dashboard__content-card seeker-dashboard__content-card--links">
                    <div className="seeker-dashboard__content-card-head">
                      <h3 className="seeker-dashboard__content-card-title">О себе</h3>
                    </div>
                    <div className="seeker-dashboard__content-card-body">
                      {applicantState.profile.about.split(/\n+/).map((paragraph) => (
                        <p key={paragraph} className="seeker-dashboard__paragraph">{paragraph}</p>
                      ))}
                    </div>
                  </article>
                ) : null}

                {(applicantState.profile.level ||
                  applicantState.profile.hardSkills.length > 0 ||
                  applicantState.profile.softSkills.length > 0 ||
                  applicantState.profile.languages.length > 0) ? (
                  <article className="seeker-dashboard__content-card">
                    <div className="seeker-dashboard__content-card-head">
                      <h3 className="seeker-dashboard__content-card-title">Навыки</h3>
                    </div>
                    <div className="seeker-dashboard__content-card-body seeker-dashboard__content-card-body--stacked">
                      {applicantState.profile.level ? (
                        <div className="seeker-dashboard__skill-group">
                          <span className="seeker-dashboard__skill-title">Уровень</span>
                          <Badge variant={resolveLevelStatusVariant(applicantState.profile.level)} className="seeker-dashboard__level-badge">
                            {applicantState.profile.level}
                          </Badge>
                        </div>
                      ) : null}
                      {applicantState.profile.hardSkills.length > 0 ? (
                        <div className="seeker-dashboard__skill-group">
                          <span className="seeker-dashboard__skill-title">Hard skills</span>
                          <div className="seeker-dashboard__tag-list">
                            {applicantState.profile.hardSkills.map((item) => (
                              <Badge key={item} variant="secondary">{item}</Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {applicantState.profile.softSkills.length > 0 ? (
                        <div className="seeker-dashboard__skill-group">
                          <span className="seeker-dashboard__skill-title">Soft skills</span>
                          <div className="seeker-dashboard__tag-list">
                            {applicantState.profile.softSkills.map((item) => (
                              <Badge key={item} variant="secondary">{item}</Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {applicantState.profile.languages.length > 0 ? (
                        <div className="seeker-dashboard__skill-group">
                          <span className="seeker-dashboard__skill-title">Языки</span>
                          <div className="seeker-dashboard__tag-list">
                            {applicantState.profile.languages.map((item) => (
                              <Badge key={item} variant="secondary">{item}</Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ) : null}

                {(applicantState.profile.githubUrl ||
                  applicantState.profile.gitlabUrl ||
                  applicantState.profile.bitbucketUrl ||
                  applicantState.profile.linkedinUrl ||
                  applicantState.profile.portfolioUrl ||
                  applicantState.profile.habrUrl ||
                  applicantState.profile.resumeUrl) ? (
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
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="seeker-dashboard__section seeker-dashboard__section--combined">
            {applicantState.projects.length > 0 ? (
              <div className="seeker-dashboard__collection seeker-dashboard__collection--combined">
                <div className="seeker-dashboard__collection-section">
                  <h2 className="seeker-dashboard__section-title">Опыт проектов</h2>
                </div>
                <div className="seeker-dashboard__collection-grid">
                  {applicantState.projects.map((project) => (
                  <article key={project.id} className="seeker-dashboard__collection-card">
                    <div className="seeker-dashboard__collection-card-head">
                      <h3 className="seeker-dashboard__collection-card-title">{project.title}</h3>
                    </div>
                    <div className="seeker-dashboard__collection-card-body">
                      {project.description ? (
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Описание:</span>
                          <p className="seeker-dashboard__paragraph">{project.description}</p>
                        </div>
                      ) : null}
                      {project.technologies ? (
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Технологии:</span>
                          <p className="seeker-dashboard__paragraph">{project.technologies}</p>
                        </div>
                      ) : null}
                      {project.periodLabel ? (
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Период:</span>
                          <p className="seeker-dashboard__paragraph">{project.periodLabel}</p>
                        </div>
                      ) : null}
                      {project.roleName ? (
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Роль:</span>
                          <p className="seeker-dashboard__paragraph">{project.roleName}</p>
                        </div>
                      ) : null}
                      {project.repositoryUrl ? (
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Ссылка:</span>
                          <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                            {project.repositoryUrl}
                          </a>
                        </div>
                      ) : null}
                    </div>
                  </article>
                  ))}
                </div>
              </div>
            ) : null}

            {applicantState.achievements.length > 0 ? (
              <div className="seeker-dashboard__collection seeker-dashboard__collection--combined">
                <div className="seeker-dashboard__collection-section">
                  <h2 className="seeker-dashboard__section-title">Достижения</h2>
                </div>
                <div className="seeker-dashboard__collection-grid">
                  {applicantState.achievements.map((item) => (
                  <article key={item.id} className="seeker-dashboard__collection-card">
                    <div className="seeker-dashboard__collection-card-head">
                      <h3 className="seeker-dashboard__collection-card-title">{item.title}</h3>
                    </div>
                    <div className="seeker-dashboard__collection-card-body">
                      {item.eventName ? (
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Мероприятие:</span>
                          <p className="seeker-dashboard__paragraph">{item.eventName}</p>
                        </div>
                      ) : null}
                      {item.projectName ? (
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Проект:</span>
                          <p className="seeker-dashboard__paragraph">{item.projectName}</p>
                        </div>
                      ) : null}
                      {item.award ? (
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Награда:</span>
                          <p className="seeker-dashboard__paragraph">{item.award}</p>
                        </div>
                      ) : null}
                    </div>
                  </article>
                  ))}
                </div>
              </div>
            ) : null}

            {applicantState.certificates.length > 0 ? (
              <div className="seeker-dashboard__collection seeker-dashboard__collection--combined">
                <div className="seeker-dashboard__collection-section">
                  <h2 className="seeker-dashboard__section-title">Сертификаты</h2>
                </div>
                <div className="seeker-dashboard__collection-grid">
                  {applicantState.certificates.map((item) => (
                  <article key={item.id} className="seeker-dashboard__collection-card">
                    <div className="seeker-dashboard__collection-card-head">
                      <h3 className="seeker-dashboard__collection-card-title">{item.title}</h3>
                    </div>
                    <div className="seeker-dashboard__collection-card-body">
                      {item.organizationName ? (
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Организация:</span>
                          <p className="seeker-dashboard__paragraph">{item.organizationName}</p>
                        </div>
                      ) : null}
                      {item.issuedAt ? (
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Дата:</span>
                          <p className="seeker-dashboard__paragraph">{item.issuedAt}</p>
                        </div>
                      ) : null}
                      {item.credentialUrl ? (
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Ссылка:</span>
                          <a href={item.credentialUrl} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                            {item.credentialUrl}
                          </a>
                        </div>
                      ) : null}
                    </div>
                  </article>
                  ))}
                </div>
              </div>
            ) : null}
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
  const employerOfficeAddresses = normalizeStringArray(employerProfile?.office_addresses);
  const employerActivityAreas = normalizeStringArray(employerProfile?.activity_areas);
  const employerCorporateEmail = normalizeStringValue(employerProfile?.corporate_email);
  const employerWebsite = normalizeStringValue(employerProfile?.website);
  const employerPhone = normalizeStringValue(employerProfile?.phone);
  const employerSocialLink = normalizeStringValue(employerProfile?.social_link);
  const employerMaxLink = normalizeStringValue(employerProfile?.max_link);
  const employerRutubeLink = normalizeStringValue(employerProfile?.rutube_link);
  const employerShortDescription = normalizeStringValue(employerProfile?.short_description);
  const employerOrganizationSize = normalizeStringValue(employerProfile?.organization_size);
  const employerVisibleOpportunities = (employerOpportunitiesQuery.data ?? []).filter(
    (item) => normalizeStringValue(item.employerPublicId) === profile.public_id,
  );

  return (
    <main className="employer-dashboard public-profile-page public-profile-page--employer">
      <Header
        containerClassName="employer-dashboard__header-container"
        profileMenuItems={profileMenuItems}
        theme={theme}
        city={selectedCity}
        onCityChange={handleCityChange}
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
                <h1 className="public-profile-page__company-name">
                  {employerProfile?.company_name || profile.display_name || "Не указано"}
                </h1>
              </div>
            </div>

            <div className="employer-dashboard__form-grid">
              {employerShortDescription ? (
                <div className="employer-dashboard__field">
                  <span className="employer-dashboard__field-label">Краткое описание</span>
                  <p className="public-profile-page__field-value public-profile-page__field-value--multiline">{employerShortDescription}</p>
                </div>
              ) : null}

              {employerOfficeAddresses.length > 0 ? (
                <div className="employer-dashboard__field">
                  <span className="employer-dashboard__field-label">Адреса офисов</span>
                  <div className="employer-dashboard__office-list">
                    {employerOfficeAddresses.map((address, index) => (
                      <div key={`${address}-${index}`} className="employer-dashboard__office-item">
                        <p className="public-profile-page__field-value">{address}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {employerActivityAreas.length > 0 ? (
                <div className="employer-dashboard__field">
                  <span className="employer-dashboard__field-label">Сфера деятельности</span>
                  <div className="employer-dashboard__office-list">
                    {employerActivityAreas.map((area, index) => (
                      <div key={`${area}-${index}`} className="employer-dashboard__office-item">
                        <p className="public-profile-page__field-value">{area}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {employerCorporateEmail ? (
                <div className="employer-dashboard__field">
                  <span className="employer-dashboard__field-label">Корпоративная почта</span>
                  <p className="public-profile-page__field-value">{employerCorporateEmail}</p>
                </div>
              ) : null}

              {employerPhone ? (
                <div className="employer-dashboard__field">
                  <span className="employer-dashboard__field-label">Телефон</span>
                  <p className="public-profile-page__field-value">{employerPhone}</p>
                </div>
              ) : null}

              {employerWebsite ? (
                <div className="employer-dashboard__field">
                  <span className="employer-dashboard__field-label">Сайт</span>
                  <a href={employerWebsite} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                    {employerWebsite}
                  </a>
                </div>
              ) : null}

              {employerSocialLink ? (
                <div className="employer-dashboard__field">
                  <span className="employer-dashboard__field-label">VK</span>
                  <a href={employerSocialLink} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                    {employerSocialLink}
                  </a>
                </div>
              ) : null}

              {employerMaxLink ? (
                <div className="employer-dashboard__field">
                  <span className="employer-dashboard__field-label">MAX</span>
                  <a href={employerMaxLink} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                    {employerMaxLink}
                  </a>
                </div>
              ) : null}

              {employerRutubeLink ? (
                <div className="employer-dashboard__field">
                  <span className="employer-dashboard__field-label">RUTUBE</span>
                  <a href={employerRutubeLink} target="_blank" rel="noreferrer" className="seeker-dashboard__link-value">
                    {employerRutubeLink}
                  </a>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="employer-dashboard__summary">
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

            {normalizeStringValue(employerProfile?.inn) ? (
              <article className="employer-dashboard__summary-card">
                <p className="employer-dashboard__summary-label">ИНН:</p>
                <strong className="employer-dashboard__summary-value">{employerProfile?.inn}</strong>
              </article>
            ) : null}

            {employerOrganizationSize ? (
              <article className="employer-dashboard__summary-card">
                <p className="employer-dashboard__summary-label">Размер организации:</p>
                <div className="employer-dashboard__summary-value-row">
                  <strong className="employer-dashboard__summary-value">{employerOrganizationSize}</strong>
                </div>
              </article>
            ) : null}

            {employerProfile?.foundation_year ? (
              <article className="employer-dashboard__summary-card">
                <p className="employer-dashboard__summary-label">Год основания:</p>
                <div className="employer-dashboard__summary-value-row">
                  <strong className="employer-dashboard__summary-value">{String(employerProfile.foundation_year)}</strong>
                </div>
              </article>
            ) : null}
          </aside>
        </section>

        <section className="employer-dashboard__opportunities">
          <h2 className="employer-dashboard__opportunities-title">
            <span className="employer-dashboard__opportunities-title-accent">Возможности</span> от организации
          </h2>

          <div className="employer-dashboard__opportunities-shell">
            <OpportunityFilters
              viewMode={employerOpportunityViewMode}
              isMapExpanded={false}
              onViewModeChange={setEmployerOpportunityViewMode}
            />

            <div className="employer-dashboard__opportunities-content">
              <div
                className={
                  employerOpportunityViewMode === "map"
                    ? "employer-dashboard__opportunities-panel employer-dashboard__opportunities-panel--active"
                    : "employer-dashboard__opportunities-panel employer-dashboard__opportunities-panel--hidden"
                }
                aria-hidden={employerOpportunityViewMode !== "map"}
              >
                <div className="employer-dashboard__opportunities-map">
                  <MapView
                    opportunities={employerVisibleOpportunities}
                    favoriteOpportunityIds={[]}
                    selectedOpportunityId={selectedEmployerOpportunityId}
                    selectedCity={normalizeStringValue(profile.preferred_city) || selectedCity}
                    selectedCityViewport={null}
                    isExpanded={false}
                    isTransitioning={false}
                    roleName="employer"
                    onSelectOpportunity={setSelectedEmployerOpportunityId}
                    onToggleFavorite={() => undefined}
                    onSelectCity={() => undefined}
                    onCloseDetails={() => setSelectedEmployerOpportunityId(null)}
                    onToggleExpand={() => undefined}
                    onApply={(opportunityId) => navigate(`/opportunities/${encodeURIComponent(opportunityId)}`)}
                  />
                </div>
              </div>
              <div
                className={
                  employerOpportunityViewMode === "list"
                    ? "employer-dashboard__opportunities-panel employer-dashboard__opportunities-panel--active"
                    : "employer-dashboard__opportunities-panel employer-dashboard__opportunities-panel--hidden"
                }
                aria-hidden={employerOpportunityViewMode !== "list"}
              >
                <OpportunityList
                  opportunities={employerVisibleOpportunities}
                  favoriteOpportunityIds={[]}
                  roleName="employer"
                  onToggleFavorite={() => undefined}
                  onApply={(opportunityId) => navigate(`/opportunities/${encodeURIComponent(opportunityId)}`)}
                />
              </div>
            </div>
          </div>
        </section>
      </Container>

      <Footer theme="employer" />
    </main>
  );
}
