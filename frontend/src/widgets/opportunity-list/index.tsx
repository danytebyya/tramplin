import verifiedIcon from "../../assets/icons/verified.svg";
import { Opportunity } from "../../entities/opportunity";
import { Badge, Button } from "../../shared/ui";
import "./opportunity-list.css";

type OpportunityListProps = {
  opportunities: Opportunity[];
  favoriteOpportunityIds: string[];
  appliedOpportunityIds?: string[];
  roleName?: string;
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
  roleName,
  onToggleFavorite,
  onApply,
  onWrite,
}: OpportunityListProps) {
  const actionLabel = roleName === "employer" ? "Подробнее" : "Откликнуться";

  return (
    <section className="opportunity-list" aria-label="Список возможностей">
      {opportunities.map((opportunity) => {
        const isFavorite = favoriteOpportunityIds.includes(opportunity.id);
        const isApplied = appliedOpportunityIds.includes(opportunity.id);

        return (
          <article key={opportunity.id} className="opportunity-list__card">
            <div className="opportunity-list__content">
              <div className="opportunity-list__title-block">
                <div className="opportunity-list__title-row">
                  <h3 className="opportunity-list__title">{opportunity.title}</h3>
                  <button
                    type="button"
                    className="opportunity-list__favorite"
                    aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
                    aria-pressed={isFavorite}
                    onClick={() => onToggleFavorite(opportunity.id)}
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

              <div className="opportunity-list__tags-block">
                <div className="opportunity-list__tags">
                  {opportunity.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="opportunity-list__tag">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="opportunity-list__details-block">
                <p className="opportunity-list__secondary">Уровень: {opportunity.levelLabel}</p>
                <p className="opportunity-list__secondary">
                  Занятость: {opportunity.employmentLabel}
                </p>
              </div>

              <div className="opportunity-list__description-block">
                <p className="opportunity-list__text">{opportunity.description}</p>
                <div className="opportunity-list__content-actions">
                  <Button
                    type="button"
                    variant={roleName !== "employer" && isApplied ? "danger-outline" : "secondary"}
                    size="sm"
                    onClick={() => onApply?.(opportunity.id)}
                  >
                    {roleName !== "employer" && isApplied ? "Отозвать отклик" : actionLabel}
                  </Button>
                </div>
              </div>
            </div>

            <div className="opportunity-list__side">
              <div className="opportunity-list__company-block">
                <div className="opportunity-list__company-row">
                  <div className="opportunity-list__company-header">
                    <p className="opportunity-list__company">{opportunity.companyName}</p>
                    {opportunity.companyVerified ? (
                      <span className="opportunity-list__verified-icon" aria-hidden="true">
                        <img src={verifiedIcon} alt="" aria-hidden="true" className="opportunity-list__verified-icon-image" />
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="opportunity-list__rating-block">
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
                <Button type="button" variant="secondary-outline" size="sm">
                  Показать контакты
                </Button>
                <Button
                  type="button"
                  variant="secondary-outline"
                  size="sm"
                  onClick={() => onWrite?.(opportunity)}
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
