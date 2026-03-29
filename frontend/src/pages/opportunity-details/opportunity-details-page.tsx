import { useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { listOpportunitiesRequest } from "../../entities/opportunity/api";
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
import { resolveAvatarIcon } from "../../shared/lib";
import { Button, Container } from "../../shared/ui";
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
  name: string;
  subtitle: string;
  isOnline: boolean;
  tags: string[];
  city: string;
  salaryLabel: string;
  formatLabel: string;
  employmentLabel: string;
  avatarSrc: string;
};

function resolveThemeRole(role: string | null) {
  if (role === "junior") {
    return "curator";
  }

  if (role === "employer" || role === "curator" || role === "admin") {
    return role;
  }

  return "applicant";
}

function formatOpportunityKindLabel(kind: Opportunity["kind"]) {
  if (kind === "internship") {
    return "Стажировка";
  }

  if (kind === "event") {
    return "Мероприятие";
  }

  if (kind === "mentorship") {
    return "Менторская программа";
  }

  return "Вакансия";
}

function formatOpportunityFormatLabel(format: Opportunity["format"]) {
  if (format === "office") {
    return "Оффлайн";
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

function buildSuggestedContacts(opportunity: Opportunity): SuggestedContact[] {
  const sharedTags = opportunity.tags.slice(0, 4);
  const city = opportunity.city || "Чебоксары";
  const avatarSrc = resolveAvatarIcon("applicant");

  return [
    {
      id: `${opportunity.id}-contact-1`,
      name: "Мария Петрова",
      subtitle: "ЧГУ, выпуск 2024",
      isOnline: true,
      tags: ["Junior", ...sharedTags],
      city,
      salaryLabel: "от 80 000 ₽",
      formatLabel: formatOpportunityFormatLabel(opportunity.format),
      employmentLabel: opportunity.employmentLabel,
      avatarSrc,
    },
    {
      id: `${opportunity.id}-contact-2`,
      name: "Илья Смирнов",
      subtitle: "МГУ, выпуск 2025",
      isOnline: false,
      tags: ["Junior", ...sharedTags.slice(0, 3), "C++"],
      city,
      salaryLabel: "от 70 000 ₽",
      formatLabel: formatOpportunityFormatLabel(opportunity.format),
      employmentLabel: opportunity.employmentLabel,
      avatarSrc,
    },
  ];
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
    () => (opportunity ? buildSuggestedContacts(opportunity) : []),
    [opportunity],
  );

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

    submitApplicationMutation.mutate({
      targetOpportunityId: opportunity.id,
      shouldWithdraw: isApplied,
    });
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
                  <p className="opportunity-details-page__eyebrow">{formatOpportunityKindLabel(opportunity.kind)}</p>
                  <h1 className="opportunity-details-page__title">{opportunity.title}</h1>
                  <p className="opportunity-details-page__salary">{opportunity.salaryLabel} в месяц</p>
                  <p className="opportunity-details-page__published">
                    Дата публикации: {formatPublishedAt(opportunity.publishedAt)}
                  </p>

                  <div className="opportunity-details-page__meta">
                    <span className="opportunity-details-page__meta-item">{opportunity.city || "Россия"}</span>
                    <span className="opportunity-details-page__meta-item">{formatOpportunityFormatLabel(opportunity.format)}</span>
                    <span className="opportunity-details-page__meta-item">{opportunity.employmentLabel}</span>
                    <span className="opportunity-details-page__meta-item">{opportunity.levelLabel}</span>
                  </div>

                  <div className="opportunity-details-page__tags">
                    {opportunity.tags.map((tag) => (
                      <span key={tag} className="opportunity-details-page__tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="opportunity-details-page__hero-actions">
                  {canApply ? (
                    <Button
                      type="button"
                      variant={isApplied ? "danger-outline" : "secondary"}
                      size="md"
                      className="opportunity-details-page__apply"
                      onClick={handleApply}
                      loading={submitApplicationMutation.isPending}
                    >
                      {isApplied ? "Отозвать отклик" : "Откликнуться"}
                    </Button>
                  ) : null}

                  <button
                    type="button"
                    className={
                      isFavorite
                        ? "opportunity-details-page__favorite opportunity-details-page__favorite--active"
                        : "opportunity-details-page__favorite"
                    }
                    onClick={handleToggleFavorite}
                  >
                    <span className="opportunity-details-page__favorite-star" aria-hidden="true">☆</span>
                    <span>{isFavorite ? "В избранном" : "Добавить в избранное"}</span>
                  </button>
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
              </section>

              <section className="opportunity-details-page__section">
                <h2 className="opportunity-details-page__section-title">Контакты, подходящие под эту возможность</h2>
                <div className="opportunity-details-page__contacts-grid">
                  {suggestedContacts.map((contact) => (
                    <article key={contact.id} className="opportunity-details-page__contact-card">
                      <span className="opportunity-details-page__contact-id">id: {contact.id.slice(-6)}</span>
                      <div className="opportunity-details-page__contact-avatar-shell">
                        <img src={contact.avatarSrc} alt="" aria-hidden="true" className="opportunity-details-page__contact-avatar" />
                      </div>
                      <h3 className="opportunity-details-page__contact-name">{contact.name}</h3>
                      <p className="opportunity-details-page__contact-subtitle">{contact.subtitle}</p>
                      <p className="opportunity-details-page__contact-status">
                        <span className={`opportunity-details-page__contact-dot${contact.isOnline ? " opportunity-details-page__contact-dot--online" : ""}`} />
                        {contact.isOnline ? "Online" : "Недавно в сети"}
                      </p>

                      <div className="opportunity-details-page__contact-tags">
                        {contact.tags.map((tag) => (
                          <span key={`${contact.id}-${tag}`} className="opportunity-details-page__contact-tag">
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="opportunity-details-page__contact-meta">
                        <span>{contact.city}</span>
                        <span>{contact.salaryLabel}</span>
                        <span>{contact.formatLabel}</span>
                        <span>{contact.employmentLabel}</span>
                      </div>

                      <Button type="button" variant="secondary" size="md" fullWidth>
                        Рекомендовать
                      </Button>
                    </article>
                  ))}
                </div>
              </section>
            </div>

            <aside className="opportunity-details-page__sidebar">
              <div className="opportunity-details-page__company-card">
                <p className="opportunity-details-page__company-heading">Организатор</p>
                <div className="opportunity-details-page__company-logo-placeholder" />
                <h2 className="opportunity-details-page__company-name">{opportunity.companyName}</h2>

                {opportunity.companyVerified ? (
                  <span className="opportunity-details-page__company-badge">
                    <img src={verifiedIcon} alt="" aria-hidden="true" />
                    Верифицировано
                  </span>
                ) : null}

                <p className="opportunity-details-page__company-rating">
                  Рейтинг {opportunity.companyRating !== null ? `${opportunity.companyRating}/5` : "4,5/5"}
                </p>
                <p className="opportunity-details-page__company-reviews">
                  {opportunity.companyReviewsCount || 10} отзывов
                </p>

                <div className="opportunity-details-page__company-contacts">
                  {opportunity.contactEmail ? (
                    <a href={`mailto:${opportunity.contactEmail}`} className="opportunity-details-page__company-contact">
                      {opportunity.contactEmail}
                    </a>
                  ) : null}
                  {opportunity.companyWebsite ? (
                    <a href={opportunity.companyWebsite} target="_blank" rel="noreferrer" className="opportunity-details-page__company-contact">
                      {opportunity.companyWebsite.replace(/^https?:\/\//, "")}
                    </a>
                  ) : null}
                  {opportunity.companyPhone ? (
                    <a href={`tel:${opportunity.companyPhone}`} className="opportunity-details-page__company-contact">
                      {opportunity.companyPhone}
                    </a>
                  ) : null}
                  <p className="opportunity-details-page__company-address">{opportunity.address || opportunity.locationLabel}</p>
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
    </main>
  );
}
