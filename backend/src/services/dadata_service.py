import json
from datetime import UTC, datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from src.core.config import settings
from src.enums import EmployerType
from src.utils.errors import AppError


def _resolve_dadata_party_type(employer_type: EmployerType) -> str:
    if employer_type == EmployerType.COMPANY:
        return "LEGAL"

    return "INDIVIDUAL"


def _format_registration_date(value: int | None) -> str | None:
    if not value:
        return None

    return datetime.fromtimestamp(value / 1000, tz=UTC).strftime("%d.%m.%Y")


def _resolve_subject_type_label(suggestion_data: dict) -> str:
    if suggestion_data.get("type") == "LEGAL":
        return suggestion_data.get("opf", {}).get("full") or "Юридическое лицо"

    return "Индивидуальный предприниматель"


def _resolve_status_label(status: str | None) -> str | None:
    status_map = {
        "ACTIVE": "Действующая",
        "LIQUIDATING": "В процессе ликвидации",
        "LIQUIDATED": "Ликвидирована",
        "REORGANIZING": "В процессе реорганизации",
        "BANKRUPT": "Банкротство",
    }
    return status_map.get(status or "", status)


class DadataService:
    def _request_suggestions(self, inn: str, employer_type: EmployerType | None) -> list[dict]:
        if not settings.dadata_api_key:
            raise AppError(
                code="DADATA_NOT_CONFIGURED",
                message="Проверка ИНН временно недоступна",
                status_code=503,
            )

        payload = {
            "query": inn,
            "count": 10,
        }
        if employer_type is not None:
            payload["type"] = _resolve_dadata_party_type(employer_type)
        request = Request(
            settings.dadata_suggestions_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": f"Token {settings.dadata_api_key}",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=settings.dadata_timeout_seconds) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raise AppError(
                code="DADATA_REQUEST_FAILED",
                message="Не удалось проверить ИНН. Попробуйте позже.",
                status_code=502,
                details={"status_code": error.code},
            ) from error
        except URLError as error:
            raise AppError(
                code="DADATA_UNAVAILABLE",
                message="Сервис проверки ИНН временно недоступен",
                status_code=502,
            ) from error

        return response_payload.get("suggestions", [])

    def verify_inn(self, inn: str, employer_type: EmployerType | None) -> dict:
        search_order = [employer_type] if employer_type is not None else [
            EmployerType.COMPANY,
            EmployerType.SOLE_PROPRIETOR,
        ]

        matched_suggestion = None
        matched_employer_type = None

        for current_type in search_order:
            suggestions = self._request_suggestions(inn=inn, employer_type=current_type)
            matched_suggestion = next(
                (
                    suggestion
                    for suggestion in suggestions
                    if suggestion.get("data", {}).get("inn") == inn
                ),
                None,
            )
            if matched_suggestion is not None:
                matched_employer_type = current_type
                break

        if matched_suggestion is None:
            not_found_message = (
                "Организация с таким ИНН не найдена"
                if employer_type != EmployerType.SOLE_PROPRIETOR
                else "Физическое лицо с таким ИНН не найдено"
            )
            raise AppError(
                code="EMPLOYER_INN_NOT_FOUND",
                message=not_found_message,
                status_code=404,
            )

        suggestion_data = matched_suggestion.get("data", {})
        raw_status = suggestion_data.get("state", {}).get("status")

        return {
            "employer_type": matched_employer_type.value if matched_employer_type else None,
            "inn": suggestion_data.get("inn"),
            "full_name": suggestion_data.get("name", {}).get("full_with_opf") or matched_suggestion.get("value"),
            "name": suggestion_data.get("name", {}).get("short_with_opf")
            or suggestion_data.get("name", {}).get("full_with_opf")
            or matched_suggestion.get("value"),
            "ogrn": suggestion_data.get("ogrn"),
            "address": suggestion_data.get("address", {}).get("value"),
            "type": suggestion_data.get("type"),
            "subject_type": _resolve_subject_type_label(suggestion_data),
            "status": raw_status,
            "status_label": _resolve_status_label(raw_status),
            "registration_date": _format_registration_date(
                suggestion_data.get("state", {}).get("registration_date")
            ),
            "director_name": suggestion_data.get("management", {}).get("name"),
        }
