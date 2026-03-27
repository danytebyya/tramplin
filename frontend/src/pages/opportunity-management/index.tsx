import { useEffect, useMemo, useRef, useState } from "react";

import { Navigate, Link, useNavigate } from "react-router-dom";

import deleteIcon from "../../assets/icons/delete.svg";
import editIcon from "../../assets/icons/edit.svg";
import filterIcon from "../../assets/icons/filter.svg";
import searchIcon from "../../assets/icons/search.svg";
import sortingIcon from "../../assets/icons/sorting.svg";
import uploadIcon from "../../assets/icons/upload.svg";
import {
  CitySelector,
  readSelectedCityCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import { performLogout, useAuthStore } from "../../features/auth";
import { NotificationMenu } from "../../features/notifications";
import { Button, Container, Input } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { HeaderProfileMenu } from "../../widgets/header/header-profile-menu";
import "../../widgets/header/header.css";
import "./opportunity-management.css";

type OpportunityManagementStatus = "active" | "planned" | "removed" | "rejected" | "pending_review";
type OpportunitySortValue = "newest" | "oldest" | "responses";

type OpportunityManagementItem = {
  id: string;
  title: string;
  kind: string;
  salaryLabel: string;
  locationLabel: string;
  tags: string[];
  levelLabel: string;
  employmentLabel: string;
  description: string;
  status: OpportunityManagementStatus;
  responsesCount?: number;
  publishedAtLabel?: string;
  activeUntilLabel?: string;
  plannedPublishAtLabel?: string;
  plannedCloseAtLabel?: string;
  closedAtLabel?: string;
  moderationComment?: string;
  submittedAtLabel?: string;
};

type EmployerTabItem = {
  label: string;
  to?: string;
  isCurrent?: boolean;
};

const DEFAULT_CITY = "Чебоксары";
const PAGE_SIZE = 5;

const employerTabItems: EmployerTabItem[] = [
  { label: "Профиль компании", to: "/dashboard/employer" },
  { label: "Управление возможностями", to: "/employer/opportunities", isCurrent: true },
  { label: "Отклики" },
  { label: "Чат" },
  { label: "Настройки", to: "/settings" },
];

const statusFilterItems: Array<{ value: OpportunityManagementStatus | "all"; label: string }> = [
  { value: "all", label: "Все статусы" },
  { value: "active", label: "Активно" },
  { value: "planned", label: "Запланировано" },
  { value: "pending_review", label: "На рассмотрении" },
  { value: "removed", label: "Снято с публикации" },
  { value: "rejected", label: "Отклонено" },
];

const sortItems: Array<{ value: OpportunitySortValue; label: string }> = [
  { value: "newest", label: "Сначала новые" },
  { value: "oldest", label: "Сначала старые" },
  { value: "responses", label: "По откликам" },
];

const opportunityItems: OpportunityManagementItem[] = [
  {
    id: "opportunity-1",
    title: "Вакансия",
    kind: "Вакансия",
    salaryLabel: "Зарплата ₽",
    locationLabel: "Город (формат работы)",
    tags: ["Label", "Label", "Label"],
    levelLabel: "Middle",
    employmentLabel: "Full-time",
    description:
      "ОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписание",
    status: "active",
    responsesCount: 23,
    publishedAtLabel: "23.03.2026",
    activeUntilLabel: "23.04.2026",
  },
  {
    id: "opportunity-2",
    title: "Вакансия",
    kind: "Вакансия",
    salaryLabel: "Зарплата ₽",
    locationLabel: "Город (формат работы)",
    tags: ["Label", "Label", "Label"],
    levelLabel: "Middle",
    employmentLabel: "Full-time",
    description:
      "ОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписание",
    status: "planned",
    plannedPublishAtLabel: "23.03.2026",
    plannedCloseAtLabel: "23.04.2026",
  },
  {
    id: "opportunity-3",
    title: "Вакансия",
    kind: "Вакансия",
    salaryLabel: "Зарплата ₽",
    locationLabel: "Город (формат работы)",
    tags: ["Label", "Label", "Label"],
    levelLabel: "Middle",
    employmentLabel: "Full-time",
    description:
      "ОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписание",
    status: "removed",
    responsesCount: 23,
    publishedAtLabel: "23.03.2026",
    closedAtLabel: "23.04.2026",
  },
  {
    id: "opportunity-4",
    title: "Вакансия",
    kind: "Вакансия",
    salaryLabel: "Зарплата ₽",
    locationLabel: "Город (формат работы)",
    tags: ["Label", "Label", "Label"],
    levelLabel: "Middle",
    employmentLabel: "Full-time",
    description:
      "ОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписание",
    status: "rejected",
    moderationComment: "Не указана зарплата",
  },
  {
    id: "opportunity-5",
    title: "Вакансия",
    kind: "Вакансия",
    salaryLabel: "Зарплата ₽",
    locationLabel: "Город (формат работы)",
    tags: ["Label", "Label", "Label"],
    levelLabel: "Middle",
    employmentLabel: "Full-time",
    description:
      "ОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписаниеОписание",
    status: "pending_review",
    submittedAtLabel: "23.03.2026",
  },
  {
    id: "opportunity-6",
    title: "Стажировка",
    kind: "Стажировка",
    salaryLabel: "Оплата по договоренности",
    locationLabel: "Москва (гибрид)",
    tags: ["React", "Junior", "Аналитика"],
    levelLabel: "Junior",
    employmentLabel: "Part-time",
    description:
      "Описание стажировки с понятными требованиями, наставником, гибким графиком и понятной траекторией роста.",
    status: "active",
    responsesCount: 12,
    publishedAtLabel: "19.03.2026",
    activeUntilLabel: "19.04.2026",
  },
  {
    id: "opportunity-7",
    title: "Мероприятие",
    kind: "Мероприятие",
    salaryLabel: "Бесплатно",
    locationLabel: "Онлайн",
    tags: ["Tech talk", "Data", "AI"],
    levelLabel: "Middle",
    employmentLabel: "One-time",
    description:
      "Открытая онлайн-встреча для студентов и джунов, где команда рассказывает про реальные задачи и процессы.",
    status: "planned",
    plannedPublishAtLabel: "25.03.2026",
    plannedCloseAtLabel: "30.03.2026",
  },
];

function resolveStatusLabel(status: OpportunityManagementStatus) {
  switch (status) {
    case "active":
      return "Активно";
    case "planned":
      return "Запланировано";
    case "removed":
      return "Снято с публикации";
    case "rejected":
      return "Отклонено";
    case "pending_review":
      return "На рассмотрении";
    default:
      return status;
  }
}

function resolveSortWeight(item: OpportunityManagementItem, sortValue: OpportunitySortValue) {
  if (sortValue === "responses") {
    return item.responsesCount ?? 0;
  }

  const fallbackDates = [
    item.publishedAtLabel,
    item.plannedPublishAtLabel,
    item.submittedAtLabel,
    item.closedAtLabel,
  ].filter(Boolean);
  const source = fallbackDates[0];

  if (!source) {
    return 0;
  }

  const [day, month, year] = source.split(".").map((value) => Number(value));
  if (!day || !month || !year) {
    return 0;
  }

  return new Date(year, month - 1, day).getTime();
}

function buildPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, "ellipsis", totalPages];
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis", currentPage, "ellipsis-right", totalPages];
}

