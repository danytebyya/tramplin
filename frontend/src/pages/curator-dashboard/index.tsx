import { useQuery } from "@tanstack/react-query";

import { getModerationDashboardRequest } from "../../features/moderation";
import { abbreviateLegalEntityName } from "../../shared/lib/legal-entity";
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
const DEFAULT_WEEK_ACTIVITY_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DEFAULT_WEEK_ACTIVITY_CATEGORIES = ["Вакансии", "Стажировки", "Мероприятия", "Менторства"];

type ModerationDashboardContentProps = {
  footerTheme?: "curator" | "admin";
  showFooter?: boolean;
};

function DashboardSkeleton({ className }: { className: string }) {
  return <span className={`curator-dashboard__skeleton ${className}`} aria-hidden="true" />;
}

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
  const chartDays =
    weeklyActivity?.days && weeklyActivity.days.length > 0
      ? weeklyActivity.days
      : DEFAULT_WEEK_ACTIVITY_DAYS.map((label) => ({
          label,
          count: 0,
        }));
  const chartCategories =
    weeklyActivity?.categories && weeklyActivity.categories.length > 0
      ? weeklyActivity.categories
      : DEFAULT_WEEK_ACTIVITY_CATEGORIES.map((label) => ({
          label,
          count: 0,
        }));
  const latestActivity = dashboardQuery.data?.data?.latest_activity ?? [];
  const urgentTaskGroups = dashboardQuery.data?.data?.urgent_task_groups ?? [];
  const visibleLatestActivity = latestActivity.slice(0, MAX_VISIBLE_ACTIVITY_ITEMS);
  const maxDayCount = Math.max(...chartDays.map((item) => item.count), 1);
  const maxCategoryCount = Math.max(...chartCategories.map((item) => item.count), 1);
  const isLoading = dashboardQuery.isPending;

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
            {[
              ["Всего на модерации:", metrics?.total_on_moderation ?? 0],
              ["В очереди:", metrics?.in_queue ?? 0],
              ["Сегодня проверено:", metrics?.reviewed_today ?? 0],
              ["Кураторов онлайн:", metrics?.curators_online ?? 0],
            ].map(([label, value]) => (
              <article key={label} className="curator-dashboard__metric-card">
                <span className="curator-dashboard__metric-label">{label}</span>
                {isLoading ? (
                  <DashboardSkeleton className="curator-dashboard__skeleton--metric-value" />
                ) : (
                  <strong className="curator-dashboard__metric-value">{value}</strong>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="curator-dashboard__section" aria-labelledby="curator-week-title">
          <h2 id="curator-week-title" className="curator-dashboard__section-title">
            Активность за неделю
          </h2>
          <div className="curator-dashboard__week-grid">
            <article className="curator-dashboard__week-card">
              <span className="curator-dashboard__week-label">Проверено заявок:</span>
              {isLoading ? (
                <DashboardSkeleton className="curator-dashboard__skeleton--week-total" />
              ) : (
                <strong className="curator-dashboard__week-total">
                  {weeklyActivity?.total_reviewed ?? 0}
                </strong>
              )}
            </article>

            <article className="curator-dashboard__week-card">
              <div className="curator-dashboard__chart">
                {(isLoading ? DEFAULT_WEEK_ACTIVITY_DAYS.map((label) => ({ label, count: 0 })) : chartDays).map((item, index) => (
                  <div key={item.label} className="curator-dashboard__chart-column">
                    {isLoading ? (
                      <DashboardSkeleton className="curator-dashboard__skeleton--chart-value" />
                    ) : (
                      <span className="curator-dashboard__chart-value">{item.count}</span>
                    )}
                    <div
                      className={isLoading ? "curator-dashboard__chart-bar curator-dashboard__chart-bar--skeleton" : "curator-dashboard__chart-bar"}
                      style={
                        isLoading
                          ? { height: `${56 + (index % 4) * 16}px` }
                          : { height: `${Math.max((item.count / maxDayCount) * 120, item.count > 0 ? 10 : 0)}px` }
                      }
                    />
                    <span className="curator-dashboard__chart-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="curator-dashboard__week-card">
              <div className="curator-dashboard__category-list">
                {(isLoading ? DEFAULT_WEEK_ACTIVITY_CATEGORIES.map((label) => ({ label, count: 0 })) : chartCategories).map((item, index) => (
                  <div key={item.label} className="curator-dashboard__category-item">
                    <span className="curator-dashboard__category-label">{item.label}</span>
                    <div className="curator-dashboard__category-track">
                      <div
                        className={isLoading ? "curator-dashboard__category-fill curator-dashboard__category-fill--skeleton" : "curator-dashboard__category-fill"}
                        style={{
                          width: isLoading
                            ? `${42 + index * 12}%`
                            : `${Math.max((item.count / maxCategoryCount) * 100, 12)}%`,
                        }}
                      />
                    </div>
                    {isLoading ? (
                      <DashboardSkeleton className="curator-dashboard__skeleton--category-value" />
                    ) : (
                      <span className="curator-dashboard__category-value">{item.count}</span>
                    )}
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
                {isLoading ? (
                  Array.from({ length: MAX_VISIBLE_ACTIVITY_ITEMS }, (_, index) => (
                    <div key={`activity-skeleton-${index}`} className="curator-dashboard__activity-item">
                      <DashboardSkeleton className="curator-dashboard__skeleton--status" />
                      <div className="curator-dashboard__activity-content">
                        <DashboardSkeleton className="curator-dashboard__skeleton--activity-line" />
                        <DashboardSkeleton className="curator-dashboard__skeleton--activity-time" />
                      </div>
                    </div>
                  ))
                ) : visibleLatestActivity.length > 0 ? (
                  visibleLatestActivity.map((item) => (
                    <div key={item.id} className="curator-dashboard__activity-item">
                      <div className="curator-dashboard__activity-status">
                        <Status variant={item.status_variant}>{item.status_label}</Status>
                      </div>
                      <div className="curator-dashboard__activity-content">
                        <div className="curator-dashboard__activity-subject-line">
                          <span className="curator-dashboard__activity-subject">
                            {abbreviateLegalEntityName(item.subject)}
                          </span>
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
                {isLoading ? (
                  Array.from({ length: 3 }, (_, groupIndex) => (
                    <section key={`urgent-skeleton-${groupIndex}`} className="curator-dashboard__urgent-group">
                      <div className="curator-dashboard__urgent-group-title">
                        <DashboardSkeleton className="curator-dashboard__skeleton--dot" />
                        <DashboardSkeleton className="curator-dashboard__skeleton--urgent-title" />
                      </div>
                      <div className="curator-dashboard__urgent-list">
                        {Array.from({ length: MAX_VISIBLE_URGENT_ITEMS }, (_, itemIndex) => (
                          <div key={`urgent-item-skeleton-${groupIndex}-${itemIndex}`} className="curator-dashboard__urgent-item">
                            <DashboardSkeleton className="curator-dashboard__skeleton--urgent-subject" />
                            <DashboardSkeleton className="curator-dashboard__skeleton--urgent-meta" />
                          </div>
                        ))}
                      </div>
                    </section>
                  ))
                ) : urgentTaskGroups.length > 0 ? (
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
                            <div className="curator-dashboard__urgent-subject">
                              {abbreviateLegalEntityName(item.subject)}
                            </div>
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
