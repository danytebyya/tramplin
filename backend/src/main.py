import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.api import api_router
from src.core.config import settings
from src.core.logging import setup_logging
from src.utils.errors import AppError
from src.utils.responses import error_response, success_response

setup_logging()
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    debug=settings.app_debug,
    version="0.1.0",
    openapi_url=f"{settings.api_v1_prefix}/openapi.json",
    docs_url=f"{settings.api_v1_prefix}/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


def _normalize_validation_message(error: dict) -> str:
    message = error.get("msg", "Некорректные данные запроса")
    if message.startswith("Value error, "):
        message = message.replace("Value error, ", "", 1)

    location_parts = [str(part) for part in error.get("loc", []) if part != "body"]
    location = ".".join(location_parts)
    lower_message = message.lower()

    if "email" in location.lower() and (
        "valid email address" in lower_message
        or "email address" in lower_message
        or "e-mail address" in lower_message
    ):
        return "Введите корректный email"

    if lower_message == "field required":
        return "Обязательное поле"

    return message


@app.get("/health")
def health() -> dict:
    return success_response({"status": "ok"})


@app.exception_handler(AppError)
def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    logger.warning(
        "app_error method=%s path=%s code=%s status=%s message=%s origin=%s",
        request.method,
        request.url.path,
        exc.code,
        exc.status_code,
        exc.message,
        request.headers.get("origin"),
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(code=exc.code, message=exc.message, details=exc.details),
    )


@app.exception_handler(RequestValidationError)
def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    normalized_errors: list[dict[str, str]] = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", []) if part != "body")
        message = _normalize_validation_message(error)
        normalized_errors.append(
            {
                "field": location or "request",
                "message": message,
            }
        )

    first_error_message = normalized_errors[0]["message"] if normalized_errors else "Некорректные данные запроса"
    logger.warning(
        "validation_error method=%s path=%s message=%s fields=%s origin=%s",
        request.method,
        request.url.path,
        first_error_message,
        normalized_errors,
        request.headers.get("origin"),
    )
    return JSONResponse(
        status_code=422,
        content=error_response(
            code="VALIDATION_ERROR",
            message=first_error_message,
            details={"fields": normalized_errors},
        ),
    )


@app.exception_handler(Exception)
def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "unhandled_error method=%s path=%s exception_type=%s origin=%s",
        request.method,
        request.url.path,
        exc.__class__.__name__,
        request.headers.get("origin"),
    )
    return JSONResponse(
        status_code=500,
        content=error_response(
            code="INTERNAL_SERVER_ERROR",
            message="Внутренняя ошибка сервера",
            details={"exception_type": exc.__class__.__name__} if settings.app_debug else {},
        ),
    )
