LEGAL_ENTITY_REPLACEMENTS: list[tuple[str, str]] = [
    ("ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ", "ООО"),
    ("ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", "ПАО"),
    ("НЕПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО", "НАО"),
    ("АКЦИОНЕРНОЕ ОБЩЕСТВО", "АО"),
    ("ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ", "ИП"),
    ("ФЕДЕРАЛЬНОЕ ГОСУДАРСТВЕННОЕ БЮДЖЕТНОЕ ОБРАЗОВАТЕЛЬНОЕ УЧРЕЖДЕНИЕ", "ФГБОУ"),
    ("ФЕДЕРАЛЬНОЕ ГОСУДАРСТВЕННОЕ БЮДЖЕТНОЕ УЧРЕЖДЕНИЕ", "ФГБУ"),
    ("ГОСУДАРСТВЕННОЕ БЮДЖЕТНОЕ УЧРЕЖДЕНИЕ", "ГБУ"),
    ("МУНИЦИПАЛЬНОЕ БЮДЖЕТНОЕ УЧРЕЖДЕНИЕ", "МБУ"),
]


def normalize_legal_entity_name(value: str) -> str:
    normalized_value = " ".join(value.replace("\u00A0", " ").strip().split())
    upper_value = normalized_value.upper()

    for full_name, abbreviation in LEGAL_ENTITY_REPLACEMENTS:
        match_index = upper_value.find(full_name)
        if match_index == -1:
            continue

        before = normalized_value[:match_index].strip()
        after = normalized_value[match_index + len(full_name):].strip()
        parts = [part for part in (before, abbreviation, after) if part]
        return " ".join(parts)

    return normalized_value
