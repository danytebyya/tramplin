import { useQuery } from "@tanstack/react-query";

import { getModerationDashboardRequest } from "../../features/moderation";
import { Button, Container, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import "./curator-dashboard.css";

function formatRelativeMinutes(timestamp: string) {
  const createdAt = new Date(timestamp).getTime();
  const diffMs = Math.max(Date.now() - createdAt, 0);
  const diffMinutes = Math.max(Math.round(diffMs / 60000), 1);

  if (diffMinutes < 60) {
    return `${diffMinutes} минут назад`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} часов назад`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} дней назад`;
}

const MAX_VISIBLE_ACTIVITY_ITEMS = 4;
const MAX_VISIBLE_URGENT_ITEMS = 2;

type ModerationDashboardContentProps = {
  footerTheme?: "curator" | "admin";
  showFooter?: boolean;
};

export function ModerationDashboardContent({
  footerTheme = "curator",
  showFooter = false,
}: ModerationDashboardContentProps) {
  const dashboardQuery = useQuery({
    queryKey: ["moderation", "dashboard"],
    queryFn: getModerationDashboardRequest,
    staleTime: 60 * 1000,
    refetchInterval: () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return false;
      }

      return 15 * 1000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const metrics = dashboardQuery.data?.data?.metrics;
  const weeklyActivity = dashboardQuery.data?.data?.weekly_activity;
  const latestActivity = dashboardQuery.data?.data?.latest_activity ?? [];
  const urgentTaskGroups = dashboardQuery.data?.data?.urgent_task_groups ?? [];
  const visibleLatestActivity = latestActivity.slice(0, MAX_VISIBLE_ACTIVITY_ITEMS);
  const maxDayCount = Math.max(...(weeklyActivity?.days?.map((item) => item.count) ?? [0]), 1);
  const maxCategoryCount = Math.max(
    ...(weeklyActivity?.categories?.map((item) => item.count) ?? [0]),
    1,
  );

  return (
    <section className="curator-dashboard" id="dashboard">
      <Container className="curator-dashboard__container">
        <header className="curator-dashboard__header">
          <h1 className="curator-dashboard__title">Дашборд</h1>
        </header>

        <section className="curator-dashboard__section" aria-labelledby="curator-metrics-title">
          <h2 id="curator-metrics-title" className="curator-dashboard__section-title">
            Ключевые метрики
          </h2>
          <div className="curator-dashboard__metrics">
            <article className="curator-dashboard__metric-card">
              <span className="curator-dashboard__metric-label">Всего на модерации:</span>
              <strong className="curator-dashboard__metric-value">
                {metrics?.total_on_moderation ?? 0}
              </strong>
            </article>
            <article className="curator-dashboard__metric-card">
              <span className="curator-dashboard__metric-label">В очереди:</span>
              <strong className="curator-dashboard__metric-value">{metrics?.in_queue ?? 0}</strong>
            </article>
            <article className="curator-dashboard__metric-card">
              <span className="curator-dashboard__metric-label">Сегодня проверено:</span>
              <strong className="curator-dashboard__metric-value">
                {metrics?.reviewed_today ?? 0}
              </strong>
            </article>
            <article className="curator-dashboard__metric-card">
              <span className="curator-dashboard__metric-label">Кураторов онлайн:</span>
              <strong className="curator-dashboard__metric-value">
                {metrics?.curators_online ?? 0}
              </strong>
            </article>
          </div>
        </section>

        <section className="curator-dashboard__section" aria-labelledby="curator-week-title">
          <h2 id="curator-week-title" className="curator-dashboard__section-title">
            Активность за неделю
          </h2>
          <div className="curator-dashboard__week-grid">
            <article className="curator-dashboard__week-card">
              <span className="curator-dashboard__week-label">Проверено заявок:</span>
              <strong className="curator-dashboard__week-total">
                {weeklyActivity?.total_reviewed ?? 0}
              </strong>
            </article>

            <article className="curator-dashboard__week-card">
              <div className="curator-dashboard__chart">
                {(weeklyActivity?.days ?? []).map((item) => (
                  <div key={item.label} className="curator-dashboard__chart-column">
                    <span className="curator-dashboard__chart-value">{item.count}</span>
                    <div
                      className="curator-dashboard__chart-bar"
                      style={{ height: `${Math.max((item.count / maxDayCount) * 120, item.count > 0 ? 10 : 0)}px` }}
                    />
                    <span className="curator-dashboard__chart-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="curator-dashboard__week-card">
              <div className="curator-dashboard__category-list">
                {(weeklyActivity?.categories ?? []).map((item) => (
                  <div key={item.label} className="curator-dashboard__category-item">
                    <span className="curator-dashboard__category-label">{item.label}</span>
                    <div className="curator-dashboard__category-track">
                      <div
                        className="curator-dashboard__category-fill"
                        style={{ width: `${Math.max((item.count / maxCategoryCount) * 100, item.count > 0 ? 18 : 0)}%` }}
                      />
                    </div>
                    <span className="curator-dashboard__category-value">{item.count}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="curator-dashboard__bottom-grid">
          <div className="curator-dashboard__bottom-section">
            <h2 className="curator-dashboard__section-title">Последняя активность</h2>
              <article className="curator-dashboard__activity-card">
                <div className="curator-dashboard__activity-list">
                {visibleLatestActivity.length > 0 ? (
                  visibleLatestActivity.map((item) => (
                    <div key={item.id} className="curator-dashboard__activity-item">
                      <div className="curator-dashboard__activity-status">
                        <Status variant={item.status_variant}>{item.status_label}</Status>
                      </div>
                      <div className="curator-dashboard__activity-content">
                        <div className="curator-dashboard__activity-subject-line">
                          <span className="curator-dashboard__activity-subject">{item.subject}</span>
                          <span className="curator-dashboard__activity-separator" aria-hidden="true">
                            •
                          </span>
                          <span className="curator-dashboard__activity-meta">{item.meta}</span>
                        </div>
                        <div className="curator-dashboard__activity-time">
                          {formatRelativeMinutes(item.created_at)}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="curator-dashboard__empty">Пока нет завершённых действий модерации.</p>
                )}
              </div>
            </article>
          </div>

          <div className="curator-dashboard__bottom-section">
            <h2 className="curator-dashboard__section-title">Срочные задачи</h2>
            <article className="curator-dashboard__urgent-card">
              <div className="curator-dashboard__urgent-groups">
                {urgentTaskGroups.length > 0 ? (
                  urgentTaskGroups.map((group) => (
                    <section key={group.title} className="curator-dashboard__urgent-group">
                      <div className="curator-dashboard__urgent-group-title">
                        <span
                          className={`curator-dashboard__urgent-group-dot curator-dashboard__urgent-group-dot--${group.accent}`}
                          aria-hidden="true"
                        />
                        <span className="curator-dashboard__urgent-group-label">{group.title}:</span>
                        <span className="curator-dashboard__urgent-group-count">{group.items.length}</span>
                      </div>
                      <div className="curator-dashboard__urgent-list">
                        {group.items.slice(0, MAX_VISIBLE_URGENT_ITEMS).map((item) => (
                          <div key={item.id} className="curator-dashboard__urgent-item">
                            <div className="curator-dashboard__urgent-subject">{item.subject}</div>
                            <div className="curator-dashboard__urgent-meta">
                              {item.meta} · {item.age_days} дн. без решения
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))
                ) : (
                  <p className="curator-dashboard__empty">Срочных задач нет.</p>
                )}
              </div>
              <div className="curator-dashboard__urgent-actions">
                <Button type="button" variant="accent" size="md">
                  Перейти к проверке
                </Button>
              </div>
            </article>
          </div>
        </section>
      </Container>
      {showFooter ? <Footer hashPrefix="/" theme={footerTheme} /> : null}
    </section>
  );
}

export function CuratorDashboardPage() {
  return <ModerationDashboardContent showFooter footerTheme="curator" />;
}
