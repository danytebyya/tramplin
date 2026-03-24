import {
  Badge,
  Button,
  Checkbox,
  Container,
  Input,
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
  { label: "Отклонено", variant: "rejected" as const },
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

export function UiKitPage() {
  const employerTypeOptions = [
    { value: "company", label: "Компания" },
    { value: "sole_proprietor", label: "ИП" },
    { value: "state", label: "Госорганизация" },
    { value: "ngo", label: "НКО" },
  ];

  return (
    <main className="kit-page">
      <Container className="kit-page__container">
        <section className="kit-section">
          <h1 className="kit-section__title">Buttons</h1>
          <div className="kit-button-groups">
            {buttonGroups.map((group) => (
              <div className="kit-button-group" key={group.title}>
                <h2 className="kit-section__subtitle">{group.title}</h2>
                <div className="kit-section__group kit-section__group--buttons">
                  {group.variants.map(({ label, variant }) => (
                    <div className="kit-section__column" key={variant}>
                      <h3 className="kit-section__column-title">{label}</h3>
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
              <div className="kit-section__column" key={variant}>
                <h3 className="kit-section__column-title">{title}</h3>
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
              <div className="kit-section__column" key={`disabled-${variant}`}>
                <h3 className="kit-section__column-title">{title}</h3>
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
              <div className="kit-section__column" key={`loading-${variant}`}>
                <h3 className="kit-section__column-title">{title}</h3>
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

        <section className="kit-section kit-section--controls">
          <div className="kit-controls">
            <h1 className="kit-section__title">Checkboxes and Radio</h1>
            <div className="kit-controls__content">
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
    </main>
  );
}
