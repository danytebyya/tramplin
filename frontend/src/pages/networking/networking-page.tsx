import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { CitySelection, readSelectedCityCookie, writeSelectedCityCookie } from "../../features/city-selector";
import { useAuthStore } from "../../features/auth";
import { Container } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { buildApplicantProfileMenuItems, Header } from "../../widgets/header";
import { ChatWorkspace } from "../../widgets/chat-workspace";
import "../settings/settings.css";
import "./networking.css";

export function NetworkingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
  const preferredEmployerId = new URLSearchParams(location.search).get("employerId");

  if (role !== "applicant") {
    return <Navigate to="/" replace />;
  }

  const profileMenuItems = buildApplicantProfileMenuItems(navigate);

  const handleCityChange = (nextCity: CitySelection) => {
    setSelectedCity(nextCity.name);
    writeSelectedCityCookie(nextCity.name);
  };

  return (
    <main className="networking-page settings-page settings-page--applicant">
      <Header
        containerClassName="home-page__container"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
      />

      <Container className="settings-page__container networking-page__container">
        <nav className="settings-page__tabs" aria-label="Навигация соискателя">
          <button type="button" className="settings-page__tab" onClick={() => navigate("/dashboard/applicant")}>
            Профиль
          </button>
          <button type="button" className="settings-page__tab">
            Мои отклики
          </button>
          <button type="button" className="settings-page__tab" onClick={() => navigate("/favorites")}>
            Избранное
          </button>
          <button type="button" className="settings-page__tab settings-page__tab--active">
            Нетворкинг
          </button>
          <button type="button" className="settings-page__tab" onClick={() => navigate("/settings")}>
            Настройки
          </button>
        </nav>

        <ChatWorkspace
          title="Чат"
          emptyTitle="Пока нет активного чата"
          emptyText="Используйте поиск сверху, чтобы найти пользователя, или откройте существующий диалог слева."
          preferredEmployerId={preferredEmployerId}
        />
      </Container>

      <Footer theme="applicant" />
    </main>
  );
}
