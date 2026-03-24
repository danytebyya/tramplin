import { Opportunity } from "../../entities/opportunity";
import { Button } from "../../shared/ui";
import "./opportunity-list.css";

type OpportunityListProps = {
  opportunities: Opportunity[];
};

function getOpportunityKindLabel(kind: Opportunity["kind"]) {
  if (kind === "internship") {
    return "Стажировка";
  }

  if (kind === "event") {
    return "Мероприятие";
  }

  return "Вакансия";
}

export function OpportunityList({ opportunities }: OpportunityListProps) {
  return (
    <section className="opportunity-list" aria-label="Список возможностей">
      {opportunities.map((opportunity) => (
        <article key={opportunity.id} className="opportunity-list__card">
          <div className="opportunity-list__media" aria-hidden="true" />

          <div className="opportunity-list__content">
            <h3 className="opportunity-list__title">{getOpportunityKindLabel(opportunity.kind)}</h3>
            <p className="opportunity-list__price">{opportunity.salaryLabel}</p>
            <p className="opportunity-list__meta">{opportunity.locationLabel}</p>
            <div className="opportunity-list__tags">
              {opportunity.tags.map((tag) => (
                <span key={tag} className="opportunity-list__tag">
                  {tag}
                </span>
              ))}
            </div>
            <p className="opportunity-list__secondary">Уровень: {opportunity.levelLabel}</p>
            <p className="opportunity-list__secondary">Занятость: {opportunity.employmentLabel}</p>
            <p className="opportunity-list__text">{opportunity.description}</p>
            <p className="opportunity-list__secondary">{getOpportunityKindLabel(opportunity.kind)}</p>
          </div>

          <div className="opportunity-list__actions">
            <p className="opportunity-list__company">{opportunity.companyName}</p>
            {opportunity.companyVerified ? <span className="opportunity-list__badge">Верифицировано</span> : null}
            <Button type="button" variant="accent-outline">
              Показать контакты
            </Button>
            <Button type="button" variant="accent">
              Написать
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
