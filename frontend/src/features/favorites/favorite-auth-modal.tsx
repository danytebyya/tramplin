import { useNavigate } from "react-router-dom";

import { Button, Modal } from "../../shared/ui";
import "./favorites.css";

type FavoriteAuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
  actionLabel?: string;
};

export function FavoriteAuthModal({ isOpen, onClose, actionLabel }: FavoriteAuthModalProps) {
  const navigate = useNavigate();

  const handleNavigate = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Войдите или зарегистрируйтесь"
      size="small"
    >
      <div className="modal__body favorite-auth-modal__body">
        <p className="modal__text favorite-auth-modal__text">
          {actionLabel
            ? `Авторизуйтесь, чтобы ${actionLabel}.`
            : "Авторизуйтесь, чтобы продолжить."}
        </p>
        <div className="modal__actions favorite-auth-modal__actions">
          <Button
            type="button"
            variant="primary-outline"
            size="md"
            onClick={() => handleNavigate("/login")}
          >
            Войти
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => handleNavigate("/register")}
          >
            Зарегистрироваться
          </Button>
        </div>
      </div>
    </Modal>
  );
}
