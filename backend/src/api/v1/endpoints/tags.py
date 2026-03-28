from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from src.db import get_db
from src.repositories import TagRepository
from src.services import TagService
from src.utils.responses import success_response

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("/catalog", status_code=status.HTTP_200_OK)
def list_tags_catalog(db: Session = Depends(get_db)) -> dict:
    service = TagService(TagRepository(db))
    return success_response({"items": service.list_catalog()})
