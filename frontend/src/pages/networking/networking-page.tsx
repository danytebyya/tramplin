import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { CitySelection, readSelectedCityCookie, writeSelectedCityCookie } from "../../features/city-selector";
import { performLogout, useAuthStore } from "../../features/auth";
import { Container } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { Header } from "../../widgets/header";
import { ChatWorkspace } from "../../widgets/chat-workspace";
import "./networking.css";

export function NetworkingPage() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");

  if (role !== "applicant") {
    return <Navigate to="/" replace />;
  }

  const profileMenuItems = [
    { label: "Нетворкинг", onClick: () => navigate("/networking") },
    { label: "Настройки", onClick: () => navigate("/settings") },
    { label: "Выйти", isDanger: true, onClick: () => void performLogout({ redirectTo: "/" }) },
  ];

  const handleCityChange = (nextCity: CitySelection) => {
    setSelectedCity(nextCity.name);
    writeSelectedCityCookie(nextCity.name);
  };

  return (
    <main className="networking-page">
      <Header
        containerClassName="networking-page__header-container"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
        bottomContent={
          <nav className="networking-page__navigation" aria-label="Навигация соискателя">
            <span className="networking-page__navigation-link" aria-disabled="true">
              Карьерный трек
            </span>
            <span className="networking-page__navigation-link" aria-disabled="true">
              Отклики
            </span>
            <span className="networking-page__navigation-link networking-page__navigation-link--active">
              Нетворкинг
            </span>
            <span className="networking-page__navigation-link" aria-disabled="true">
              Настройки
            </span>
          </nav>
        }
      />

      <Container className="networking-page__container">
        <ChatWorkspace
          title="Нетворкинг"
          subtitle="Личный защищенный канал связи с работодателями и рекрутерами"
          emptyTitle="Выберите контакт"
          emptyText="Слева отображаются активные диалоги и доступные работодатели для первого касания."
          createConversationPayload={(contact) => ({
            employer_user_id: contact.userId,
            employer_id: contact.employerId ?? undefined,
          })}
        />
      </Container>

      <Footer theme="applicant" />
    </main>
  );
}
