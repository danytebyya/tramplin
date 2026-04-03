import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { CitySelection, readSelectedCityCookie, writeSelectedCityCookie } from "../../features/city-selector";
import { useAuthStore } from "../../features/auth";
import { Container, ProfileTabs } from "../../shared/ui";
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [preferredEmployerId]);

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
        containerClassName="home-page__shell"
        profileMenuItems={profileMenuItems}
        city={selectedCity}
        onCityChange={handleCityChange}
      />

      <Container className="settings-page__shell networking-page__shell">
        <ProfileTabs navigate={navigate} audience="applicant" current="networking" />

        <ChatWorkspace
          title="Чат"
          emptyTitle="Пока нет активного чата"
          emptyText="Выберите, кому бы хотели написать."
          preferredEmployerId={preferredEmployerId}
        />
      </Container>

      <Footer theme="applicant" />
    </main>
  );
}
