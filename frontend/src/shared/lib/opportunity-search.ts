import type { Opportunity } from "../../entities/opportunity";

const SEARCH_SYNONYM_GROUPS = [
  ["python", "питон", "пайтон"],
  ["javascript", "js", "джаваскрипт", "жаваскрипт"],
  ["typescript", "ts", "тайпскрипт", "тайп"],
  ["java", "джава", "ява"],
  ["csharp", "c#", "сишарп", "шарп"],
  ["golang", "go", "голанг", "го"],
  ["postgresql", "postgres", "postgre", "постгрес", "постгре"],
  ["react", "реакт"],
  ["vue", "вью"],
  ["node", "nodejs", "node.js", "нод", "ноджс"],
  ["frontend", "front-end", "фронтенд", "фронтэнд"],
  ["backend", "back-end", "бэкенд", "бекенд"],
  ["fullstack", "full-stack", "фуллстек", "фулстек"],
  ["devops", "девопс"],
  ["qa", "quality assurance", "тестирование", "тестировщик", "тестировщица"],
  ["design", "designer", "дизайн", "дизайнер"],
  ["analytics", "analyst", "аналитика", "аналитик"],
  ["security", "cybersecurity", "безопасность", "кибербезопасность"],
] as const;

export function normalizeOpportunitySearchText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9+#.\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function expandOpportunitySearchAliases(value: string) {
  const normalizedValue = normalizeOpportunitySearchText(value);

  if (!normalizedValue) {
    return "";
  }

  let expandedValue = ` ${normalizedValue} `;

  SEARCH_SYNONYM_GROUPS.forEach((group) => {
    const hasMatch = group.some((item) => expandedValue.includes(` ${normalizeOpportunitySearchText(item)} `));

    if (!hasMatch) {
      return;
    }

    group.forEach((item) => {
      const normalizedItem = normalizeOpportunitySearchText(item);
      if (!expandedValue.includes(` ${normalizedItem} `)) {
        expandedValue += `${normalizedItem} `;
      }
    });
  });

  return expandedValue.trim();
}

function getTokenVariants(token: string) {
  const normalizedToken = normalizeOpportunitySearchText(token);

  if (!normalizedToken) {
    return [];
  }

  const variants = new Set<string>([normalizedToken]);

  SEARCH_SYNONYM_GROUPS.forEach((group) => {
    const normalizedGroup = group.map((item) => normalizeOpportunitySearchText(item));
    const matchesGroup = normalizedGroup.some((item) => item.includes(normalizedToken));

    if (!matchesGroup) {
      return;
    }

    normalizedGroup.forEach((item) => {
      variants.add(item);
    });
  });

  return Array.from(variants);
}

export function buildOpportunitySearchText(opportunity: Opportunity) {
  return normalizeOpportunitySearchText(expandOpportunitySearchAliases([
    opportunity.title,
    opportunity.companyName,
    opportunity.description,
    opportunity.salaryLabel,
    opportunity.locationLabel,
    opportunity.city,
    opportunity.address,
    opportunity.levelLabel,
    opportunity.employmentLabel,
    opportunity.eventType,
    opportunity.mentorshipDirection,
    opportunity.mentorExperience,
    opportunity.format === "office"
      ? "офлайн offline office"
      : opportunity.format === "hybrid"
        ? "гибрид hybrid"
        : "удаленно удаленно remote online",
    opportunity.kind === "vacancy"
      ? "вакансия vacancy"
      : opportunity.kind === "internship"
        ? "стажировка internship"
        : opportunity.kind === "event"
          ? "мероприятие event"
          : "менторство mentorship",
    ...opportunity.tags,
  ].filter(Boolean).join(" ")));
}

function tokenizeOpportunitySearchText(value: string) {
  return normalizeOpportunitySearchText(value)
    .split(/[\s.-]+/)
    .filter(Boolean);
}

export function matchesOpportunitySearch(opportunity: Opportunity, query: string) {
  const normalizedQuery = normalizeOpportunitySearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const searchableText = buildOpportunitySearchText(opportunity);
  const directMatch = searchableText.includes(normalizedQuery);

  if (directMatch) {
    return true;
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const searchableTokens = tokenizeOpportunitySearchText(searchableText);

  return queryTokens.every((token) => {
    const tokenVariants = getTokenVariants(token);
    return tokenVariants.some((variant) =>
      searchableTokens.some(
        (searchableToken) =>
          searchableToken.startsWith(variant) || variant.startsWith(searchableToken),
      ),
    );
  });
}
