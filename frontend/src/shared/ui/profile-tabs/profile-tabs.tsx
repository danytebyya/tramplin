import type { EmployerAccessState } from "../../../features/auth";
import { cn } from "../../lib";

type ApplicantProfileTabKey = "profile" | "applications" | "favorites" | "networking" | "settings";
type EmployerProfileTabKey = "company-profile" | "opportunities" | "responses" | "chat" | "settings";

type SharedProfileTabsProps = {
  navigate: (to: string) => void;
  ariaLabel?: string;
  tabsClassName?: string;
  tabClassName?: string;
  activeTabClassName?: string;
};

type ApplicantProfileTabsProps = SharedProfileTabsProps & {
  audience: "applicant";
  current: ApplicantProfileTabKey;
};

type EmployerProfileTabsProps = SharedProfileTabsProps & {
  audience: "employer";
  current: EmployerProfileTabKey;
  employerAccess: EmployerAccessState;
};

type ProfileTabsProps = ApplicantProfileTabsProps | EmployerProfileTabsProps;

type ResolvedProfileTab = {
  key: ApplicantProfileTabKey | EmployerProfileTabKey;
  label: string;
  to: string;
};

const APPLICANT_TABS: ResolvedProfileTab[] = [
  { key: "profile", label: "Профиль", to: "/dashboard/applicant" },
  { key: "applications", label: "Мои отклики", to: "/applications" },
  { key: "favorites", label: "Избранное", to: "/favorites" },
  { key: "networking", label: "Нетворкинг", to: "/networking" },
  { key: "settings", label: "Настройки", to: "/settings" },
];

function resolveEmployerTabs(employerAccess: EmployerAccessState): ResolvedProfileTab[] {
  return [
    ...(employerAccess.canManageCompanyProfile
      ? [{ key: "company-profile" as const, label: "Профиль компании", to: "/dashboard/employer" as const }]
      : []),
    ...(employerAccess.canManageOpportunities
      ? [{ key: "opportunities" as const, label: "Управление возможностями", to: "/employer/opportunities" as const }]
      : []),
    ...(employerAccess.canReviewResponses
      ? [{ key: "responses" as const, label: "Отклики", to: "/employer/responses" as const }]
      : []),
    ...(employerAccess.canAccessChat ? [{ key: "chat" as const, label: "Чат", to: "/employer/chat" as const }] : []),
    { key: "settings" as const, label: "Настройки", to: "/settings" },
  ];
}

export function ProfileTabs(props: ProfileTabsProps) {
  const {
    navigate,
    tabsClassName = "settings-page__tabs",
    tabClassName = "settings-page__tab",
    activeTabClassName = "settings-page__tab--active",
  } = props;

  const tabs = props.audience === "employer" ? resolveEmployerTabs(props.employerAccess) : APPLICANT_TABS;
  const ariaLabel =
    props.ariaLabel ?? (props.audience === "employer" ? "Разделы работодателя" : "Навигация соискателя");

  return (
    <div className="profile-tabs-section">
      <nav className={tabsClassName} aria-label={ariaLabel}>
        {tabs.map((tab) => {
          const isCurrent = tab.key === props.current;

          return (
            <button
              key={tab.key}
              type="button"
              className={cn(tabClassName, isCurrent && activeTabClassName)}
              onClick={() => {
                if (!isCurrent) {
                  navigate(tab.to);
                }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
