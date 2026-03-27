from src.utils.legal_entity import normalize_legal_entity_name


def test_normalize_legal_entity_name_abbreviates_ooo() -> None:
    assert (
        normalize_legal_entity_name("ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ Ромашка")
        == "ООО Ромашка"
    )


def test_normalize_legal_entity_name_abbreviates_ip() -> None:
    assert (
        normalize_legal_entity_name("Индивидуальный предприниматель Иванов Иван Иванович")
        == "ИП Иванов Иван Иванович"
    )
