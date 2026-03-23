from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.orm import Session

from src.api.deps import get_current_user
from src.db import get_db
from src.enums import UserRole
from src.models import User
from src.schemas.company import EmployerInnVerificationRequest, EmployerOnboardingRequest
from src.schemas.user import UserRead
from src.services import DadataService, EmployerService
from src.utils.errors import AppError
from src.utils.responses import success_response

router = APIRouter(prefix="/companies", tags=["companies"])


@router.post("/verify-inn", status_code=status.HTTP_200_OK)
def verify_employer_inn(
    payload: EmployerInnVerificationRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != UserRole.EMPLOYER:
        raise AppError(
            code="EMPLOYER_PROFILE_FORBIDDEN",
            message="Профиль работодателя доступен только работодателям",
            status_code=403,
        )

    verification_result = DadataService().verify_inn(
        inn=payload.inn,
        employer_type=payload.employer_type,
    )
    return success_response({"verification": verification_result})


@router.put("/profile", status_code=status.HTTP_200_OK)
def upsert_employer_profile(
    payload: EmployerOnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    EmployerService(db).upsert_profile(current_user=current_user, payload=payload)
    db.refresh(current_user)
    return success_response({"user": UserRead.model_validate(current_user).model_dump(mode="json")})


@router.post("/verification-documents", status_code=status.HTTP_200_OK)
async def upload_employer_verification_documents(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    documents = []
    for item in files:
        content = await item.read()
        documents.append((item.filename or "document", item.content_type or "application/octet-stream", content))

    result = EmployerService(db).submit_verification_documents(current_user=current_user, files=documents)
    return success_response(result)
