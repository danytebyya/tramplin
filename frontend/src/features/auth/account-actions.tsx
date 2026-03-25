import notificationsIcon from "../../assets/icons/notifications.svg";
import profileIcon from "../../assets/icons/profile.svg";

type AccountActionsProps = {
  className?: string;
};

export function AccountActions({ className }: AccountActionsProps) {
  return (
    <div className={className} aria-label="Быстрые действия аккаунта">
      <button type="button" className="page-placeholder__account-action" aria-label="Уведомления">
        <img
          src={notificationsIcon}
          alt=""
          aria-hidden="true"
          className="page-placeholder__account-action-icon"
        />
      </button>

      <button type="button" className="page-placeholder__account-action" aria-label="Профиль">
        <img
          src={profileIcon}
          alt=""
          aria-hidden="true"
          className="page-placeholder__account-action-icon"
        />
      </button>
    </div>
  );
}
