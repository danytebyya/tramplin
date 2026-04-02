import { type ChangeEvent, type CSSProperties, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Navigate, useNavigate } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import editIcon from "../../assets/icons/edit.svg";
import checkMarkIcon from "../../assets/icons/check-mark.svg";
import closeIcon from "../../assets/icons/close.svg";
import deleteIcon from "../../assets/icons/delete.svg";
import {
  CitySelection,
  readSelectedCityCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import {
  CitySuggestion,
  UniversitySuggestion,
  getCitySuggestions,
  getUniversitySuggestions,
} from "../../features/city-selector/api";
import {
  ApplicantDashboardAchievement,
  ApplicantDashboardCertificate,
  ApplicantDashboardProject,
  ApplicantDashboardResponse,
  deleteApplicantAvatarRequest,
  MeResponse,
  applicantDashboardRequest,
  meRequest,
  uploadApplicantAvatarRequest,
  updateApplicantDashboardRequest,
  useAuthStore,
} from "../../features/auth";
import {
  OpportunityTagCatalogCategory,
  listOpportunityTagCatalogRequest,
} from "../../features/opportunity/api";
import { resolveAvatarIcon, resolveAvatarUrl } from "../../shared/lib";
import { Badge, Button, Checkbox, Container, Input, Modal, ProfileTabs, Select } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { buildApplicantProfileMenuItems, Header } from "../../widgets/header";
import "./seeker-dashboard.css";

type SeekerUser = NonNullable<NonNullable<MeResponse["data"]>["user"]>;

type ProfileFormState = {
  fullName: string;
  email: string;
  university: string;
  course: string;
  graduationYear: string;
  city: string;
};

type DashboardState = {
  profile: {
    fullName: string;
    university: string;
    about: string;
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
    profileViewsCount: number;
    recommendationsCount: number;
  };
  preferredCity: string;
  stats: {
    profileViewsCount: number;
    applicationsCount: number;
    responsesCount: number;
    invitationsCount: number;
    recommendationsCount: number;
  };
  projects: EditableProject[];
  achievements: EditableAchievement[];
  certificates: EditableCertificate[];
};

type EditableProject = {
  id: string;
  title: string;
  description: string;
  technologies: string;
  periodLabel: string;
  roleName: string;
  repositoryUrl: string;
};

type EditableAchievement = {
  id: string;
  title: string;
  eventName: string;
  projectName: string;
  award: string;
};

type EditableCertificate = {
  id: string;
  title: string;
  organizationName: string;
  issuedAt: string;
  credentialUrl: string;
};

type ProjectDraft = Omit<EditableProject, "id">;
type AchievementDraft = Omit<EditableAchievement, "id">;
type CertificateDraft = Omit<EditableCertificate, "id">;

type SectionMode = null | "about" | "skills" | "links" | "career-interests";
type CollectionModal = null | "project" | "achievement" | "certificate";
type SeekerLevel = "Junior" | "Middle" | "Senior";
type SkillSelectorMode = "hard" | "soft" | "language" | "project-tech" | null;
type DeleteModalState =
  | null
  | {
      kind: "project" | "achievement" | "certificate";
      id: string;
      title: string;
      entityLabel: string;
    };

type SkillsDraftState = {
  level: SeekerLevel;
  hardSkills: string[];
  softSkills: string[];
  languages: string[];
  hardSkillsQuery: string;
  softSkillsQuery: string;
  languagesQuery: string;
};

const EMPTY_PROFILE_FORM: ProfileFormState = {
  fullName: "",
  email: "",
  university: "",
  course: "",
  graduationYear: "",
  city: "",
};

const EMPTY_PROJECT_DRAFT: ProjectDraft = {
  title: "",
  description: "",
  technologies: "",
  periodLabel: "",
  roleName: "",
  repositoryUrl: "",
};

const EMPTY_ACHIEVEMENT_DRAFT: AchievementDraft = {
  title: "",
  eventName: "",
  projectName: "",
  award: "",
};

const EMPTY_CERTIFICATE_DRAFT: CertificateDraft = {
  title: "",
  organizationName: "",
  issuedAt: "",
  credentialUrl: "",
};

const EMPLOYMENT_OPTIONS = ["Full-time", "Part-time", "Стажировка", "Проектная работа"];
const WORK_FORMAT_OPTIONS = ["Оффлайн", "Гибрид", "Удаленно"];
const SOFT_SKILL_CATEGORY_SLUGS = ["applicant-soft-skills"];
const LANGUAGE_CATEGORY_SLUGS = ["spoken-languages"];
const HARD_SKILL_EXCLUDED_CATEGORY_SLUGS = [
  "applicant-soft-skills",
  "spoken-languages",
  "level-format",
  "specialization",
];

function resolveLevelStatusVariant(level: SeekerLevel) {
  if (level === "Middle") {
    return "warning" as const;
  }

  if (level === "Senior") {
    return "danger" as const;
  }

  return "success" as const;
}

function normalizeStringArray(value?: string[] | null) {
  return (value ?? []).map((item) => item.trim()).filter(Boolean);
}

function createSkillsDraft(profile: DashboardState["profile"]): SkillsDraftState {
  return {
    level: profile.level,
    hardSkills: [...profile.hardSkills],
    softSkills: [...profile.softSkills],
    languages: [...profile.languages],
    hardSkillsQuery: "",
    softSkillsQuery: "",
    languagesQuery: "",
  };
}

function normalizeCatalogValue(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function splitCommaSeparatedValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectCatalogItems(categories: OpportunityTagCatalogCategory[] | undefined, slugs: string[]) {
  const itemMap = new Map<string, string>();

  for (const category of categories ?? []) {
    if (!slugs.includes(category.slug)) {
      continue;
    }

    for (const item of category.items) {
      const normalizedName = item.name.trim();
      if (normalizedName.length === 0 || itemMap.has(normalizedName)) {
        continue;
      }
      itemMap.set(normalizedName, normalizedName);
    }
  }

  return Array.from(itemMap.values()).sort((left, right) => left.localeCompare(right, "ru"));
}

function collectHardSkillItems(categories: OpportunityTagCatalogCategory[] | undefined) {
  const itemMap = new Map<string, string>();

  for (const category of categories ?? []) {
    if (HARD_SKILL_EXCLUDED_CATEGORY_SLUGS.includes(category.slug)) {
      continue;
    }

    if (!["technology", "skill", "language"].includes(category.tagType)) {
      continue;
    }

    for (const item of category.items) {
      const normalizedName = item.name.trim();
      if (normalizedName.length === 0 || itemMap.has(normalizedName)) {
        continue;
      }
      itemMap.set(normalizedName, normalizedName);
    }
  }

  return Array.from(itemMap.values()).sort((left, right) => left.localeCompare(right, "ru"));
}

function filterCatalogItems(items: string[], query: string, selected: string[]) {
  const normalizedQuery = normalizeCatalogValue(query);

  return items.filter((item) => {
    if (selected.includes(item)) {
      return false;
    }

    if (normalizedQuery.length === 0) {
      return true;
    }

    return normalizeCatalogValue(item).includes(normalizedQuery);
  });
}

function mapProject(project: ApplicantDashboardProject): EditableProject {
  return {
    id: project.id,
    title: project.title ?? "",
    description: project.description?.trim() ?? "",
    technologies: project.technologies?.trim() ?? "",
    periodLabel: project.period_label?.trim() ?? "",
    roleName: project.role_name?.trim() ?? "",
    repositoryUrl: project.repository_url?.trim() ?? "",
  };
}

function mapAchievement(item: ApplicantDashboardAchievement): EditableAchievement {
  return {
    id: item.id,
    title: item.title ?? "",
    eventName: item.event_name?.trim() ?? "",
    projectName: item.project_name?.trim() ?? "",
    award: item.award?.trim() ?? "",
  };
}

function mapCertificate(item: ApplicantDashboardCertificate): EditableCertificate {
  return {
    id: item.id,
    title: item.title ?? "",
    organizationName: item.organization_name?.trim() ?? "",
    issuedAt: item.issued_at?.trim() ?? "",
    credentialUrl: item.credential_url?.trim() ?? "",
  };
}

function buildDashboardState(
  dashboard: ApplicantDashboardResponse["data"] | undefined,
  user: SeekerUser | undefined,
): DashboardState {
  const profile = dashboard?.profile;
  const preferredCity =
    dashboard?.career_interests?.preferred_city?.trim() ||
    dashboard?.preferred_city?.trim() ||
    user?.preferred_city?.trim() ||
    "";

  return {
    profile: {
      fullName: profile?.full_name?.trim() || user?.display_name?.trim() || "",
      university: profile?.university?.trim() ?? "",
      about: profile?.about?.trim() ?? "",
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
      employmentTypes: normalizeStringArray(
        dashboard?.career_interests?.employment_types ?? profile?.employment_types,
      ),
      workFormats: normalizeStringArray(
        dashboard?.career_interests?.work_formats ?? profile?.work_formats,
      ),
      profileViewsCount: dashboard?.stats?.profile_views_count ?? profile?.profile_views_count ?? 0,
      recommendationsCount:
        dashboard?.stats?.recommendations_count ?? profile?.recommendations_count ?? 0,
    },
    preferredCity,
    stats: {
      profileViewsCount: dashboard?.stats?.profile_views_count ?? profile?.profile_views_count ?? 0,
      applicationsCount: dashboard?.stats?.applications_count ?? 0,
      responsesCount: dashboard?.stats?.responses_count ?? 0,
      invitationsCount: dashboard?.stats?.invitations_count ?? 0,
      recommendationsCount:
        dashboard?.stats?.recommendations_count ?? profile?.recommendations_count ?? 0,
    },
    projects: (dashboard?.projects ?? []).map(mapProject),
    achievements: (dashboard?.achievements ?? []).map(mapAchievement),
    certificates: (dashboard?.certificates ?? []).map(mapCertificate),
  };
}

function buildProfileFormState(user: SeekerUser | undefined, state: DashboardState): ProfileFormState {
  return {
    fullName: state.profile.fullName || user?.display_name?.trim() || "",
    email: user?.email?.trim() ?? "",
    university: state.profile.university,
    course: state.profile.studyCourse,
    graduationYear: state.profile.graduationYear,
    city: state.preferredCity || readSelectedCityCookie() || "",
  };
}

function calculateProfileCompletion(state: DashboardState, formState: ProfileFormState) {
  const weightedFields = [
    { filled: formState.fullName.trim().length > 0, weight: 1 },
    { filled: formState.email.trim().length > 0, weight: 1 },
    { filled: formState.university.trim().length > 0, weight: 1 },
    { filled: formState.course.trim().length > 0, weight: 1 },
    { filled: formState.graduationYear.trim().length > 0, weight: 1 },
    { filled: formState.city.trim().length > 0, weight: 1 },
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
    { filled: state.preferredCity.trim().length > 0, weight: 1 },
    { filled: state.profile.preferredLocation.trim().length > 0, weight: 2 },
    { filled: state.profile.employmentTypes.length > 0, weight: 2 },
    { filled: state.profile.workFormats.length > 0, weight: 2 },
    { filled: state.projects.length > 0, weight: 4 },
    { filled: state.achievements.length > 0, weight: 3 },
    { filled: state.certificates.length > 0, weight: 3 },
  ];
  const totalWeight = weightedFields.reduce((sum, item) => sum + item.weight, 0);
  const filledWeight = weightedFields.reduce(
    (sum, item) => sum + (item.filled ? item.weight : 0),
    0,
  );
  return Math.round((filledWeight / totalWeight) * 100);
}

function buildPayload(state: DashboardState) {
  return {
    full_name: state.profile.fullName || null,
    university: state.profile.university || null,
    about: state.profile.about || null,
    study_course: state.profile.studyCourse ? Number(state.profile.studyCourse) : null,
    graduation_year: state.profile.graduationYear ? Number(state.profile.graduationYear) : null,
    level: state.profile.level || null,
    hard_skills: state.profile.hardSkills,
    soft_skills: state.profile.softSkills,
    languages: state.profile.languages,
    links: {
      github_url: state.profile.githubUrl || null,
      gitlab_url: state.profile.gitlabUrl || null,
      bitbucket_url: state.profile.bitbucketUrl || null,
      linkedin_url: state.profile.linkedinUrl || null,
      portfolio_url: state.profile.portfolioUrl || null,
      habr_url: state.profile.habrUrl || null,
      resume_url: state.profile.resumeUrl || null,
    },
    career_interests: {
      desired_salary_from: state.profile.desiredSalaryFrom ? Number(state.profile.desiredSalaryFrom) : null,
      preferred_city: state.preferredCity || null,
      preferred_location: state.profile.preferredLocation || null,
      employment_types: state.profile.employmentTypes,
      work_formats: state.profile.workFormats,
    },
    projects: state.projects.map((item) => ({
      id: resolveOptionalEntityId(item.id),
      title: item.title,
      description: item.description || null,
      technologies: item.technologies || null,
      period_label: item.periodLabel || null,
      role_name: item.roleName || null,
      repository_url: item.repositoryUrl || null,
    })),
    achievements: state.achievements.map((item) => ({
      id: resolveOptionalEntityId(item.id),
      title: item.title,
      event_name: item.eventName || null,
      project_name: item.projectName || null,
      award: item.award || null,
    })),
    certificates: state.certificates.map((item) => ({
      id: resolveOptionalEntityId(item.id),
      title: item.title,
      organization_name: item.organizationName || null,
      issued_at: item.issuedAt || null,
      credential_url: item.credentialUrl || null,
    })),
  };
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

function resolveOptionalEntityId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

type SkillTagSelectorProps = {
  fieldRef: RefObject<HTMLLabelElement>;
  label: string;
  placeholder: string;
  selected: string[];
  query: string;
  options: string[];
  isOpen: boolean;
  isLoading: boolean;
  onQueryChange: (value: string) => void;
  onOpen: () => void;
  onSelect: (value: string) => void;
  onRemove: (value: string) => void;
};

function SkillTagSelector({
  fieldRef,
  label,
  placeholder,
  selected,
  query,
  options,
  isOpen,
  isLoading,
  onQueryChange,
  onOpen,
  onSelect,
  onRemove,
}: SkillTagSelectorProps) {
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDropdownStyle(null);
      return;
    }

    const updateDropdownPosition = () => {
      const rect = searchRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    };

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [isOpen, options.length, query, selected.length]);

  return (
    <label ref={fieldRef} className="seeker-dashboard__field seeker-dashboard__field--skill-select">
      <span className="seeker-dashboard__field-label">{label}</span>
      <div className="seeker-dashboard__skill-selector">
        <div ref={searchRef} className="seeker-dashboard__skill-search">
          <Input
            className="input--secondary input--sm"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={onOpen}
            placeholder={placeholder}
          />
        </div>
        {selected.length > 0 ? (
          <div className="seeker-dashboard__skill-chip-list">
            {selected.map((item) => (
              <Badge key={item} variant="secondary" className="seeker-dashboard__skill-chip">
                <span className="seeker-dashboard__skill-chip-text">{item}</span>
                <button
                  type="button"
                  className="seeker-dashboard__skill-chip-remove"
                  aria-label={`Удалить ${item}`}
                  onClick={() => onRemove(item)}
                >
                  <span className="seeker-dashboard__skill-chip-remove-icon" aria-hidden="true" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        {isOpen && dropdownStyle && typeof document !== "undefined"
          ? createPortal(
              <div
                className="seeker-dashboard__skill-dropdown seeker-dashboard__skill-dropdown--portal"
                style={dropdownStyle}
                role="listbox"
                aria-label={label}
              >
                {isLoading ? (
                  <div className="seeker-dashboard__skill-dropdown-empty">Загружаем список...</div>
                ) : options.length > 0 ? (
                  options.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="seeker-dashboard__skill-dropdown-option"
                      onClick={() => onSelect(item)}
                    >
                      {item}
                    </button>
                  ))
                ) : (
                  <div className="seeker-dashboard__skill-dropdown-empty">Ничего не найдено</div>
                )}
              </div>,
              document.body,
            )
          : null}
      </div>
    </label>
  );
}

export function SeekerDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isAuthenticated = Boolean(accessToken || refreshToken);

  const cityFieldRef = useRef<HTMLLabelElement | null>(null);
  const universityFieldRef = useRef<HTMLLabelElement | null>(null);
  const preferredLocationFieldRef = useRef<HTMLLabelElement | null>(null);
  const hardSkillsFieldRef = useRef<HTMLLabelElement | null>(null);
  const softSkillsFieldRef = useRef<HTMLLabelElement | null>(null);
  const languagesFieldRef = useRef<HTMLLabelElement | null>(null);
  const projectTechnologiesFieldRef = useRef<HTMLLabelElement | null>(null);

  const [headerCity, setHeaderCity] = useState(() => readSelectedCityCookie() ?? "");
  const [dashboardState, setDashboardState] = useState<DashboardState | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [displayedProfileCompletion, setDisplayedProfileCompletion] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [isAvatarMarkedForDeletion, setIsAvatarMarkedForDeletion] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [activeEditor, setActiveEditor] = useState<SectionMode>(null);
  const [aboutDraft, setAboutDraft] = useState("");
  const [skillsDraft, setSkillsDraft] = useState<SkillsDraftState>(() =>
    createSkillsDraft({
      fullName: "",
      university: "",
      about: "",
      studyCourse: "",
      graduationYear: "",
      level: "Junior",
      hardSkills: [],
      softSkills: [],
      languages: [],
      githubUrl: "",
      gitlabUrl: "",
      bitbucketUrl: "",
      linkedinUrl: "",
      portfolioUrl: "",
      habrUrl: "",
      resumeUrl: "",
      desiredSalaryFrom: "",
      preferredLocation: "",
      employmentTypes: [],
      workFormats: [],
      profileViewsCount: 0,
      recommendationsCount: 0,
    }),
  );
  const [activeSkillSelector, setActiveSkillSelector] = useState<SkillSelectorMode>(null);
  const [linksDraft, setLinksDraft] = useState({
    githubUrl: "",
    gitlabUrl: "",
    bitbucketUrl: "",
    linkedinUrl: "",
    portfolioUrl: "",
    habrUrl: "",
    resumeUrl: "",
  });
  const [careerDraft, setCareerDraft] = useState({
    desiredSalaryFrom: "",
    preferredLocation: "",
    employmentTypes: [] as string[],
    workFormats: [] as string[],
  });

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingAchievementId, setEditingAchievementId] = useState<string | null>(null);
  const [editingCertificateId, setEditingCertificateId] = useState<string | null>(null);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(EMPTY_PROJECT_DRAFT);
  const [achievementDraft, setAchievementDraft] = useState<AchievementDraft>(EMPTY_ACHIEVEMENT_DRAFT);
  const [certificateDraft, setCertificateDraft] = useState<CertificateDraft>(EMPTY_CERTIFICATE_DRAFT);
  const [activeModal, setActiveModal] = useState<CollectionModal>(null);
  const [pendingDelete, setPendingDelete] = useState<DeleteModalState>(null);
  const [modalProjectDraft, setModalProjectDraft] = useState<ProjectDraft>(EMPTY_PROJECT_DRAFT);
  const [modalProjectTechnologiesQuery, setModalProjectTechnologiesQuery] = useState("");
  const [modalAchievementDraft, setModalAchievementDraft] =
    useState<AchievementDraft>(EMPTY_ACHIEVEMENT_DRAFT);
  const [modalCertificateDraft, setModalCertificateDraft] =
    useState<CertificateDraft>(EMPTY_CERTIFICATE_DRAFT);

  const [isUniversityDropdownOpen, setIsUniversityDropdownOpen] = useState(false);
  const [universitySuggestions, setUniversitySuggestions] = useState<UniversitySuggestion[]>([]);
  const [isUniversitySuggestionsLoading, setIsUniversitySuggestionsLoading] = useState(false);
  const [universitySuggestionsError, setUniversitySuggestionsError] = useState<string | null>(null);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [isCitySuggestionsLoading, setIsCitySuggestionsLoading] = useState(false);
  const [citySuggestionsError, setCitySuggestionsError] = useState<string | null>(null);
  const [citySelectionConfirmed, setCitySelectionConfirmed] = useState(true);
  const [cityValidationError, setCityValidationError] = useState<string | null>(null);
  const [isPreferredLocationDropdownOpen, setIsPreferredLocationDropdownOpen] = useState(false);
  const [preferredLocationSuggestions, setPreferredLocationSuggestions] = useState<CitySuggestion[]>([]);
  const [isPreferredLocationSuggestionsLoading, setIsPreferredLocationSuggestionsLoading] = useState(false);
  const [preferredLocationSuggestionsError, setPreferredLocationSuggestionsError] = useState<string | null>(null);
  const [preferredLocationSelectionConfirmed, setPreferredLocationSelectionConfirmed] = useState(true);
  const [preferredLocationValidationError, setPreferredLocationValidationError] = useState<string | null>(null);
  const [courseValidationError, setCourseValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const dashboardQuery = useQuery({
    queryKey: ["applicant-dashboard"],
    queryFn: applicantDashboardRequest,
    enabled: isAuthenticated && role === "applicant",
    staleTime: 60 * 1000,
    retry: false,
  });

  const tagCatalogQuery = useQuery({
    queryKey: ["opportunity-tag-catalog"],
    queryFn: listOpportunityTagCatalogRequest,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const saveDashboardMutation = useMutation({
    mutationFn: updateApplicantDashboardRequest,
  });
  const uploadApplicantAvatarMutation = useMutation({
    mutationFn: uploadApplicantAvatarRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.refetchQueries({ queryKey: ["auth", "me"], type: "active" });
      setAvatarPreviewUrl((currentValue) => {
        if (currentValue) {
          URL.revokeObjectURL(currentValue);
        }
        return null;
      });
    },
  });
  const deleteApplicantAvatarMutation = useMutation({
    mutationFn: deleteApplicantAvatarRequest,
  });

  const user = meQuery.data?.data?.user;
  const profileMenuItems = buildApplicantProfileMenuItems(navigate);
  const persistedApplicantAvatarUrl = resolveAvatarUrl(user?.applicant_profile?.avatar_url);
  const applicantAvatar =
    avatarPreviewUrl ??
    (isAvatarMarkedForDeletion ? null : persistedApplicantAvatarUrl) ??
    resolveAvatarIcon("applicant");
  const profilePublicId = user?.public_id ?? user?.id ?? "000000";
  const confirmIcon = <img src={checkMarkIcon} alt="" aria-hidden="true" className="seeker-dashboard__confirm-icon" />;
  const hardSkillOptions = useMemo(
    () => collectHardSkillItems(tagCatalogQuery.data),
    [tagCatalogQuery.data],
  );
  const softSkillOptions = useMemo(
    () => collectCatalogItems(tagCatalogQuery.data, SOFT_SKILL_CATEGORY_SLUGS),
    [tagCatalogQuery.data],
  );
  const languageOptions = useMemo(
    () => collectCatalogItems(tagCatalogQuery.data, LANGUAGE_CATEGORY_SLUGS),
    [tagCatalogQuery.data],
  );
  const filteredHardSkillOptions = useMemo(
    () => filterCatalogItems(hardSkillOptions, skillsDraft.hardSkillsQuery, skillsDraft.hardSkills),
    [hardSkillOptions, skillsDraft.hardSkills, skillsDraft.hardSkillsQuery],
  );
  const filteredSoftSkillOptions = useMemo(
    () => filterCatalogItems(softSkillOptions, skillsDraft.softSkillsQuery, skillsDraft.softSkills),
    [softSkillOptions, skillsDraft.softSkills, skillsDraft.softSkillsQuery],
  );
  const filteredLanguageOptions = useMemo(
    () => filterCatalogItems(languageOptions, skillsDraft.languagesQuery, skillsDraft.languages),
    [languageOptions, skillsDraft.languages, skillsDraft.languagesQuery],
  );
  const modalProjectTechnologyItems = useMemo(
    () => splitCommaSeparatedValues(modalProjectDraft.technologies),
    [modalProjectDraft.technologies],
  );
  const filteredProjectTechnologyOptions = useMemo(
    () =>
      filterCatalogItems(
        hardSkillOptions,
        modalProjectTechnologiesQuery,
        modalProjectTechnologyItems,
      ),
    [hardSkillOptions, modalProjectTechnologiesQuery, modalProjectTechnologyItems],
  );
  const projectSelectOptions = useMemo(
    () =>
      dashboardState?.projects
        .filter((item) => item.title.trim().length > 0)
        .map((item) => ({
          value: item.title,
          label: item.title,
        })) ?? [],
    [dashboardState?.projects],
  );
  const isProjectModalValid =
    modalProjectDraft.title.trim().length > 0 &&
    modalProjectDraft.description.trim().length > 0 &&
    modalProjectTechnologyItems.length > 0 &&
    modalProjectDraft.repositoryUrl.trim().length > 0;
  const isAchievementModalValid =
    modalAchievementDraft.title.trim().length > 0 &&
    modalAchievementDraft.eventName.trim().length > 0 &&
    modalAchievementDraft.projectName.trim().length > 0 &&
    modalAchievementDraft.award.trim().length > 0;
  const isCertificateModalValid =
    modalCertificateDraft.title.trim().length > 0 &&
    modalCertificateDraft.organizationName.trim().length > 0 &&
    modalCertificateDraft.issuedAt.trim().length > 0 &&
    modalCertificateDraft.credentialUrl.trim().length > 0;

  const addSkillValue = (mode: Exclude<SkillSelectorMode, null>, value: string) => {
    setSkillsDraft((current) => {
      if (mode === "hard") {
        return {
          ...current,
          hardSkills: current.hardSkills.includes(value) ? current.hardSkills : [...current.hardSkills, value],
          hardSkillsQuery: "",
        };
      }

      if (mode === "soft") {
        return {
          ...current,
          softSkills: current.softSkills.includes(value) ? current.softSkills : [...current.softSkills, value],
          softSkillsQuery: "",
        };
      }

      return {
        ...current,
        languages: current.languages.includes(value) ? current.languages : [...current.languages, value],
        languagesQuery: "",
      };
    });
    setActiveSkillSelector(mode);
  };

  const removeSkillValue = (mode: Exclude<SkillSelectorMode, null>, value: string) => {
    setSkillsDraft((current) => {
      if (mode === "hard") {
        return {
          ...current,
          hardSkills: current.hardSkills.filter((item) => item !== value),
        };
      }

      if (mode === "soft") {
        return {
          ...current,
          softSkills: current.softSkills.filter((item) => item !== value),
        };
      }

      return {
        ...current,
        languages: current.languages.filter((item) => item !== value),
      };
    });
  };

  const addProjectTechnologyValue = (value: string) => {
    const nextItems = modalProjectTechnologyItems.includes(value)
      ? modalProjectTechnologyItems
      : [...modalProjectTechnologyItems, value];

    setModalProjectDraft((current) => ({
      ...current,
      technologies: nextItems.join(", "),
    }));
    setModalProjectTechnologiesQuery("");
    setActiveSkillSelector("project-tech");
  };

  const removeProjectTechnologyValue = (value: string) => {
    const nextItems = modalProjectTechnologyItems.filter((item) => item !== value);
    setModalProjectDraft((current) => ({
      ...current,
      technologies: nextItems.join(", "),
    }));
  };

  const handlePickAvatar = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      return;
    }

    setPendingAvatarFile(file);
    setIsAvatarMarkedForDeletion(false);
    setAvatarPreviewUrl((currentValue) => {
      if (currentValue) {
        URL.revokeObjectURL(currentValue);
      }

      return URL.createObjectURL(file);
    });

    event.target.value = "";
  };

  const handleDeleteAvatar = () => {
    if (!pendingAvatarFile && !persistedApplicantAvatarUrl) {
      return;
    }

    setPendingAvatarFile(null);
    setIsAvatarMarkedForDeletion(true);
    setAvatarPreviewUrl((currentValue) => {
      if (currentValue) {
        URL.revokeObjectURL(currentValue);
      }
      return null;
    });
  };

  useEffect(() => {
    if (!user || !dashboardQuery.data?.data || isInitialized) {
      return;
    }

    const nextState = buildDashboardState(dashboardQuery.data.data, user);
    setDashboardState(nextState);
    setProfileForm(buildProfileFormState(user, nextState));
    setHeaderCity(readSelectedCityCookie() || nextState.preferredCity || "");
    setCitySelectionConfirmed(true);
    setAboutDraft(nextState.profile.about);
    setSkillsDraft(createSkillsDraft(nextState.profile));
    setLinksDraft({
      githubUrl: nextState.profile.githubUrl,
      gitlabUrl: nextState.profile.gitlabUrl,
      bitbucketUrl: nextState.profile.bitbucketUrl,
      linkedinUrl: nextState.profile.linkedinUrl,
      portfolioUrl: nextState.profile.portfolioUrl,
      habrUrl: nextState.profile.habrUrl,
      resumeUrl: nextState.profile.resumeUrl,
    });
    setCareerDraft({
      desiredSalaryFrom: nextState.profile.desiredSalaryFrom,
      preferredLocation: nextState.profile.preferredLocation,
      employmentTypes: nextState.profile.employmentTypes,
      workFormats: nextState.profile.workFormats,
    });
    setIsInitialized(true);
  }, [dashboardQuery.data?.data, isInitialized, user]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    const isAnyDropdownOpen =
      isCityDropdownOpen ||
      isUniversityDropdownOpen ||
      isPreferredLocationDropdownOpen ||
      activeSkillSelector !== null;

    if (!isAnyDropdownOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const isSkillPortalClick = Boolean(target?.closest(".seeker-dashboard__skill-dropdown--portal"));

      if (!cityFieldRef.current?.contains(event.target as Node)) {
        setIsCityDropdownOpen(false);
      }

      if (!universityFieldRef.current?.contains(event.target as Node)) {
        setIsUniversityDropdownOpen(false);
      }

      if (!preferredLocationFieldRef.current?.contains(event.target as Node)) {
        setIsPreferredLocationDropdownOpen(false);
      }

      if (
        !isSkillPortalClick &&
        !hardSkillsFieldRef.current?.contains(event.target as Node) &&
        activeSkillSelector === "hard"
      ) {
        setActiveSkillSelector(null);
      }

      if (
        !isSkillPortalClick &&
        !softSkillsFieldRef.current?.contains(event.target as Node) &&
        activeSkillSelector === "soft"
      ) {
        setActiveSkillSelector(null);
      }

      if (
        !isSkillPortalClick &&
        !languagesFieldRef.current?.contains(event.target as Node) &&
        activeSkillSelector === "language"
      ) {
        setActiveSkillSelector(null);
      }

      if (
        !isSkillPortalClick &&
        !projectTechnologiesFieldRef.current?.contains(event.target as Node) &&
        activeSkillSelector === "project-tech"
      ) {
        setActiveSkillSelector(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [
    activeSkillSelector,
    isCityDropdownOpen,
    isPreferredLocationDropdownOpen,
    isUniversityDropdownOpen,
  ]);

  useEffect(() => {
    const normalizedQuery = profileForm.university.trim();

    if (!isUniversityDropdownOpen || normalizedQuery.length === 0) {
      setUniversitySuggestions([]);
      setIsUniversitySuggestionsLoading(false);
      setUniversitySuggestionsError(null);
      return;
    }

    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      setIsUniversitySuggestionsLoading(true);
      setUniversitySuggestionsError(null);

      void getUniversitySuggestions(normalizedQuery, profileForm.city.trim())
        .then((items) => {
          if (!isActive) {
            return;
          }
          setUniversitySuggestions(items);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }
          setUniversitySuggestions([]);
          setUniversitySuggestionsError("Не удалось загрузить список учебных заведений.");
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setIsUniversitySuggestionsLoading(false);
        });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [isUniversityDropdownOpen, profileForm.city, profileForm.university]);

  useEffect(() => {
    const normalizedQuery = profileForm.city.trim();

    if (!isCityDropdownOpen || normalizedQuery.length === 0) {
      setCitySuggestions([]);
      setIsCitySuggestionsLoading(false);
      setCitySuggestionsError(null);
      return;
    }

    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      setIsCitySuggestionsLoading(true);
      setCitySuggestionsError(null);

      void getCitySuggestions(normalizedQuery)
        .then((items) => {
          if (!isActive) {
            return;
          }
          setCitySuggestions(items);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }
          setCitySuggestions([]);
          setCitySuggestionsError("Не удалось загрузить список городов.");
        })
        .finally(() => {
          if (!isActive) {
            return;
          }
          setIsCitySuggestionsLoading(false);
        });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [isCityDropdownOpen, profileForm.city]);

  useEffect(() => {
    const normalizedQuery = (careerDraft.preferredLocation ?? "").trim();

    if (!isPreferredLocationDropdownOpen || normalizedQuery.length === 0) {
      setPreferredLocationSuggestions([]);
      setIsPreferredLocationSuggestionsLoading(false);
      setPreferredLocationSuggestionsError(null);
      return;
    }

    let isActive = true;
    const timeoutId = window.setTimeout(() => {
      setIsPreferredLocationSuggestionsLoading(true);
      setPreferredLocationSuggestionsError(null);

      void getCitySuggestions(normalizedQuery)
        .then((items) => {
          if (!isActive) {
            return;
          }

          setPreferredLocationSuggestions(items);
        })
        .catch(() => {
          if (!isActive) {
            return;
          }

          setPreferredLocationSuggestions([]);
          setPreferredLocationSuggestionsError("Не удалось загрузить список городов.");
        })
        .finally(() => {
          if (!isActive) {
            return;
          }

          setIsPreferredLocationSuggestionsLoading(false);
        });
    }, 220);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [careerDraft.preferredLocation, isPreferredLocationDropdownOpen]);

  const profileCompletion = useMemo(() => {
    if (!dashboardState) {
      return 0;
    }
    return calculateProfileCompletion(dashboardState, profileForm);
  }, [dashboardState, profileForm]);

  useEffect(() => {
    const startValue = displayedProfileCompletion;
    const targetValue = profileCompletion;

    if (startValue === targetValue) {
      return;
    }

    const animationDuration = 520;
    const animationStart = performance.now();
    let frameId = 0;

    const animate = (timestamp: number) => {
      const progress = Math.min((timestamp - animationStart) / animationDuration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(startValue + (targetValue - startValue) * easedProgress);
      setDisplayedProfileCompletion(nextValue);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(animate);
      }
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [displayedProfileCompletion, profileCompletion]);

  const initialProfileSeed = useMemo(() => {
    if (!dashboardState || !user) {
      return "";
    }
    return JSON.stringify(buildProfileFormState(user, dashboardState));
  }, [dashboardState, user]);

  const currentProfileSeed = JSON.stringify(profileForm);
  const hasUnsavedProfileChanges = Boolean(initialProfileSeed) && initialProfileSeed !== currentProfileSeed;
  const hasPendingAvatarChanges = Boolean(pendingAvatarFile) || isAvatarMarkedForDeletion;
  const hasUnsavedApplicantChanges = hasUnsavedProfileChanges || hasPendingAvatarChanges;

  const resetPendingAvatarState = () => {
    setPendingAvatarFile(null);
    setIsAvatarMarkedForDeletion(false);
    setAvatarPreviewUrl((currentValue) => {
      if (currentValue) {
        URL.revokeObjectURL(currentValue);
      }
      return null;
    });
  };

  async function persistDashboard(nextState: DashboardState, options?: { syncHeaderCity?: boolean }) {
    const response = await saveDashboardMutation.mutateAsync(buildPayload(nextState));
    const nextDashboard = buildDashboardState(response.data, meQuery.data?.data?.user);

    setDashboardState(nextDashboard);
    setAboutDraft(nextDashboard.profile.about);
    setSkillsDraft(createSkillsDraft(nextDashboard.profile));
    setLinksDraft({
      githubUrl: nextDashboard.profile.githubUrl,
      gitlabUrl: nextDashboard.profile.gitlabUrl,
      bitbucketUrl: nextDashboard.profile.bitbucketUrl,
      linkedinUrl: nextDashboard.profile.linkedinUrl,
      portfolioUrl: nextDashboard.profile.portfolioUrl,
      habrUrl: nextDashboard.profile.habrUrl,
      resumeUrl: nextDashboard.profile.resumeUrl,
    });
    setCareerDraft({
      desiredSalaryFrom: nextDashboard.profile.desiredSalaryFrom,
      preferredLocation: nextDashboard.profile.preferredLocation,
      employmentTypes: nextDashboard.profile.employmentTypes,
      workFormats: nextDashboard.profile.workFormats,
    });

    if (user) {
      setProfileForm(buildProfileFormState(user, nextDashboard));
    }

    if (options?.syncHeaderCity) {
      setHeaderCity(nextDashboard.preferredCity);
      writeSelectedCityCookie(nextDashboard.preferredCity);
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
      queryClient.invalidateQueries({ queryKey: ["applicant-dashboard"] }),
    ]);
  }

  const handleProfileSave = async () => {
    if (!dashboardState) {
      return;
    }

    const normalizedCourse = profileForm.course.trim();
    const normalizedCity = profileForm.city.trim();

    if (normalizedCourse.length > 0 && !/^[1-5]$/.test(normalizedCourse)) {
      setCourseValidationError("Можно указать курс только от 1 до 5.");
      return;
    }

    if (normalizedCity.length > 0 && !citySelectionConfirmed) {
      setCityValidationError("Нужно выбрать город из списка.");
      setIsCityDropdownOpen(true);
      return;
    }

    setSaveError(null);
    setCourseValidationError(null);
    setCityValidationError(null);

    try {
      await persistDashboard(
        {
          ...dashboardState,
          profile: {
            ...dashboardState.profile,
            fullName: profileForm.fullName.trim(),
            university: profileForm.university.trim(),
            studyCourse: normalizedCourse,
            graduationYear: profileForm.graduationYear.trim(),
          },
          preferredCity: normalizedCity,
        },
        { syncHeaderCity: true },
      );

      if (isAvatarMarkedForDeletion && persistedApplicantAvatarUrl) {
        await deleteApplicantAvatarMutation.mutateAsync();
      } else if (pendingAvatarFile) {
        await uploadApplicantAvatarMutation.mutateAsync(pendingAvatarFile);
      }

      resetPendingAvatarState();
    } catch {
      setSaveError("Не удалось сохранить профиль.");
    }
  };

  const handleAboutSave = async () => {
    if (!dashboardState) {
      return;
    }
    try {
      await persistDashboard({
        ...dashboardState,
        profile: {
          ...dashboardState.profile,
          about: aboutDraft.trim(),
        },
      });
      setActiveEditor(null);
    } catch {
      setSaveError("Не удалось сохранить раздел «О себе».");
    }
  };

  const handleSkillsSave = async () => {
    if (!dashboardState) {
      return;
    }
    try {
      await persistDashboard({
        ...dashboardState,
        profile: {
          ...dashboardState.profile,
          level: skillsDraft.level,
          hardSkills: skillsDraft.hardSkills,
          softSkills: skillsDraft.softSkills,
          languages: skillsDraft.languages,
        },
      });
      setActiveSkillSelector(null);
      setActiveEditor(null);
    } catch {
      setSaveError("Не удалось сохранить навыки.");
    }
  };

  const handleLinksSave = async () => {
    if (!dashboardState) {
      return;
    }
    try {
      await persistDashboard({
        ...dashboardState,
        profile: {
          ...dashboardState.profile,
          githubUrl: linksDraft.githubUrl.trim(),
          gitlabUrl: linksDraft.gitlabUrl.trim(),
          bitbucketUrl: linksDraft.bitbucketUrl.trim(),
          linkedinUrl: linksDraft.linkedinUrl.trim(),
          portfolioUrl: linksDraft.portfolioUrl.trim(),
          habrUrl: linksDraft.habrUrl.trim(),
          resumeUrl: linksDraft.resumeUrl.trim(),
        },
      });
      setActiveEditor(null);
    } catch {
      setSaveError("Не удалось сохранить ссылки.");
    }
  };

  const handleCareerSave = async () => {
    if (!dashboardState) {
      return;
    }

    if ((careerDraft.preferredLocation ?? "").trim().length > 0 && !preferredLocationSelectionConfirmed) {
      setPreferredLocationValidationError("Нужно выбрать город из списка.");
      setIsPreferredLocationDropdownOpen(true);
      return;
    }

    try {
      await persistDashboard({
        ...dashboardState,
        profile: {
          ...dashboardState.profile,
          desiredSalaryFrom: careerDraft.desiredSalaryFrom.replace(/\D+/g, ""),
          preferredLocation: (careerDraft.preferredLocation ?? "").trim(),
          employmentTypes: careerDraft.employmentTypes,
          workFormats: careerDraft.workFormats,
        },
      });
      setPreferredLocationValidationError(null);
      setActiveEditor(null);
    } catch {
      setSaveError("Не удалось сохранить карьерные интересы.");
    }
  };

  const handleProjectEdit = (item: EditableProject) => {
    setEditingProjectId(item.id);
    setProjectDraft({
      title: item.title,
      description: item.description,
      technologies: item.technologies,
      periodLabel: item.periodLabel,
      roleName: item.roleName,
      repositoryUrl: item.repositoryUrl,
    });
  };

  const handleAchievementEdit = (item: EditableAchievement) => {
    setEditingAchievementId(item.id);
    setAchievementDraft({
      title: item.title,
      eventName: item.eventName,
      projectName: item.projectName,
      award: item.award,
    });
  };

  const handleCertificateEdit = (item: EditableCertificate) => {
    setEditingCertificateId(item.id);
    setCertificateDraft({
      title: item.title,
      organizationName: item.organizationName,
      issuedAt: item.issuedAt,
      credentialUrl: item.credentialUrl,
    });
  };

  const handleProjectUpdate = async () => {
    if (!dashboardState || !editingProjectId) {
      return;
    }
    const previousProject = dashboardState.projects.find((item) => item.id === editingProjectId);
    const nextTitle = projectDraft.title.trim();
    const previousTitle = previousProject?.title.trim() ?? "";
    try {
      await persistDashboard({
        ...dashboardState,
        projects: dashboardState.projects.map((item) =>
          item.id === editingProjectId
            ? { id: item.id, ...projectDraft }
            : item,
        ),
        achievements:
          previousTitle.length > 0 && previousTitle !== nextTitle
            ? dashboardState.achievements.map((item) =>
                item.projectName === previousTitle
                  ? { ...item, projectName: nextTitle }
                  : item,
              )
            : dashboardState.achievements,
      });
      setEditingProjectId(null);
      setProjectDraft(EMPTY_PROJECT_DRAFT);
    } catch {
      setSaveError("Не удалось сохранить проект.");
    }
  };

  const handleAchievementUpdate = async () => {
    if (!dashboardState || !editingAchievementId) {
      return;
    }
    if (!achievementDraft.projectName.trim()) {
      setSaveError("Для достижения нужно выбрать проект.");
      return;
    }
    try {
      await persistDashboard({
        ...dashboardState,
        achievements: dashboardState.achievements.map((item) =>
          item.id === editingAchievementId
            ? { id: item.id, ...achievementDraft }
            : item,
        ),
      });
      setEditingAchievementId(null);
      setAchievementDraft(EMPTY_ACHIEVEMENT_DRAFT);
    } catch {
      setSaveError("Не удалось сохранить достижение.");
    }
  };

  const handleCertificateUpdate = async () => {
    if (!dashboardState || !editingCertificateId) {
      return;
    }
    try {
      await persistDashboard({
        ...dashboardState,
        certificates: dashboardState.certificates.map((item) =>
          item.id === editingCertificateId
            ? { id: item.id, ...certificateDraft }
            : item,
        ),
      });
      setEditingCertificateId(null);
      setCertificateDraft(EMPTY_CERTIFICATE_DRAFT);
    } catch {
      setSaveError("Не удалось сохранить сертификат.");
    }
  };

  const handleProjectDelete = async (projectId: string) => {
    if (!dashboardState) {
      return;
    }
    const deletedProject = dashboardState.projects.find((item) => item.id === projectId);
    const deletedProjectTitle = deletedProject?.title.trim() ?? "";
    try {
      await persistDashboard({
        ...dashboardState,
        projects: dashboardState.projects.filter((item) => item.id !== projectId),
        achievements:
          deletedProjectTitle.length > 0
            ? dashboardState.achievements.filter((item) => item.projectName !== deletedProjectTitle)
            : dashboardState.achievements,
      });
    } catch {
      setSaveError("Не удалось удалить проект.");
    }
  };

  const handlePendingDeleteConfirm = async () => {
    if (!pendingDelete) {
      return;
    }

    if (pendingDelete.kind === "project") {
      await handleProjectDelete(pendingDelete.id);
    }

    if (pendingDelete.kind === "achievement") {
      await handleAchievementDelete(pendingDelete.id);
    }

    if (pendingDelete.kind === "certificate") {
      await handleCertificateDelete(pendingDelete.id);
    }

    setPendingDelete(null);
  };

  const handleAchievementDelete = async (achievementId: string) => {
    if (!dashboardState) {
      return;
    }
    try {
      await persistDashboard({
        ...dashboardState,
        achievements: dashboardState.achievements.filter((item) => item.id !== achievementId),
      });
    } catch {
      setSaveError("Не удалось удалить достижение.");
    }
  };

  const handleCertificateDelete = async (certificateId: string) => {
    if (!dashboardState) {
      return;
    }
    try {
      await persistDashboard({
        ...dashboardState,
        certificates: dashboardState.certificates.filter((item) => item.id !== certificateId),
      });
    } catch {
      setSaveError("Не удалось удалить сертификат.");
    }
  };

  const handleProjectAdd = async () => {
    if (!dashboardState || !modalProjectDraft.title.trim()) {
      return;
    }
    try {
      await persistDashboard({
        ...dashboardState,
        projects: [
          {
            id: `new-project-${Date.now()}`,
            ...modalProjectDraft,
          },
          ...dashboardState.projects,
        ],
      });
      setActiveModal(null);
      setModalProjectDraft(EMPTY_PROJECT_DRAFT);
      setModalProjectTechnologiesQuery("");
      if (activeSkillSelector === "project-tech") {
        setActiveSkillSelector(null);
      }
    } catch {
      setSaveError("Не удалось добавить проект.");
    }
  };

  const handleAchievementAdd = async () => {
    if (!dashboardState || !modalAchievementDraft.title.trim()) {
      return;
    }
    if (!modalAchievementDraft.projectName.trim()) {
      setSaveError("Для достижения нужно выбрать проект.");
      return;
    }
    try {
      await persistDashboard({
        ...dashboardState,
        achievements: [
          {
            id: `new-achievement-${Date.now()}`,
            ...modalAchievementDraft,
          },
          ...dashboardState.achievements,
        ],
      });
      setActiveModal(null);
      setModalAchievementDraft(EMPTY_ACHIEVEMENT_DRAFT);
    } catch {
      setSaveError("Не удалось добавить достижение.");
    }
  };

  const handleCertificateAdd = async () => {
    if (!dashboardState || !modalCertificateDraft.title.trim()) {
      return;
    }
    try {
      await persistDashboard({
        ...dashboardState,
        certificates: [
          {
            id: `new-certificate-${Date.now()}`,
            ...modalCertificateDraft,
          },
          ...dashboardState.certificates,
        ],
      });
      setActiveModal(null);
      setModalCertificateDraft(EMPTY_CERTIFICATE_DRAFT);
    } catch {
      setSaveError("Не удалось добавить сертификат.");
    }
  };

  if (role !== "applicant") {
    return <Navigate to="/" replace />;
  }

  if (!dashboardState) {
    return null;
  }

  return (
    <main className="seeker-dashboard">
      <Header
        containerClassName="home-page__shell"
        profileMenuItems={profileMenuItems}
        theme="applicant"
        city={headerCity || "Выберите город"}
        onCityChange={(city: CitySelection) => {
          setHeaderCity(city.name);
          writeSelectedCityCookie(city.name);
        }}
      />

      <Container className="seeker-dashboard__shell">
        <ProfileTabs
          navigate={navigate}
          audience="applicant"
          current="profile"
          tabsClassName="seeker-dashboard__tabs"
          tabClassName="seeker-dashboard__tab"
          activeTabClassName="seeker-dashboard__tab--active"
          ariaLabel="Разделы профиля соискателя"
        />

        <section className="seeker-dashboard__profile">
          <div className="seeker-dashboard__profile-summary">
            <section className="seeker-dashboard__form-panel">
              <div className="seeker-dashboard__identity">
                <p className="seeker-dashboard__profile-id">{`ID:${profilePublicId}`}</p>
                <div className="seeker-dashboard__avatar-panel">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    hidden
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={handleAvatarChange}
                  />
                  <span className="seeker-dashboard__avatar-shell">
                    <img src={applicantAvatar} alt="" aria-hidden="true" className="seeker-dashboard__avatar-image" />
                    {pendingAvatarFile || persistedApplicantAvatarUrl ? (
                      <button
                        type="button"
                        className="seeker-dashboard__avatar-overlay"
                        aria-label="Удалить аватар"
                        onClick={handleDeleteAvatar}
                      >
                        <span aria-hidden="true" className="seeker-dashboard__avatar-overlay-icon" />
                      </button>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    variant="secondary-ghost"
                    size="md"
                    className="seeker-dashboard__avatar-action"
                    onClick={handlePickAvatar}
                  >
                    <span className="seeker-dashboard__avatar-actions">Изменить аватар</span>
                  </Button>
                </div>
              </div>

              <div className="seeker-dashboard__profile-form">
                <label className="seeker-dashboard__field">
                  <span className="seeker-dashboard__field-label">ФИО</span>
                  <Input
                    className="input--secondary input--sm"
                    value={profileForm.fullName}
                    onChange={(event) => setProfileForm((current) => ({ ...current, fullName: event.target.value }))}
                    placeholder="Введите полное имя"
                  />
                </label>

                <label className="seeker-dashboard__field">
                  <span className="seeker-dashboard__field-label">E-mail</span>
                  <Input className="input--secondary input--sm" value={profileForm.email} disabled />
                </label>

                <label ref={universityFieldRef} className="seeker-dashboard__field seeker-dashboard__field--university">
                  <span className="seeker-dashboard__field-label">ВУЗ</span>
                  <div className="seeker-dashboard__university-search">
                    <Input
                      className="input--secondary input--sm"
                      value={profileForm.university}
                      onFocus={() => setIsUniversityDropdownOpen(true)}
                      onChange={(event) => {
                        setProfileForm((current) => ({ ...current, university: event.target.value }));
                        setIsUniversityDropdownOpen(true);
                      }}
                      placeholder="Начните вводить название вуза"
                    />
                    {isUniversityDropdownOpen && profileForm.university.trim().length > 0 ? (
                      <div className="seeker-dashboard__university-dropdown" role="listbox" aria-label="Список вузов">
                        {isUniversitySuggestionsLoading ? (
                          <div className="seeker-dashboard__university-empty">Ищем учебные заведения...</div>
                        ) : null}
                        {!isUniversitySuggestionsLoading && universitySuggestionsError ? (
                          <div className="seeker-dashboard__university-empty">{universitySuggestionsError}</div>
                        ) : null}
                        {!isUniversitySuggestionsLoading &&
                        !universitySuggestionsError &&
                        universitySuggestions.length === 0 ? (
                          <div className="seeker-dashboard__university-empty">Ничего не найдено.</div>
                        ) : null}
                        {!isUniversitySuggestionsLoading && !universitySuggestionsError
                          ? universitySuggestions.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="seeker-dashboard__university-option"
                                onClick={() => {
                                  setProfileForm((current) => ({ ...current, university: item.name }));
                                  setIsUniversityDropdownOpen(false);
                                }}
                              >
                                <span className="seeker-dashboard__university-option-label">{item.name}</span>
                                {item.subtitle && item.subtitle !== item.name ? (
                                  <span className="seeker-dashboard__university-option-meta">{item.subtitle}</span>
                                ) : null}
                              </button>
                            ))
                          : null}
                      </div>
                    ) : null}
                  </div>
                </label>

                <label className="seeker-dashboard__field">
                  <span className="seeker-dashboard__field-label">Курс</span>
                  <Input
                    className={
                      courseValidationError
                        ? "input--secondary input--sm input--error"
                        : "input--secondary input--sm"
                    }
                    value={profileForm.course}
                    inputMode="numeric"
                    onChange={(event) => {
                      const nextValue = event.target.value.replace(/\D+/g, "").slice(0, 1);
                      setProfileForm((current) => ({ ...current, course: nextValue }));
                      setCourseValidationError(
                        nextValue.length > 0 && !/^[1-5]$/.test(nextValue)
                          ? "Можно указать курс только от 1 до 5."
                          : null,
                      );
                    }}
                    placeholder="От 1 до 5"
                  />
                  {courseValidationError ? (
                    <span className="seeker-dashboard__field-error">{courseValidationError}</span>
                  ) : null}
                </label>

                <label className="seeker-dashboard__field">
                  <span className="seeker-dashboard__field-label">Год выпуска</span>
                  <Input
                    className="input--secondary input--sm"
                    value={profileForm.graduationYear}
                    onChange={(event) =>
                      setProfileForm((current) => ({ ...current, graduationYear: event.target.value.replace(/\D+/g, "").slice(0, 4) }))
                    }
                    placeholder="Например, 2027"
                  />
                </label>

                <label ref={cityFieldRef} className="seeker-dashboard__field seeker-dashboard__field--city">
                  <span className="seeker-dashboard__field-label">Город</span>
                  <div className="seeker-dashboard__city-search">
                    <Input
                      className={
                        cityValidationError
                          ? "input--secondary input--sm input--error"
                          : "input--secondary input--sm"
                      }
                      value={profileForm.city}
                      onFocus={() => setIsCityDropdownOpen(true)}
                      onChange={(event) => {
                        const nextCity = event.target.value;
                        setProfileForm((current) => ({ ...current, city: nextCity }));
                        setCitySelectionConfirmed(nextCity.trim().length === 0);
                        setCityValidationError(
                          nextCity.trim().length === 0 ? null : "Нужно выбрать город из списка.",
                        );
                        setIsCityDropdownOpen(true);
                      }}
                      placeholder="Начните вводить город"
                    />
                    {isCityDropdownOpen && profileForm.city.trim().length > 0 ? (
                      <div className="seeker-dashboard__city-dropdown" role="listbox" aria-label="Список городов">
                        {isCitySuggestionsLoading ? (
                          <div className="seeker-dashboard__city-empty">Ищем города...</div>
                        ) : null}
                        {!isCitySuggestionsLoading && citySuggestionsError ? (
                          <div className="seeker-dashboard__city-empty">{citySuggestionsError}</div>
                        ) : null}
                        {!isCitySuggestionsLoading && !citySuggestionsError && citySuggestions.length === 0 ? (
                          <div className="seeker-dashboard__city-empty">Ничего не найдено.</div>
                        ) : null}
                        {!isCitySuggestionsLoading && !citySuggestionsError
                          ? citySuggestions.map((city) => (
                              <button
                                key={city.id}
                                type="button"
                                className="seeker-dashboard__city-option"
                                onClick={() => {
                                  setProfileForm((current) => ({ ...current, city: city.name }));
                                  setCitySelectionConfirmed(true);
                                  setCityValidationError(null);
                                  setIsCityDropdownOpen(false);
                                }}
                              >
                                {city.name}
                              </button>
                            ))
                          : null}
                      </div>
                    ) : null}
                  </div>
                  {cityValidationError ? (
                    <span className="seeker-dashboard__field-error">{cityValidationError}</span>
                  ) : null}
                </label>
              </div>

              {saveError ? <p className="seeker-dashboard__save-error">{saveError}</p> : null}

              <Button
                type="button"
                variant="secondary"
                size="md"
                loading={
                  saveDashboardMutation.isPending ||
                  uploadApplicantAvatarMutation.isPending ||
                  deleteApplicantAvatarMutation.isPending
                }
                disabled={
                  saveDashboardMutation.isPending ||
                  uploadApplicantAvatarMutation.isPending ||
                  deleteApplicantAvatarMutation.isPending ||
                  !hasUnsavedApplicantChanges
                }
                className="seeker-dashboard__save-button"
                onClick={() => void handleProfileSave()}
              >
                Сохранить изменения
              </Button>
            </section>

            <aside className="seeker-dashboard__summary-panel">
              <article className="seeker-dashboard__summary-card">
                <div className="seeker-dashboard__summary-progress-head">
                  <p className="seeker-dashboard__summary-title">{`Профиль заполнен на ${displayedProfileCompletion}%`}</p>
                  <div className="seeker-dashboard__progress">
                    <span
                      className="seeker-dashboard__progress-bar"
                      style={{ width: `${Math.min(Math.max(displayedProfileCompletion, 6), 100)}%` }}
                    />
                  </div>
                </div>
                <dl className="seeker-dashboard__metrics">
                  <div className="seeker-dashboard__metric-line">
                    <dt>Просмотров профиля:</dt>
                    <dd>{dashboardState.stats.profileViewsCount}</dd>
                  </div>
                  <div className="seeker-dashboard__metric-line">
                    <dt>Отправлено откликов:</dt>
                    <dd>{dashboardState.stats.applicationsCount}</dd>
                  </div>
                  <div className="seeker-dashboard__metric-line">
                    <dt>Получено ответов:</dt>
                    <dd>{dashboardState.stats.responsesCount}</dd>
                  </div>
                  <div className="seeker-dashboard__metric-line">
                    <dt>Приглашений:</dt>
                    <dd>{dashboardState.stats.invitationsCount}</dd>
                  </div>
                  <div className="seeker-dashboard__metric-line">
                    <dt>Рекомендаций от контактов:</dt>
                    <dd>{dashboardState.stats.recommendationsCount}</dd>
                  </div>
                </dl>
              </article>

              <article className="seeker-dashboard__summary-card">
                <div className="seeker-dashboard__summary-head">
                  <h2 className="seeker-dashboard__summary-section-title">
                    Карьерные <span className="seeker-dashboard__summary-section-title-accent">интересы</span>
                  </h2>
                  {activeEditor === "career-interests" ? (
                    <Button type="button" variant="secondary" size="md" className="seeker-dashboard__confirm-button" onClick={() => void handleCareerSave()}>
                      {confirmIcon}
                    </Button>
                  ) : (
                    <button
                      type="button"
                      className="seeker-dashboard__icon-button"
                      aria-label="Редактировать карьерные интересы"
                      onClick={() => {
                        setCareerDraft({
                          desiredSalaryFrom: dashboardState.profile.desiredSalaryFrom,
                          preferredLocation: dashboardState.profile.preferredLocation,
                          employmentTypes: dashboardState.profile.employmentTypes,
                          workFormats: dashboardState.profile.workFormats,
                        });
                        setPreferredLocationSelectionConfirmed(
                          (dashboardState.profile.preferredLocation ?? "").trim().length === 0,
                        );
                        setPreferredLocationValidationError(null);
                        setActiveEditor("career-interests");
                      }}
                    >
                      <img src={editIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                    </button>
                  )}
                </div>
                {activeEditor === "career-interests" ? (
                  <div className="seeker-dashboard__interest-list seeker-dashboard__interest-list--editing">
                    <div className="seeker-dashboard__interest-card">
                      <span className="seeker-dashboard__interest-label">Ожидаемая зарплата:</span>
                      <Input
                        className="input--secondary input--sm"
                        value={careerDraft.desiredSalaryFrom}
                        inputMode="numeric"
                        onChange={(event) =>
                          setCareerDraft((current) => ({
                            ...current,
                            desiredSalaryFrom: event.target.value.replace(/\D+/g, ""),
                          }))
                        }
                        placeholder="Например, 80000"
                      />
                    </div>
                    <label
                      ref={preferredLocationFieldRef}
                      className="seeker-dashboard__interest-card seeker-dashboard__interest-card--search"
                    >
                      <span className="seeker-dashboard__interest-label">Предпочитаемая локация:</span>
                      <div className="seeker-dashboard__city-search">
                        <Input
                          className={
                            preferredLocationValidationError
                              ? "input--secondary input--sm input--error"
                              : "input--secondary input--sm"
                          }
                          value={careerDraft.preferredLocation}
                          onFocus={() => setIsPreferredLocationDropdownOpen(true)}
                          onChange={(event) => {
                            const nextCity = event.target.value;
                            setCareerDraft((current) => ({ ...current, preferredLocation: nextCity }));
                            setPreferredLocationSelectionConfirmed(nextCity.trim().length === 0);
                            setPreferredLocationValidationError(
                              nextCity.trim().length === 0 ? null : "Нужно выбрать город из списка.",
                            );
                            setIsPreferredLocationDropdownOpen(true);
                          }}
                          placeholder="Начните вводить город"
                        />
                        {isPreferredLocationDropdownOpen && (careerDraft.preferredLocation ?? "").trim().length > 0 ? (
                          <div className="seeker-dashboard__city-dropdown" role="listbox" aria-label="Список городов">
                            {isPreferredLocationSuggestionsLoading ? (
                              <div className="seeker-dashboard__city-empty">Ищем города...</div>
                            ) : null}
                            {!isPreferredLocationSuggestionsLoading && preferredLocationSuggestionsError ? (
                              <div className="seeker-dashboard__city-empty">{preferredLocationSuggestionsError}</div>
                            ) : null}
                            {!isPreferredLocationSuggestionsLoading &&
                            !preferredLocationSuggestionsError &&
                            preferredLocationSuggestions.length === 0 ? (
                              <div className="seeker-dashboard__city-empty">Ничего не найдено.</div>
                            ) : null}
                            {!isPreferredLocationSuggestionsLoading && !preferredLocationSuggestionsError
                              ? preferredLocationSuggestions.map((city) => (
                                  <button
                                    key={city.id}
                                    type="button"
                                    className="seeker-dashboard__city-option"
                                    onClick={() => {
                                      setCareerDraft((current) => ({ ...current, preferredLocation: city.name }));
                                      setPreferredLocationSelectionConfirmed(true);
                                      setPreferredLocationValidationError(null);
                                      setIsPreferredLocationDropdownOpen(false);
                                    }}
                                  >
                                    {city.name}
                                  </button>
                                ))
                              : null}
                          </div>
                        ) : null}
                      </div>
                      {preferredLocationValidationError ? (
                        <span className="seeker-dashboard__field-error">{preferredLocationValidationError}</span>
                      ) : null}
                    </label>
                    <div className="seeker-dashboard__interest-card">
                      <span className="seeker-dashboard__interest-label">Тип занятости:</span>
                      <div className="seeker-dashboard__preference-options">
                        {EMPLOYMENT_OPTIONS.map((option) => (
                          <label key={option} className="seeker-dashboard__preference-option">
                            <Checkbox
                              variant="secondary"
                              checked={careerDraft.employmentTypes.includes(option)}
                              onChange={(event) =>
                                setCareerDraft((current) => ({
                                  ...current,
                                  employmentTypes: event.target.checked
                                    ? [...current.employmentTypes, option]
                                    : current.employmentTypes.filter((item) => item !== option),
                                }))
                              }
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="seeker-dashboard__interest-card">
                      <span className="seeker-dashboard__interest-label">Формат работы:</span>
                      <div className="seeker-dashboard__preference-options">
                        {WORK_FORMAT_OPTIONS.map((option) => (
                          <label key={option} className="seeker-dashboard__preference-option">
                            <Checkbox
                              variant="secondary"
                              checked={careerDraft.workFormats.includes(option)}
                              onChange={(event) =>
                                setCareerDraft((current) => ({
                                  ...current,
                                  workFormats: event.target.checked
                                    ? [...current.workFormats, option]
                                    : current.workFormats.filter((item) => item !== option),
                                }))
                              }
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="seeker-dashboard__interest-list">
                    <div className="seeker-dashboard__interest-card">
                      <span className="seeker-dashboard__interest-label">Ожидаемая зарплата</span>
                      <strong className="seeker-dashboard__interest-value">
                        {formatSalary(dashboardState.profile.desiredSalaryFrom)}
                      </strong>
                    </div>
                    <div className="seeker-dashboard__interest-card">
                      <span className="seeker-dashboard__interest-label">Предпочитаемая локация</span>
                      <strong className="seeker-dashboard__interest-value">
                        {dashboardState.profile.preferredLocation || "Не указана"}
                      </strong>
                    </div>
                    <div className="seeker-dashboard__interest-card">
                      <span className="seeker-dashboard__interest-label">Тип занятости</span>
                      <strong className="seeker-dashboard__interest-value">
                        {dashboardState.profile.employmentTypes.join(", ") || "Не указано"}
                      </strong>
                    </div>
                    <div className="seeker-dashboard__interest-card">
                      <span className="seeker-dashboard__interest-label">Формат работы</span>
                      <strong className="seeker-dashboard__interest-value">
                        {dashboardState.profile.workFormats.join(", ") || "Не указано"}
                      </strong>
                    </div>
                  </div>
                )}
              </article>
            </aside>
          </div>
        </section>

        <section className="seeker-dashboard__section">
          <h2 className="seeker-dashboard__section-title">Портфолио</h2>
          <div className="seeker-dashboard__portfolio-showcase">
            <article className="seeker-dashboard__profile-panel seeker-dashboard__profile-panel--links">
              <div className="seeker-dashboard__profile-panel-head">
                <h3 className="seeker-dashboard__profile-panel-title">О себе</h3>
                {activeEditor === "about" ? (
                  <Button type="button" variant="secondary" size="md" className="seeker-dashboard__confirm-button" onClick={() => void handleAboutSave()}>
                    {confirmIcon}
                  </Button>
                ) : (
                  <button
                    type="button"
                    className="seeker-dashboard__icon-button"
                    aria-label="Редактировать раздел о себе"
                    onClick={() => {
                      setAboutDraft(dashboardState.profile.about);
                      setActiveEditor("about");
                    }}
                  >
                    <img src={editIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                  </button>
                )}
              </div>
              <div className="seeker-dashboard__profile-panel-body">
                {activeEditor === "about" ? (
                  <textarea
                    className="seeker-dashboard__textarea"
                    value={aboutDraft}
                    onChange={(event) => setAboutDraft(event.target.value)}
                    rows={12}
                    placeholder="Расскажите о себе, своём опыте, интересах и карьерных целях"
                  />
                ) : dashboardState.profile.about ? (
                  dashboardState.profile.about.split(/\n+/).map((paragraph) => (
                    <p key={paragraph} className="seeker-dashboard__paragraph">{paragraph}</p>
                  ))
                ) : (
                  <p className="seeker-dashboard__paragraph">Пока ничего не добавлено.</p>
                )}
              </div>
            </article>

            <article
              className={
                activeEditor === "skills"
                  ? "seeker-dashboard__profile-panel seeker-dashboard__profile-panel--skills-editing"
                  : "seeker-dashboard__profile-panel"
              }
            >
              <div className="seeker-dashboard__profile-panel-head">
                <h3 className="seeker-dashboard__profile-panel-title">Навыки</h3>
                {activeEditor === "skills" ? (
                  <Button type="button" variant="secondary" size="md" className="seeker-dashboard__confirm-button" onClick={() => void handleSkillsSave()}>
                    {confirmIcon}
                  </Button>
                ) : (
                  <button
                    type="button"
                    className="seeker-dashboard__icon-button"
                    aria-label="Редактировать навыки"
                    onClick={() => {
                      setSkillsDraft(createSkillsDraft(dashboardState.profile));
                      setActiveSkillSelector(null);
                      setActiveEditor("skills");
                    }}
                  >
                    <img src={editIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                  </button>
                )}
              </div>
              <div className="seeker-dashboard__profile-panel-body seeker-dashboard__profile-panel-body--stacked">
                {activeEditor === "skills" ? (
                  <>
                    <div className="seeker-dashboard__skill-group">
                      <span className="seeker-dashboard__skill-title">Уровень</span>
                      <div className="seeker-dashboard__preference-options">
                        {(["Junior", "Middle", "Senior"] as SeekerLevel[]).map((level) => (
                          <label key={level} className="seeker-dashboard__preference-option">
                            <Checkbox
                              variant="secondary"
                              checked={skillsDraft.level === level}
                              onChange={() => setSkillsDraft((current) => ({ ...current, level }))}
                            />
                            <span>{level}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <SkillTagSelector
                      fieldRef={hardSkillsFieldRef}
                      label="Hard skills"
                      placeholder="Найдите hard skill"
                      selected={skillsDraft.hardSkills}
                      query={skillsDraft.hardSkillsQuery}
                      options={filteredHardSkillOptions}
                      isOpen={activeSkillSelector === "hard"}
                      isLoading={tagCatalogQuery.isLoading}
                      onQueryChange={(value) => {
                        setSkillsDraft((current) => ({ ...current, hardSkillsQuery: value }));
                        setActiveSkillSelector("hard");
                      }}
                      onOpen={() => setActiveSkillSelector("hard")}
                      onSelect={(value) => addSkillValue("hard", value)}
                      onRemove={(value) => removeSkillValue("hard", value)}
                    />
                    <SkillTagSelector
                      fieldRef={softSkillsFieldRef}
                      label="Soft skills"
                      placeholder="Найдите soft skill"
                      selected={skillsDraft.softSkills}
                      query={skillsDraft.softSkillsQuery}
                      options={filteredSoftSkillOptions}
                      isOpen={activeSkillSelector === "soft"}
                      isLoading={tagCatalogQuery.isLoading}
                      onQueryChange={(value) => {
                        setSkillsDraft((current) => ({ ...current, softSkillsQuery: value }));
                        setActiveSkillSelector("soft");
                      }}
                      onOpen={() => setActiveSkillSelector("soft")}
                      onSelect={(value) => addSkillValue("soft", value)}
                      onRemove={(value) => removeSkillValue("soft", value)}
                    />
                    <SkillTagSelector
                      fieldRef={languagesFieldRef}
                      label="Языки"
                      placeholder="Найдите язык"
                      selected={skillsDraft.languages}
                      query={skillsDraft.languagesQuery}
                      options={filteredLanguageOptions}
                      isOpen={activeSkillSelector === "language"}
                      isLoading={tagCatalogQuery.isLoading}
                      onQueryChange={(value) => {
                        setSkillsDraft((current) => ({ ...current, languagesQuery: value }));
                        setActiveSkillSelector("language");
                      }}
                      onOpen={() => setActiveSkillSelector("language")}
                      onSelect={(value) => addSkillValue("language", value)}
                      onRemove={(value) => removeSkillValue("language", value)}
                    />
                  </>
                ) : (
                  <>
                    <div className="seeker-dashboard__skill-group">
                      <span className="seeker-dashboard__skill-title">Уровень</span>
                      <Badge
                        variant={resolveLevelStatusVariant(dashboardState.profile.level)}
                        className="seeker-dashboard__level-badge"
                      >
                        {dashboardState.profile.level}
                      </Badge>
                    </div>
                    <div className="seeker-dashboard__skill-group">
                      <span className="seeker-dashboard__skill-title">Hard skills</span>
                      <div className="seeker-dashboard__tag-list">
                        {dashboardState.profile.hardSkills.map((item) => (
                          <Badge key={item} variant="secondary">{item}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="seeker-dashboard__skill-group">
                      <span className="seeker-dashboard__skill-title">Soft skills</span>
                      <div className="seeker-dashboard__tag-list">
                        {dashboardState.profile.softSkills.map((item) => (
                          <Badge key={item} variant="secondary">{item}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="seeker-dashboard__skill-group">
                      <span className="seeker-dashboard__skill-title">Языки</span>
                      <div className="seeker-dashboard__tag-list">
                        {dashboardState.profile.languages.map((item) => (
                          <Badge key={item} variant="secondary">{item}</Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </article>

            <article className="seeker-dashboard__profile-panel">
              <div className="seeker-dashboard__profile-panel-head">
                <h3 className="seeker-dashboard__profile-panel-title">Ссылки на репозитории</h3>
                {activeEditor === "links" ? (
                  <Button type="button" variant="secondary" size="md" className="seeker-dashboard__confirm-button" onClick={() => void handleLinksSave()}>
                    {confirmIcon}
                  </Button>
                ) : (
                  <button
                    type="button"
                    className="seeker-dashboard__icon-button"
                    aria-label="Редактировать ссылки"
                    onClick={() => {
                      setLinksDraft({
                        githubUrl: dashboardState.profile.githubUrl,
                        gitlabUrl: dashboardState.profile.gitlabUrl,
                        bitbucketUrl: dashboardState.profile.bitbucketUrl,
                        linkedinUrl: dashboardState.profile.linkedinUrl,
                        portfolioUrl: dashboardState.profile.portfolioUrl,
                        habrUrl: dashboardState.profile.habrUrl,
                        resumeUrl: dashboardState.profile.resumeUrl,
                      });
                      setActiveEditor("links");
                    }}
                  >
                    <img src={editIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                  </button>
                )}
              </div>
              <div className="seeker-dashboard__profile-panel-body seeker-dashboard__profile-panel-body--stacked">
                {activeEditor === "links" ? (
                  <>
                    {[
                      ["GitHub", "githubUrl"],
                      ["GitLab", "gitlabUrl"],
                      ["Bitbucket", "bitbucketUrl"],
                      ["LinkedIn", "linkedinUrl"],
                      ["Портфолио", "portfolioUrl"],
                      ["Хабр", "habrUrl"],
                    ].map(([label, key]) => (
                      <label key={key} className="seeker-dashboard__field">
                        <span className="seeker-dashboard__field-label">{label}</span>
                        <Input
                          className="input--secondary input--sm"
                          value={linksDraft[key as keyof typeof linksDraft]}
                          onChange={(event) =>
                            setLinksDraft((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="seeker-dashboard__link-panel">
                      <span className="seeker-dashboard__link-label">GitHub</span>
                      <a href={dashboardState.profile.githubUrl || "#"} className="seeker-dashboard__link-value">
                        {formatLinkLabel(dashboardState.profile.githubUrl, "github.com")}
                      </a>
                    </div>
                    <div className="seeker-dashboard__link-panel">
                      <span className="seeker-dashboard__link-label">GitLab</span>
                      <a href={dashboardState.profile.gitlabUrl || "#"} className="seeker-dashboard__link-value">
                        {formatLinkLabel(dashboardState.profile.gitlabUrl, "gitlab.com")}
                      </a>
                    </div>
                    <div className="seeker-dashboard__link-panel">
                      <span className="seeker-dashboard__link-label">Bitbucket</span>
                      <a href={dashboardState.profile.bitbucketUrl || "#"} className="seeker-dashboard__link-value">
                        {formatLinkLabel(dashboardState.profile.bitbucketUrl, "bitbucket.org")}
                      </a>
                    </div>
                    <div className="seeker-dashboard__link-panel">
                      <span className="seeker-dashboard__link-label">LinkedIn</span>
                      <a href={dashboardState.profile.linkedinUrl || "#"} className="seeker-dashboard__link-value">
                        {formatLinkLabel(dashboardState.profile.linkedinUrl, "linkedin.com")}
                      </a>
                    </div>
                    <div className="seeker-dashboard__link-panel">
                      <span className="seeker-dashboard__link-label">Портфолио</span>
                      <a href={dashboardState.profile.portfolioUrl || "#"} className="seeker-dashboard__link-value">
                        {formatLinkLabel(dashboardState.profile.portfolioUrl, "portfolio.example")}
                      </a>
                    </div>
                    <div className="seeker-dashboard__link-panel">
                      <span className="seeker-dashboard__link-label">Хабр</span>
                      <a href={dashboardState.profile.habrUrl || "#"} className="seeker-dashboard__link-value">
                        {formatLinkLabel(dashboardState.profile.habrUrl, "habr.com")}
                      </a>
                    </div>
                  </>
                )}
              </div>
            </article>
          </div>
        </section>

        <section className="seeker-dashboard__section seeker-dashboard__section--combined">
          <div className="seeker-dashboard__portfolio-set seeker-dashboard__portfolio-set--combined">
            <div className="seeker-dashboard__portfolio-set-section">
              <h2 className="seeker-dashboard__section-title">Опыт проектов</h2>
            </div>
            <div className="seeker-dashboard__portfolio-set-gallery">
              {dashboardState.projects.map((project) => (
                <article key={project.id} className="seeker-dashboard__portfolio-set-entry">
                  <div className="seeker-dashboard__portfolio-set-entry-head">
                    {editingProjectId === project.id ? (
                      <Input
                        className="input--secondary input--sm seeker-dashboard__portfolio-set-title-input"
                        value={projectDraft.title}
                        onChange={(event) => setProjectDraft((current) => ({ ...current, title: event.target.value }))}
                      />
                    ) : (
                      <h3 className="seeker-dashboard__portfolio-set-entry-title">{project.title}</h3>
                    )}
                    <div className="seeker-dashboard__portfolio-set-entry-actions">
                      {editingProjectId === project.id ? (
                        <Button type="button" variant="secondary" size="md" className="seeker-dashboard__confirm-button" onClick={() => void handleProjectUpdate()}>
                          {confirmIcon}
                        </Button>
                      ) : (
                        <button type="button" className="seeker-dashboard__icon-button" onClick={() => handleProjectEdit(project)}>
                          <img src={editIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="seeker-dashboard__icon-button"
                        onClick={() =>
                          setPendingDelete({
                            kind: "project",
                            id: project.id,
                            title: "Удаление проекта",
                            entityLabel: project.title || "этот проект",
                          })
                        }
                      >
                        <img src={deleteIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                      </button>
                    </div>
                  </div>
                  <div className="seeker-dashboard__portfolio-set-entry-body">
                    {editingProjectId === project.id ? (
                      <>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Описание:</span>
                          <textarea
                            className="seeker-dashboard__textarea seeker-dashboard__textarea--sm"
                            value={projectDraft.description}
                            onChange={(event) =>
                              setProjectDraft((current) => ({ ...current, description: event.target.value }))
                            }
                            rows={4}
                          />
                        </label>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Технологии:</span>
                          <Input
                            className="input--secondary input--sm"
                            value={projectDraft.technologies}
                            onChange={(event) =>
                              setProjectDraft((current) => ({ ...current, technologies: event.target.value }))
                            }
                          />
                        </label>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Период:</span>
                          <Input
                            className="input--secondary input--sm"
                            value={projectDraft.periodLabel}
                            onChange={(event) =>
                              setProjectDraft((current) => ({ ...current, periodLabel: event.target.value }))
                            }
                          />
                        </label>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Роль:</span>
                          <Input
                            className="input--secondary input--sm"
                            value={projectDraft.roleName}
                            onChange={(event) =>
                              setProjectDraft((current) => ({ ...current, roleName: event.target.value }))
                            }
                          />
                        </label>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Ссылка:</span>
                          <Input
                            className="input--secondary input--sm"
                            value={projectDraft.repositoryUrl}
                            onChange={(event) =>
                              setProjectDraft((current) => ({ ...current, repositoryUrl: event.target.value }))
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <div className="seeker-dashboard__portfolio-set-entry-detail">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Описание:</span>
                          <p className="seeker-dashboard__paragraph">{project.description}</p>
                        </div>
                        <div className="seeker-dashboard__portfolio-set-entry-detail">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Технологии:</span>
                          <p className="seeker-dashboard__paragraph">{project.technologies}</p>
                          <p className="seeker-dashboard__paragraph">{`Период: ${project.periodLabel}`}</p>
                          <p className="seeker-dashboard__paragraph">{`Роль: ${project.roleName}`}</p>
                        </div>
                        <div className="seeker-dashboard__portfolio-set-entry-detail">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Ссылка:</span>
                          <p className="seeker-dashboard__paragraph">{project.repositoryUrl}</p>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Button type="button" variant="secondary-outline" size="md" fullWidth className="seeker-dashboard__portfolio-set-button" onClick={() => setActiveModal("project")}>
              Добавить проект
            </Button>

            <div className="seeker-dashboard__portfolio-set-section">
              <h2 className="seeker-dashboard__section-title">Достижения</h2>
            </div>
            <div className="seeker-dashboard__portfolio-set-gallery">
              {dashboardState.achievements.map((item) => (
                <article key={item.id} className="seeker-dashboard__portfolio-set-entry">
                  <div className="seeker-dashboard__portfolio-set-entry-head">
                    {editingAchievementId === item.id ? (
                      <Input
                        className="input--secondary input--sm seeker-dashboard__portfolio-set-title-input"
                        value={achievementDraft.title}
                        onChange={(event) => setAchievementDraft((current) => ({ ...current, title: event.target.value }))}
                      />
                    ) : (
                      <h3 className="seeker-dashboard__portfolio-set-entry-title">{item.title}</h3>
                    )}
                    <div className="seeker-dashboard__portfolio-set-entry-actions">
                      {editingAchievementId === item.id ? (
                        <Button type="button" variant="secondary" size="md" className="seeker-dashboard__confirm-button" onClick={() => void handleAchievementUpdate()}>
                          {confirmIcon}
                        </Button>
                      ) : (
                        <button type="button" className="seeker-dashboard__icon-button" onClick={() => handleAchievementEdit(item)}>
                          <img src={editIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="seeker-dashboard__icon-button"
                        onClick={() =>
                          setPendingDelete({
                            kind: "achievement",
                            id: item.id,
                            title: "Удаление достижения",
                            entityLabel: item.title || "это достижение",
                          })
                        }
                      >
                        <img src={deleteIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                      </button>
                    </div>
                  </div>
                  <div className="seeker-dashboard__portfolio-set-entry-body">
                    {editingAchievementId === item.id ? (
                      <>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Мероприятие:</span>
                          <Input
                            className="input--secondary input--sm"
                            value={achievementDraft.eventName}
                            onChange={(event) =>
                              setAchievementDraft((current) => ({
                                ...current,
                                eventName: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Проект:</span>
                          <Select
                            className="seeker-dashboard__select"
                            variant="secondary"
                            size="sm"
                            placeholder={
                              projectSelectOptions.length > 0
                                ? "Выберите проект"
                                : "Сначала добавьте проект"
                            }
                            value={achievementDraft.projectName}
                            options={projectSelectOptions}
                            disabled={projectSelectOptions.length === 0}
                            onValueChange={(value) =>
                              setAchievementDraft((current) => ({
                                ...current,
                                projectName: value,
                              }))
                            }
                          />
                        </label>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Награда:</span>
                          <Input
                            className="input--secondary input--sm"
                            value={achievementDraft.award}
                            onChange={(event) =>
                              setAchievementDraft((current) => ({
                                ...current,
                                award: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <div className="seeker-dashboard__portfolio-set-entry-detail">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Мероприятие:</span>
                          <p className="seeker-dashboard__paragraph">{item.eventName}</p>
                        </div>
                        <div className="seeker-dashboard__portfolio-set-entry-detail">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Проект:</span>
                          <p className="seeker-dashboard__paragraph">{item.projectName}</p>
                        </div>
                        <div className="seeker-dashboard__portfolio-set-entry-detail">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Награда:</span>
                          <p className="seeker-dashboard__paragraph">{item.award}</p>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Button type="button" variant="secondary-outline" size="md" fullWidth className="seeker-dashboard__portfolio-set-button" onClick={() => setActiveModal("achievement")}>
              Добавить достижение
            </Button>

            <div className="seeker-dashboard__portfolio-set-section">
              <h2 className="seeker-dashboard__section-title">Сертификаты</h2>
            </div>
            <div className="seeker-dashboard__portfolio-set-gallery">
              {dashboardState.certificates.map((item) => (
                <article key={item.id} className="seeker-dashboard__portfolio-set-entry">
                  <div className="seeker-dashboard__portfolio-set-entry-head">
                    {editingCertificateId === item.id ? (
                      <Input
                        className="input--secondary input--sm seeker-dashboard__portfolio-set-title-input"
                        value={certificateDraft.title}
                        onChange={(event) => setCertificateDraft((current) => ({ ...current, title: event.target.value }))}
                      />
                    ) : (
                      <h3 className="seeker-dashboard__portfolio-set-entry-title">{item.title}</h3>
                    )}
                    <div className="seeker-dashboard__portfolio-set-entry-actions">
                      {editingCertificateId === item.id ? (
                        <Button type="button" variant="secondary" size="md" className="seeker-dashboard__confirm-button" onClick={() => void handleCertificateUpdate()}>
                          {confirmIcon}
                        </Button>
                      ) : (
                        <button type="button" className="seeker-dashboard__icon-button" onClick={() => handleCertificateEdit(item)}>
                          <img src={editIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="seeker-dashboard__icon-button"
                        onClick={() =>
                          setPendingDelete({
                            kind: "certificate",
                            id: item.id,
                            title: "Удаление сертификата",
                            entityLabel: item.title || "этот сертификат",
                          })
                        }
                      >
                        <img src={deleteIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                      </button>
                    </div>
                  </div>
                  <div className="seeker-dashboard__portfolio-set-entry-body">
                    {editingCertificateId === item.id ? (
                      <>
                        {[
                          ["Организация", "organizationName"],
                          ["Дата", "issuedAt"],
                          ["Ссылка", "credentialUrl"],
                        ].map(([label, key]) => (
                          <label key={key} className="seeker-dashboard__field">
                            <span className="seeker-dashboard__portfolio-set-entry-label">{`${label}:`}</span>
                            <Input
                              className="input--secondary input--sm"
                              value={certificateDraft[key as keyof CertificateDraft]}
                              onChange={(event) =>
                                setCertificateDraft((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }))
                              }
                            />
                          </label>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className="seeker-dashboard__portfolio-set-entry-detail">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Организация:</span>
                          <p className="seeker-dashboard__paragraph">{item.organizationName}</p>
                        </div>
                        <div className="seeker-dashboard__portfolio-set-entry-detail">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Дата:</span>
                          <p className="seeker-dashboard__paragraph">{item.issuedAt}</p>
                        </div>
                        <div className="seeker-dashboard__portfolio-set-entry-detail">
                          <span className="seeker-dashboard__portfolio-set-entry-label">Ссылка:</span>
                          <a href={item.credentialUrl || "#"} className="seeker-dashboard__link-value">
                            {formatLinkLabel(item.credentialUrl, "Посмотреть")}
                          </a>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Button type="button" variant="secondary-outline" size="md" fullWidth className="seeker-dashboard__portfolio-set-button" onClick={() => setActiveModal("certificate")}>
              Добавить сертификат
            </Button>
          </div>
        </section>
      </Container>

      <Modal
        title="Добавление проекта"
        isOpen={activeModal === "project"}
        onClose={() => {
          setActiveModal(null);
          setModalProjectTechnologiesQuery("");
          if (activeSkillSelector === "project-tech") {
            setActiveSkillSelector(null);
          }
        }}
        titleAccentColor="var(--color-secondary)"
      >
        <div className="modal__form seeker-dashboard__modal-form">
          <label className="modal__field seeker-dashboard__field">
            <span className="modal__field-label seeker-dashboard__field-label">Название проекта</span>
            <Input className="input--secondary input--sm" value={modalProjectDraft.title} onChange={(event) => setModalProjectDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Название проекта" />
          </label>
          <label className="modal__field seeker-dashboard__field">
            <span className="modal__field-label seeker-dashboard__field-label">Описание</span>
            <textarea className="modal__textarea seeker-dashboard__textarea seeker-dashboard__textarea--sm" value={modalProjectDraft.description} onChange={(event) => setModalProjectDraft((current) => ({ ...current, description: event.target.value }))} rows={4} placeholder="Описание" />
          </label>
          <SkillTagSelector
            fieldRef={projectTechnologiesFieldRef}
            label="Технологии"
            placeholder="Найдите hard skill"
            selected={modalProjectTechnologyItems}
            query={modalProjectTechnologiesQuery}
            options={filteredProjectTechnologyOptions}
            isOpen={activeSkillSelector === "project-tech"}
            isLoading={tagCatalogQuery.isLoading}
            onQueryChange={(value) => {
              setModalProjectTechnologiesQuery(value);
              setActiveSkillSelector("project-tech");
            }}
            onOpen={() => setActiveSkillSelector("project-tech")}
            onSelect={addProjectTechnologyValue}
            onRemove={removeProjectTechnologyValue}
          />
          <label className="modal__field seeker-dashboard__field">
            <span className="modal__field-label seeker-dashboard__field-label">Ссылка</span>
            <Input className="input--secondary input--sm" value={modalProjectDraft.repositoryUrl} onChange={(event) => setModalProjectDraft((current) => ({ ...current, repositoryUrl: event.target.value }))} placeholder="Ссылка" />
          </label>
          <div className="modal__actions seeker-dashboard__modal-actions">
            <Button
              type="button"
              variant="secondary-outline"
              size="md"
              fullWidth
              onClick={() => {
                setActiveModal(null);
                setModalProjectTechnologiesQuery("");
                if (activeSkillSelector === "project-tech") {
                  setActiveSkillSelector(null);
                }
              }}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              fullWidth
              disabled={!isProjectModalValid}
              onClick={() => void handleProjectAdd()}
            >
              Добавить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title="Добавление достижения"
        isOpen={activeModal === "achievement"}
        onClose={() => setActiveModal(null)}
        titleAccentColor="var(--color-secondary)"
      >
        <div className="modal__form seeker-dashboard__modal-form">
          <label className="modal__field seeker-dashboard__field">
            <span className="modal__field-label seeker-dashboard__field-label">Название</span>
            <Input className="input--secondary input--sm" value={modalAchievementDraft.title} onChange={(event) => setModalAchievementDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Название" />
          </label>
          <label className="modal__field seeker-dashboard__field">
            <span className="modal__field-label seeker-dashboard__field-label">Мероприятие</span>
            <Input className="input--secondary input--sm" value={modalAchievementDraft.eventName} onChange={(event) => setModalAchievementDraft((current) => ({ ...current, eventName: event.target.value }))} placeholder="Мероприятие" />
          </label>
          <label className="modal__field seeker-dashboard__field">
            <span className="modal__field-label seeker-dashboard__field-label">Проект</span>
            <Select
              className="seeker-dashboard__select"
              variant="secondary"
              size="sm"
              placeholder={
                projectSelectOptions.length > 0
                  ? "Выберите проект"
                  : "Сначала добавьте проект"
              }
              value={modalAchievementDraft.projectName}
              options={projectSelectOptions}
              disabled={projectSelectOptions.length === 0}
              onValueChange={(value) =>
                setModalAchievementDraft((current) => ({
                  ...current,
                  projectName: value,
                }))
              }
            />
          </label>
          <label className="modal__field seeker-dashboard__field">
            <span className="modal__field-label seeker-dashboard__field-label">Награда</span>
            <Input className="input--secondary input--sm" value={modalAchievementDraft.award} onChange={(event) => setModalAchievementDraft((current) => ({ ...current, award: event.target.value }))} placeholder="Награда" />
          </label>
          <div className="modal__actions seeker-dashboard__modal-actions">
            <Button type="button" variant="secondary-outline" size="md" fullWidth onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              fullWidth
              disabled={!isAchievementModalValid}
              onClick={() => void handleAchievementAdd()}
            >
              Добавить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title="Добавление сертификата"
        isOpen={activeModal === "certificate"}
        onClose={() => setActiveModal(null)}
        titleAccentColor="var(--color-secondary)"
      >
        <div className="modal__form seeker-dashboard__modal-form">
          <label className="modal__field seeker-dashboard__field">
            <span className="modal__field-label seeker-dashboard__field-label">Название</span>
            <Input className="input--secondary input--sm" value={modalCertificateDraft.title} onChange={(event) => setModalCertificateDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Название" />
          </label>
          <label className="modal__field seeker-dashboard__field">
            <span className="modal__field-label seeker-dashboard__field-label">Организация</span>
            <Input className="input--secondary input--sm" value={modalCertificateDraft.organizationName} onChange={(event) => setModalCertificateDraft((current) => ({ ...current, organizationName: event.target.value }))} placeholder="Организация" />
          </label>
          <label className="modal__field seeker-dashboard__field">
            <span className="modal__field-label seeker-dashboard__field-label">Дата</span>
            <Input className="input--secondary input--sm" value={modalCertificateDraft.issuedAt} onChange={(event) => setModalCertificateDraft((current) => ({ ...current, issuedAt: event.target.value }))} placeholder="Дата в формате YYYY-MM-DD" />
          </label>
          <label className="modal__field seeker-dashboard__field">
            <span className="modal__field-label seeker-dashboard__field-label">Ссылка</span>
            <Input className="input--secondary input--sm" value={modalCertificateDraft.credentialUrl} onChange={(event) => setModalCertificateDraft((current) => ({ ...current, credentialUrl: event.target.value }))} placeholder="Ссылка" />
          </label>
          <div className="modal__actions seeker-dashboard__modal-actions">
            <Button type="button" variant="secondary-outline" size="md" fullWidth onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              fullWidth
              disabled={!isCertificateModalValid}
              onClick={() => void handleCertificateAdd()}
            >
              Добавить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title={
          pendingDelete?.kind === "project"
            ? "Удаление проекта"
            : pendingDelete?.kind === "achievement"
              ? "Удаление достижения"
              : pendingDelete?.kind === "certificate"
                ? "Удаление сертификата"
                : ""
        }
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        size="small"
        titleAccentColor="var(--color-danger)"
      >
        <div className="modal__body seeker-dashboard__modal-form">
          <p className="modal__text seeker-dashboard__paragraph">
            {pendingDelete?.kind === "project"
              ? `Вы уверены, что хотите удалить проект «${pendingDelete.entityLabel}»?`
              : pendingDelete?.kind === "achievement"
                ? `Вы уверены, что хотите удалить достижение «${pendingDelete.entityLabel}»?`
                : pendingDelete?.kind === "certificate"
                  ? `Вы уверены, что хотите удалить сертификат «${pendingDelete.entityLabel}»?`
                  : "Вы уверены, что хотите удалить элемент?"}
          </p>
          <div className="modal__actions seeker-dashboard__modal-actions">
            <Button type="button" variant="cancel" size="md" fullWidth onClick={() => setPendingDelete(null)}>
              Отмена
            </Button>
            <Button type="button" variant="danger" size="md" fullWidth onClick={() => void handlePendingDeleteConfirm()}>
              Удалить
            </Button>
          </div>
        </div>
      </Modal>

      <Footer theme="applicant" />
    </main>
  );
}
