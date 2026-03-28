from fastapi import APIRouter

from src.api.v1.endpoints.applications import router as applications_router
from src.api.v1.endpoints.auth import router as auth_router
from src.api.v1.endpoints.chat import router as chat_router
from src.api.v1.endpoints.companies import router as companies_router
from src.api.v1.endpoints.favorites import router as favorites_router
from src.api.v1.endpoints.moderation import router as moderation_router
from src.api.v1.endpoints.notifications import router as notifications_router
from src.api.v1.endpoints.opportunities import router as opportunities_router
from src.api.v1.endpoints.presence import router as presence_router
from src.api.v1.endpoints.tags import router as tags_router
from src.api.v1.endpoints.users import router as users_router

api_router = APIRouter()
api_router.include_router(applications_router)
api_router.include_router(auth_router)
api_router.include_router(chat_router)
api_router.include_router(companies_router)
api_router.include_router(favorites_router)
api_router.include_router(moderation_router)
api_router.include_router(notifications_router)
api_router.include_router(opportunities_router)
api_router.include_router(presence_router)
api_router.include_router(tags_router)
api_router.include_router(users_router)
