from fastapi import APIRouter

from src.api.v1.endpoints.auth import router as auth_router
from src.api.v1.endpoints.companies import router as companies_router
from src.api.v1.endpoints.opportunities import router as opportunities_router
from src.api.v1.endpoints.users import router as users_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(companies_router)
api_router.include_router(opportunities_router)
api_router.include_router(users_router)