export function OpportunityManagementPage() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? DEFAULT_CITY);
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<OpportunityManagementStatus | "all">("all");
  const [sortValue, setSortValue] = useState<OpportunitySortValue>("newest");
  const [page, setPage] = useState(1);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) {
        setIsStatusMenuOpen(false);
      }

      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setIsSortMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchValue, sortValue, statusFilter]);

  if (role !== "employer") {
    return <Navigate to="/" replace />;
  }

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    const nextItems = opportunityItems.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        item.title,
        item.kind,
        item.locationLabel,
        item.levelLabel,
        item.employmentLabel,
        item.description,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });

    nextItems.sort((left, right) => {
      const leftWeight = resolveSortWeight(left, sortValue);
      const rightWeight = resolveSortWeight(right, sortValue);

      if (sortValue === "oldest") {
        return leftWeight - rightWeight;
      }

      if (sortValue === "responses") {
        return rightWeight - leftWeight;
      }

      return rightWeight - leftWeight;
    });

    return nextItems;
  }, [searchValue, sortValue, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const paginationItems = buildPaginationItems(currentPage, totalPages);

  const metrics = {
    total: opportunityItems.length,
    active: opportunityItems.filter((item) => item.status === "active").length,
    planned: opportunityItems.filter((item) => item.status === "planned").length,
    closed: opportunityItems.filter((item) => item.status === "removed" || item.status === "rejected").length,
  };

  const profileMenuItems = [
    { label: "Профиль компании", onClick: () => navigate("/dashboard/employer") },
    { label: "Настройки", onClick: () => navigate("/settings") },
    { label: "Выйти", isDanger: true, onClick: () => void performLogout({ redirectTo: "/" }) },
  ];

  return (
    <main className="opportunity-management-page">
      <header className="header">
        <div className="header__top">
          <Container className="opportunity-management-page__header-container header__top-container">
            <div className="header__brand">
              <Link to="/" className="header__brand-name">Трамплин</Link>
              <div className="header__logo-badge">Лого</div>
            </div>

            <div className="header__main">
              <div className="header__controls">
                <div className="header__actions">
                  <div className="header__account-actions" aria-label="Действия аккаунта">
                    <NotificationMenu
                      buttonClassName="header__icon-button"
                      iconClassName="header__icon-button-image"
                    />
                    <HeaderProfileMenu items={profileMenuItems} />
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </div>
      </header>

      <Container className="opportunity-management-page__container">
        <div className="opportunity-management-page__tabs" role="tablist" aria-label="Вкладки работодателя">
          {employerTabItems.map((item) => (
            <button
              key={item.label}
              type="button"
              className={
                item.isCurrent
                  ? "opportunity-management-page__tab opportunity-management-page__tab--active"
                  : "opportunity-management-page__tab"
              }
              onClick={() => {
                if (item.to) {
                  navigate(item.to);
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <section className="opportunity-management-page__metrics" aria-label="Статистика возможностей">
          <article className="opportunity-management-page__metric-card">
            <span className="opportunity-management-page__metric-label">Всего:</span>
            <strong className="opportunity-management-page__metric-value">{metrics.total}</strong>
          </article>
          <article className="opportunity-management-page__metric-card">
            <span className="opportunity-management-page__metric-label">Активные:</span>
            <strong className="opportunity-management-page__metric-value">{metrics.active}</strong>
          </article>
          <article className="opportunity-management-page__metric-card">
            <span className="opportunity-management-page__metric-label">Запланированные:</span>
            <strong className="opportunity-management-page__metric-value">{metrics.planned}</strong>
          </article>
          <article className="opportunity-management-page__metric-card">
            <span className="opportunity-management-page__metric-label">Закрытые:</span>
            <strong className="opportunity-management-page__metric-value">{metrics.closed}</strong>
          </article>
        </section>

        <section className="opportunity-management-page__toolbar" aria-label="Управление списком возможностей">
          <label className="opportunity-management-page__search" aria-label="Поиск по возможностям">
            <img src={searchIcon} alt="" aria-hidden="true" className="opportunity-management-page__search-icon" />
            <Input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Поиск"
              className="input--sm opportunity-management-page__search-input"
            />
          </label>

          <div ref={statusMenuRef} className="opportunity-management-page__toolbar-menu">
            <button
              type="button"
              className={
                isStatusMenuOpen
                  ? "opportunity-management-page__icon-button opportunity-management-page__icon-button--active"
                  : "opportunity-management-page__icon-button"
              }
              aria-label="Фильтр по статусу"
              onClick={() => {
                setIsStatusMenuOpen((current) => !current);
                setIsSortMenuOpen(false);
              }}
            >
              <img src={filterIcon} alt="" aria-hidden="true" className="opportunity-management-page__icon-button-image" />
            </button>
            {isStatusMenuOpen ? (
              <div className="opportunity-management-page__menu-popover">
                {statusFilterItems.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={
                      statusFilter === item.value
                        ? "opportunity-management-page__menu-item opportunity-management-page__menu-item--active"
                        : "opportunity-management-page__menu-item"
                    }
                    onClick={() => {
                      setStatusFilter(item.value);
                      setIsStatusMenuOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div ref={sortMenuRef} className="opportunity-management-page__toolbar-menu">
            <button
              type="button"
              className={
                isSortMenuOpen
                  ? "opportunity-management-page__icon-button opportunity-management-page__icon-button--active"
                  : "opportunity-management-page__icon-button"
              }
              aria-label="Сортировка"
              onClick={() => {
                setIsSortMenuOpen((current) => !current);
                setIsStatusMenuOpen(false);
              }}
            >
              <img src={sortingIcon} alt="" aria-hidden="true" className="opportunity-management-page__icon-button-image" />
            </button>
            {isSortMenuOpen ? (
              <div className="opportunity-management-page__menu-popover">
                {sortItems.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={
                      sortValue === item.value
                        ? "opportunity-management-page__menu-item opportunity-management-page__menu-item--active"
                        : "opportunity-management-page__menu-item"
                    }
                    onClick={() => {
                      setSortValue(item.value);
                      setIsSortMenuOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <Button type="button" variant="primary" size="md" className="opportunity-management-page__create-button">
            Создать возможность
          </Button>
        </section>

        <section className="opportunity-management-page__grid" aria-label="Карточки возможностей">
          {visibleItems.map((item) => (
            <article key={item.id} className="opportunity-management-page__card">
              <div className="opportunity-management-page__card-body">
                <span
                  className={`opportunity-management-page__status opportunity-management-page__status--${item.status}`}
                >
                  {resolveStatusLabel(item.status)}
                </span>

                <div className="opportunity-management-page__title-group">
                  <h2 className="opportunity-management-page__card-title">{item.title}</h2>
                  <p className="opportunity-management-page__card-kind">{item.kind}</p>
                </div>

                <div className="opportunity-management-page__summary">
                  <p className="opportunity-management-page__salary">{item.salaryLabel}</p>
                  <p className="opportunity-management-page__location">{item.locationLabel}</p>
                </div>

                <div className="opportunity-management-page__tags">
                  {item.tags.map((tag) => (
                    <span key={`${item.id}-${tag}`} className="opportunity-management-page__tag">{tag}</span>
                  ))}
                </div>

                <div className="opportunity-management-page__details">
                  <p className="opportunity-management-page__detail-text">Уровень: {item.levelLabel}</p>
                  <p className="opportunity-management-page__detail-text">Занятость: {item.employmentLabel}</p>
                </div>

                <p className="opportunity-management-page__description">{item.description}</p>

                <div className="opportunity-management-page__footer">
                  <div className="opportunity-management-page__meta">
                    {item.responsesCount !== undefined ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Откликов:</span>
                        <span className="opportunity-management-page__meta-value">{item.responsesCount}</span>
                      </p>
                    ) : null}

                    {item.publishedAtLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Опубликовано:</span>
                        <span className="opportunity-management-page__meta-value">{item.publishedAtLabel}</span>
                      </p>
                    ) : null}

                    {item.activeUntilLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Активно до:</span>
                        <span className="opportunity-management-page__meta-value">{item.activeUntilLabel}</span>
                      </p>
                    ) : null}

                    {item.plannedPublishAtLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Дата публикации:</span>
                        <span className="opportunity-management-page__meta-value">{item.plannedPublishAtLabel}</span>
                      </p>
                    ) : null}

                    {item.plannedCloseAtLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Дата закрытия:</span>
                        <span className="opportunity-management-page__meta-value">{item.plannedCloseAtLabel}</span>
                      </p>
                    ) : null}

                    {item.closedAtLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Закрыто:</span>
                        <span className="opportunity-management-page__meta-value">{item.closedAtLabel}</span>
                      </p>
                    ) : null}

                    {item.submittedAtLabel ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Дата отправки:</span>
                        <span className="opportunity-management-page__meta-value">{item.submittedAtLabel}</span>
                      </p>
                    ) : null}

                    {item.moderationComment ? (
                      <p className="opportunity-management-page__meta-row">
                        <span className="opportunity-management-page__meta-label">Комментарий:</span>
                        <span className="opportunity-management-page__meta-value">{item.moderationComment}</span>
                      </p>
                    ) : null}
                  </div>

                  <div className="opportunity-management-page__actions">
                    {item.status === "removed" ? (
                      <button
                        type="button"
                        className="opportunity-management-page__action-button"
                        aria-label="Вернуть в публикацию"
                      >
                        <img src={uploadIcon} alt="" aria-hidden="true" className="opportunity-management-page__action-icon" />
                      </button>
                    ) : null}
                    <button type="button" className="opportunity-management-page__action-button" aria-label="Редактировать">
                      <img src={editIcon} alt="" aria-hidden="true" className="opportunity-management-page__action-icon" />
                    </button>
                    <button type="button" className="opportunity-management-page__action-button" aria-label="Удалить">
                      <img src={deleteIcon} alt="" aria-hidden="true" className="opportunity-management-page__action-icon" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>

        <div className="opportunity-management-page__pagination" aria-label="Пагинация">
          <button
            type="button"
            className="opportunity-management-page__pagination-arrow"
            disabled={currentPage === 1}
            onClick={() => setPage((currentValue) => Math.max(1, currentValue - 1))}
          >
            &lt;
          </button>
          {paginationItems.map((item, index) =>
            typeof item === "number" ? (
              <button
                key={`${item}-${index}`}
                type="button"
                className={
                  currentPage === item
                    ? "opportunity-management-page__pagination-item opportunity-management-page__pagination-item--active"
                    : "opportunity-management-page__pagination-item"
                }
                onClick={() => setPage(item)}
              >
                {item}
              </button>
            ) : (
              <span key={`${item}-${index}`} className="opportunity-management-page__pagination-ellipsis">
                ...
              </span>
            ),
          )}
          <button
            type="button"
            className="opportunity-management-page__pagination-arrow"
            disabled={currentPage === totalPages}
            onClick={() => setPage((currentValue) => Math.min(totalPages, currentValue + 1))}
          >
            &gt;
          </button>
        </div>

        <div className="opportunity-management-page__city-selector">
          <CitySelector
            value={selectedCity}
            onChange={(nextCity) => {
              setSelectedCity(nextCity.name);
              writeSelectedCityCookie(nextCity.name);
            }}
          />
        </div>
      </Container>

      <Footer theme="employer" />
    </main>
  );
}
