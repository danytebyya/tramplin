import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import editIcon from "../../assets/icons/edit.svg";
import deleteIcon from "../../assets/icons/delete.svg";
import checkMarkIcon from "../../assets/icons/check-mark.svg";
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
  MeResponse,
  applicantDashboardRequest,
  meRequest,
  updateApplicantDashboardRequest,
  useAuthStore,
} from "../../features/auth";
import { resolveAvatarIcon } from "../../shared/lib";
import { Badge, Button, Checkbox, Container, Input, Modal, Status } from "../../shared/ui";
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

function resolveLevelStatusVariant(level: SeekerLevel) {
  if (level === "Middle") {
    return "pending-review" as const;
  }

  if (level === "Senior") {
    return "rejected" as const;
  }

  return "approved" as const;
}

function normalizeStringArray(value?: string[] | null) {
  return (value ?? []).map((item) => item.trim()).filter(Boolean);
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
  const fields = [
    formState.fullName,
    formState.email,
    formState.university,
    formState.course,
    formState.graduationYear,
    state.profile.about,
    state.profile.desiredSalaryFrom,
    state.profile.level,
    state.profile.hardSkills.join(","),
    state.profile.portfolioUrl,
  ];
  const filledCount = fields.filter((value) => value.trim().length > 0).length;
  return Math.round((filledCount / fields.length) * 100);
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

function splitTagInput(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveOptionalEntityId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
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

  const [headerCity, setHeaderCity] = useState(() => readSelectedCityCookie() ?? "");
  const [dashboardState, setDashboardState] = useState<DashboardState | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(EMPTY_PROFILE_FORM);
  const [displayedProfileCompletion, setDisplayedProfileCompletion] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  const [activeEditor, setActiveEditor] = useState<SectionMode>(null);
  const [aboutDraft, setAboutDraft] = useState("");
  const [skillsDraft, setSkillsDraft] = useState({
    level: "Junior" as SeekerLevel,
    hardSkillsText: "",
    softSkillsText: "",
    languagesText: "",
  });
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
  const [modalProjectDraft, setModalProjectDraft] = useState<ProjectDraft>(EMPTY_PROJECT_DRAFT);
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

  const saveDashboardMutation = useMutation({
    mutationFn: updateApplicantDashboardRequest,
  });

  const user = meQuery.data?.data?.user;
  const profileMenuItems = buildApplicantProfileMenuItems(navigate);
  const applicantAvatar = resolveAvatarIcon("applicant");
  const profilePublicId = user?.public_id ?? user?.id ?? "000000";
  const confirmIcon = <img src={checkMarkIcon} alt="" aria-hidden="true" className="seeker-dashboard__confirm-icon" />;

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
    setSkillsDraft({
      level: nextState.profile.level,
      hardSkillsText: nextState.profile.hardSkills.join(", "),
      softSkillsText: nextState.profile.softSkills.join(", "),
      languagesText: nextState.profile.languages.join(", "),
    });
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
    if (!isCityDropdownOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!cityFieldRef.current?.contains(event.target as Node)) {
        setIsCityDropdownOpen(false);
      }

      if (!universityFieldRef.current?.contains(event.target as Node)) {
        setIsUniversityDropdownOpen(false);
      }

      if (!preferredLocationFieldRef.current?.contains(event.target as Node)) {
        setIsPreferredLocationDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isCityDropdownOpen]);

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

  async function persistDashboard(nextState: DashboardState, options?: { syncHeaderCity?: boolean }) {
    const response = await saveDashboardMutation.mutateAsync(buildPayload(nextState));
    const nextDashboard = buildDashboardState(response.data, meQuery.data?.data?.user);

    setDashboardState(nextDashboard);
    setAboutDraft(nextDashboard.profile.about);
    setSkillsDraft({
      level: nextDashboard.profile.level,
      hardSkillsText: nextDashboard.profile.hardSkills.join(", "),
      softSkillsText: nextDashboard.profile.softSkills.join(", "),
      languagesText: nextDashboard.profile.languages.join(", "),
    });
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
          hardSkills: splitTagInput(skillsDraft.hardSkillsText),
          softSkills: splitTagInput(skillsDraft.softSkillsText),
          languages: splitTagInput(skillsDraft.languagesText),
        },
      });
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
    try {
      await persistDashboard({
        ...dashboardState,
        projects: dashboardState.projects.map((item) =>
          item.id === editingProjectId
            ? { id: item.id, ...projectDraft }
            : item,
        ),
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
    try {
      await persistDashboard({
        ...dashboardState,
        projects: dashboardState.projects.filter((item) => item.id !== projectId),
      });
    } catch {
      setSaveError("Не удалось удалить проект.");
    }
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
    } catch {
      setSaveError("Не удалось добавить проект.");
    }
  };

  const handleAchievementAdd = async () => {
    if (!dashboardState || !modalAchievementDraft.title.trim()) {
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
        containerClassName="home-page__container"
        profileMenuItems={profileMenuItems}
        theme="applicant"
        city={headerCity || "Выберите город"}
        onCityChange={(city: CitySelection) => {
          setHeaderCity(city.name);
          writeSelectedCityCookie(city.name);
        }}
      />

      <Container className="seeker-dashboard__container">
        <nav className="seeker-dashboard__tabs" aria-label="Разделы профиля соискателя">
          <button type="button" className="seeker-dashboard__tab seeker-dashboard__tab--active">
            Профиль
          </button>
          <button type="button" className="seeker-dashboard__tab">Мои отклики</button>
          <button type="button" className="seeker-dashboard__tab">Избранное</button>
          <button type="button" className="seeker-dashboard__tab" onClick={() => navigate("/networking")}>
            Нетворкинг
          </button>
          <button type="button" className="seeker-dashboard__tab" onClick={() => navigate("/settings")}>
            Настройки
          </button>
        </nav>

        <section className="seeker-dashboard__profile">
          <div className="seeker-dashboard__profile-grid">
            <section className="seeker-dashboard__form-panel">
              <div className="seeker-dashboard__identity">
                <p className="seeker-dashboard__profile-id">{`ID:${profilePublicId}`}</p>
                <div className="seeker-dashboard__avatar-block">
                  <span className="seeker-dashboard__avatar-shell">
                    <img src={applicantAvatar} alt="" aria-hidden="true" className="seeker-dashboard__avatar-image" />
                  </span>
                  <Button type="button" variant="secondary-ghost" size="md" className="seeker-dashboard__avatar-action">
                    <span className="seeker-dashboard__avatar-action-content">Изменить аватар</span>
                  </Button>
                </div>
              </div>

              <div className="seeker-dashboard__form-grid">
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
                loading={saveDashboardMutation.isPending}
                disabled={saveDashboardMutation.isPending || !hasUnsavedProfileChanges}
                className="seeker-dashboard__save-button"
                onClick={() => void handleProfileSave()}
              >
                Сохранить изменения
              </Button>
            </section>

            <aside className="seeker-dashboard__summary-column">
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
                  <div className="seeker-dashboard__metric-row">
                    <dt>Просмотров профиля:</dt>
                    <dd>{dashboardState.stats.profileViewsCount}</dd>
                  </div>
                  <div className="seeker-dashboard__metric-row">
                    <dt>Отправлено откликов:</dt>
                    <dd>{dashboardState.stats.applicationsCount}</dd>
                  </div>
                  <div className="seeker-dashboard__metric-row">
                    <dt>Получено ответов:</dt>
                    <dd>{dashboardState.stats.responsesCount}</dd>
                  </div>
                  <div className="seeker-dashboard__metric-row">
                    <dt>Приглашений:</dt>
                    <dd>{dashboardState.stats.invitationsCount}</dd>
                  </div>
                  <div className="seeker-dashboard__metric-row">
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
                      <div className="seeker-dashboard__choice-grid">
                        {EMPLOYMENT_OPTIONS.map((option) => (
                          <label key={option} className="seeker-dashboard__choice-item">
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
                      <div className="seeker-dashboard__choice-grid">
                        {WORK_FORMAT_OPTIONS.map((option) => (
                          <label key={option} className="seeker-dashboard__choice-item">
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
          <div className="seeker-dashboard__portfolio-grid">
            <article className="seeker-dashboard__content-card seeker-dashboard__content-card--links">
              <div className="seeker-dashboard__content-card-head">
                <h3 className="seeker-dashboard__content-card-title">О себе</h3>
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
              <div className="seeker-dashboard__content-card-body">
                {activeEditor === "about" ? (
                  <textarea
                    className="seeker-dashboard__textarea"
                    value={aboutDraft}
                    onChange={(event) => setAboutDraft(event.target.value)}
                    rows={12}
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

            <article className="seeker-dashboard__content-card">
              <div className="seeker-dashboard__content-card-head">
                <h3 className="seeker-dashboard__content-card-title">Навыки</h3>
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
                      setSkillsDraft({
                        level: dashboardState.profile.level,
                        hardSkillsText: dashboardState.profile.hardSkills.join(", "),
                        softSkillsText: dashboardState.profile.softSkills.join(", "),
                        languagesText: dashboardState.profile.languages.join(", "),
                      });
                      setActiveEditor("skills");
                    }}
                  >
                    <img src={editIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                  </button>
                )}
              </div>
              <div className="seeker-dashboard__content-card-body seeker-dashboard__content-card-body--stacked">
                {activeEditor === "skills" ? (
                  <>
                    <div className="seeker-dashboard__skill-group">
                      <span className="seeker-dashboard__skill-title">Уровень</span>
                      <div className="seeker-dashboard__choice-grid">
                        {(["Junior", "Middle", "Senior"] as SeekerLevel[]).map((level) => (
                          <label key={level} className="seeker-dashboard__choice-item">
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
                    <label className="seeker-dashboard__field">
                      <span className="seeker-dashboard__field-label">Hard skills</span>
                      <Input
                        className="input--secondary input--sm"
                        value={skillsDraft.hardSkillsText}
                        onChange={(event) =>
                          setSkillsDraft((current) => ({ ...current, hardSkillsText: event.target.value }))
                        }
                        placeholder="Через запятую"
                      />
                    </label>
                    <label className="seeker-dashboard__field">
                      <span className="seeker-dashboard__field-label">Soft skills</span>
                      <Input
                        className="input--secondary input--sm"
                        value={skillsDraft.softSkillsText}
                        onChange={(event) =>
                          setSkillsDraft((current) => ({ ...current, softSkillsText: event.target.value }))
                        }
                        placeholder="Через запятую"
                      />
                    </label>
                    <label className="seeker-dashboard__field">
                      <span className="seeker-dashboard__field-label">Языки</span>
                      <Input
                        className="input--secondary input--sm"
                        value={skillsDraft.languagesText}
                        onChange={(event) =>
                          setSkillsDraft((current) => ({ ...current, languagesText: event.target.value }))
                        }
                        placeholder="Через запятую"
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <div className="seeker-dashboard__skill-group">
                      <span className="seeker-dashboard__skill-title">Уровень</span>
                      <Status variant={resolveLevelStatusVariant(dashboardState.profile.level)}>
                        {dashboardState.profile.level}
                      </Status>
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

            <article className="seeker-dashboard__content-card">
              <div className="seeker-dashboard__content-card-head">
                <h3 className="seeker-dashboard__content-card-title">Ссылки на репозитории</h3>
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
              <div className="seeker-dashboard__content-card-body seeker-dashboard__content-card-body--stacked">
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
                    <div className="seeker-dashboard__link-block">
                      <span className="seeker-dashboard__link-label">GitHub</span>
                      <a href={dashboardState.profile.githubUrl || "#"} className="seeker-dashboard__link-value">
                        {formatLinkLabel(dashboardState.profile.githubUrl, "github.com")}
                      </a>
                    </div>
                    <div className="seeker-dashboard__link-block">
                      <span className="seeker-dashboard__link-label">GitLab</span>
                      <a href={dashboardState.profile.gitlabUrl || "#"} className="seeker-dashboard__link-value">
                        {formatLinkLabel(dashboardState.profile.gitlabUrl, "gitlab.com")}
                      </a>
                    </div>
                    <div className="seeker-dashboard__link-block">
                      <span className="seeker-dashboard__link-label">Bitbucket</span>
                      <a href={dashboardState.profile.bitbucketUrl || "#"} className="seeker-dashboard__link-value">
                        {formatLinkLabel(dashboardState.profile.bitbucketUrl, "bitbucket.org")}
                      </a>
                    </div>
                    <div className="seeker-dashboard__link-block">
                      <span className="seeker-dashboard__link-label">LinkedIn</span>
                      <a href={dashboardState.profile.linkedinUrl || "#"} className="seeker-dashboard__link-value">
                        {formatLinkLabel(dashboardState.profile.linkedinUrl, "linkedin.com")}
                      </a>
                    </div>
                    <div className="seeker-dashboard__link-block">
                      <span className="seeker-dashboard__link-label">Портфолио</span>
                      <a href={dashboardState.profile.portfolioUrl || "#"} className="seeker-dashboard__link-value">
                        {formatLinkLabel(dashboardState.profile.portfolioUrl, "portfolio.example")}
                      </a>
                    </div>
                    <div className="seeker-dashboard__link-block">
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
          <div className="seeker-dashboard__collection seeker-dashboard__collection--combined">
            <div className="seeker-dashboard__collection-section">
              <h2 className="seeker-dashboard__section-title">Опыт проектов</h2>
            </div>
            <div className="seeker-dashboard__collection-grid">
              {dashboardState.projects.map((project) => (
                <article key={project.id} className="seeker-dashboard__collection-card">
                  <div className="seeker-dashboard__collection-card-head">
                    {editingProjectId === project.id ? (
                      <Input
                        className="input--secondary input--sm seeker-dashboard__collection-title-input"
                        value={projectDraft.title}
                        onChange={(event) => setProjectDraft((current) => ({ ...current, title: event.target.value }))}
                      />
                    ) : (
                      <h3 className="seeker-dashboard__collection-card-title">{project.title}</h3>
                    )}
                    <div className="seeker-dashboard__collection-card-actions">
                      {editingProjectId === project.id ? (
                        <Button type="button" variant="secondary" size="md" className="seeker-dashboard__confirm-button" onClick={() => void handleProjectUpdate()}>
                          {confirmIcon}
                        </Button>
                      ) : (
                        <button type="button" className="seeker-dashboard__icon-button" onClick={() => handleProjectEdit(project)}>
                          <img src={editIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                        </button>
                      )}
                      <button type="button" className="seeker-dashboard__icon-button" onClick={() => void handleProjectDelete(project.id)}>
                        <img src={deleteIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                      </button>
                    </div>
                  </div>
                  <div className="seeker-dashboard__collection-card-body">
                    {editingProjectId === project.id ? (
                      <>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__collection-card-label">Описание:</span>
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
                          <span className="seeker-dashboard__collection-card-label">Технологии:</span>
                          <Input
                            className="input--secondary input--sm"
                            value={projectDraft.technologies}
                            onChange={(event) =>
                              setProjectDraft((current) => ({ ...current, technologies: event.target.value }))
                            }
                          />
                        </label>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__collection-card-label">Период:</span>
                          <Input
                            className="input--secondary input--sm"
                            value={projectDraft.periodLabel}
                            onChange={(event) =>
                              setProjectDraft((current) => ({ ...current, periodLabel: event.target.value }))
                            }
                          />
                        </label>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__collection-card-label">Роль:</span>
                          <Input
                            className="input--secondary input--sm"
                            value={projectDraft.roleName}
                            onChange={(event) =>
                              setProjectDraft((current) => ({ ...current, roleName: event.target.value }))
                            }
                          />
                        </label>
                        <label className="seeker-dashboard__field">
                          <span className="seeker-dashboard__collection-card-label">Ссылка:</span>
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
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Описание:</span>
                          <p className="seeker-dashboard__paragraph">{project.description}</p>
                        </div>
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Технологии:</span>
                          <p className="seeker-dashboard__paragraph">{project.technologies}</p>
                          <p className="seeker-dashboard__paragraph">{`Период: ${project.periodLabel}`}</p>
                          <p className="seeker-dashboard__paragraph">{`Роль: ${project.roleName}`}</p>
                        </div>
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Ссылка:</span>
                          <p className="seeker-dashboard__paragraph">{project.repositoryUrl}</p>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Button type="button" variant="secondary-outline" size="md" fullWidth className="seeker-dashboard__collection-button" onClick={() => setActiveModal("project")}>
              Добавить проект
            </Button>

            <div className="seeker-dashboard__collection-section">
              <h2 className="seeker-dashboard__section-title">Достижения</h2>
            </div>
            <div className="seeker-dashboard__collection-grid">
              {dashboardState.achievements.map((item) => (
                <article key={item.id} className="seeker-dashboard__collection-card">
                  <div className="seeker-dashboard__collection-card-head">
                    {editingAchievementId === item.id ? (
                      <Input
                        className="input--secondary input--sm seeker-dashboard__collection-title-input"
                        value={achievementDraft.title}
                        onChange={(event) => setAchievementDraft((current) => ({ ...current, title: event.target.value }))}
                      />
                    ) : (
                      <h3 className="seeker-dashboard__collection-card-title">{item.title}</h3>
                    )}
                    <div className="seeker-dashboard__collection-card-actions">
                      {editingAchievementId === item.id ? (
                        <Button type="button" variant="secondary" size="md" className="seeker-dashboard__confirm-button" onClick={() => void handleAchievementUpdate()}>
                          {confirmIcon}
                        </Button>
                      ) : (
                        <button type="button" className="seeker-dashboard__icon-button" onClick={() => handleAchievementEdit(item)}>
                          <img src={editIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                        </button>
                      )}
                      <button type="button" className="seeker-dashboard__icon-button" onClick={() => void handleAchievementDelete(item.id)}>
                        <img src={deleteIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                      </button>
                    </div>
                  </div>
                  <div className="seeker-dashboard__collection-card-body">
                    {editingAchievementId === item.id ? (
                      <>
                        {[
                          ["Мероприятие", "eventName"],
                          ["Проект", "projectName"],
                          ["Награда", "award"],
                        ].map(([label, key]) => (
                          <label key={key} className="seeker-dashboard__field">
                            <span className="seeker-dashboard__collection-card-label">{`${label}:`}</span>
                            <Input
                              className="input--secondary input--sm"
                              value={achievementDraft[key as keyof AchievementDraft]}
                              onChange={(event) =>
                                setAchievementDraft((current) => ({
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
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Мероприятие:</span>
                          <p className="seeker-dashboard__paragraph">{item.eventName}</p>
                        </div>
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Проект:</span>
                          <p className="seeker-dashboard__paragraph">{item.projectName}</p>
                        </div>
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Награда:</span>
                          <p className="seeker-dashboard__paragraph">{item.award}</p>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Button type="button" variant="secondary-outline" size="md" fullWidth className="seeker-dashboard__collection-button" onClick={() => setActiveModal("achievement")}>
              Добавить достижение
            </Button>

            <div className="seeker-dashboard__collection-section">
              <h2 className="seeker-dashboard__section-title">Сертификаты</h2>
            </div>
            <div className="seeker-dashboard__collection-grid">
              {dashboardState.certificates.map((item) => (
                <article key={item.id} className="seeker-dashboard__collection-card">
                  <div className="seeker-dashboard__collection-card-head">
                    {editingCertificateId === item.id ? (
                      <Input
                        className="input--secondary input--sm seeker-dashboard__collection-title-input"
                        value={certificateDraft.title}
                        onChange={(event) => setCertificateDraft((current) => ({ ...current, title: event.target.value }))}
                      />
                    ) : (
                      <h3 className="seeker-dashboard__collection-card-title">{item.title}</h3>
                    )}
                    <div className="seeker-dashboard__collection-card-actions">
                      {editingCertificateId === item.id ? (
                        <Button type="button" variant="secondary" size="md" className="seeker-dashboard__confirm-button" onClick={() => void handleCertificateUpdate()}>
                          {confirmIcon}
                        </Button>
                      ) : (
                        <button type="button" className="seeker-dashboard__icon-button" onClick={() => handleCertificateEdit(item)}>
                          <img src={editIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                        </button>
                      )}
                      <button type="button" className="seeker-dashboard__icon-button" onClick={() => void handleCertificateDelete(item.id)}>
                        <img src={deleteIcon} alt="" aria-hidden="true" className="seeker-dashboard__icon" />
                      </button>
                    </div>
                  </div>
                  <div className="seeker-dashboard__collection-card-body">
                    {editingCertificateId === item.id ? (
                      <>
                        {[
                          ["Организация", "organizationName"],
                          ["Дата", "issuedAt"],
                          ["Ссылка", "credentialUrl"],
                        ].map(([label, key]) => (
                          <label key={key} className="seeker-dashboard__field">
                            <span className="seeker-dashboard__collection-card-label">{`${label}:`}</span>
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
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Организация:</span>
                          <p className="seeker-dashboard__paragraph">{item.organizationName}</p>
                        </div>
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Дата:</span>
                          <p className="seeker-dashboard__paragraph">{item.issuedAt}</p>
                        </div>
                        <div className="seeker-dashboard__collection-card-detail">
                          <span className="seeker-dashboard__collection-card-label">Ссылка:</span>
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
            <Button type="button" variant="secondary-outline" size="md" fullWidth className="seeker-dashboard__collection-button" onClick={() => setActiveModal("certificate")}>
              Добавить сертификат
            </Button>
          </div>
        </section>
      </Container>

      <Modal title="Добавить проект" isOpen={activeModal === "project"} onClose={() => setActiveModal(null)}>
        <div className="seeker-dashboard__modal-form">
          <Input className="input--secondary input--sm" value={modalProjectDraft.title} onChange={(event) => setModalProjectDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Название проекта" />
          <textarea className="seeker-dashboard__textarea seeker-dashboard__textarea--sm" value={modalProjectDraft.description} onChange={(event) => setModalProjectDraft((current) => ({ ...current, description: event.target.value }))} rows={4} placeholder="Описание" />
          <Input className="input--secondary input--sm" value={modalProjectDraft.technologies} onChange={(event) => setModalProjectDraft((current) => ({ ...current, technologies: event.target.value }))} placeholder="Технологии" />
          <Input className="input--secondary input--sm" value={modalProjectDraft.periodLabel} onChange={(event) => setModalProjectDraft((current) => ({ ...current, periodLabel: event.target.value }))} placeholder="Период" />
          <Input className="input--secondary input--sm" value={modalProjectDraft.roleName} onChange={(event) => setModalProjectDraft((current) => ({ ...current, roleName: event.target.value }))} placeholder="Роль" />
          <Input className="input--secondary input--sm" value={modalProjectDraft.repositoryUrl} onChange={(event) => setModalProjectDraft((current) => ({ ...current, repositoryUrl: event.target.value }))} placeholder="Ссылка" />
          <Button type="button" variant="secondary" size="md" onClick={() => void handleProjectAdd()}>
            Сохранить
          </Button>
        </div>
      </Modal>

      <Modal title="Добавить достижение" isOpen={activeModal === "achievement"} onClose={() => setActiveModal(null)}>
        <div className="seeker-dashboard__modal-form">
          <Input className="input--secondary input--sm" value={modalAchievementDraft.title} onChange={(event) => setModalAchievementDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Название" />
          <Input className="input--secondary input--sm" value={modalAchievementDraft.eventName} onChange={(event) => setModalAchievementDraft((current) => ({ ...current, eventName: event.target.value }))} placeholder="Мероприятие" />
          <Input className="input--secondary input--sm" value={modalAchievementDraft.projectName} onChange={(event) => setModalAchievementDraft((current) => ({ ...current, projectName: event.target.value }))} placeholder="Проект" />
          <Input className="input--secondary input--sm" value={modalAchievementDraft.award} onChange={(event) => setModalAchievementDraft((current) => ({ ...current, award: event.target.value }))} placeholder="Награда" />
          <Button type="button" variant="secondary" size="md" onClick={() => void handleAchievementAdd()}>
            Сохранить
          </Button>
        </div>
      </Modal>

      <Modal title="Добавить сертификат" isOpen={activeModal === "certificate"} onClose={() => setActiveModal(null)}>
        <div className="seeker-dashboard__modal-form">
          <Input className="input--secondary input--sm" value={modalCertificateDraft.title} onChange={(event) => setModalCertificateDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Название" />
          <Input className="input--secondary input--sm" value={modalCertificateDraft.organizationName} onChange={(event) => setModalCertificateDraft((current) => ({ ...current, organizationName: event.target.value }))} placeholder="Организация" />
          <Input className="input--secondary input--sm" value={modalCertificateDraft.issuedAt} onChange={(event) => setModalCertificateDraft((current) => ({ ...current, issuedAt: event.target.value }))} placeholder="Дата в формате YYYY-MM-DD" />
          <Input className="input--secondary input--sm" value={modalCertificateDraft.credentialUrl} onChange={(event) => setModalCertificateDraft((current) => ({ ...current, credentialUrl: event.target.value }))} placeholder="Ссылка" />
          <Button type="button" variant="secondary" size="md" onClick={() => void handleCertificateAdd()}>
            Сохранить
          </Button>
        </div>
      </Modal>

      <Footer theme="applicant" />
    </main>
  );
}
