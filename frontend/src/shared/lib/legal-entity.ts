const LEGAL_ENTITY_PREFIXES: Array<[RegExp, string]> = [
  [/^\s*ОБЩЕСТВО[\s\xa0]+С[\s\xa0]+ОГРАНИЧЕННОЙ[\s\xa0]+ОТВЕТСТВЕННОСТЬЮ\b[\s\xa0]*/i, "ООО "],
  [/^\s*ПУБЛИЧНОЕ[\s\xa0]+АКЦИОНЕРНОЕ[\s\xa0]+ОБЩЕСТВО\b[\s\xa0]*/i, "ПАО "],
  [/^\s*НЕПУБЛИЧНОЕ[\s\xa0]+АКЦИОНЕРНОЕ[\s\xa0]+ОБЩЕСТВО\b[\s\xa0]*/i, "НАО "],
  [/^\s*АКЦИОНЕРНОЕ[\s\xa0]+ОБЩЕСТВО\b[\s\xa0]*/i, "АО "],
  [/^\s*ИНДИВИДУАЛЬНЫЙ[\s\xa0]+ПРЕДПРИНИМАТЕЛЬ\b[\s\xa0]*/i, "ИП "],
];

export function abbreviateLegalEntityName(value: string) {
  const normalizedValue = value.trim();

  for (const [pattern, replacement] of LEGAL_ENTITY_PREFIXES) {
    if (pattern.test(normalizedValue)) {
      return normalizedValue.replace(pattern, replacement).trim();
    }
  }

  return normalizedValue;
}
