import { MouseEvent, useEffect, useState } from "react";

import { Link, useLocation, useNavigate } from "react-router-dom";

import logoPrimary from "../../assets/icons/logo-primary.svg";
import logoSecondary from "../../assets/icons/logo-secondary.svg";
import { useAuthStore } from "../../features/auth";
import { Container } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import "../../widgets/back-navigation/back-navigation.css";
import { legalDocuments, LegalDocumentType } from "./legal-data";
import "./legal.css";

type LegalDocumentPageProps = {
  documentType: LegalDocumentType;
};

function resolveThemeRole(role: string | null) {
  if (role === "junior") {
    return "curator";
  }

  if (role === "applicant" || role === "employer" || role === "curator" || role === "admin") {
    return role;
  }

  return "guest";
}

export function LegalDocumentPage({ documentType }: LegalDocumentPageProps) {
  const legalDocument = legalDocuments[documentType];
  const location = useLocation();
  const navigate = useNavigate();
  const role = useAuthStore((state) => state.role);
  const themeRole = resolveThemeRole(role);
  const brandLogo = themeRole === "applicant" ? logoSecondary : logoPrimary;
  const [activeSectionId, setActiveSectionId] = useState(legalDocument.sections[0]?.id ?? "");
  const returnTo =
    typeof location.state?.returnTo === "string" &&
    location.state.returnTo !== "/confidential" &&
    location.state.returnTo !== "/rules"
      ? location.state.returnTo
      : "/";

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "auto",
    });
  }, [documentType]);

  useEffect(() => {
    const resolveActiveSection = () => {
      const headerOffset = 112;
      let nextActiveSectionId = legalDocument.sections[0]?.id ?? "";

      legalDocument.sections.forEach((section) => {
        const element = getSectionElement(section.id);

        if (!element) {
          return;
        }

        const top = element.getBoundingClientRect().top;

        if (top - headerOffset <= 24) {
          nextActiveSectionId = section.id;
        }
      });

      setActiveSectionId(nextActiveSectionId);
    };

    const getSectionElement = (id: string) => window.document.getElementById(id);

    resolveActiveSection();
    window.addEventListener("scroll", resolveActiveSection, { passive: true });

    return () => {
      window.removeEventListener("scroll", resolveActiveSection);
    };
  }, [legalDocument.sections]);

  const handleSectionLinkClick = (sectionId: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();

    const sectionElement = window.document.getElementById(sectionId);

    if (!sectionElement) {
      return;
    }

    const headerOffset = 112;
    const targetTop = window.scrollY + sectionElement.getBoundingClientRect().top - headerOffset;

    window.history.replaceState(window.history.state, "", `#${sectionId}`);
    setActiveSectionId(sectionId);
    window.scrollTo({
      top: Math.max(targetTop, 0),
      behavior: "smooth",
    });
  };

  const handleBackClick = () => {
    navigate(returnTo, { replace: true });
  };

  return (
    <main className={`legal-page legal-page--${themeRole}`}>
      <header className="legal-page__header">
        <Container className="legal-page__header-shell">
          <div className="legal-page__brand-group">
            <Link to="/" className="legal-page__brand">
              <img src={brandLogo} alt="Трамплин" className="legal-page__brand-logo" />
            </Link>
          </div>

          <nav className="legal-page__nav" aria-label="Юридическая навигация">
            <Link
              to="/confidential"
              replace
              state={{ returnTo }}
              className={
                documentType === "confidential"
                  ? "legal-page__nav-link legal-page__nav-link--active"
                  : "legal-page__nav-link"
              }
            >
              Политика конфиденциальности
            </Link>
            <Link
              to="/rules"
              replace
              state={{ returnTo }}
              className={
                documentType === "rules"
                  ? "legal-page__nav-link legal-page__nav-link--active"
                  : "legal-page__nav-link"
              }
            >
              Согласие на обработку данных
            </Link>
          </nav>
        </Container>
      </header>

      <section className="legal-page__hero">
        <Container className="legal-page__hero-shell">
          <button
            type="button"
            className="back-navigation__button legal-page__back"
            aria-label="Назад"
            onClick={handleBackClick}
          >
            <span aria-hidden="true" className="legal-page__back-icon" />
          </button>
          <h1 className="legal-page__title">{legalDocument.title}</h1>
        </Container>
      </section>

      <section className="legal-page__summary">
        <Container className="legal-page__summary-shell">
          <aside className="legal-page__sidebar" aria-label="Разделы документа">
            <div className="legal-page__sidebar-card">
              {legalDocument.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className={
                    activeSectionId === section.id
                      ? "legal-page__sidebar-link legal-page__sidebar-link--active"
                      : "legal-page__sidebar-link"
                  }
                  onClick={handleSectionLinkClick(section.id)}
                >
                  {section.title}
                </a>
              ))}
            </div>
          </aside>

          <div className="legal-page__document">
            {legalDocument.sections.map((section, index) => (
              <section key={section.id} id={section.id} className="legal-page__section">
                <h2 className="legal-page__section-title">
                  {index + 1}. {section.title}
                </h2>
                <div className="legal-page__section-body">
                  {section.blocks.map((block, blockIndex) =>
                    block.type === "paragraph" ? (
                      <p key={`${section.id}-${blockIndex}`} className="legal-page__paragraph">
                        {block.content}
                      </p>
                    ) : (
                      <ul key={`${section.id}-${blockIndex}`} className="legal-page__list">
                        {block.items.map((item, itemIndex) => (
                          <li key={`${section.id}-${blockIndex}-${itemIndex}`} className="legal-page__list-entry">
                            {item}
                          </li>
                        ))}
                      </ul>
                    ),
                  )}
                </div>
              </section>
            ))}
          </div>
        </Container>
      </section>

      <Footer theme={themeRole} />
    </main>
  );
}
