import { Button, Modal } from "../../shared/ui";
import "./delete-account-modal.css";

type DeleteAccountModalVariant = "employer" | "applicant";

type DeleteAccountModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  variant: DeleteAccountModalVariant;
  displayName?: string | null;
  hasManagedEmployees?: boolean;
  isPending?: boolean;
  error?: string | null;
};

export function DeleteAccountModal({
  isOpen,
  onClose,
  onConfirm,
  variant,
  displayName,
  hasManagedEmployees = false,
  isPending = false,
  error = null,
}: DeleteAccountModalProps) {
  const resolvedName = displayName ?? "Пользователь";
  const isEmployer = variant === "employer";

  return (
    <Modal
      title="Удаление аккаунта"
      isOpen={isOpen}
      onClose={onClose}
      titleAccentColor="var(--color-danger)"
    >
      <div className="modal__body delete-account-modal">
        <p className="modal__text delete-account-modal__text">
          {isEmployer ? "Вы уверены, что хотите удалить аккаунт работодателя" : "Вы уверены, что хотите удалить аккаунт соискателя"}
          {" "}
          <span>{`«${resolvedName}»`}</span>
          ?
        </p>
        <p className="modal__warning delete-account-modal__warning">Это действие нельзя отменить!</p>
        <div className="modal__section delete-account-modal__removal">
          <p className="modal__text delete-account-modal__text">Безвозвратно будут удалены:</p>
          <ul className="modal__list delete-account-modal__list">
            {isEmployer ? (
              <>
                <li>Компания, профиль работодателя и все данные о ней</li>
                {hasManagedEmployees ? <li>Все сотрудники, приглашения и доступы внутри этой компании</li> : null}
                <li>Все возможности компании, отклики, статусы, избранное и связанные чаты</li>
                <li>Документы верификации, уведомления и остальная история, привязанная к компании</li>
              </>
            ) : (
              <>
                <li>Профиль, резюме и портфолио</li>
                <li>История откликов и статусы</li>
                <li>Избранное и профессиональные контакты</li>
                <li>Переписки и уведомления</li>
              </>
            )}
          </ul>
        </div>
        <p className="modal__note delete-account-modal__note">
          {isEmployer
            ? "Если сотрудник состоит в другой компании или у него есть профиль соискателя, этот аккаунт сохранится. Если он был зарегистрирован только как сотрудник этой компании, аккаунт будет удален."
            : "Если вы хотите временно скрыть профиль, используйте настройки приватности."}
        </p>
        {error ? <p className="modal__error delete-account-modal__error">{error}</p> : null}
        <div className="modal__actions delete-account-modal__actions">
          <Button type="button" variant="cancel" size="md" onClick={onClose} disabled={isPending}>
            Отмена
          </Button>
          <Button type="button" variant="danger" size="md" loading={isPending} disabled={isPending} onClick={onConfirm}>
            Удалить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
