import { useState } from "react";

import { DeleteAccountModal } from "../../features/account";
import { FavoriteAuthModal } from "../../features/favorites";
import { WithdrawApplicationModal } from "../../features/applications";
import {
  Badge,
  Button,
  Checkbox,
  Container,
  DateInput,
  InfoTooltip,
  Input,
  Modal,
  Radio,
  Select,
  Status,
  Switch,
} from "../../shared/ui";
import "./ui-kit.css";

const buttonSizes = [
  { label: "sm", size: "sm" as const },
  { label: "md", size: "md" as const },
  { label: "long", size: undefined },
];

const buttonGroups = [
  {
    title: "Primary",
    variants: [
      { label: "Solid", variant: "primary" as const },
      { label: "Outline", variant: "primary-outline" as const },
      { label: "Ghost", variant: "ghost" as const },
    ],
  },
  {
    title: "Secondary",
    variants: [
      { label: "Solid", variant: "secondary" as const },
      { label: "Outline", variant: "secondary-outline" as const },
      { label: "Ghost", variant: "secondary-ghost" as const },
    ],
  },
  {
    title: "Accent",
    variants: [
      { label: "Solid", variant: "accent" as const },
      { label: "Outline", variant: "accent-outline" as const },
      { label: "Ghost", variant: "accent-ghost" as const },
    ],
  },
];

const statusButtonGroups = [
  { title: "Danger", variant: "danger" as const },
  { title: "Success", variant: "success" as const },
];

const statusItems = [
  { label: "Активно", variant: "active" as const },
  { label: "Одобрено", variant: "approved" as const },
  { label: "На рассмотрении", variant: "pending-review" as const },
  { label: "Отклонена", variant: "rejected" as const },
  { label: "Запрос информации", variant: "info-request" as const },
  { label: "Снято с публикации", variant: "unpublished" as const },
  { label: "Верифицировано", variant: "verified" as const },
  { label: "Верифицировано", variant: "verified-accent" as const },
];

const badgeItems = [
  { label: "Label", variant: "primary" as const },
  { label: "Label", variant: "secondary" as const },
  { label: "Label", variant: "warning" as const },
  { label: "Label", variant: "success" as const },
  { label: "Label", variant: "danger" as const },
  { label: "Label", variant: "info" as const },
];

const modalItems = [
  { id: "auth", label: "Auth", title: "Гостевая модалка" },
  { id: "confirm", label: "Confirm", title: "Подтверждение действия" },
  { id: "deleteEmployer", label: "Delete employer", title: "Удаление аккаунта работодателя" },
  { id: "deleteApplicant", label: "Delete applicant", title: "Удаление аккаунта соискателя" },
  { id: "leave", label: "Unsaved leave", title: "Несохранённые изменения" },
  { id: "staffInvite", label: "Staff invite", title: "Приглашение сотрудника" },
  { id: "staffDelete", label: "Staff delete", title: "Удаление сотрудника" },
  { id: "status", label: "Response status", title: "Изменение статуса" },
  { id: "opportunityDelete", label: "Opportunity delete", title: "Удалить возможность" },
  { id: "seekerProject", label: "Seeker project", title: "Добавление проекта" },
  { id: "seekerAchievement", label: "Seeker achievement", title: "Добавление достижения" },
  { id: "seekerCertificate", label: "Seeker certificate", title: "Добавление сертификата" },
  { id: "seekerDelete", label: "Seeker delete", title: "Удаление элемента" },
  { id: "curatorDelete", label: "Curator delete", title: "Удалить куратора" },
  { id: "curatorBulkDelete", label: "Curator bulk delete", title: "Удалить кураторов" },
  { id: "curatorEdit", label: "Curator edit", title: "Редактирование куратора" },
  { id: "curatorBulkRole", label: "Curator bulk role", title: "Изменить роль кураторов" },
  { id: "curatorCreate", label: "Curator create", title: "Добавить куратора" },
] as const;

type UiKitModalId = (typeof modalItems)[number]["id"];
type UiKitResponseStatus = "new" | "accepted" | "reserve" | "rejected";

