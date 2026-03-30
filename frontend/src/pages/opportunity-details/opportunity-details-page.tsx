import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import jobIcon from "../../assets/icons/job.svg";
import arrowIcon from "../../assets/icons/arrow.svg";
import locationIcon from "../../assets/icons/location.svg";
import mailIcon from "../../assets/icons/mail.svg";
import levelIcon from "../../assets/icons/level.svg";
import phoneIcon from "../../assets/icons/phone.svg";
import siteIcon from "../../assets/icons/site.svg";
import timeIcon from "../../assets/icons/time.svg";
import {
  listOpportunitiesRequest,
  listOpportunityRecommendationCandidatesRequest,
  recommendOpportunityRequest,
  type OpportunityRecommendationCandidate,
} from "../../entities/opportunity/api";
import type { Opportunity } from "../../entities/opportunity";
import {
  addFavoriteOpportunityRequest,
  FavoriteAuthModal,
  listFavoriteOpportunitiesRequest,
  removeFavoriteOpportunityRequest,
} from "../../features/favorites";
import {
  listMyAppliedOpportunityIdsRequest,
  submitOpportunityApplicationRequest,
  withdrawOpportunityApplicationRequest,
} from "../../features/applications";
import { CitySelection, readSelectedCityCookie, writeSelectedCityCookie } from "../../features/city-selector";
import { useAuthStore } from "../../features/auth";
import { resolveAvatarIcon, resolveAvatarUrl } from "../../shared/lib";
import { Button, Container, Modal } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import {
  buildApplicantProfileMenuItems,
  buildEmployerProfileMenuItems,
  buildModerationProfileMenuItems,
  Header,
} from "../../widgets/header";
import verifiedIcon from "../../assets/icons/verified.svg";
import "./opportunity-details.css";

type SuggestedContact = {
  id: string;
  userId: string;
  name: string;
  subtitle: string;
  isOnline: boolean;
  levelLabel: string | null;
  tags: string[];
  city: string;
  salaryLabel: string;
  formatLabel: string;
  employmentLabel: string;
  avatarSrc: string;
};

const RECOMMENDED_CONTACTS_PAGE_SIZE = 2;

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, "ellipsis", totalPages] as const;
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages] as const;
  }

  return [1, "ellipsis", currentPage, "ellipsis-right", totalPages] as const;
}

function resolveThemeRole(role: string | null) {
  if (role === "junior") {
    return "curator";
  }

  if (role === "employer" || role === "curator" || role === "admin") {
    return role;
  }

  return "applicant";
}

function formatOpportunityFormatLabel(format: Opportunity["format"]) {
  if (format === "office") {
    return "Офлайн";
  }

  if (format === "hybrid") {
    return "Гибрид";
  }

  return "Удалённо";
}

function formatPublishedAt(value: string | null | undefined) {
  if (!value) {
    return "Дата публикации не указана";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Дата публикации не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function buildDescriptionSections(description: string) {
  const normalized = description.trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const firstLine = lines[0] ?? "";
      const hasTitle = firstLine.endsWith(":") && lines.length > 1;

      return {
        id: `${index}-${firstLine}`,
        title: hasTitle ? firstLine : null,
        body: hasTitle ? lines.slice(1).join("\n") : lines.join("\n"),
      };
    });
}

function mapSuggestedContact(candidate: OpportunityRecommendationCandidate): SuggestedContact {
  const [firstTag, ...remainingTags] = candidate.tags;
  const normalizedLevel = firstTag?.trim().toLowerCase();
  const isLevelTag = normalizedLevel === "junior" || normalizedLevel === "middle" || normalizedLevel === "senior";

  return {
    id: candidate.publicId || candidate.userId,
    userId: candidate.userId,
    name: candidate.displayName,
    subtitle: candidate.subtitle,
    isOnline: candidate.isOnline,
    levelLabel: isLevelTag ? firstTag : null,
    tags: isLevelTag ? remainingTags : candidate.tags,
    city: candidate.city,
    salaryLabel: candidate.salaryLabel,
    formatLabel: candidate.formatLabel,
    employmentLabel: candidate.employmentLabel,
    avatarSrc: resolveAvatarIcon("applicant"),
  };
}

