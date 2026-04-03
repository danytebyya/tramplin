import { ChangeEvent, FocusEvent, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, UNSAFE_NavigationContext, useNavigate } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import sadSearchIcon from "../../assets/icons/sad-search.png";
import {
  CitySelection,
  readRecentAddressQueriesCookie,
  readSelectedCityCookie,
  writeLastAddressQueryCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import { AddressSuggestion, getAddressSuggestions } from "../../features/city-selector/api";
import {
  deleteEmployerAvatar,
  getEmployerVerificationDraft,
  uploadEmployerAvatar,
  upsertEmployerProfile,
} from "../../features/company-verification";
import {
  getEmployerAccessState,
  MeResponse,
  meRequest,
  resolveEmployerFallbackRoute,
  useAuthStore,
} from "../../features/auth";
import { listEmployerOpportunitiesRequest } from "../../features/opportunity";
import type { Opportunity } from "../../entities/opportunity";
import { resolveAvatarIcon, resolveAvatarUrl } from "../../shared/lib";
import { Button, Container, Input, Modal, ProfileTabs, VerifiedTooltip } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { OpportunityFilters } from "../../widgets/filters";
import { buildEmployerProfileMenuItems, Header } from "../../widgets/header";
import { MapView } from "../../widgets/map-view";
import { OpportunityList } from "../../widgets/opportunity-list";
import "./employer-dashboard.css";

type EmployerProfileFormState = {
  companyName: string;
  inn: string;
  corporateEmail: string;
  shortDescription: string;
  officeAddresses: string[];
  activityAreas: string[];
  organizationSize: string;
  foundationYear: string;
  website: string;
  phone: string;
  socialLink: string;
  maxLink: string;
  rutubeLink: string;
};

const EMPTY_FORM_STATE: EmployerProfileFormState = {
  companyName: "",
  inn: "",
  corporateEmail: "",
  shortDescription: "",
  officeAddresses: [],
  activityAreas: [],
  organizationSize: "",
  foundationYear: "",
  website: "",
  phone: "",
  socialLink: "",
  maxLink: "",
  rutubeLink: "",
};

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
    case "unverified":
    default:
      return "employer-dashboard__summary-value employer-dashboard__summary-value--unpublished";
  }
}

function buildEmployerFormState(
  employerProfile: NonNullable<NonNullable<MeResponse["data"]>["user"]>["employer_profile"] | null | undefined,
  verificationDraft?: {
    website?: string | null;
    phone?: string | null;
    social_link?: string | null;
  },
): EmployerProfileFormState {
  return {
    companyName: employerProfile?.company_name?.trim() ?? "",
    inn: employerProfile?.inn?.trim() ?? "",
    corporateEmail: "",
    shortDescription: employerProfile?.short_description?.trim() ?? "",
    officeAddresses: employerProfile?.office_addresses ?? [],
    activityAreas: employerProfile?.activity_areas ?? [],
    organizationSize: employerProfile?.organization_size?.trim() ?? "",
    foundationYear: employerProfile?.foundation_year ? String(employerProfile.foundation_year) : "",
    website: verificationDraft?.website?.trim() ?? employerProfile?.website?.trim() ?? "",
    phone: verificationDraft?.phone?.trim() ?? "",
    socialLink: verificationDraft?.social_link?.trim() ?? employerProfile?.social_link?.trim() ?? "",
    maxLink: employerProfile?.max_link?.trim() ?? "",
    rutubeLink: employerProfile?.rutube_link?.trim() ?? "",
  };
}

