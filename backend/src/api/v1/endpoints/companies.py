from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse
from pathlib import Path
from sqlalchemy.orm import Session

from src.api.deps import get_current_access_payload, get_current_user
from src.api.serializers.user import serialize_user
from src.db import get_db
from src.enums import UserRole
from src.models import User
from src.schemas.company import (
    EmployerInnVerificationRequest,
    EmployerOnboardingRequest,
    EmployerStaffInvitationAcceptRequest,
    EmployerStaffInviteRequest,
    EmployerStaffListRead,
    EmployerVerificationDraftRead,
)
from src.services import DadataService, EmployerService
from src.utils.errors import AppError
from src.utils.responses import success_response

router = APIRouter(prefix="/companies", tags=["companies"])


@router.post("/verify-inn", status_code=status.HTTP_200_OK)
def verify_employer_inn(
    payload: EmployerInnVerificationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if current_user.role != UserRole.EMPLOYER:
        raise AppError(
            code="EMPLOYER_PROFILE_FORBIDDEN",
            message="Профиль работодателя доступен только работодателям",
            status_code=403,
        )

    EmployerService(db).ensure_inn_available(current_user=current_user, inn=payload.inn)
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
    return success_response({"user": serialize_user(current_user)})


@router.get("/verification-draft", status_code=status.HTTP_200_OK)
def read_employer_verification_draft(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = EmployerService(db).get_verification_draft(current_user)
    return success_response(EmployerVerificationDraftRead.model_validate(payload).model_dump(mode="json"))


@router.get("/staff", status_code=status.HTTP_200_OK)
def list_employer_staff(
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = EmployerService(db).list_staff_members(current_user, access_payload=access_payload)
    return success_response(EmployerStaffListRead.model_validate(payload).model_dump(mode="json"))


@router.get("/staff/invitations", status_code=status.HTTP_200_OK)
def list_employer_staff_invitations(
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = EmployerService(db).list_staff_invitations(current_user, access_payload=access_payload)
    return success_response(payload.model_dump(mode="json"))


@router.post("/staff/invitations", status_code=status.HTTP_201_CREATED)
def invite_employer_staff_member(
    payload: EmployerStaffInviteRequest,
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    invitation = EmployerService(db).invite_staff_member(
        current_user,
        payload,
        access_payload=access_payload,
    )
    return success_response(invitation.model_dump(mode="json"))


@router.post("/staff/invitations/accept", status_code=status.HTTP_200_OK)
def accept_employer_staff_invitation(
    payload: EmployerStaffInvitationAcceptRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    member = EmployerService(db).accept_staff_invitation(current_user, token=payload.token)
    return success_response(member.model_dump(mode="json"))


@router.delete("/staff/invitations/{invitation_id}", status_code=status.HTTP_200_OK)
def revoke_employer_staff_invitation(
    invitation_id: str,
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    EmployerService(db).revoke_staff_invitation(
        current_user,
        invitation_id=invitation_id,
        access_payload=access_payload,
    )
    return success_response({"deleted": True})


@router.delete("/staff/memberships/{membership_id}", status_code=status.HTTP_200_OK)
def leave_employer_company(
    membership_id: str,
    access_payload: dict = Depends(get_current_access_payload),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    EmployerService(db).leave_company(current_user, membership_id=membership_id, access_payload=access_payload)
    return success_response({"deleted": True})


@router.post("/verification-documents", status_code=status.HTTP_200_OK)
async def upload_employer_verification_documents(
    files: list[UploadFile] | None = File(default=None),
    verification_request_id: str | None = Form(default=None),
    deleted_document_ids: list[str] | None = Form(default=None),
    phone: str | None = Form(default=None),
    social_link: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    documents = []
    for item in files or []:
        content = await item.read()
        documents.append((item.filename or "document", item.content_type or "application/octet-stream", content))

    result = EmployerService(db).submit_verification_documents(
        current_user=current_user,
        files=documents,
        verification_request_id=verification_request_id,
        deleted_document_ids=deleted_document_ids,
        phone=phone.strip() or None if phone is not None else None,
        social_link=social_link.strip() or None if social_link is not None else None,
    )
    return success_response(result)


@router.get("/verification-documents/{document_id}/file", status_code=status.HTTP_200_OK)
def read_employer_verification_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    document = EmployerService(db).get_verification_document_or_raise(
        current_user=current_user,
        document_id=document_id,
    )
    media_file = document.media_file
    if media_file is None or media_file.public_url is None:
        raise AppError(
            code="EMPLOYER_VERIFICATION_DOCUMENT_NOT_FOUND",
            message="Документ не найден",
            status_code=404,
        )

    file_path = Path(media_file.public_url)
    if not file_path.exists() or not file_path.is_file():
        raise AppError(
            code="EMPLOYER_VERIFICATION_DOCUMENT_NOT_FOUND",
            message="Файл документа не найден в хранилище",
            status_code=404,
        )

    return FileResponse(
        path=file_path,
        media_type=media_file.mime_type or "application/octet-stream",
        filename=media_file.original_filename,
    )


@router.delete("/verification-documents/{document_id}", status_code=status.HTTP_200_OK)
def delete_employer_verification_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    EmployerService(db).delete_verification_document(
        current_user=current_user,
        document_id=document_id,
    )
    return success_response({"deleted": True})
