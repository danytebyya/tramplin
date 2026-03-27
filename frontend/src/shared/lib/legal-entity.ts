const LEGAL_ENTITY_REPLACEMENTS: Array<[string, string]> = [
  ["ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ", "ООО"],
  ["ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", "ПАО"],
  ["НЕПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", "НАО"],
  ["АКЦИОНЕРНОЕ ОБЩЕСТВО", "АО"],
  ["ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ", "ИП"],
  ["ФЕДЕРАЛЬНОЕ ГОСУДАРСТВЕННОЕ БЮДЖЕТНОЕ ОБРАЗОВАТЕЛЬНОЕ УЧРЕЖДЕНИЕ", "ФГБОУ"],
  ["ФЕДЕРАЛЬНОЕ ГОСУДАРСТВЕННОЕ БЮДЖЕТНОЕ УЧРЕЖДЕНИЕ", "ФГБУ"],
  ["ГОСУДАРСТВЕННОЕ БЮДЖЕТНОЕ УЧРЕЖДЕНИЕ", "ГБУ"],
  ["МУНИЦИПАЛЬНОЕ БЮДЖЕТНОЕ УЧРЕЖДЕНИЕ", "МБУ"],
];

function normalizeLegalEntityName(value: string) {
  return value
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ")
    .replace(/[«»]/g, "\"")
    .trim()
    .replace(/\s+/g, " ");
}

export function abbreviateLegalEntityName(value: string) {
  const normalizedValue = normalizeLegalEntityName(value);
  const upperValue = normalizedValue.toUpperCase();

  for (const [fullName, abbreviation] of LEGAL_ENTITY_REPLACEMENTS) {
    const matchIndex = upperValue.indexOf(fullName);

    if (matchIndex === -1) {
      continue;
    }

    const before = normalizedValue.slice(0, matchIndex);
    const after = normalizedValue.slice(matchIndex + fullName.length).trimStart();
    const parts = [before.trimEnd(), abbreviation, after].filter(Boolean);

    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  return normalizedValue;
}
