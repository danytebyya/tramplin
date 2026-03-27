import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import {
  CitySelection,
  readSelectedCityCookie,
  writeSelectedCityCookie,
} from "../../features/city-selector";
import { performLogout, useAuthStore } from "../../features/auth";
import { Container } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { Header } from "../../widgets/header";
import { EmployerHeaderNavigation } from "../../widgets/header/header-navigation";
import "./employer-dashboard.css";

export function EmployerDashboardPage() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");

  if (role !== "employer") {
    return <Navigate to="/" replace />;
  }

  const profileMenuItems = [
    { label: "Профиль компании", onClick: () => navigate("/dashboard/employer") },
    { label: "Управление возможностями", onClick: () => navigate("/employer/opportunities") },
    { label: "Настройки", onClick: () => navigate("/settings") },
    { label: "Выйти", isDanger: true, onClick: () => void performLogout({ redirectTo: "/" }) },
  ];

  const handleCityChange = (nextCity: CitySelection) => {
    setSelectedCity(nextCity.name);
    writeSelectedCityCookie(nextCity.name);
  };

  return (
    <main className="employer-dashboard">
      <Header
        containerClassName="employer-dashboard__header-container"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
        bottomContent={<EmployerHeaderNavigation currentPage="dashboard" />}
      />

      <Container className="employer-dashboard__container">
        <section className="employer-dashboard__hero">
          <div className="employer-dashboard__hero-body">
            <p className="employer-dashboard__eyebrow">Дашборд работодателя</p>
            <h1 className="employer-dashboard__title">
              Управляйте вакансиями, кандидатами и верификацией из одного окна
            </h1>
            <p className="employer-dashboard__description">
              Уведомления помогают не терять новые отклики, статус проверки компании и рекомендации
              по сильным кандидатам.
            </p>
          </div>
        </section>

        <section className="employer-dashboard__grid">
          <div className="employer-dashboard__main">
            <article className="employer-dashboard__panel">
              <div className="employer-dashboard__panel-header">
                <div className="employer-dashboard__panel-title-group">
                  <h2 className="employer-dashboard__panel-title">Сводка по найму</h2>
                  <p className="employer-dashboard__panel-text">
                    Ключевые метрики обновляются вместе с уведомлениями и очередями кандидатов.
                  </p>
                </div>
              </div>

              <div className="employer-dashboard__metrics">
                <div className="employer-dashboard__metric">
                  <span className="employer-dashboard__metric-label">Активные вакансии</span>
                  <strong className="employer-dashboard__metric-value">12</strong>
                  <span className="employer-dashboard__metric-note">+3 за эту неделю</span>
                </div>
                <div className="employer-dashboard__metric">
                  <span className="employer-dashboard__metric-label">Новые отклики</span>
                  <strong className="employer-dashboard__metric-value">47</strong>
                  <span className="employer-dashboard__metric-note">14 требуют разбора сегодня</span>
                </div>
                <div className="employer-dashboard__metric">
                  <span className="employer-dashboard__metric-label">Средний match</span>
                  <strong className="employer-dashboard__metric-value">86%</strong>
                  <span className="employer-dashboard__metric-note">Лучше на 9% чем месяц назад</span>
                </div>
              </div>
            </article>

            <article className="employer-dashboard__panel">
              <div className="employer-dashboard__panel-header">
                <div className="employer-dashboard__panel-title-group">
                  <h2 className="employer-dashboard__panel-title">Воронка подбора</h2>
                  <p className="employer-dashboard__panel-text">
                    Уведомления стоит отправлять на переходах между этапами и при долгом простое кандидата.
                  </p>
                </div>
              </div>

              <div className="employer-dashboard__pipeline">
                <div className="employer-dashboard__pipeline-card">
                  <span className="employer-dashboard__pipeline-step">Новые</span>
                  <strong className="employer-dashboard__pipeline-count">18</strong>
                  <span className="employer-dashboard__pipeline-detail">6 откликов без ответа более 24 часов</span>
                </div>
                <div className="employer-dashboard__pipeline-card">
                  <span className="employer-dashboard__pipeline-step">Интервью</span>
                  <strong className="employer-dashboard__pipeline-count">9</strong>
                  <span className="employer-dashboard__pipeline-detail">3 напоминания интервью на завтра</span>
                </div>
                <div className="employer-dashboard__pipeline-card">
                  <span className="employer-dashboard__pipeline-step">Офферы</span>
                  <strong className="employer-dashboard__pipeline-count">4</strong>
                  <span className="employer-dashboard__pipeline-detail">1 оффер ожидает подтверждения студента</span>
                </div>
              </div>
            </article>
          </div>

          <aside className="employer-dashboard__aside">
            <article className="employer-dashboard__panel">
              <div className="employer-dashboard__panel-header">
                <div className="employer-dashboard__panel-title-group">
                  <h2 className="employer-dashboard__panel-title">Рекомендуемые кандидаты</h2>
                  <p className="employer-dashboard__panel-text">
                    Эти карточки логично связывать с уведомлениями о новых релевантных кандидатах.
                  </p>
                </div>
              </div>

              <div className="employer-dashboard__candidates">
                <div className="employer-dashboard__candidate">
                  <div className="employer-dashboard__candidate-body">
                    <span className="employer-dashboard__candidate-name">Мария Лебедева</span>
                    <span className="employer-dashboard__candidate-meta">Frontend, React, 4 курс НИУ ВШЭ</span>
                  </div>
                  <span className="employer-dashboard__candidate-match">91%</span>
                </div>
                <div className="employer-dashboard__candidate">
                  <div className="employer-dashboard__candidate-body">
                    <span className="employer-dashboard__candidate-name">Илья Воронов</span>
                    <span className="employer-dashboard__candidate-meta">Backend, Python, МФТИ</span>
                  </div>
                  <span className="employer-dashboard__candidate-match">88%</span>
                </div>
                <div className="employer-dashboard__candidate">
                  <div className="employer-dashboard__candidate-body">
                    <span className="employer-dashboard__candidate-name">Алина Фёдорова</span>
                    <span className="employer-dashboard__candidate-meta">Product analytics, SQL, ИТМО</span>
                  </div>
                  <span className="employer-dashboard__candidate-match">84%</span>
                </div>
              </div>
            </article>

            <article className="employer-dashboard__panel">
              <div className="employer-dashboard__panel-header">
                <div className="employer-dashboard__panel-title-group">
                  <h2 className="employer-dashboard__panel-title">Когда создаются уведомления</h2>
                  <p className="employer-dashboard__panel-text">
                    Базовые триггеры уже подготовлены под реальный рабочий поток работодателя.
                  </p>
                </div>
              </div>

              <div className="employer-dashboard__actions">
                <div className="employer-dashboard__action-card">
                  <span className="employer-dashboard__action-title">Новый релевантный кандидат</span>
                  <span className="employer-dashboard__action-text">
                    Срабатывает, когда matching находит сильный профиль под активную вакансию.
                  </span>
                </div>
                <div className="employer-dashboard__action-card">
                  <span className="employer-dashboard__action-title">Изменение статуса верификации</span>
                  <span className="employer-dashboard__action-text">
                    Срабатывает после отправки документов и при решении куратора по компании.
                  </span>
                </div>
                <div className="employer-dashboard__action-card">
                  <span className="employer-dashboard__action-title">Риск потерять кандидата</span>
                  <span className="employer-dashboard__action-text">
                    Срабатывает, если отклик или интервью долго остаются без ответа.
                  </span>
                </div>
              </div>
            </article>
          </aside>
        </section>
      </Container>

      <Footer theme="employer" />
    </main>
  );
}
