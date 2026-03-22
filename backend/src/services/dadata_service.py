import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from src.core.config import settings
from src.enums import EmployerType
from src.utils.errors import AppError


def _resolve_dadata_party_type(employer_type: EmployerType) -> str:
    if employer_type == EmployerType.COMPANY:
        return "LEGAL"

    return "INDIVIDUAL"


class DadataService:
    def verify_inn(self, inn: str, employer_type: EmployerType) -> dict:
        if not settings.dadata_api_key:
            raise AppError(
                code="DADATA_NOT_CONFIGURED",
                message="Проверка ИНН временно недоступна",
                status_code=503,
            )

        payload = {
            "query": inn,
            "count": 10,
            "type": _resolve_dadata_party_type(employer_type),
        }
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

        suggestions = response_payload.get("suggestions", [])
        matched_suggestion = next(
            (
                suggestion
                for suggestion in suggestions
                if suggestion.get("data", {}).get("inn") == inn
            ),
            None,
        )

        if matched_suggestion is None:
            raise AppError(
                code="EMPLOYER_INN_NOT_FOUND",
                message="Организация или ИП с таким ИНН не найдены",
                status_code=404,
            )

        suggestion_data = matched_suggestion.get("data", {})

        return {
            "inn": suggestion_data.get("inn"),
            "name": suggestion_data.get("name", {}).get("short_with_opf")
            or suggestion_data.get("name", {}).get("full_with_opf")
            or matched_suggestion.get("value"),
            "ogrn": suggestion_data.get("ogrn"),
            "address": suggestion_data.get("address", {}).get("value"),
            "type": suggestion_data.get("type"),
            "status": suggestion_data.get("state", {}).get("status"),
        }
