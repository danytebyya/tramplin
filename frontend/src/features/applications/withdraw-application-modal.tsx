import { Button, Modal } from "../../shared/ui";
import "./withdraw-application-modal.css";

type WithdrawApplicationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending?: boolean;
};

export function WithdrawApplicationModal({
  isOpen,
  onClose,
  onConfirm,
  isPending = false,
}: WithdrawApplicationModalProps) {
  return (
    <Modal
      title="Отзыв отклика"
      isOpen={isOpen}
      onClose={onClose}
      size="small"
      titleAccentColor="var(--color-danger)"
    >
      <div className="modal__body withdraw-application-modal">
        <p className="modal__text withdraw-application-modal__text">
          Это действие отменит ваше участие в отборе.
        </p>
        <div className="modal__actions withdraw-application-modal__actions">
          <Button type="button" variant="cancel" size="md" onClick={onClose} disabled={isPending}>
            Отмена
          </Button>
          <Button type="button" variant="danger" size="md" onClick={onConfirm} loading={isPending}>
            Отозвать
          </Button>
        </div>
      </div>
    </Modal>
  );
}
