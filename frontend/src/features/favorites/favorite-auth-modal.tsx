import { useNavigate } from "react-router-dom";

import { Button, Modal } from "../../shared/ui";
import "./favorites.css";

type FavoriteAuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function FavoriteAuthModal({ isOpen, onClose }: FavoriteAuthModalProps) {
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Избранное доступно после входа"
      panelClassName="favorite-auth-modal"
    >
      <div className="favorite-auth-modal__body">
        <p className="favorite-auth-modal__text">
          Чтобы добавлять мероприятия и возможности в избранное, нужно зарегистрироваться или
          войти в профиль.
        </p>
        <div className="favorite-auth-modal__actions">
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => handleNavigate("/register")}
          >
            Регистрация
          </Button>
          <Button
            type="button"
            variant="primary-outline"
            size="md"
            onClick={() => handleNavigate("/login")}
          >
            Войти
          </Button>
        </div>
      </div>
    </Modal>
  );
}
