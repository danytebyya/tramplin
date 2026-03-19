from fastapi import FastAPI, Request
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


@app.exception_handler(Exception)
def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content=error_response(
            code="INTERNAL_SERVER_ERROR",
            message="Unexpected server error",
            details={"error": str(exc)} if settings.app_debug else {},
        ),
    )