function resolveSuggestedContactLevelClassName(levelLabel: string | null) {
  const normalizedLevel = levelLabel?.trim().toLowerCase();

  if (normalizedLevel === "middle") {
    return "opportunity-details-page__contact-level-badge opportunity-details-page__contact-level-badge--warning";
  }

  if (normalizedLevel === "senior") {
    return "opportunity-details-page__contact-level-badge opportunity-details-page__contact-level-badge--danger";
  }

  return "opportunity-details-page__contact-level-badge opportunity-details-page__contact-level-badge--success";
}

export function OpportunityDetailsPage() {
  const { opportunityId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const themeRole = resolveThemeRole(role);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
  const [isFavoriteAuthModalOpen, setIsFavoriteAuthModalOpen] = useState(false);
  const [isWithdrawConfirmModalOpen, setIsWithdrawConfirmModalOpen] = useState(false);
  const [recommendedUserIds, setRecommendedUserIds] = useState<string[]>([]);
  const [recommendedContactsPage, setRecommendedContactsPage] = useState(1);

  const opportunitiesQuery = useQuery({
    queryKey: ["opportunities", "feed"],
    queryFn: listOpportunitiesRequest,
    staleTime: 5 * 60 * 1000,
  });
  const favoritesQuery = useQuery({
    queryKey: ["favorites", "opportunities"],
    queryFn: listFavoriteOpportunitiesRequest,
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });
  const myApplicationsQuery = useQuery({
    queryKey: ["applications", "mine", "opportunity-ids"],
    queryFn: listMyAppliedOpportunityIdsRequest,
    enabled: isAuthenticated && role === "applicant",
    staleTime: 60 * 1000,
  });
  const recommendationCandidatesQuery = useQuery({
    queryKey: ["opportunities", opportunityId, "recommendation-candidates"],
    queryFn: async () => {
      if (!opportunityId) {
        return [];
      }
      return listOpportunityRecommendationCandidatesRequest(opportunityId);
    },
    enabled: isAuthenticated && Boolean(opportunityId),
    staleTime: 60 * 1000,
  });

  const favoriteOpportunityMutation = useMutation({
    mutationFn: async ({
      targetOpportunityId,
      shouldFavorite,
    }: {
      targetOpportunityId: string;
      shouldFavorite: boolean;
    }) => {
      return shouldFavorite
        ? addFavoriteOpportunityRequest(targetOpportunityId)
        : removeFavoriteOpportunityRequest(targetOpportunityId);
    },
    onSuccess: (response) => {
      queryClient.setQueryData(["favorites", "opportunities"], response);
    },
  });

  const submitApplicationMutation = useMutation({
    mutationFn: async ({
      targetOpportunityId,
      shouldWithdraw,
    }: {
      targetOpportunityId: string;
      shouldWithdraw: boolean;
    }) => {
      return shouldWithdraw
        ? withdrawOpportunityApplicationRequest(targetOpportunityId)
        : submitOpportunityApplicationRequest(targetOpportunityId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["applications", "mine", "opportunity-ids"] });
    },
  });
  const recommendOpportunityMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!opportunity) {
        throw new Error("Возможность не найдена");
      }

      return recommendOpportunityRequest(opportunity.id, targetUserId);
    },
    onSuccess: (_response, targetUserId) => {
      setRecommendedUserIds((current) => (
        current.includes(targetUserId) ? current : [...current, targetUserId]
      ));
    },
  });

  const opportunity = useMemo(
    () => (opportunitiesQuery.data ?? []).find((item) => item.id === opportunityId) ?? null,
    [opportunitiesQuery.data, opportunityId],
  );
  const favoriteOpportunityIds = favoritesQuery.data?.data?.items ?? [];
  const appliedOpportunityIds = myApplicationsQuery.data?.data?.opportunity_ids ?? [];
  const isFavorite = opportunity ? favoriteOpportunityIds.includes(opportunity.id) : false;
  const isApplied = opportunity ? appliedOpportunityIds.includes(opportunity.id) : false;
  const canApply = role !== "employer" && role !== "curator" && role !== "admin";
  const descriptionSections = useMemo(
    () => (opportunity ? buildDescriptionSections(opportunity.description) : []),
    [opportunity],
  );
  const suggestedContacts = useMemo(
    () => (recommendationCandidatesQuery.data ?? []).map(mapSuggestedContact),
    [recommendationCandidatesQuery.data],
  );
  const recommendedContactsTotalPages = Math.max(
    1,
    Math.ceil(suggestedContacts.length / RECOMMENDED_CONTACTS_PAGE_SIZE),
  );
  const recommendedContactsCurrentPage = Math.min(recommendedContactsPage, recommendedContactsTotalPages);
  const visibleSuggestedContacts = suggestedContacts.slice(
    (recommendedContactsCurrentPage - 1) * RECOMMENDED_CONTACTS_PAGE_SIZE,
    recommendedContactsCurrentPage * RECOMMENDED_CONTACTS_PAGE_SIZE,
  );
  const recommendedContactsPaginationItems = buildPaginationItems(
    recommendedContactsCurrentPage,
    recommendedContactsTotalPages,
  );
  const shouldShowRecommendationsSection =
    isAuthenticated && (recommendationCandidatesQuery.isPending || suggestedContacts.length > 0);

  useEffect(() => {
    setRecommendedContactsPage(1);
  }, [suggestedContacts.length]);

  const profileMenuItems = role === "employer"
    ? buildEmployerProfileMenuItems(navigate, {
        isEmployer: true,
        isStaffContext: false,
        hasFullAccess: true,
        permissionKeys: [
          "view_responses",
          "manage_opportunities",
          "manage_company_profile",
          "manage_staff",
          "access_chat",
        ],
        canReviewResponses: true,
        canManageCompanyProfile: true,
        canManageOpportunities: true,
        canManageStaff: true,
        canAccessChat: true,
      })
    : role === "junior" || role === "curator" || role === "admin"
      ? buildModerationProfileMenuItems()
      : buildApplicantProfileMenuItems(navigate);

  const handleCityChange = (city: CitySelection) => {
    setSelectedCity(city.name);
    writeSelectedCityCookie(city.name);
  };

  const handleToggleFavorite = () => {
    if (!opportunity) {
      return;
    }

    if (!isAuthenticated) {
      setIsFavoriteAuthModalOpen(true);
      return;
    }

    favoriteOpportunityMutation.mutate({
      targetOpportunityId: opportunity.id,
      shouldFavorite: !isFavorite,
    });
  };

  const handleApply = () => {
    if (!opportunity || !canApply) {
      return;
    }

    if (!isAuthenticated) {
      setIsFavoriteAuthModalOpen(true);
      return;
    }

    if (isApplied) {
      setIsWithdrawConfirmModalOpen(true);
      return;
    }

    submitApplicationMutation.mutate({
      targetOpportunityId: opportunity.id,
      shouldWithdraw: false,
    });
  };

  const handleConfirmWithdraw = () => {
    if (!opportunity || !canApply || !isAuthenticated || !isApplied) {
      return;
    }

    submitApplicationMutation.mutate(
      {
        targetOpportunityId: opportunity.id,
        shouldWithdraw: true,
      },
      {
        onSuccess: async () => {
          setIsWithdrawConfirmModalOpen(false);
          await queryClient.invalidateQueries({ queryKey: ["applications", "mine", "opportunity-ids"] });
        },
      },
    );
  };

  const handleRecommend = (targetUserId: string) => {
    if (!isAuthenticated) {
      setIsFavoriteAuthModalOpen(true);
      return;
    }

    recommendOpportunityMutation.mutate(targetUserId);
  };

  if (!opportunityId) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className={`opportunity-details-page opportunity-details-page--${themeRole}`}>
      <Header
        containerClassName="home-page__container"
        profileMenuItems={profileMenuItems}
        theme={themeRole === "admin" ? "curator" : themeRole}
        city={selectedCity}
        onCityChange={handleCityChange}
        isAuthenticated={isAuthenticated}
        guestActions={
          <>
            <Button type="button" variant="primary-outline" size="md" onClick={() => navigate("/login")}>
              Вход
            </Button>
            <Button type="button" variant="primary" size="md" onClick={() => navigate("/register")}>
              Регистрация
            </Button>
          </>
        }
      />

      <Container className="opportunity-details-page__container">
        {!opportunity && opportunitiesQuery.isPending ? (
          <section className="opportunity-details-page__state">
            <h1 className="opportunity-details-page__state-title">Загружаем возможность</h1>
          </section>
        ) : null}

        {!opportunity && !opportunitiesQuery.isPending ? (
          <section className="opportunity-details-page__state">
            <h1 className="opportunity-details-page__state-title">Возможность не найдена</h1>
            <Button type="button" variant="secondary" onClick={() => navigate("/")}>
              Вернуться на главную
            </Button>
          </section>
        ) : null}

        {opportunity ? (
          <section className="opportunity-details-page__layout">
            <div className="opportunity-details-page__main">
              <div className="opportunity-details-page__hero">
                <div className="opportunity-details-page__hero-copy">
                  <div className="opportunity-details-page__content">
                    <div className="opportunity-details-page__hero-summary">
                      <div className="opportunity-details-page__hero-header">
                        <h1 className="opportunity-details-page__title">{opportunity.title}</h1>
                        <p className="opportunity-details-page__salary">{opportunity.salaryLabel}</p>
                        <p className="opportunity-details-page__published">
                          Дата публикации: {formatPublishedAt(opportunity.publishedAt)}
                        </p>

                        <div className="opportunity-details-page__meta">
                          <span className="opportunity-details-page__meta-item">
                            <img src={locationIcon} alt="" aria-hidden="true" className="opportunity-details-page__meta-icon" />
                            {opportunity.city || "Россия"}
                          </span>
                          <span className="opportunity-details-page__meta-item">
                            <img src={jobIcon} alt="" aria-hidden="true" className="opportunity-details-page__meta-icon" />
                            {formatOpportunityFormatLabel(opportunity.format)}
                          </span>
                          <span className="opportunity-details-page__meta-item">
                            <img src={timeIcon} alt="" aria-hidden="true" className="opportunity-details-page__meta-icon" />
                            {opportunity.employmentLabel}
                          </span>
                          <span className="opportunity-details-page__meta-item">
                            <img src={levelIcon} alt="" aria-hidden="true" className="opportunity-details-page__meta-icon" />
                            {opportunity.levelLabel}
                          </span>
                        </div>
                      </div>

                      <div className="opportunity-details-page__tags">
                        {opportunity.tags.map((tag) => (
                          <span key={tag} className="opportunity-details-page__tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <section className="opportunity-details-page__section">
                      <h2 className="opportunity-details-page__section-title">Описание</h2>
                      <div className="opportunity-details-page__description">
                        {descriptionSections.length > 0 ? descriptionSections.map((section) => (
                          <article key={section.id} className="opportunity-details-page__description-section">
                            {section.title ? (
                              <h3 className="opportunity-details-page__description-title">{section.title}</h3>
                            ) : null}
                            <p className="opportunity-details-page__description-text">{section.body}</p>
                          </article>
                        )) : (
                          <p className="opportunity-details-page__description-text">{opportunity.description}</p>
                        )}
                      </div>

                      {canApply ? (
                        <div className="opportunity-details-page__apply-section">
                          <Button
                            type="button"
                            variant={isApplied ? "danger-outline" : "secondary"}
                            className={isApplied
                              ? "opportunity-details-page__apply opportunity-details-page__apply-button opportunity-details-page__apply-button--applied opportunity-details-page__apply--withdraw"
                              : "opportunity-details-page__apply opportunity-details-page__apply-button"}
                            onClick={handleApply}
                            loading={submitApplicationMutation.isPending}
                          >
                            <span className="opportunity-details-page__apply-labels" aria-live="polite">
                              <span
                                className={
                                  isApplied
                                    ? "opportunity-details-page__apply-label opportunity-details-page__apply-label--inactive"
                                    : "opportunity-details-page__apply-label opportunity-details-page__apply-label--active"
                                }
                              >
                                Откликнуться
                              </span>
                              <span
                                className={
                                  isApplied
                                    ? "opportunity-details-page__apply-label opportunity-details-page__apply-label--active"
                                    : "opportunity-details-page__apply-label opportunity-details-page__apply-label--inactive"
                                }
                              >
                                Отозвать отклик
                              </span>
                            </span>
                          </Button>
                        </div>
                      ) : null}
                    </section>

                    {shouldShowRecommendationsSection ? (
                      <section className="opportunity-details-page__section">
                        <h2 className="opportunity-details-page__section-title">Контакты, подходящие под эту возможность</h2>
                        {recommendationCandidatesQuery.isPending ? (
                          <p className="opportunity-details-page__description-text">Подбираем подходящих кандидатов...</p>
                        ) : null}

                        <div className="opportunity-details-page__contacts-grid">
                          {visibleSuggestedContacts.map((contact) => {
                            const isRecommended = recommendedUserIds.includes(contact.userId);
                            const isCurrentTargetLoading =
                              recommendOpportunityMutation.isPending && recommendOpportunityMutation.variables === contact.userId;

                            return (
                              <article key={contact.id} className="opportunity-details-page__contact-card">
                                <div className="opportunity-details-page__contact-id-block">
                                  <span className="opportunity-details-page__contact-id">ID: {contact.id.slice(-6)}</span>
                                </div>

                                <div className="opportunity-details-page__contact-primary">
                                  <div className="opportunity-details-page__contact-avatar-shell">
                                    <img src={contact.avatarSrc} alt="" aria-hidden="true" className="opportunity-details-page__contact-avatar" />
                                  </div>
                                  <h3 className="opportunity-details-page__contact-name">{contact.name}</h3>
                                  <p className="opportunity-details-page__contact-subtitle">{contact.subtitle}</p>
                                  <p className="opportunity-details-page__contact-status">
                                    <span className={`opportunity-details-page__contact-dot${contact.isOnline ? " opportunity-details-page__contact-dot--online" : ""}`} />
                                    {contact.isOnline ? "Online" : "Недавно в сети"}
                                  </p>
                                </div>

                                {contact.levelLabel || contact.tags.length > 0 ? (
                                  <div className="opportunity-details-page__contact-tags">
                                    {contact.levelLabel ? (
                                      <span className={resolveSuggestedContactLevelClassName(contact.levelLabel)}>
                                        {contact.levelLabel}
                                      </span>
                                    ) : null}
                                    {contact.tags.map((tag) => (
                                      <span key={`${contact.id}-${tag}`} className="opportunity-details-page__contact-tag">
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}

                                <div className="opportunity-details-page__contact-meta">
                                  <span className="opportunity-details-page__contact-meta-item">
                                    <img src={locationIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon" />
                                    {contact.city}
                                  </span>
                                  <span className="opportunity-details-page__contact-meta-item">
                                    <img src={jobIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon" />
                                    {contact.salaryLabel}
                                  </span>
                                  <span className="opportunity-details-page__contact-meta-item">
                                    <img src={jobIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon" />
                                    {contact.formatLabel}
                                  </span>
                                  <span className="opportunity-details-page__contact-meta-item">
                                    <img src={timeIcon} alt="" aria-hidden="true" className="opportunity-details-page__contact-meta-icon" />
                                    {contact.employmentLabel}
                                  </span>
                                </div>

                                <Button
                                  type="button"
                                  variant={isRecommended ? "secondary-outline" : "secondary"}
                                  size="md"
                                  fullWidth
                                  onClick={() => handleRecommend(contact.userId)}
                                  loading={isCurrentTargetLoading}
                                  disabled={isRecommended}
                                >
                                  {isRecommended ? "Рекомендовано" : "Рекомендовать"}
                                </Button>
                              </article>
                            );
                          })}
                        </div>

                        {recommendedContactsTotalPages > 1 ? (
                          <nav className="opportunity-details-page__pagination" aria-label="Пагинация подходящих кандидатов">
                            <button
                              type="button"
                              className="opportunity-details-page__pagination-arrow"
                              onClick={() => setRecommendedContactsPage((currentValue) => Math.max(1, currentValue - 1))}
                              disabled={recommendedContactsCurrentPage === 1}
                              aria-label="Предыдущая страница"
                            >
                              <img
                                src={arrowIcon}
                                alt=""
                                aria-hidden="true"
                                className="opportunity-details-page__pagination-arrow-icon opportunity-details-page__pagination-arrow-icon--prev"
                              />
                            </button>
                            {recommendedContactsPaginationItems.map((item, index) =>
                              typeof item === "number" ? (
                                <button
                                  key={`${item}-${index}`}
                                  type="button"
                                  className={
                                    recommendedContactsCurrentPage === item
                                      ? "opportunity-details-page__pagination-page opportunity-details-page__pagination-page--active"
                                      : "opportunity-details-page__pagination-page"
                                  }
                                  onClick={() => setRecommendedContactsPage(item)}
                                >
                                  {item}
                                </button>
                              ) : (
                                <span key={`${item}-${index}`} className="opportunity-details-page__pagination-ellipsis">
                                  ...
                                </span>
                              ),
                            )}
                            <button
                              type="button"
                              className="opportunity-details-page__pagination-arrow"
                              onClick={() => setRecommendedContactsPage((currentValue) => Math.min(recommendedContactsTotalPages, currentValue + 1))}
                              disabled={recommendedContactsCurrentPage === recommendedContactsTotalPages}
                              aria-label="Следующая страница"
                            >
                              <img
                                src={arrowIcon}
                                alt=""
                                aria-hidden="true"
                                className="opportunity-details-page__pagination-arrow-icon"
                              />
                            </button>
                          </nav>
                        ) : null}
                      </section>
                    ) : null}
                  </div>
                </div>

                <div className="opportunity-details-page__hero-actions">
                  <button
                    type="button"
                    className={
                      isFavorite
                        ? "opportunity-details-page__favorite opportunity-details-page__favorite--active"
                        : "opportunity-details-page__favorite"
                    }
                    onClick={handleToggleFavorite}
                  >
                    <span className="opportunity-details-page__favorite-icon" aria-hidden="true" />
                    <span>{isFavorite ? "В избранном" : "Добавить в избранное"}</span>
                  </button>
                </div>
              </div>

            </div>

            <aside className="opportunity-details-page__sidebar">
              <div className="opportunity-details-page__company-card">
                <p className="opportunity-details-page__company-heading">Организатор</p>
                {opportunity.companyAvatarUrl ? (
                  <div className="opportunity-details-page__company-logo">
                    <img
                      src={resolveAvatarUrl(opportunity.companyAvatarUrl) ?? opportunity.companyAvatarUrl}
                      alt={opportunity.companyName}
                      className="opportunity-details-page__company-logo-image"
                    />
                  </div>
                ) : null}
                <h2 className="opportunity-details-page__company-name">{opportunity.companyName}</h2>

                {opportunity.companyVerified ? (
                  <span className="opportunity-details-page__company-badge">
                    Верифицировано
                    <img src={verifiedIcon} alt="" aria-hidden="true" />
                  </span>
                ) : null}

                <div className="opportunity-details-page__company-contacts">
                  {opportunity.contactEmail ? (
                    <a href={`mailto:${opportunity.contactEmail}`} className="opportunity-details-page__company-contact">
                      <img src={mailIcon} alt="" aria-hidden="true" className="opportunity-details-page__company-contact-icon" />
                      {opportunity.contactEmail}
                    </a>
                  ) : null}
                  {opportunity.companyWebsite ? (
                    <a href={opportunity.companyWebsite} target="_blank" rel="noreferrer" className="opportunity-details-page__company-contact">
                      <img src={siteIcon} alt="" aria-hidden="true" className="opportunity-details-page__company-contact-icon" />
                      {opportunity.companyWebsite.replace(/^https?:\/\//, "")}
                    </a>
                  ) : null}
                  {opportunity.companyPhone ? (
                    <a href={`tel:${opportunity.companyPhone}`} className="opportunity-details-page__company-contact">
                      <img src={phoneIcon} alt="" aria-hidden="true" className="opportunity-details-page__company-contact-icon" />
                      {opportunity.companyPhone}
                    </a>
                  ) : null}
                  <p className="opportunity-details-page__company-address">
                    <img src={locationIcon} alt="" aria-hidden="true" className="opportunity-details-page__company-contact-icon" />
                    {opportunity.address || opportunity.locationLabel}
                  </p>
                  <Link
                    to={{
                      pathname: "/",
                      search: opportunity.kind ? `?category=${opportunity.kind}` : "",
                      hash: "#opportunity-map",
                    }}
                    className="opportunity-details-page__map-link"
                  >
                    Показать на карте
                  </Link>
                </div>

                <Button type="button" variant="secondary-outline" size="md" fullWidth onClick={() => navigate(`/networking?employerId=${encodeURIComponent(opportunity.employerId)}`)}>
                  Подробнее
                </Button>
              </div>
            </aside>
          </section>
        ) : null}
      </Container>

      <Footer theme={themeRole} />

      <FavoriteAuthModal isOpen={isFavoriteAuthModalOpen} onClose={() => setIsFavoriteAuthModalOpen(false)} />
      <Modal
        isOpen={isWithdrawConfirmModalOpen}
        onClose={() => setIsWithdrawConfirmModalOpen(false)}
        title="Подтвердите отзыв"
        panelClassName="opportunity-details-page__confirm-modal"
      >
        <div className="opportunity-details-page__confirm-modal-body">
          <p className="opportunity-details-page__confirm-modal-text">
            Вы действительно хотите отозвать отклик на эту возможность?
          </p>
          <div className="opportunity-details-page__confirm-modal-actions">
            <Button
              type="button"
              variant="danger-outline"
              size="md"
              onClick={handleConfirmWithdraw}
              loading={submitApplicationMutation.isPending}
            >
              Отозвать отклик
            </Button>
            <Button
              type="button"
              variant="primary-outline"
              size="md"
              onClick={() => setIsWithdrawConfirmModalOpen(false)}
              disabled={submitApplicationMutation.isPending}
            >
              Отмена
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
