import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { CitySelection, readSelectedCityCookie, writeSelectedCityCookie } from "../../features/city-selector";
import { getEmployerAccessState, resolveEmployerFallbackRoute, useAuthStore } from "../../features/auth";
import { Container, ProfileTabs } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { buildEmployerProfileMenuItems, Header } from "../../widgets/header";
import { ChatWorkspace } from "../../widgets/chat-workspace";
import "./employer-chat.css";

export function EmployerChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [selectedCity, setSelectedCity] = useState(() => readSelectedCityCookie() ?? "Чебоксары");
  const employerAccess = getEmployerAccessState(role, accessToken);
  const preferredRecipientUserId = searchParams.get("recipient");

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
        containerClassName="employer-chat-page__header-shell"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
      />

      <Container className="employer-chat-page__shell">
        <ProfileTabs
          navigate={navigate}
          audience="employer"
          current="chat"
          employerAccess={employerAccess}
          tabsClassName="employer-chat-page__tabs"
          tabClassName="employer-chat-page__tab"
          activeTabClassName="employer-chat-page__tab--active"
        />

        <ChatWorkspace
          title="Чат"
          emptyTitle="Пока нет активного чата"
          emptyText="Выберите существующий диалог слева или найдите соискателя через поиск сверху."
          preferredRecipientUserId={preferredRecipientUserId}
        />
      </Container>

      <Footer theme="employer" />
    </main>
  );
}
