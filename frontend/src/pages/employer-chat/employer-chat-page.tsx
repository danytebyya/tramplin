import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { CitySelection, readSelectedCityCookie, writeSelectedCityCookie } from "../../features/city-selector";
import { performLogout, useAuthStore } from "../../features/auth";
import { Container } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { Header } from "../../widgets/header";
import { EmployerHeaderNavigation } from "../../widgets/header/header-navigation";
import { ChatWorkspace } from "../../widgets/chat-workspace";
import "./employer-chat.css";

export function EmployerChatPage() {
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");

  if (role !== "employer") {
    return <Navigate to="/" replace />;
  }

  const profileMenuItems = [
    { label: "Профиль компании", onClick: () => navigate("/dashboard/employer") },
    { label: "Управление возможностями", onClick: () => navigate("/employer/opportunities") },
    { label: "Чат", onClick: () => navigate("/employer/chat") },
    { label: "Настройки", onClick: () => navigate("/settings") },
    { label: "Выйти", isDanger: true, onClick: () => void performLogout({ redirectTo: "/" }) },
  ];

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
        bottomContent={<EmployerHeaderNavigation currentPage="chat" />}
      />

      <Container className="employer-chat-page__container">
        <ChatWorkspace
          title="Чат"
          subtitle="Защищенный канал для диалогов с кандидатами в реальном времени"
          emptyTitle="Выберите диалог"
          emptyText="Откройте существующую переписку или начните новый диалог с кандидатом из списка слева."
          createConversationPayload={(contact) => ({
            applicant_user_id: contact.userId,
          })}
        />
      </Container>

      <Footer theme="employer" />
    </main>
  );
}
