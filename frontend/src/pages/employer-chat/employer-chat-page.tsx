import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { CitySelection, readSelectedCityCookie, writeSelectedCityCookie } from "../../features/city-selector";
import { getEmployerAccessState, resolveEmployerFallbackRoute, useAuthStore } from "../../features/auth";
import { Container } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { buildEmployerProfileMenuItems, Header } from "../../widgets/header";
import { ChatWorkspace } from "../../widgets/chat-workspace";
import "./employer-chat.css";

export function EmployerChatPage() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
  const employerAccess = getEmployerAccessState(role, accessToken);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  if (role !== "employer") {
    return <Navigate to="/" replace />;
  }

  if (!employerAccess.canAccessChat) {
    return <Navigate to={resolveEmployerFallbackRoute(employerAccess)} replace />;
  }

  const profileMenuItems = buildEmployerProfileMenuItems(navigate, employerAccess);

  const handleCityChange = (nextCity: CitySelection) => {
    setSelectedCity(nextCity.name);
    writeSelectedCityCookie(nextCity.name);
  };

  return (
    <main className="employer-chat-page">
      <Header
        containerClassName="employer-chat-page__header-container"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
      />

      <Container className="employer-chat-page__container">
        <nav className="employer-chat-page__tabs" aria-label="Разделы работодателя">
          {employerAccess.canManageCompanyProfile ? (
            <button type="button" className="employer-chat-page__tab" onClick={() => navigate("/dashboard/employer")}>
              Профиль компании
            </button>
          ) : null}
          {employerAccess.canManageOpportunities ? (
            <button
              type="button"
              className="employer-chat-page__tab"
              onClick={() => navigate("/employer/opportunities")}
            >
              Управление возможностями
            </button>
          ) : null}
          {employerAccess.canReviewResponses ? <button type="button" className="employer-chat-page__tab">Отклики</button> : null}
          <button type="button" className="employer-chat-page__tab employer-chat-page__tab--active">
            Чат
          </button>
          <button type="button" className="employer-chat-page__tab" onClick={() => navigate("/settings")}>
            Настройки
          </button>
        </nav>

        <ChatWorkspace
          title="Чат"
          emptyTitle="Пока нет активного чата"
          emptyText="Выберите существующий диалог слева или найдите соискателя через поиск сверху."
        />
      </Container>

      <Footer theme="employer" />
    </main>
  );
}
