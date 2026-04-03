import { KeyboardEvent, MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Opportunity } from "../../entities/opportunity";
import type { BackendApplicationStatus } from "../../features/applications";
import { Badge, Button, VerifiedTooltip } from "../../shared/ui";
import "./opportunity-list.css";

type OpportunityListProps = {
  opportunities: Opportunity[];
  favoriteOpportunityIds: string[];
  appliedOpportunityIds?: string[];
  applicationStatusByOpportunityId?: Record<string, BackendApplicationStatus>;
  roleName?: string;
  isLoading?: boolean;
  skeletonCount?: number;
  onToggleFavorite: (opportunityId: string) => void;
  onApply?: (opportunityId: string) => void;
  onWrite?: (opportunity: Opportunity) => void;
};

function getOpportunityKindLabel(kind: Opportunity["kind"]) {
  if (kind === "internship") {
    return "Стажировка";
  }

  if (kind === "event") {
    return "Мероприятие";
  }

  if (kind === "mentorship") {
    return "Менторство";
  }

  return "Вакансия";
}

export function OpportunityList({
  opportunities,
  favoriteOpportunityIds,
  appliedOpportunityIds = [],
  applicationStatusByOpportunityId = {},
  roleName,
  isLoading = false,
  skeletonCount = 3,
  onToggleFavorite,
  onApply,
  onWrite,
}: OpportunityListProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const actionLabel = roleName === "employer" ? "Подробнее" : "Откликнуться";
  const solidThemeVariant =
    roleName === "applicant"
      ? "secondary"
      : roleName === "curator" || roleName === "admin"
        ? "accent"
        : "primary";
  const outlineThemeVariant =
    roleName === "applicant"
      ? "secondary-outline"
      : roleName === "curator" || roleName === "admin"
        ? "accent-outline"
        : "primary-outline";

  const resolveStatusButtonMeta = (status: BackendApplicationStatus | undefined) => {
    if (status === "withdrawn") {
      return { label: "Отклик отозван", variant: "secondary-outline" as const };
    }

    if (status === "rejected") {
      return { label: "Работодатель отклонил отклик", variant: "danger-outline" as const };
    }

    if (status === "interview" || status === "offer" || status === "accepted") {
      return { label: "Работодатель принял отклик", variant: "secondary-outline" as const };
    }

    return null;
  };

  if (isLoading) {
    return (
      <section className="opportunity-list" aria-label="Список возможностей">
        {Array.from({ length: skeletonCount }, (_, index) => (
          <article key={`opportunity-skeleton-${index}`} className="opportunity-list__card opportunity-list__card--skeleton" aria-hidden="true">
            <div className="opportunity-list__summary">
              <div className="opportunity-list__title-panel">
                <div className="opportunity-list__title-summary">
                  <span className="opportunity-list__skeleton opportunity-list__skeleton--title" />
                  <span className="opportunity-list__skeleton opportunity-list__skeleton--favorite" />
                </div>
                <span className="opportunity-list__skeleton opportunity-list__skeleton--kind" />
              </div>

              <div className="opportunity-list__summary">
                <span className="opportunity-list__skeleton opportunity-list__skeleton--price" />
                <span className="opportunity-list__skeleton opportunity-list__skeleton--meta" />
              </div>

              <div className="opportunity-list__tags">
                <span className="opportunity-list__skeleton opportunity-list__skeleton--tag" />
                <span className="opportunity-list__skeleton opportunity-list__skeleton--tag" />
                <span className="opportunity-list__skeleton opportunity-list__skeleton--tag opportunity-list__skeleton--tag-wide" />
              </div>

              <div className="opportunity-list__details-panel">
                <span className="opportunity-list__skeleton opportunity-list__skeleton--meta" />
                <span className="opportunity-list__skeleton opportunity-list__skeleton--meta opportunity-list__skeleton--meta-short" />
              </div>

              <div className="opportunity-list__description-panel">
                <span className="opportunity-list__skeleton opportunity-list__skeleton--text" />
                <span className="opportunity-list__skeleton opportunity-list__skeleton--text opportunity-list__skeleton--text-short" />
                <div className="opportunity-list__card-actions">
                  <span className="opportunity-list__skeleton opportunity-list__skeleton--button" />
                </div>
              </div>
            </div>

            <div className="opportunity-list__side">
              <div className="opportunity-list__company-panel">
                <div className="opportunity-list__company-header">
                  <span className="opportunity-list__skeleton opportunity-list__skeleton--company" />
                  <span className="opportunity-list__skeleton opportunity-list__skeleton--verified" />
                </div>
                <div className="opportunity-list__rating-panel">
                  <span className="opportunity-list__skeleton opportunity-list__skeleton--rating" />
                  <span className="opportunity-list__skeleton opportunity-list__skeleton--rating opportunity-list__skeleton--rating-short" />
                </div>
              </div>

              <div className="opportunity-list__actions">
                <span className="opportunity-list__skeleton opportunity-list__skeleton--button" />
                <span className="opportunity-list__skeleton opportunity-list__skeleton--button" />
              </div>
            </div>
          </article>
        ))}
      </section>
    );
  }

  const openOpportunity = (opportunityId: string) => {
    navigate(`/opportunities/${opportunityId}`, {
      state: {
        backgroundLocation: location,
        restoreScrollY: window.scrollY,
        restoreViewMode: "list",
        returnTo: {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
        },
      },
    });
  };

  const openEmployerProfile = (opportunity: Opportunity) => {
    if (opportunity.employerPublicId) {
      navigate(`/profiles/${opportunity.employerPublicId}`, {
        state: {
          restoreScrollY: window.scrollY,
          restoreViewMode: "list",
          returnTo: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          },
        },
      });
      return;
    }

    if (onWrite) {
      onWrite(opportunity);
      return;
    }

    openOpportunity(opportunity.id);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>, opportunityId: string) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openOpportunity(opportunityId);
  };

  const handleCardClick = (event: MouseEvent<HTMLElement>, opportunityId: string) => {
    const selectedText = window.getSelection()?.toString().trim() ?? "";

    if (selectedText.length > 0) {
      event.preventDefault();
      return;
    }

    openOpportunity(opportunityId);
  };

  return (
    <section className="opportunity-list" aria-label="Список возможностей">
      {opportunities.map((opportunity) => {
        const isFavorite = favoriteOpportunityIds.includes(opportunity.id);
        const isApplied = appliedOpportunityIds.includes(opportunity.id);
        const statusButtonMeta = resolveStatusButtonMeta(applicationStatusByOpportunityId[opportunity.id]);
        const shouldDisableAction = roleName !== "employer" && !isApplied && statusButtonMeta !== null;

        return (
          <article
            key={opportunity.id}
            className="opportunity-list__card"
            role="link"
            tabIndex={0}
            onClick={(event) => handleCardClick(event, opportunity.id)}
            onKeyDown={(event) => handleCardKeyDown(event, opportunity.id)}
          >
            <div className="opportunity-list__summary">
              <div className="opportunity-list__title-panel">
                <div className="opportunity-list__title-summary">
                  <h3 className="opportunity-list__title">
                    <span className="opportunity-list__title-link">{opportunity.title}</span>
                  </h3>
                  <button
                    type="button"
                    className="opportunity-list__favorite"
                    aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                    aria-pressed={isFavorite}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(opportunity.id);
                    }}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 512 489"
                      className="opportunity-list__favorite-icon"
                    >
                      <path
                        d={
                          isFavorite
                            ? "M256 403.578L118.839 486.44C115.369 488.299 111.837 489.146 108.243 488.979C104.644 488.813 101.378 487.697 98.4453 485.633C95.5124 483.564 93.3127 480.844 91.8463 477.474C90.3798 474.103 90.1838 470.352 91.2581 466.218L127.331 310.17L6.65522 204.796C3.38928 202.066 1.35345 198.935 0.54771 195.403C-0.258031 191.866 -0.174773 188.413 0.797488 185.042C1.76975 181.672 3.6713 178.872 6.50214 176.641C9.33298 174.405 12.8138 173.123 16.9445 172.795L176.602 158.717L238.709 11.1026C240.444 7.50653 242.891 4.75706 246.049 2.85423C249.213 0.951398 252.53 0 256 0C259.47 0 262.787 0.951398 265.951 2.85423C269.109 4.75706 271.556 7.50653 273.291 11.1026L335.398 158.717L495.055 172.795C499.186 173.123 502.667 174.405 505.498 176.641C508.329 178.872 510.23 181.672 511.203 185.042C512.175 188.413 512.258 191.866 511.452 195.403C510.647 198.935 508.611 202.066 505.345 204.796L384.669 310.17L421.048 466.218C421.918 470.352 421.62 474.103 420.154 477.474C418.687 480.844 416.488 483.564 413.555 485.633C410.622 487.697 407.356 488.813 403.757 488.979C400.163 489.146 396.631 488.299 393.161 486.44L256 403.578Z"
                            : "M136.315 432.854L256 360.78L375.685 433.66L344.011 297.269L449.314 205.788L310.42 193.508L256 65.1881L201.58 192.702L62.6865 204.982L167.989 296.777L136.315 432.854ZM256 403.578L118.839 486.44C115.369 488.299 111.837 489.146 108.243 488.979C104.644 488.813 101.378 487.697 98.4453 485.633C95.5124 483.564 93.3127 480.844 91.8463 477.474C90.3798 474.103 90.1838 470.352 91.2581 466.218L127.331 310.17L6.65522 204.796C3.38928 202.066 1.35345 198.935 0.54771 195.403C-0.258031 191.866 -0.174773 188.413 0.797488 185.042C1.76975 181.672 3.6713 178.872 6.50214 176.641C9.33298 174.405 12.8138 173.123 16.9445 172.795L176.602 158.717L238.709 11.1026C240.444 7.50653 242.891 4.75706 246.049 2.85423C249.213 0.951398 252.53 0 256 0C259.47 0 262.787 0.951398 265.951 2.85423C269.109 4.75706 271.556 7.50653 273.291 11.1026L335.398 158.717L495.055 172.795C499.186 173.123 502.667 174.405 505.498 176.641C508.329 178.872 510.23 181.672 511.203 185.042C512.175 188.413 512.258 191.866 511.452 195.403C510.647 198.935 508.611 202.066 505.345 204.796L384.669 310.17L421.048 466.218C421.918 470.352 421.62 474.103 420.154 477.474C418.687 480.844 416.488 483.564 413.555 485.633C410.622 487.697 407.356 488.813 403.757 488.979C400.163 489.146 396.631 488.299 393.161 486.44L256 403.578Z"
                        }
                      />
                    </svg>
                  </button>
                </div>
                <p className="opportunity-list__kind">{getOpportunityKindLabel(opportunity.kind)}</p>
              </div>

              <div className="opportunity-list__summary">
                <p className="opportunity-list__price">{opportunity.salaryLabel}</p>
                <p className="opportunity-list__meta">{opportunity.locationLabel}</p>
              </div>

              <div className="opportunity-list__tags-panel">
                <div className="opportunity-list__tags">
                  {opportunity.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="opportunity-list__tag">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="opportunity-list__details-panel">
                <p className="opportunity-list__secondary">Уровень: {opportunity.levelLabel}</p>
                <p className="opportunity-list__secondary">
                  Занятость: {opportunity.employmentLabel}
                </p>
              </div>

              <div className="opportunity-list__description-panel">
                <p className="opportunity-list__text">{opportunity.description}</p>
                <div className="opportunity-list__card-actions">
                  <Button
                    type="button"
                    variant={
                      shouldDisableAction
                        ? statusButtonMeta.variant
                        : roleName !== "employer" && isApplied
                          ? "danger-outline"
                          : solidThemeVariant
                    }
                    size="sm"
                    disabled={shouldDisableAction}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (shouldDisableAction) {
                        return;
                      }
                      onApply?.(opportunity.id);
                    }}
                  >
                    {shouldDisableAction
                      ? statusButtonMeta.label
                      : roleName !== "employer" && isApplied
                        ? "Отозвать отклик"
                        : actionLabel}
                  </Button>
                </div>
              </div>
            </div>

            <div className="opportunity-list__side">
              <div className="opportunity-list__company-panel">
                <div className="opportunity-list__company-summary">
                  <div className="opportunity-list__company-header">
                    {opportunity.employerPublicId ? (
                      <button
                        type="button"
                        className="opportunity-list__company opportunity-list__company-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEmployerProfile(opportunity);
                        }}
                      >
                        {opportunity.companyName}
                      </button>
                    ) : (
                      <p className="opportunity-list__company">{opportunity.companyName}</p>
                    )}
                    {opportunity.companyVerified ? (
                      <VerifiedTooltip className="opportunity-list__verified-icon" />
                    ) : null}
                  </div>
                </div>

                <div className="opportunity-list__rating-panel">
                  <p className="opportunity-list__rating">
                    Рейтинг:{" "}
                    {opportunity.companyRating !== null ? `${opportunity.companyRating}/5` : "0/5"}
                  </p>
                  <span className="opportunity-list__rating-separator" aria-hidden="true" />
                  <p className="opportunity-list__reviews">
                    {opportunity.companyReviewsCount} отзывов
                  </p>
                </div>
              </div>

              <div className="opportunity-list__actions">
                <Button
                  type="button"
                  variant={outlineThemeVariant}
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    openEmployerProfile(opportunity);
                  }}
                >
                  Показать контакты
                </Button>
                <Button
                  type="button"
                  variant={solidThemeVariant}
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    onWrite?.(opportunity);
                  }}
                >
                  Написать
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
