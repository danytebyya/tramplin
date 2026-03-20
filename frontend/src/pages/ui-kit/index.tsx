import { Button, Checkbox, Container, Input, Radio, Switch } from "../../shared/ui";
import "./ui-kit.css";

const buttonVariants = ["primary", "secondary", "ghost", "danger", "success"] as const;
const buttonSizes = [
  { label: "sm", size: "sm" as const },
  { label: "md", size: "md" as const },
  { label: "long", size: undefined },
];

export function UiKitPage() {
  return (
    <main className="kit-page">
      <Container className="kit-page__container">
        <section className="kit-section">
          <h1 className="kit-section__title">Buttons</h1>
          <div className="kit-section__group">
            {buttonVariants.map((variant) => (
              <div className="kit-section__column" key={variant}>
                <h2 className="kit-section__column-title">{variant}</h2>
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
          <div className="kit-section__group">
            {buttonVariants.map((variant) => (
              <div className="kit-section__column" key={`disabled-${variant}`}>
                <h3 className="kit-section__column-title">{variant}</h3>
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
          <div className="kit-section__group">
            {buttonVariants.map((variant) => (
              <div className="kit-section__column" key={`loading-${variant}`}>
                <h3 className="kit-section__column-title">{variant}</h3>
                {buttonSizes.map(({ label, size }) => (
                  <Button
                    key={`loading-${variant}-${label}`}
                    variant={variant}
                    size={size}
                    loading
                  >
                    Кнопка
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="kit-section">
          <h1 className="kit-section__title">Inputs</h1>
          <div className="kit-fields">
            <label className="kit-field">
              <span className="kit-field__label">Label (large)</span>
              <div className="kit-field__control">
                <Input placeholder="Input" defaultValue="Input value" />
              </div>
            </label>
            <label className="kit-field">
              <span className="kit-field__label">Label (small)</span>
              <div className="kit-field__control">
                <Input placeholder="Input" className="input--sm" defaultValue="Input value" />
              </div>
            </label>
            <label className="kit-field kit-field--error">
              <span className="kit-field__label">Label</span>
              <div className="kit-field__control">
                <Input placeholder="Input" className="input--error" defaultValue="Wrong value" />
                <span className="kit-field__icon">!</span>
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

        <section className="kit-section kit-section--controls">
          <div className="kit-controls">
            <h1 className="kit-section__title">Checkboxes and Radio</h1>
            <div className="kit-controls__content">
              <Checkbox defaultChecked />
              <Checkbox defaultChecked disabled />
              <Radio name="kit-radio-group" defaultChecked />
              <Radio name="kit-radio-group" />
              <Radio checked disabled readOnly />
            </div>
          </div>
          <div className="kit-controls">
            <h1 className="kit-section__title">Switches</h1>
            <div className="kit-controls__switches">
              <Switch defaultChecked />
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
