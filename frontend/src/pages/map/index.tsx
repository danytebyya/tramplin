import { useNavigate } from "react-router-dom";

import { clearPersistedAuthSession, useAuthStore } from "../../features/auth";
import { Button } from "../../shared/ui";
import "./map.css";

export function MapPage() {
  const navigate = useNavigate();

  const handleLogout = () => {
    useAuthStore.getState().clearSession();
    clearPersistedAuthSession();
    navigate("/", { replace: true });
  };

  return (
    <main className="map-page">
      <h1 className="map-page__title">Tramplin</h1>
      <p className="map-page__text">Map/list opportunities screen will be implemented next.</p>
      <div className="map-page__actions">
        <Button type="button" variant="primary-outline" onClick={() => navigate("/login")}>
          Вход
        </Button>
        <Button type="button" variant="primary" onClick={() => navigate("/register")}>
          Регистрация
        </Button>
        <Button type="button" variant="ghost" onClick={handleLogout}>
          Выход
        </Button>
      </div>
    </main>
  );
}
