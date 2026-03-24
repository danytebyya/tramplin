export type OpportunityFormat = "office" | "hybrid" | "remote";
export type OpportunityKind = "vacancy" | "internship" | "event";

export type Opportunity = {
  id: string;
  title: string;
  companyName: string;
  companyVerified: boolean;
  salaryLabel: string;
  locationLabel: string;
  format: OpportunityFormat;
  kind: OpportunityKind;
  levelLabel: string;
  employmentLabel: string;
  description: string;
  tags: string[];
  latitude: number;
  longitude: number;
  accent: "cyan" | "amber" | "blue" | "slate";
};

export const opportunityViewOptions = [
  { label: "Карта", value: "map" },
  { label: "Список", value: "list" },
] as const;

export const mockOpportunities: Opportunity[] = [
  {
    id: "opportunity-1",
    title: "Frontend developer",
    companyName: "Трамплин Digital",
    companyVerified: true,
    salaryLabel: "от 120 000 ₽",
    locationLabel: "Чебоксары, офис",
    format: "office",
    kind: "vacancy",
    levelLabel: "Middle",
    employmentLabel: "Full-time",
    description:
      "Разработка интерфейсов карьерной платформы, участие в проектировании UI и интеграциях с backend API.",
    tags: ["React", "TypeScript", "Vite"],
    latitude: 56.1325,
    longitude: 47.2519,
    accent: "cyan",
  },
  {
    id: "opportunity-2",
    title: "Product designer intern",
    companyName: "Start Volga",
    companyVerified: true,
    salaryLabel: "от 60 000 ₽",
    locationLabel: "Чебоксары, гибрид",
    format: "hybrid",
    kind: "internship",
    levelLabel: "Intern",
    employmentLabel: "Part-time",
    description:
      "Стажировка в продуктовой команде: исследование пользовательских сценариев, прототипы и UI для web-платформы.",
    tags: ["Figma", "UX", "Research"],
    latitude: 56.1262,
    longitude: 47.2325,
    accent: "amber",
  },
  {
    id: "opportunity-3",
    title: "Backend Python engineer",
    companyName: "Volga Cloud",
    companyVerified: false,
    salaryLabel: "от 170 000 ₽",
    locationLabel: "Новочебоксарск, удалённо",
    format: "remote",
    kind: "vacancy",
    levelLabel: "Senior",
    employmentLabel: "Full-time",
    description:
      "Проектирование сервисов на FastAPI, работа с PostgreSQL, очередями и наблюдаемостью в production.",
    tags: ["FastAPI", "PostgreSQL", "Docker"],
    latitude: 56.1108,
    longitude: 47.4773,
    accent: "blue",
  },
  {
    id: "opportunity-4",
    title: "AI meetup for students",
    companyName: "Технопарк Чувашии",
    companyVerified: true,
    salaryLabel: "Бесплатно",
    locationLabel: "Чебоксары, офлайн",
    format: "office",
    kind: "event",
    levelLabel: "Open level",
    employmentLabel: "1 day",
    description:
      "Митап о прикладном AI, карьерных треках и подготовке к первым техническим интервью.",
    tags: ["AI", "Career", "Meetup"],
    latitude: 56.1438,
    longitude: 47.1996,
    accent: "slate",
  },
];