const uiKitResponseStatusOptions: Array<{ value: UiKitResponseStatus; label: string }> = [
  { value: "new", label: "Новый" },
  { value: "accepted", label: "Принято" },
  { value: "reserve", label: "В резерве" },
  { value: "rejected", label: "Отклонено" },
];

const uiKitCuratorRoleDescriptions = {
  junior: "Модерация контента и публикаций по чеклисту. Без доступа к верификации работодателей и управлению кураторами.",
  curator: "Проверка и верификация работодателей, работа с заявками и расширенные полномочия модерации. Без доступа к управлению кураторами.",
  admin: "Полный доступ: управление кураторами, ролями, аналитикой, логами и верификацией работодателей.",
} as const;

export function UiKitPage() {
  const [activeModal, setActiveModal] = useState<UiKitModalId | null>(null);
  const [uiKitResponseStatus, setUiKitResponseStatus] = useState<UiKitResponseStatus>("accepted");
  const employerTypeOptions = [
    { value: "company", label: "Компания" },
    { value: "sole_proprietor", label: "ИП" },
    { value: "state", label: "Госорганизация" },
    { value: "ngo", label: "НКО" },
  ];

  return (
    <main className="kit-page">
      <Container className="kit-page__shell">
        <section className="kit-section">
          <h1 className="kit-section__title">Buttons</h1>
          <div className="kit-button-groups">
            {buttonGroups.map((group) => (
              <div className="kit-button-group" key={group.title}>
                <h2 className="kit-section__subtitle">{group.title}</h2>
                <div className="kit-section__group kit-section__group--buttons">
                  {group.variants.map(({ label, variant }) => (
                    <div className="kit-section__topic" key={variant}>
                      <h3 className="kit-section__topic-title">{label}</h3>
                      {buttonSizes.map(({ size, label: sizeLabel }) => (
                        <Button key={`${variant}-${sizeLabel}`} variant={variant} size={size}>
                          Кнопка
                        </Button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="kit-section">
          <h2 className="kit-section__subtitle">Danger and Success</h2>
          <div className="kit-section__group kit-section__group--status-buttons">
            {statusButtonGroups.map(({ title, variant }) => (
              <div className="kit-section__topic" key={variant}>
                <h3 className="kit-section__topic-title">{title}</h3>
                {buttonSizes.map(({ label, size }) => (
                  <Button key={`${variant}-${label}`} variant={variant} size={size}>
                    Кнопка
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="kit-section">
          <h2 className="kit-section__subtitle">Disabled</h2>
          <div className="kit-section__group kit-section__group--buttons">
            {[
              ...buttonGroups.flatMap((group) => group.variants.map(({ label, variant }) => ({ title: `${group.title} ${label}`, variant }))),
              ...statusButtonGroups.map(({ title, variant }) => ({ title, variant })),
            ].map(({ title, variant }) => (
              <div className="kit-section__topic" key={`disabled-${variant}`}>
                <h3 className="kit-section__topic-title">{title}</h3>
                {buttonSizes.map(({ label, size }) => (
                  <Button key={`disabled-${variant}-${label}`} variant={variant} size={size} disabled>
                    Кнопка
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="kit-section">
          <h2 className="kit-section__subtitle">Loading</h2>
          <div className="kit-section__group kit-section__group--buttons">
            {[
              ...buttonGroups.flatMap((group) => group.variants.map(({ label, variant }) => ({ title: `${group.title} ${label}`, variant }))),
              ...statusButtonGroups.map(({ title, variant }) => ({ title, variant })),
            ].map(({ title, variant }) => (
              <div className="kit-section__topic" key={`loading-${variant}`}>
                <h3 className="kit-section__topic-title">{title}</h3>
                {buttonSizes.map(({ label, size }) => (
                  <Button key={`loading-${variant}-${label}`} variant={variant} size={size} loading>
                    Кнопка
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="kit-section">
          <h1 className="kit-section__title">Statuses</h1>
          <div className="kit-statuses">
            {statusItems.map(({ label, variant }) => (
              <Status key={`${variant}-${label}`} variant={variant}>
                {label}
              </Status>
            ))}
          </div>
        </section>

        <section className="kit-section">
          <h1 className="kit-section__title">Badges</h1>
          <div className="kit-badges">
            {badgeItems.map(({ label, variant }) => (
              <Badge key={`${variant}-${label}`} variant={variant}>
                {label}
              </Badge>
            ))}
          </div>
        </section>

        <section className="kit-section">
          <h1 className="kit-section__title">Inputs</h1>
          <div className="kit-fields">
            <label className="kit-field">
              <span className="kit-field__label">Primary (large)</span>
              <div className="kit-field__control">
                <Input placeholder="Input" defaultValue="Input value" />
              </div>
            </label>
            <label className="kit-field">
              <span className="kit-field__label">Primary (small)</span>
              <div className="kit-field__control">
                <Input placeholder="Input" className="input--sm" defaultValue="Input value" />
              </div>
            </label>
            <label className="kit-field">
              <span className="kit-field__label">Secondary (large)</span>
              <div className="kit-field__control">
                <Input placeholder="Input" className="input--secondary" defaultValue="Input value" />
              </div>
            </label>
            <label className="kit-field">
              <span className="kit-field__label">Secondary (small)</span>
              <div className="kit-field__control">
                <Input
                  placeholder="Input"
                  className="input--secondary input--sm"
                  defaultValue="Input value"
                />
              </div>
            </label>
            <label className="kit-field">
              <span className="kit-field__label">Accent (large)</span>
              <div className="kit-field__control">
                <Input placeholder="Input" className="input--accent" defaultValue="Input value" />
              </div>
            </label>
            <label className="kit-field">
              <span className="kit-field__label">Accent (small)</span>
              <div className="kit-field__control">
                <Input
                  placeholder="Input"
                  className="input--accent input--sm"
                  defaultValue="Input value"
                />
              </div>
            </label>
            <label className="kit-field kit-field--error">
              <span className="kit-field__label">Label</span>
              <div className="kit-field__control">
                <Input placeholder="Input" className="input--error" defaultValue="Wrong value" />
                <span className="kit-field__icon" aria-hidden="true" />
              </div>
              <span className="kit-field__caption">Caption</span>
            </label>
            <label className="kit-field">
              <span className="kit-field__label kit-field__label--disabled">Label</span>
              <div className="kit-field__control">
                <Input placeholder="Input" disabled />
              </div>
            </label>
          </div>
        </section>

        <section className="kit-section">
          <h1 className="kit-section__title">Selects</h1>
          <div className="kit-fields">
            <label className="kit-field">
              <span className="kit-field__label">Primary (base)</span>
              <div className="kit-field__control">
                <Select placeholder="Выберите вариант" options={employerTypeOptions} />
              </div>
            </label>
            <label className="kit-field">
              <span className="kit-field__label">Primary (large)</span>
              <div className="kit-field__control">
                <Select size="large" placeholder="Выберите вариант" options={employerTypeOptions} />
              </div>
            </label>
            <label className="kit-field">
              <span className="kit-field__label">Primary (small)</span>
              <div className="kit-field__control">
                <Select size="sm" placeholder="Выберите вариант" options={employerTypeOptions} />
              </div>
            </label>
            <label className="kit-field">
              <span className="kit-field__label">Secondary (base)</span>
              <div className="kit-field__control">
                <Select
                  variant="secondary"
                  placeholder="Выберите вариант"
                  options={employerTypeOptions}
                />
              </div>
            </label>
            <label className="kit-field">
              <span className="kit-field__label">Accent (base)</span>
              <div className="kit-field__control">
                <Select
                  variant="accent"
                  placeholder="Выберите вариант"
                  options={employerTypeOptions}
                />
              </div>
            </label>
            <label className="kit-field kit-field--error">
              <span className="kit-field__label">Label</span>
              <div className="kit-field__control">
                <Select error="Caption" defaultValue="company" options={employerTypeOptions} />
              </div>
              <span className="kit-field__caption">Caption</span>
            </label>
            <label className="kit-field">
              <span className="kit-field__label kit-field__label--disabled">Label</span>
              <div className="kit-field__control">
                <Select disabled defaultValue="company" options={employerTypeOptions} />
              </div>
            </label>
          </div>
        </section>

        <section className="kit-section">
          <h1 className="kit-section__title">Modals</h1>
          <div className="kit-modal-grid">
            {modalItems.map((item) => (
              <div key={item.id} className="kit-section__topic">
                <h3 className="kit-section__topic-title">{item.label}</h3>
                <p className="kit-modal-card-title">{item.title}</p>
                <Button type="button" variant="primary-outline" size="md" onClick={() => setActiveModal(item.id)}>
                  Открыть
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="kit-section kit-section--controls">
          <div className="kit-controls">
            <h1 className="kit-section__title">Checkboxes and Radio</h1>
            <div className="kit-controls__summary">
              <Checkbox defaultChecked />
              <Checkbox variant="secondary" defaultChecked />
              <Checkbox variant="accent" defaultChecked />
              <Checkbox defaultChecked disabled />
              <Radio name="kit-radio-group" defaultChecked />
              <Radio name="kit-radio-group-secondary" variant="secondary" defaultChecked />
              <Radio name="kit-radio-group-accent" variant="accent" defaultChecked />
              <Radio name="kit-radio-group" />
              <Radio checked disabled readOnly />
            </div>
          </div>
          <div className="kit-controls">
            <h1 className="kit-section__title">Switches</h1>
            <div className="kit-controls__switches">
              <Switch defaultChecked />
              <Switch variant="secondary" defaultChecked />
              <Switch variant="accent" defaultChecked />
            </div>
          </div>
        </section>
      </Container>

      <FavoriteAuthModal
        isOpen={activeModal === "auth"}
        onClose={() => setActiveModal(null)}
        actionLabel="написать сообщение работодателю"
      />

      <WithdrawApplicationModal
        isOpen={activeModal === "confirm"}
        onClose={() => setActiveModal(null)}
        onConfirm={() => setActiveModal(null)}
      />

      <DeleteAccountModal
        isOpen={activeModal === "deleteEmployer"}
        onClose={() => setActiveModal(null)}
        onConfirm={() => setActiveModal(null)}
        variant="employer"
        displayName="ООО «Трамплин»"
        hasManagedEmployees
      />

      <DeleteAccountModal
        isOpen={activeModal === "deleteApplicant"}
        onClose={() => setActiveModal(null)}
        onConfirm={() => setActiveModal(null)}
        variant="applicant"
        displayName="Анна Смирнова"
      />

      <Modal
        isOpen={activeModal === "leave"}
        onClose={() => setActiveModal(null)}
        title="Несохраненные изменения"
        size="small"
        titleAccentColor="var(--color-primary)"
        closeOnBackdrop={false}
      >
        <div className="kit-modal-body">
          <p className="kit-modal-text">Если перейти на другую страницу сейчас, все несохранённые данные сотрутся.</p>
          <div className="kit-modal-actions">
            <Button type="button" variant="cancel" size="md" onClick={() => setActiveModal(null)}>
              Отменить
            </Button>
            <Button type="button" variant="primary" size="md" onClick={() => setActiveModal(null)}>
              Сохранить и выйти
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "staffInvite"}
        onClose={() => setActiveModal(null)}
        title="Приглашение сотрудника"
      >
        <div className="kit-modal-body">
          <label className="kit-field">
            <span className="kit-field__label">Почта сотрудника</span>
            <div className="kit-field__control">
              <Input className="input--sm" placeholder="Введите email" defaultValue="user@example.com" />
            </div>
          </label>
          <div className="kit-modal-checks">
            <label className="kit-modal-option">
              <Checkbox defaultChecked />
              <span>Просмотр откликов</span>
            </label>
            <label className="kit-modal-option">
              <Checkbox defaultChecked />
              <span>Управление возможностями</span>
            </label>
            <label className="kit-modal-option">
              <Checkbox />
              <span>Управление сотрудниками</span>
            </label>
          </div>
          <div className="kit-modal-actions">
            <Button type="button" variant="cancel" size="md" onClick={() => setActiveModal(null)}>
              Отменить
            </Button>
            <Button type="button" variant="primary" size="md" onClick={() => setActiveModal(null)}>
              Отправить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "staffDelete"}
        onClose={() => setActiveModal(null)}
        title="Удалить сотрудника"
        size="small"
        titleAccentColor="var(--color-danger)"
      >
        <div className="kit-modal-body">
          <p className="kit-modal-text">Вы уверены, что хотите удалить сотрудника «employee@company.ru» из компании?</p>
          <div className="kit-modal-actions">
            <Button type="button" variant="cancel" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="danger" size="md" onClick={() => setActiveModal(null)}>
              Удалить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "status"}
        onClose={() => setActiveModal(null)}
        title="Изменение статуса"
        panelClassName="ui-kit-page__status-modal"
      >
        <div className="ui-kit-page__status-modal-body">
          <div className="ui-kit-page__status-modal-copy">
            <p>Кандидат: Иван Петров</p>
            <p>Вакансия: Frontend Developer</p>
            <p>Отклик: 2 апреля 2026</p>
          </div>

          <div className="ui-kit-page__status-field ui-kit-page__status-field--selector">
            <span className="ui-kit-page__status-field-label">Выберите статус:</span>
            <div className="ui-kit-page__status-options">
              {uiKitResponseStatusOptions.map((option) => (
                <label key={option.value} className="ui-kit-page__status-radio">
                  <Radio
                    name="ui-kit-status"
                    checked={uiKitResponseStatus === option.value}
                    onChange={() => setUiKitResponseStatus(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {uiKitResponseStatus === "accepted" ? (
            <>
              <div className="ui-kit-page__status-field">
                <span className="ui-kit-page__status-field-label">Назначьте дату собеседования:</span>
                <DateInput className="input--sm" value="2026-04-10" onChange={() => undefined} variant="primary" />
              </div>

              <div className="ui-kit-page__meeting-schedule">
                <label className="ui-kit-page__status-field">
                  <span className="ui-kit-page__status-field-label">Начало:</span>
                  <Input className="input--sm ui-kit-page__time-input" type="time" value="10:00" onChange={() => undefined} clearable={false} />
                </label>
                <label className="ui-kit-page__status-field">
                  <span className="ui-kit-page__status-field-label">Окончание:</span>
                  <Input className="input--sm ui-kit-page__time-input" type="time" value="11:00" onChange={() => undefined} clearable={false} />
                </label>
              </div>

              <label className="ui-kit-page__status-field">
                <span className="ui-kit-page__status-field-label">Формат:</span>
                <Input className="input--sm" value="Онлайн, Google Meet" onChange={() => undefined} />
              </label>

              <label className="ui-kit-page__status-field">
                <span className="ui-kit-page__status-field-label">Ссылка:</span>
                <Input className="input--sm" value="https://meet.google.com/demo-room" onChange={() => undefined} />
              </label>

              <label className="ui-kit-page__status-field">
                <span className="ui-kit-page__status-field-label">Контакты:</span>
                <Input className="input--sm" value="hr@company.ru" onChange={() => undefined} />
              </label>

              <label className="ui-kit-page__status-field">
                <span className="ui-kit-page__status-field-label">Что взять с собой:</span>
                <textarea
                  className="ui-kit-page__status-textarea ui-kit-page__status-textarea--sm"
                  placeholder="Каждый пункт с новой строки"
                  defaultValue={"Паспорт\nНоутбук\nПортфолио"}
                />
              </label>
            </>
          ) : null}

          <label className="ui-kit-page__status-field">
            <span className="ui-kit-page__status-field-label">Комментарий:</span>
            <textarea
              className="ui-kit-page__status-textarea ui-kit-page__status-textarea--sm"
              placeholder="Введите комментарий"
              defaultValue="Будем на связи после следующего этапа."
            />
          </label>

          <div className="kit-modal-actions">
            <Button type="button" variant="cancel" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="primary" size="md" onClick={() => setActiveModal(null)}>
              Подтвердить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "opportunityDelete"}
        onClose={() => setActiveModal(null)}
        title="Удалить возможность"
        size="small"
        titleAccentColor="var(--color-danger)"
      >
        <div className="kit-modal-body">
          <p className="kit-modal-text">Вы уверены, что хотите удалить эту вакансию?</p>
          <p className="kit-modal-warning">Это действие нельзя отменить!</p>
          <div className="kit-modal-removal">
            <p className="kit-modal-text">Безвозвратно будут удалены:</p>
            <ul className="kit-modal-list">
              <li>Все отклики на эту вакансию</li>
              <li>Вакансия исчезнет из поиска</li>
            </ul>
          </div>
          <div className="kit-modal-actions">
            <Button type="button" variant="cancel" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="danger" size="md" onClick={() => setActiveModal(null)}>
              Удалить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "seekerProject"}
        onClose={() => setActiveModal(null)}
        title="Добавление проекта"
        titleAccentColor="var(--color-secondary)"
      >
        <div className="kit-modal-body">
          <label className="kit-field">
            <span className="kit-field__label">Название проекта</span>
            <div className="kit-field__control">
              <Input className="input--secondary input--sm" placeholder="Название проекта" defaultValue="Frontend LMS" />
            </div>
          </label>
          <label className="kit-field">
            <span className="kit-field__label">Описание</span>
            <textarea
              className="ui-kit-page__status-textarea ui-kit-page__status-textarea--sm"
              placeholder="Описание"
              defaultValue="Личный учебный проект"
            />
          </label>
          <label className="kit-field">
            <span className="kit-field__label">Технологии</span>
            <div className="kit-field__control">
              <Input className="input--secondary input--sm" placeholder="Найдите hard skill" defaultValue="React, TypeScript" />
            </div>
          </label>
          <label className="kit-field">
            <span className="kit-field__label">Ссылка</span>
            <div className="kit-field__control">
              <Input className="input--secondary input--sm" placeholder="Ссылка" defaultValue="https://github.com/demo/frontend-lms" />
            </div>
          </label>
          <div className="kit-modal-actions">
            <Button type="button" variant="secondary-outline" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setActiveModal(null)}>
              Добавить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "seekerAchievement"}
        onClose={() => setActiveModal(null)}
        title="Добавление достижения"
        titleAccentColor="var(--color-secondary)"
      >
        <div className="kit-modal-body">
          <label className="kit-field">
            <span className="kit-field__label">Название</span>
            <div className="kit-field__control">
              <Input className="input--secondary input--sm" placeholder="Название" defaultValue="Победа в хакатоне" />
            </div>
          </label>
          <label className="kit-field">
            <span className="kit-field__label">Мероприятие</span>
            <div className="kit-field__control">
              <Input className="input--secondary input--sm" placeholder="Мероприятие" defaultValue="Hackathon 2026" />
            </div>
          </label>
          <label className="kit-field">
            <span className="kit-field__label">Проект</span>
            <Select
              className="seeker-dashboard__select"
              variant="secondary"
              size="sm"
              placeholder="Выберите проект"
              value="Frontend LMS"
              options={[
                { value: "Frontend LMS", label: "Frontend LMS" },
                { value: "Career Platform", label: "Career Platform" },
              ]}
              onValueChange={() => undefined}
            />
          </label>
          <label className="kit-field">
            <span className="kit-field__label">Награда</span>
            <div className="kit-field__control">
              <Input className="input--secondary input--sm" placeholder="Награда" defaultValue="1 место" />
            </div>
          </label>
          <div className="kit-modal-actions">
            <Button type="button" variant="secondary-outline" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setActiveModal(null)}>
              Добавить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "seekerCertificate"}
        onClose={() => setActiveModal(null)}
        title="Добавление сертификата"
        titleAccentColor="var(--color-secondary)"
      >
        <div className="kit-modal-body">
          <label className="kit-field">
            <span className="kit-field__label">Название</span>
            <div className="kit-field__control">
              <Input className="input--secondary input--sm" placeholder="Название" defaultValue="React Developer Certificate" />
            </div>
          </label>
          <label className="kit-field">
            <span className="kit-field__label">Организация</span>
            <div className="kit-field__control">
              <Input className="input--secondary input--sm" placeholder="Организация" defaultValue="Open Education" />
            </div>
          </label>
          <label className="kit-field">
            <span className="kit-field__label">Дата</span>
            <div className="kit-field__control">
              <Input className="input--secondary input--sm" placeholder="Дата в формате YYYY-MM-DD" defaultValue="2026-03-12" />
            </div>
          </label>
          <label className="kit-field">
            <span className="kit-field__label">Ссылка</span>
            <div className="kit-field__control">
              <Input className="input--secondary input--sm" placeholder="Ссылка" defaultValue="https://example.com/certificate/react" />
            </div>
          </label>
          <div className="kit-modal-actions">
            <Button type="button" variant="secondary-outline" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setActiveModal(null)}>
              Добавить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "seekerDelete"}
        onClose={() => setActiveModal(null)}
        title="Удаление проекта"
        size="small"
        titleAccentColor="var(--color-danger)"
      >
        <div className="kit-modal-body">
          <p className="kit-modal-text">Вы уверены, что хотите удалить проект «Frontend LMS»?</p>
          <div className="kit-modal-actions">
            <Button type="button" variant="cancel" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="danger" size="md" onClick={() => setActiveModal(null)}>
              Удалить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "curatorDelete"}
        onClose={() => setActiveModal(null)}
        title="Удалить куратора"
        size="small"
        titleAccentColor="var(--color-danger)"
      >
        <div className="kit-modal-body">
          <p className="kit-modal-text">Вы уверены, что хотите удалить куратора «Иванов Иван Иванович»?</p>
          <div className="kit-modal-actions">
            <Button type="button" variant="cancel" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="danger" size="md" onClick={() => setActiveModal(null)}>
              Удалить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "curatorBulkDelete"}
        onClose={() => setActiveModal(null)}
        title="Удалить кураторов"
        size="small"
        titleAccentColor="var(--color-danger)"
      >
        <div className="kit-modal-body">
          <p className="kit-modal-text">Вы уверены, что хотите удалить выбранных кураторов?</p>
          <ul className="kit-modal-list">
            <li>Иванов Иван Иванович</li>
            <li>Петров Пётр Петрович</li>
            <li>Сидорова Анна</li>
          </ul>
          <div className="kit-modal-actions">
            <Button type="button" variant="cancel" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="danger" size="md" onClick={() => setActiveModal(null)}>
              Удалить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "curatorEdit"}
        onClose={() => setActiveModal(null)}
        title="Редактирование куратора"
        titleAccentColor="var(--color-accent)"
      >
        <div className="kit-modal-body">
          <label className="kit-field">
            <span className="kit-field__label">ФИО</span>
            <div className="kit-field__control">
              <Input className="input--sm" defaultValue="Иванов Иван Иванович" />
            </div>
          </label>
          <label className="kit-field">
            <span className="kit-field__label">E-mail</span>
            <div className="kit-field__control">
              <Input className="input--sm" defaultValue="ivanov@curator.ru" />
            </div>
          </label>
          <label className="kit-field">
            <span className="kit-field__label">Пароль</span>
            <div className="kit-field__control">
              <Input className="input--sm" defaultValue="пароль123" />
            </div>
          </label>
          <div className="kit-field">
            <span className="kit-field__label">Роль</span>
            <div className="kit-modal-role-options">
              <label className="kit-modal-option">
                <Radio name="ui-kit-curator-edit-role" variant="accent" />
                <span className="kit-modal-role-text">
                  <span>Junior</span>
                  <InfoTooltip className="kit-modal-role-info" text={uiKitCuratorRoleDescriptions.junior} />
                </span>
              </label>
              <label className="kit-modal-option">
                <Radio name="ui-kit-curator-edit-role" variant="accent" defaultChecked />
                <span className="kit-modal-role-text">
                  <span>Middle</span>
                  <InfoTooltip className="kit-modal-role-info" text={uiKitCuratorRoleDescriptions.curator} />
                </span>
              </label>
              <label className="kit-modal-option">
                <Radio name="ui-kit-curator-edit-role" variant="accent" />
                <span className="kit-modal-role-text">
                  <span>Senior</span>
                  <InfoTooltip className="kit-modal-role-info" text={uiKitCuratorRoleDescriptions.admin} />
                </span>
              </label>
            </div>
          </div>
          <div className="kit-modal-actions">
            <Button type="button" variant="accent-outline" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="accent" size="md" onClick={() => setActiveModal(null)}>
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "curatorBulkRole"}
        onClose={() => setActiveModal(null)}
        title="Изменить роль кураторов"
        titleAccentColor="var(--color-accent)"
      >
        <div className="kit-modal-body">
          <p className="kit-modal-text">Выбрано кураторов: 3</p>
          <ul className="kit-modal-list">
            <li>
              <p className="kit-modal-text">ФИО: Иванов Иван Иванович</p>
              <p className="kit-modal-text">E-mail: ivanov@curator.ru</p>
              <p className="kit-modal-text">Роль: Middle</p>
            </li>
            <li>
              <p className="kit-modal-text">ФИО: Петров Пётр Петрович</p>
              <p className="kit-modal-text">E-mail: petrov@curator.ru</p>
              <p className="kit-modal-text">Роль: Junior</p>
            </li>
            <li>
              <p className="kit-modal-text">ФИО: Сидорова Анна</p>
              <p className="kit-modal-text">E-mail: sidorova@curator.ru</p>
              <p className="kit-modal-text">Роль: Senior</p>
            </li>
          </ul>
          <div className="kit-field">
            <span className="kit-field__label">Новая роль</span>
            <div className="kit-modal-role-options">
              <label className="kit-modal-option">
                <Radio name="ui-kit-curator-bulk-role" variant="accent" />
                <span className="kit-modal-role-text">
                  <span>Junior</span>
                  <InfoTooltip className="kit-modal-role-info" text={uiKitCuratorRoleDescriptions.junior} />
                </span>
              </label>
              <label className="kit-modal-option">
                <Radio name="ui-kit-curator-bulk-role" variant="accent" defaultChecked />
                <span className="kit-modal-role-text">
                  <span>Middle</span>
                  <InfoTooltip className="kit-modal-role-info" text={uiKitCuratorRoleDescriptions.curator} />
                </span>
              </label>
              <label className="kit-modal-option">
                <Radio name="ui-kit-curator-bulk-role" variant="accent" />
                <span className="kit-modal-role-text">
                  <span>Senior</span>
                  <InfoTooltip className="kit-modal-role-info" text={uiKitCuratorRoleDescriptions.admin} />
                </span>
              </label>
            </div>
          </div>
          <p className="kit-modal-note">При понижении роли будут отозваны соответствующие права доступа.</p>
          <div className="kit-modal-actions">
            <Button type="button" variant="accent-outline" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="accent" size="md" onClick={() => setActiveModal(null)}>
              Изменить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "curatorCreate"}
        onClose={() => setActiveModal(null)}
        title="Добавить куратора"
        titleAccentColor="var(--color-accent)"
      >
        <div className="kit-modal-body">
          <label className="kit-field">
            <span className="kit-field__label">Имя пользователя</span>
            <div className="kit-field__control">
              <Input className="input--sm" placeholder="Введите имя куратора" />
            </div>
          </label>
          <label className="kit-field">
            <span className="kit-field__label">E-mail</span>
            <div className="kit-field__control">
              <Input className="input--sm" placeholder="name@example.com" />
            </div>
          </label>
          <label className="kit-field">
            <span className="kit-field__label">Пароль</span>
            <div className="kit-field__control">
              <Input className="input--sm" placeholder="Введите пароль" />
            </div>
          </label>
          <div className="kit-field">
            <span className="kit-field__label">Роль</span>
            <div className="kit-modal-role-options">
              <label className="kit-modal-option">
                <Radio name="ui-kit-curator-create-role" variant="accent" />
                <span className="kit-modal-role-text">
                  <span>Junior</span>
                  <InfoTooltip className="kit-modal-role-info" text={uiKitCuratorRoleDescriptions.junior} />
                </span>
              </label>
              <label className="kit-modal-option">
                <Radio name="ui-kit-curator-create-role" variant="accent" defaultChecked />
                <span className="kit-modal-role-text">
                  <span>Middle</span>
                  <InfoTooltip className="kit-modal-role-info" text={uiKitCuratorRoleDescriptions.curator} />
                </span>
              </label>
              <label className="kit-modal-option">
                <Radio name="ui-kit-curator-create-role" variant="accent" />
                <span className="kit-modal-role-text">
                  <span>Senior</span>
                  <InfoTooltip className="kit-modal-role-info" text={uiKitCuratorRoleDescriptions.admin} />
                </span>
              </label>
            </div>
          </div>
          <div className="kit-modal-actions">
            <Button type="button" variant="accent-outline" size="md" onClick={() => setActiveModal(null)}>
              Отмена
            </Button>
            <Button type="button" variant="accent" size="md" onClick={() => setActiveModal(null)}>
              Добавить
            </Button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
