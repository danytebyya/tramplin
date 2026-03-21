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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def health() -> dict:
    return success_response({"status": "ok"})


@app.exception_handler(AppError)
def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response(code=exc.code, message=exc.message, details=exc.details),
    )


@app.exception_handler(RequestValidationError)
def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    normalized_errors: list[dict[str, str]] = []
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", []) if part != "body")
        message = error.get("msg", "Некорректные данные запроса")
        if message.startswith("Value error, "):
            message = message.replace("Value error, ", "", 1)
        normalized_errors.append(
            {
                "field": location or "request",
                "message": message,
            }
        )

    first_error_message = normalized_errors[0]["message"] if normalized_errors else "Некорректные данные запроса"
    return JSONResponse(
        status_code=422,
        content=error_response(
            code="VALIDATION_ERROR",
            message=first_error_message,
            details={"fields": normalized_errors},
        ),
    )


@app.exception_handler(Exception)
def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=error_response(
            code="INTERNAL_SERVER_ERROR",
            message="Внутренняя ошибка сервера",
            details={"exception_type": exc.__class__.__name__} if settings.app_debug else {},
        ),
    )
