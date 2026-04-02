import { Link, useLocation } from "react-router-dom";

import maxIcon from "../../assets/auth/max.png";
import vkIcon from "../../assets/auth/vk.png";
import logoPrimaryBlack from "../../assets/icons/logo-primary-black.svg";
import logoSecondaryBlack from "../../assets/icons/logo-secondary-black.svg";
import { Container } from "../../shared/ui";
import "./footer.css";

type FooterTheme = "guest" | "applicant" | "employer" | "curator" | "admin";

type FooterProps = {
  hashPrefix?: "" | "/";
  theme?: FooterTheme;
};

function toHref(hashPrefix: "" | "/", section: string) {
  return `${hashPrefix}${section}`;
}

export function Footer({
  hashPrefix = "",
  theme = "guest",
}: FooterProps) {
  const location = useLocation();
  const isAdminCompact = theme === "admin";
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const brandLogo = theme === "applicant" ? logoSecondaryBlack : logoPrimaryBlack;

  return (
    <footer className={`site-footer site-footer--${theme}`} id="about">
      <Container className="site-footer__shell">
        {isAdminCompact ? null : (
          <div className="site-footer__main">
            <div className="site-footer__logo-card">
              <img src={brandLogo} alt="Трамплин" className="site-footer__brand" />
            </div>

            <div className="site-footer__section">
              <h2 className="site-footer__title">О платформе</h2>
              <div className="site-footer__links">
                <a href={toHref(hashPrefix, "#")} className="site-footer__link">
                  Главная
                </a>
                <a href={toHref(hashPrefix, "#about")} className="site-footer__link">
                  О проекте
                </a>
              </div>
            </div>

            <div className="site-footer__section">
              <h2 className="site-footer__title">Категории</h2>
              <div className="site-footer__links">
                <a href={toHref(hashPrefix, "#all")} className="site-footer__link">
                  Все
                </a>
                <a href={toHref(hashPrefix, "#vacancies")} className="site-footer__link">
                  Вакансии
                </a>
                <a href={toHref(hashPrefix, "#internships")} className="site-footer__link">
                  Стажировки
                </a>
                <a href={toHref(hashPrefix, "#events")} className="site-footer__link">
                  Мероприятия
                </a>
                <a href={toHref(hashPrefix, "#mentorship")} className="site-footer__link">
                  Менторство
                </a>
              </div>
            </div>

            <div className="site-footer__section">
              <h2 className="site-footer__title">Поддержка</h2>
              <div className="site-footer__links">
                <a href={toHref(hashPrefix, "#help")} className="site-footer__link">
                  Помощь
                </a>
                <a href={toHref(hashPrefix, "#faq")} className="site-footer__link">
                  FAQ
                </a>
                <a href={toHref(hashPrefix, "#support-contacts")} className="site-footer__link">
                  Контакты поддержки
                </a>
                <a href={toHref(hashPrefix, "#report")} className="site-footer__link">
                  Сообщить о проблеме
                </a>
              </div>
            </div>

            <div className="site-footer__section">
              <h2 className="site-footer__title">Контакты</h2>
              <div className="site-footer__contacts">
                <a href="mailto:info@tramplin.ru" className="site-footer__contact">
                  info@tramplin.ru
                </a>
                <a href="tel:+79000000000" className="site-footer__contact">
                  +7 (900) 000 00-00
                </a>
              </div>
              <div className="site-footer__socials">
                <a href="https://vk.com" className="site-footer__social-link" aria-label="VK">
                  <img src={vkIcon} alt="" className="site-footer__social-icon" />
                </a>
                <a href="https://max.ru" className="site-footer__social-link" aria-label="Max">
                  <img src={maxIcon} alt="" className="site-footer__social-icon" />
                </a>
              </div>
            </div>
          </div>
        )}

        <div
          className={
            isAdminCompact
              ? "site-footer__bottom site-footer__bottom--compact"
              : "site-footer__bottom"
          }
        >
          <span className="site-footer__copyright">
            {isAdminCompact
              ? "© 2026 Трамплин Admin. Версия 1.0.0"
              : "© 2026 Платформа “Трамплин”. Все права защищены."}
          </span>
          {isAdminCompact ? (
            <a href="mailto:support@tramplin.ru" className="site-footer__legal-link">
              Техническая поддержка: support@tramplin.ru
            </a>
          ) : (
            <>
              <Link to="/confidential" state={{ returnTo }} className="site-footer__legal-link">
                Политика конфиденциальности
              </Link>
              <Link to="/rules" state={{ returnTo }} className="site-footer__legal-link">
                Согласие на обработку данных
              </Link>
            </>
          )}
        </div>
      </Container>
    </footer>
  );
}