function normalizeOptionalValue(value: string) {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function isSuggestionFromCity(item: AddressSuggestion, cityName?: string) {
  const normalizedCityName = normalizeSearchText(cityName ?? "");

  if (!normalizedCityName) {
    return false;
  }

  return normalizeSearchText(item.fullAddress).includes(normalizedCityName);
}

function mapEmployerOpportunityToFeedOpportunity(
  item: import("../../features/opportunity").EmployerOpportunityItem,
  options: {
    employerId: string;
    employerPublicId: string | null;
    companyVerified: boolean;
  },
): Opportunity {
  return {
    id: item.id,
    employerId: options.employerId,
    employerPublicId: options.employerPublicId,
    title: item.title,
    companyName: item.companyName,
    companyVerified: options.companyVerified,
    companyRating: null,
    companyReviewsCount: 0,
    salaryLabel: item.salaryLabel,
    locationLabel: item.locationLabel,
    format: item.format === "offline" ? "office" : item.format === "online" ? "remote" : "hybrid",
    kind: item.kind,
    levelLabel: item.levelLabel,
    employmentLabel: item.employmentLabel,
    description: item.description,
    tags: item.tags,
    latitude: item.latitude,
    longitude: item.longitude,
    accent:
      item.kind === "internship"
        ? "cyan"
        : item.kind === "event"
          ? "amber"
          : item.kind === "mentorship"
            ? "slate"
            : "blue",
    businessStatus:
      item.status === "active" ? "active" : item.status === "planned" ? "scheduled" : item.status === "removed" ? "archived" : "draft",
    moderationStatus:
      item.status === "pending_review"
        ? "pending_review"
        : item.status === "rejected"
          ? "rejected"
          : "approved",
  };
}

export function EmployerDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const navigationContext = useContext(UNSAFE_NavigationContext);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
  const [formState, setFormState] = useState<EmployerProfileFormState>(EMPTY_FORM_STATE);
  const [isFormInitialized, setIsFormInitialized] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [isAvatarMarkedForDeletion, setIsAvatarMarkedForDeletion] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const organizationSizeInputRef = useRef<HTMLInputElement | null>(null);
  const foundationYearInputRef = useRef<HTMLInputElement | null>(null);
  const officeFieldRef = useRef<HTMLDivElement | null>(null);
  const officeAddressInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const activityAreaInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [activeOfficeAddressIndex, setActiveOfficeAddressIndex] = useState<number | null>(null);
  const [officeAddressSuggestions, setOfficeAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOfficeAddressSuggestionsOpen, setIsOfficeAddressSuggestionsOpen] = useState(false);
  const [isOfficeAddressSuggestionsLoading, setIsOfficeAddressSuggestionsLoading] = useState(false);
  const [recentAddressQueries, setRecentAddressQueries] = useState<string[]>(() => readRecentAddressQueriesCookie());
  const [pendingOfficeAddressFocusIndex, setPendingOfficeAddressFocusIndex] = useState<number | null>(null);
  const [pendingActivityAreaFocusIndex, setPendingActivityAreaFocusIndex] = useState<number | null>(null);
  const [editingSummaryField, setEditingSummaryField] = useState<"organizationSize" | "foundationYear" | null>(null);
  const [displayedProfileCompletion, setDisplayedProfileCompletion] = useState(0);
  const [isLeaveConfirmModalOpen, setIsLeaveConfirmModalOpen] = useState(false);
  const [opportunityViewMode, setOpportunityViewMode] = useState<"map" | "list">("map");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const pendingNavigationTxRef = useRef<{ retry: () => void } | null>(null);
  const employerAccess = getEmployerAccessState(role, accessToken);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    enabled: Boolean(accessToken),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const verificationDraftQuery = useQuery({
    queryKey: ["companies", "verification-draft"],
    queryFn: getEmployerVerificationDraft,
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  });
  const employerOpportunitiesQuery = useQuery({
    queryKey: ["employer", "opportunities"],
    queryFn: listEmployerOpportunitiesRequest,
    enabled: Boolean(accessToken),
    staleTime: 60_000,
  });

  const saveEmployerProfileMutation = useMutation({
    mutationFn: upsertEmployerProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries({ queryKey: ["companies", "verification-draft"] });
      await queryClient.refetchQueries({ queryKey: ["auth", "me"], type: "active" });
      await queryClient.refetchQueries({ queryKey: ["companies", "verification-draft"], type: "active" });
    },
  });
  const uploadEmployerAvatarMutation = useMutation({
    mutationFn: uploadEmployerAvatar,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.refetchQueries({ queryKey: ["auth", "me"], type: "active" });
      setAvatarPreviewUrl(null);
    },
  });
  const deleteEmployerAvatarMutation = useMutation({
    mutationFn: deleteEmployerAvatar,
  });

  if (role !== "employer") {
    return <Navigate to="/" replace />;
  }

  if (!employerAccess.canManageCompanyProfile) {
    return <Navigate to={resolveEmployerFallbackRoute(employerAccess)} replace />;
  }

  const profileMenuItems = buildEmployerProfileMenuItems(navigate, employerAccess);

  const handleCityChange = (nextCity: CitySelection) => {
    setSelectedCity(nextCity.name);
    writeSelectedCityCookie(nextCity.name);
  };

  const employerProfile = meQuery.data?.data?.user?.employer_profile;
  const persistedEmployerAvatarUrl = resolveAvatarUrl(employerProfile?.avatar_url);
  const employerPublicId = meQuery.data?.data?.user?.public_id?.trim() || meQuery.data?.data?.user?.id;
  const verificationDraft = verificationDraftQuery.data?.data;
  const verificationStatus = employerProfile?.verification_status;
  const isVerified = verificationStatus === "verified";
  const preferredCity = meQuery.data?.data?.user?.preferred_city?.trim() || selectedCity;
  const opportunities = employerOpportunitiesQuery.data ?? [];
  const employerId = employerProfile?.inn?.trim() || meQuery.data?.data?.user?.id || "current-employer";
  const normalizedEmployerPublicId = employerPublicId ?? null;
  const activeOpportunitiesCount = opportunities.filter((item) => item.status === "active").length;
  const responsesCount = opportunities.reduce((total, item) => total + item.responsesCount, 0);
  const visibleEmployerOpportunities = useMemo(
    () => opportunities.filter((item) => item.status === "active" || item.status === "planned"),
    [opportunities],
  );
  const mappedEmployerFeedOpportunities = useMemo(
    () =>
      visibleEmployerOpportunities.map((item) =>
        mapEmployerOpportunityToFeedOpportunity(item, {
          employerId,
          employerPublicId: normalizedEmployerPublicId,
          companyVerified: isVerified,
        }),
      ),
    [employerId, isVerified, normalizedEmployerPublicId, visibleEmployerOpportunities],
  );
  const filteredEmployerFeedOpportunities = mappedEmployerFeedOpportunities;
  const profileCompletionFields = [
    formState.companyName,
    formState.inn,
    formState.corporateEmail.trim() || employerProfile?.corporate_email,
    formState.shortDescription,
    formState.organizationSize,
    formState.foundationYear,
    formState.website,
    formState.socialLink,
    formState.officeAddresses.some((item) => item.trim()),
    formState.activityAreas.some((item) => item.trim()),
  ];
  const profileCompletion = Math.round(
    (
      profileCompletionFields.filter((item) =>
        typeof item === "string" ? Boolean(item.trim()) : Boolean(item),
      ).length /
      profileCompletionFields.length
    ) * 100,
  );
  const initialFormState = buildEmployerFormState(employerProfile ?? null, verificationDraft);
  const profileSeed = JSON.stringify(initialFormState);
  const currentFormSeed = JSON.stringify(formState);
  const hasPendingAvatarChanges = Boolean(pendingAvatarFile) || isAvatarMarkedForDeletion;
  const hasUnsavedChanges = (isFormInitialized && currentFormSeed !== profileSeed) || hasPendingAvatarChanges;

  useEffect(() => {
    if (
      selectedOpportunityId &&
      !filteredEmployerFeedOpportunities.some((item) => item.id === selectedOpportunityId)
    ) {
      setSelectedOpportunityId(null);
    }
  }, [filteredEmployerFeedOpportunities, selectedOpportunityId]);

  useEffect(() => {
    if (!employerProfile || isFormInitialized) {
      return;
    }

    setFormState(initialFormState);
    setIsFormInitialized(true);
  }, [employerProfile, initialFormState, isFormInitialized, verificationDraft, profileSeed]);

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
  }, [profileCompletion]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    const navigator = navigationContext.navigator as { block?: (blocker: (tx: { retry: () => void }) => void) => () => void };
    if (typeof navigator.block !== "function") {
      return;
    }

    const unblock = navigator.block((tx) => {
      pendingNavigationTxRef.current = tx;
      setIsLeaveConfirmModalOpen(true);
    });

    return unblock;
  }, [hasUnsavedChanges, navigationContext.navigator]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  const isProfileLoading = meQuery.isLoading || verificationDraftQuery.isLoading;
  const saveErrorMessage = "Не удалось сохранить изменения";

  const isSaveDisabled =
    saveEmployerProfileMutation.isPending ||
    !formState.companyName.trim() ||
    !formState.inn.trim() ||
    !hasUnsavedChanges;

  const handleInputChange =
    (field: keyof EmployerProfileFormState) => (event: ChangeEvent<HTMLInputElement>) => {
      setFormState((currentValue) => ({
        ...currentValue,
        [field]: event.target.value,
      }));
    };

  const handleShortDescriptionChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setFormState((currentValue) => ({
      ...currentValue,
      shortDescription: event.target.value,
    }));
  };

  const handleOfficeAddressChange = (index: number) => (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;

    setFormState((currentValue) => ({
      ...currentValue,
      officeAddresses: currentValue.officeAddresses.map((address, addressIndex) =>
        addressIndex === index ? nextValue : address,
      ),
    }));
    setActiveOfficeAddressIndex(index);
    setIsOfficeAddressSuggestionsOpen(true);
  };

  const handleAddOfficeAddress = () => {
    setFormState((currentValue) => ({
      ...currentValue,
      officeAddresses: [...currentValue.officeAddresses, ""],
    }));
    setPendingOfficeAddressFocusIndex(formState.officeAddresses.length);
    setActiveOfficeAddressIndex(formState.officeAddresses.length);
    setIsOfficeAddressSuggestionsOpen(false);
  };

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    if (pendingOfficeAddressFocusIndex === null) {
      return;
    }

    officeAddressInputRefs.current[pendingOfficeAddressFocusIndex]?.focus();
    setPendingOfficeAddressFocusIndex(null);
  }, [formState.officeAddresses.length, pendingOfficeAddressFocusIndex]);

  useEffect(() => {
    if (pendingActivityAreaFocusIndex === null) {
      return;
    }

    activityAreaInputRefs.current[pendingActivityAreaFocusIndex]?.focus();
    setPendingActivityAreaFocusIndex(null);
  }, [formState.activityAreas.length, pendingActivityAreaFocusIndex]);

  useEffect(() => {
    if (editingSummaryField === "organizationSize") {
      organizationSizeInputRef.current?.focus();
    }

    if (editingSummaryField === "foundationYear") {
      foundationYearInputRef.current?.focus();
    }
  }, [editingSummaryField]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (officeFieldRef.current && !officeFieldRef.current.contains(event.target as Node)) {
        setIsOfficeAddressSuggestionsOpen(false);
        setActiveOfficeAddressIndex(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    const activeQuery =
      activeOfficeAddressIndex === null ? "" : formState.officeAddresses[activeOfficeAddressIndex]?.trim() ?? "";

    if (activeOfficeAddressIndex === null || !isOfficeAddressSuggestionsOpen || !activeQuery) {
      setOfficeAddressSuggestions([]);
      setIsOfficeAddressSuggestionsLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsOfficeAddressSuggestionsLoading(true);

      void getAddressSuggestions(activeQuery, preferredCity)
        .then((items) => {
          setOfficeAddressSuggestions(items);
        })
        .catch(() => {
          setOfficeAddressSuggestions([]);
        })
        .finally(() => {
          setIsOfficeAddressSuggestionsLoading(false);
        });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [activeOfficeAddressIndex, formState.officeAddresses, isOfficeAddressSuggestionsOpen, preferredCity]);

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
    if (!pendingAvatarFile && !persistedEmployerAvatarUrl) {
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

  const handleOfficeAddressSuggestionSelect = (index: number, item: AddressSuggestion) => {
    setFormState((currentValue) => ({
      ...currentValue,
      officeAddresses: currentValue.officeAddresses.map((address, addressIndex) =>
        addressIndex === index ? item.fullAddress : address,
      ),
    }));
    writeLastAddressQueryCookie(item.fullAddress);
    setRecentAddressQueries(readRecentAddressQueriesCookie());
    setOfficeAddressSuggestions([]);
    setIsOfficeAddressSuggestionsOpen(false);
    setActiveOfficeAddressIndex(null);
  };

  const handleRecentOfficeAddressQuerySelect = (query: string) => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery || activeOfficeAddressIndex === null) {
      return;
    }

    setFormState((currentValue) => ({
      ...currentValue,
      officeAddresses: currentValue.officeAddresses.map((address, addressIndex) =>
        addressIndex === activeOfficeAddressIndex ? normalizedQuery : address,
      ),
    }));
    writeLastAddressQueryCookie(normalizedQuery);
    setRecentAddressQueries(readRecentAddressQueriesCookie());
    setIsOfficeAddressSuggestionsOpen(false);
    setActiveOfficeAddressIndex(null);
  };

  const handleActivityAreaChange = (index: number) => (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;

    setFormState((currentValue) => ({
      ...currentValue,
      activityAreas: currentValue.activityAreas.map((area, areaIndex) => (areaIndex === index ? nextValue : area)),
    }));
  };

  const handleAddActivityArea = () => {
    setFormState((currentValue) => ({
      ...currentValue,
      activityAreas: [...currentValue.activityAreas, ""],
    }));
    setPendingActivityAreaFocusIndex(formState.activityAreas.length);
  };

  const handleActivityAreaBlur = (index: number) => (event: FocusEvent<HTMLInputElement>) => {
    if (event.target.value.trim()) {
      return;
    }

    setFormState((currentValue) => ({
      ...currentValue,
      activityAreas: currentValue.activityAreas.filter((_, areaIndex) => areaIndex !== index),
    }));
    activityAreaInputRefs.current = activityAreaInputRefs.current.filter((_, areaIndex) => areaIndex !== index);
  };

  const handleOfficeAddressBlur = (index: number) => (event: FocusEvent<HTMLInputElement>) => {
    if (event.target.value.trim()) {
      return;
    }

    setFormState((currentValue) => ({
      ...currentValue,
      officeAddresses: currentValue.officeAddresses.filter((_, addressIndex) => addressIndex !== index),
    }));
    officeAddressInputRefs.current = officeAddressInputRefs.current.filter((_, addressIndex) => addressIndex !== index);
    setOfficeAddressSuggestions([]);
    setIsOfficeAddressSuggestionsOpen(false);
    setActiveOfficeAddressIndex(null);
  };

  const prioritizedOfficeAddressSuggestions = officeAddressSuggestions.filter((item) =>
    isSuggestionFromCity(item, preferredCity),
  );
  const secondaryOfficeAddressSuggestions = officeAddressSuggestions.filter(
    (item) => !isSuggestionFromCity(item, preferredCity),
  );

  const handleSubmit = async () => {
    if (!employerProfile?.inn || !formState.companyName.trim()) {
      return;
    }

    const corporateEmail = formState.corporateEmail.trim() || employerProfile.corporate_email?.trim();

    await saveEmployerProfileMutation.mutateAsync({
      employer_type: employerProfile.employer_type ?? "company",
      company_name: formState.companyName.trim(),
      inn: formState.inn.trim(),
      corporate_email: corporateEmail || undefined,
      short_description: normalizeOptionalValue(formState.shortDescription),
      office_addresses: formState.officeAddresses.map((item) => item.trim()).filter(Boolean),
      activity_areas: formState.activityAreas.map((item) => item.trim()).filter(Boolean),
      organization_size: normalizeOptionalValue(formState.organizationSize),
      foundation_year: formState.foundationYear.trim() ? Number(formState.foundationYear.trim()) : undefined,
      website: normalizeOptionalValue(formState.website),
      phone: normalizeOptionalValue(formState.phone),
      social_link: normalizeOptionalValue(formState.socialLink),
      max_link: normalizeOptionalValue(formState.maxLink),
      rutube_link: normalizeOptionalValue(formState.rutubeLink),
    });

    if (isAvatarMarkedForDeletion && persistedEmployerAvatarUrl) {
      await deleteEmployerAvatarMutation.mutateAsync();
    } else if (pendingAvatarFile) {
      await uploadEmployerAvatarMutation.mutateAsync(pendingAvatarFile);
    }

    setPendingAvatarFile(null);
    setIsAvatarMarkedForDeletion(false);
    setAvatarPreviewUrl((currentValue) => {
      if (currentValue) {
        URL.revokeObjectURL(currentValue);
      }

      return null;
    });
  };

  const handleSaveSummaryField = async () => {
    await handleSubmit();
    setEditingSummaryField(null);
  };

  const handleCloseLeaveConfirmModal = () => {
    setIsLeaveConfirmModalOpen(false);
    pendingNavigationTxRef.current = null;
  };

  const handleSaveAndLeave = async () => {
    try {
      await handleSubmit();
      setIsLeaveConfirmModalOpen(false);
      const pendingTx = pendingNavigationTxRef.current;
      pendingNavigationTxRef.current = null;
      pendingTx?.retry();
    } catch {
      return;
    }
  };

  return (
    <main className="employer-dashboard">
      <Header
        containerClassName="employer-dashboard__header-shell"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
      />

      <Container className="employer-dashboard__shell">
        <ProfileTabs
          navigate={navigate}
          audience="employer"
          current="company-profile"
          employerAccess={employerAccess}
          tabsClassName="employer-dashboard__tabs"
          tabClassName="employer-dashboard__tab"
          activeTabClassName="employer-dashboard__tab--active"
        />

        <section className="employer-dashboard__profile-summary">
          <div className="employer-dashboard__form-panel">
            <div className="employer-dashboard__identity">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="employer-dashboard__avatar-input"
                hidden
                tabIndex={-1}
                aria-hidden="true"
                onChange={handleAvatarChange}
              />
              <div className="employer-dashboard__avatar-panel">
                {employerPublicId ? <p className="employer-dashboard__profile-id">ID: {employerPublicId}</p> : null}
                <div className="employer-dashboard__avatar-shell">
                  <img
                    src={avatarPreviewUrl ?? (isAvatarMarkedForDeletion ? null : persistedEmployerAvatarUrl) ?? resolveAvatarIcon("employer")}
                    alt=""
                    aria-hidden="true"
                    className="employer-dashboard__avatar-image"
                  />
                  {pendingAvatarFile || persistedEmployerAvatarUrl ? (
                    <button
                      type="button"
                      className="employer-dashboard__avatar-overlay"
                      aria-label="Удалить аватар"
                      onClick={handleDeleteAvatar}
                    >
                      <span aria-hidden="true" className="employer-dashboard__avatar-overlay-icon" />
                    </button>
                  ) : null}
                </div>
                <div className="employer-dashboard__avatar-action-wrap">
                  <Button type="button" variant="ghost" size="md" className="employer-dashboard__avatar-action" onClick={handlePickAvatar}>
                    <span className="employer-dashboard__avatar-actions">Изменить аватар</span>
                  </Button>
                </div>
              </div>
            </div>

            <div className="employer-dashboard__profile-form">
              <label className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Наименование компании</span>
                <Input
                  value={formState.companyName}
                  onChange={handleInputChange("companyName")}
                  className="input--sm employer-dashboard__input"
                  placeholder="ООО Кейсистемс"
                  disabled
                />
              </label>

              <label className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Краткое описание</span>
                <textarea
                  value={formState.shortDescription}
                  onChange={handleShortDescriptionChange}
                  className="employer-dashboard__textarea"
                  placeholder="2-3 предложения"
                  disabled={isProfileLoading}
                  rows={3}
                />
              </label>

              <div ref={officeFieldRef} className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Адреса офисов</span>
                <div className="employer-dashboard__office-list">
                  {formState.officeAddresses.map((address, index) => (
                    <div className="employer-dashboard__office-card" key={`office-address-${index}`}>
                      <Input
                        ref={(element) => {
                          officeAddressInputRefs.current[index] = element;
                        }}
                        value={address}
                        onFocus={() => {
                          setActiveOfficeAddressIndex(index);
                          setIsOfficeAddressSuggestionsOpen(true);
                        }}
                        onBlur={handleOfficeAddressBlur(index)}
                        onChange={handleOfficeAddressChange(index)}
                        className="input--sm employer-dashboard__input employer-dashboard__office-input"
                        placeholder="Укажите адрес офиса"
                        disabled={isProfileLoading}
                      />

                      {isOfficeAddressSuggestionsOpen && activeOfficeAddressIndex === index ? (
                        <div className="employer-dashboard__office-dropdown">
                          {isOfficeAddressSuggestionsLoading ? (
                            <div className="employer-dashboard__office-dropdown-empty">Загружаем адреса...</div>
                          ) : !address.trim() && recentAddressQueries.length > 0 ? (
                            <div className="employer-dashboard__office-dropdown-group">
                              {recentAddressQueries.map((query) => (
                                <button
                                  key={query}
                                  type="button"
                                  className="employer-dashboard__office-dropdown-option"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => handleRecentOfficeAddressQuerySelect(query)}
                                >
                                  <span className="employer-dashboard__office-dropdown-title">{query}</span>
                                </button>
                              ))}
                            </div>
                          ) : prioritizedOfficeAddressSuggestions.length > 0 || secondaryOfficeAddressSuggestions.length > 0 ? (
                            <>
                              {prioritizedOfficeAddressSuggestions.length > 0 ? (
                                <div className="employer-dashboard__office-dropdown-group">
                                  {prioritizedOfficeAddressSuggestions.map((item) => (
                                    <button
                                      key={`${item.id}-priority`}
                                      type="button"
                                      className="employer-dashboard__office-dropdown-option"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => handleOfficeAddressSuggestionSelect(index, item)}
                                    >
                                      <span className="employer-dashboard__office-dropdown-title">{item.fullAddress}</span>
                                      {item.subtitle ? (
                                        <span className="employer-dashboard__office-dropdown-subtitle">{item.subtitle}</span>
                                      ) : null}
                                    </button>
                                  ))}
                                </div>
                              ) : null}

                              {secondaryOfficeAddressSuggestions.length > 0 ? (
                                <div className="employer-dashboard__office-dropdown-group">
                                  {secondaryOfficeAddressSuggestions.map((item) => (
                                    <button
                                      key={`${item.id}-secondary`}
                                      type="button"
                                      className="employer-dashboard__office-dropdown-option"
                                      onMouseDown={(event) => event.preventDefault()}
                                      onClick={() => handleOfficeAddressSuggestionSelect(index, item)}
                                    >
                                      <span className="employer-dashboard__office-dropdown-title">{item.fullAddress}</span>
                                      {item.subtitle ? (
                                        <span className="employer-dashboard__office-dropdown-subtitle">{item.subtitle}</span>
                                      ) : null}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <div className="employer-dashboard__office-dropdown-empty employer-dashboard__office-dropdown-empty--search">
                              <img src={sadSearchIcon} alt="" aria-hidden="true" className="employer-dashboard__office-dropdown-empty-icon" />
                              <span>Ничего не найдено</span>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="primary-outline"
                  size="md"
                  className="employer-dashboard__office-add"
                  onClick={handleAddOfficeAddress}
                  disabled={isProfileLoading}
                  aria-label="Добавить адрес офиса"
                >
                  <span aria-hidden="true" className="employer-dashboard__office-add-icon" />
                </Button>
              </div>

              <div className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Сфера деятельности</span>
                <div className="employer-dashboard__office-list">
                  {formState.activityAreas.map((area, index) => (
                    <div className="employer-dashboard__office-card" key={`activity-area-${index}`}>
                      <Input
                        ref={(element) => {
                          activityAreaInputRefs.current[index] = element;
                        }}
                        value={area}
                        onChange={handleActivityAreaChange(index)}
                        onBlur={handleActivityAreaBlur(index)}
                        className="input--sm employer-dashboard__input"
                        placeholder="Укажите сферу деятельности"
                        disabled={isProfileLoading}
                      />
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="primary-outline"
                  size="md"
                  className="employer-dashboard__office-add"
                  onClick={handleAddActivityArea}
                  disabled={isProfileLoading}
                  aria-label="Добавить сферу деятельности"
                >
                  <span aria-hidden="true" className="employer-dashboard__office-add-icon" />
                </Button>
              </div>

              <label className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Корпоративная почта</span>
                <Input
                  type="email"
                  value={formState.corporateEmail}
                  onChange={handleInputChange("corporateEmail")}
                  className="input--sm employer-dashboard__input"
                  placeholder="hr@company.ru"
                  disabled={isProfileLoading}
                />
              </label>

              <label className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">Сайт</span>
                <Input
                  value={formState.website}
                  onChange={handleInputChange("website")}
                  className="input--sm employer-dashboard__input"
                  placeholder="https://"
                  disabled={isProfileLoading}
                />
              </label>

              <label className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">VK</span>
                <Input
                  value={formState.socialLink}
                  onChange={handleInputChange("socialLink")}
                  className="input--sm employer-dashboard__input"
                  placeholder="https://vk.com/tramplin"
                  disabled={isProfileLoading}
                />
              </label>

              <label className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">MAX</span>
                <Input
                  value={formState.maxLink}
                  onChange={handleInputChange("maxLink")}
                  className="input--sm employer-dashboard__input"
                  placeholder="https://max.ru/tramplin"
                  disabled={isProfileLoading}
                />
              </label>

              <label className="employer-dashboard__field">
                <span className="employer-dashboard__field-label">RUTUBE</span>
                <Input
                  value={formState.rutubeLink}
                  onChange={handleInputChange("rutubeLink")}
                  className="input--sm employer-dashboard__input"
                  placeholder="https://rutube.ru/channel/tramplin"
                  disabled={isProfileLoading}
                />
              </label>
            </div>

            {verificationStatus === "changes_requested" || verificationStatus === "rejected" ? (
              <div className="employer-dashboard__moderation-note">
                <h3 className="employer-dashboard__moderation-title">Комментарий по проверке</h3>
                <p className="employer-dashboard__moderation-text">
                  {employerProfile?.moderator_comment?.trim() || "Модератор не оставил комментарий."}
                </p>
              </div>
            ) : null}

            {saveEmployerProfileMutation.isError ? (
              <p className="employer-dashboard__save-error">{saveErrorMessage}</p>
            ) : null}

            <div className="employer-dashboard__form-actions">
              <Button
                type="button"
                variant="primary"
                size="md"
                fullWidth
                className="employer-dashboard__save-button"
                onClick={() => void handleSubmit()}
                loading={
                  saveEmployerProfileMutation.isPending ||
                  uploadEmployerAvatarMutation.isPending ||
                  deleteEmployerAvatarMutation.isPending
                }
                disabled={isSaveDisabled}
              >
                Сохранить изменения
              </Button>
            </div>
          </div>

          <aside className="employer-dashboard__summary">
            <article className="employer-dashboard__summary-card employer-dashboard__summary-card--progress">
              <div className="employer-dashboard__summary-progress-head">
                <p className="employer-dashboard__summary-heading">Профиль заполнен на {displayedProfileCompletion}%</p>
                <div className="employer-dashboard__progress-track" aria-hidden="true">
                  <span
                    className="employer-dashboard__progress-value"
                    style={{ width: `${Math.min(Math.max(displayedProfileCompletion, 6), 100)}%` }}
                  />
                </div>
              </div>
              <div className="employer-dashboard__summary-progress-meta">
                <div className="employer-dashboard__progress-point">
                  <p className="employer-dashboard__summary-meta">
                    Просмотров профиля: {employerProfile?.profile_views_count ?? 0}
                  </p>
                </div>
                <div className="employer-dashboard__progress-point">
                  <p className="employer-dashboard__summary-meta">
                    Размещено возможностей: {activeOpportunitiesCount}
                  </p>
                </div>
                <div className="employer-dashboard__progress-point">
                  <p className="employer-dashboard__summary-meta">
                    Получено откликов: {responsesCount}
                  </p>
                </div>
              </div>
            </article>

            <article className="employer-dashboard__summary-card">
              <p className="employer-dashboard__summary-label">Статус:</p>
              <div className="employer-dashboard__status-summary">
                <strong className={formatVerificationClassName(verificationStatus)}>
                  {formatVerificationLabel(verificationStatus)}
                </strong>
                {isVerified ? (
                  <VerifiedTooltip className="employer-dashboard__verification-tooltip" size="lg" />
                ) : null}
              </div>
            </article>

            <article className="employer-dashboard__summary-card">
              <p className="employer-dashboard__summary-label">ИНН:</p>
              <strong className="employer-dashboard__summary-value">{employerProfile?.inn || "Не указан"}</strong>
            </article>

            <article className="employer-dashboard__summary-card">
              <p className="employer-dashboard__summary-label">Размер организации:</p>
              {editingSummaryField === "organizationSize" ? (
                <div className="employer-dashboard__summary-field">
                  <Input
                    ref={organizationSizeInputRef}
                    value={formState.organizationSize}
                    onChange={handleInputChange("organizationSize")}
                    className="input--sm employer-dashboard__input employer-dashboard__summary-input"
                    placeholder="Не указано"
                    disabled={isProfileLoading}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    className="employer-dashboard__summary-confirm"
                    onClick={() => void handleSaveSummaryField()}
                    disabled={saveEmployerProfileMutation.isPending}
                    aria-label="Сохранить размер организации"
                  >
                    <span aria-hidden="true" className="employer-dashboard__summary-confirm-icon" />
                  </Button>
                </div>
              ) : (
                <div className="employer-dashboard__summary-metric">
                  <strong className="employer-dashboard__summary-value">
                    {formState.organizationSize.trim() || "Не указано"}
                  </strong>
                  <button
                    type="button"
                    className="employer-dashboard__summary-edit"
                    onClick={() => setEditingSummaryField("organizationSize")}
                    aria-label="Редактировать размер организации"
                  >
                    <span aria-hidden="true" className="employer-dashboard__summary-edit-icon" />
                  </button>
                </div>
              )}
            </article>

            <article className="employer-dashboard__summary-card">
              <p className="employer-dashboard__summary-label">Год основания:</p>
              {editingSummaryField === "foundationYear" ? (
                <div className="employer-dashboard__summary-field">
                  <Input
                    ref={foundationYearInputRef}
                    value={formState.foundationYear}
                    onChange={handleInputChange("foundationYear")}
                    className="input--sm employer-dashboard__input employer-dashboard__summary-input"
                    placeholder="Не указано"
                    disabled={isProfileLoading}
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    className="employer-dashboard__summary-confirm"
                    onClick={() => void handleSaveSummaryField()}
                    disabled={saveEmployerProfileMutation.isPending}
                    aria-label="Сохранить год основания"
                  >
                    <span aria-hidden="true" className="employer-dashboard__summary-confirm-icon" />
                  </Button>
                </div>
              ) : (
                <div className="employer-dashboard__summary-metric">
                  <strong className="employer-dashboard__summary-value">
                    {formState.foundationYear.trim() || "Не указано"}
                  </strong>
                  <button
                    type="button"
                    className="employer-dashboard__summary-edit"
                    onClick={() => setEditingSummaryField("foundationYear")}
                    aria-label="Редактировать год основания"
                  >
                    <span aria-hidden="true" className="employer-dashboard__summary-edit-icon" />
                  </button>
                </div>
              )}
            </article>

            <article className="employer-dashboard__summary-card">
              <p className="employer-dashboard__summary-label">Активные возможности:</p>
              <strong className="employer-dashboard__summary-value">{activeOpportunitiesCount}</strong>
            </article>

            <article className="employer-dashboard__summary-card">
              <p className="employer-dashboard__summary-label">Принято кандидатов:</p>
              <strong className="employer-dashboard__summary-value">0</strong>
            </article>
          </aside>
        </section>

        <section className="employer-dashboard__opportunities">
          <h2 className="employer-dashboard__opportunities-title">
            <span className="employer-dashboard__opportunities-title-accent">Возможности</span> от организации
          </h2>

          <div className="employer-dashboard__opportunities-shell">
            <OpportunityFilters
              viewMode={opportunityViewMode}
              isMapExpanded={false}
              onViewModeChange={setOpportunityViewMode}
            />

            <div className="employer-dashboard__opportunities-summary">
              <div
                className={
                  opportunityViewMode === "map"
                    ? "employer-dashboard__opportunities-panel employer-dashboard__opportunities-panel--active"
                    : "employer-dashboard__opportunities-panel employer-dashboard__opportunities-panel--hidden"
                }
                aria-hidden={opportunityViewMode !== "map"}
              >
                <div className="employer-dashboard__opportunities-map">
                  <MapView
                    opportunities={filteredEmployerFeedOpportunities}
                    favoriteOpportunityIds={[]}
                    selectedOpportunityId={selectedOpportunityId}
                    selectedCity={selectedCity}
                    selectedCityViewport={null}
                    isExpanded={false}
                    isTransitioning={false}
                    roleName="employer"
                    onSelectOpportunity={setSelectedOpportunityId}
                    onToggleFavorite={() => undefined}
                    onSelectCity={() => undefined}
                    onCloseDetails={() => setSelectedOpportunityId(null)}
                    onToggleExpand={() => undefined}
                    onApply={(opportunityId) => navigate(`/employer/opportunities?highlight=${encodeURIComponent(opportunityId)}`)}
                  />
                </div>
              </div>
              <div
                className={
                  opportunityViewMode === "list"
                    ? "employer-dashboard__opportunities-panel employer-dashboard__opportunities-panel--active"
                    : "employer-dashboard__opportunities-panel employer-dashboard__opportunities-panel--hidden"
                }
                aria-hidden={opportunityViewMode !== "list"}
              >
                <OpportunityList
                  opportunities={filteredEmployerFeedOpportunities}
                  favoriteOpportunityIds={[]}
                  roleName="employer"
                  onToggleFavorite={() => undefined}
                  onApply={(opportunityId) => navigate(`/employer/opportunities?highlight=${encodeURIComponent(opportunityId)}`)}
                />
              </div>
            </div>
          </div>
        </section>
      </Container>

      <Footer theme="employer" />
      <Modal
        title="Несохраненные изменения"
        isOpen={isLeaveConfirmModalOpen}
        onClose={handleCloseLeaveConfirmModal}
        size="small"
        panelClassName="employer-dashboard__leave-modal-panel"
        titleAccentColor="var(--color-primary)"
        closeOnBackdrop={false}
      >
        <div className="modal__body employer-dashboard__leave-modal">
          <p className="modal__text employer-dashboard__leave-modal-text">
            Если перейти на другую страницу сейчас, все несохранённые данные сотрутся.
          </p>
          {saveEmployerProfileMutation.isError ? (
            <p className="modal__error employer-dashboard__save-error">{saveErrorMessage}</p>
          ) : null}
          <div className="modal__actions employer-dashboard__leave-modal-actions">
            <Button
              type="button"
              variant="cancel"
              size="md"
              onClick={handleCloseLeaveConfirmModal}
              disabled={saveEmployerProfileMutation.isPending}
            >
              Отменить
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={() => void handleSaveAndLeave()}
              loading={
                saveEmployerProfileMutation.isPending ||
                uploadEmployerAvatarMutation.isPending ||
                deleteEmployerAvatarMutation.isPending
              }
              disabled={
                saveEmployerProfileMutation.isPending ||
                uploadEmployerAvatarMutation.isPending ||
                deleteEmployerAvatarMutation.isPending
              }
            >
              Сохранить и выйти
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
