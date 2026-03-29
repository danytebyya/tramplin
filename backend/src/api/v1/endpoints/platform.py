from datetime import UTC, datetime

from fastapi import APIRouter, Depends, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from src.db import get_db
from src.enums import UserRole, UserStatus
from src.models import Employer, Opportunity, OpportunityStatus, OpportunityType, User
from src.models.opportunity import ModerationStatus
from src.utils.responses import success_response

router = APIRouter(prefix="/platform", tags=["platform"])


@router.get("/stats", status_code=status.HTTP_200_OK)
def read_platform_stats(db: Session = Depends(get_db)) -> dict:
    now = datetime.now(UTC)

    applicants_count = db.execute(
        select(func.count(User.id)).where(
            User.deleted_at.is_(None),
            User.role == UserRole.APPLICANT,
            User.status == UserStatus.ACTIVE,
        )
    ).scalar_one()

    companies_count = db.execute(
        select(func.count(Employer.id)).where(
            Employer.deleted_at.is_(None),
        )
    ).scalar_one()

    public_opportunity_rows = db.execute(
        select(Opportunity.opportunity_type, func.count(Opportunity.id))
        .where(
            Opportunity.deleted_at.is_(None),
            Opportunity.moderation_status == ModerationStatus.APPROVED,
            or_(
                Opportunity.business_status == OpportunityStatus.ACTIVE,
                and_(
                    Opportunity.business_status == OpportunityStatus.SCHEDULED,
                    Opportunity.starts_at.is_not(None),
                    Opportunity.starts_at <= now,
                ),
            ),
        )
        .group_by(Opportunity.opportunity_type)
    ).all()

    public_opportunity_counts = {
        OpportunityType.VACANCY: 0,
        OpportunityType.INTERNSHIP: 0,
        OpportunityType.CAREER_EVENT: 0,
        OpportunityType.MENTORSHIP_PROGRAM: 0,
    }

    for opportunity_type, count in public_opportunity_rows:
        public_opportunity_counts[opportunity_type] = count

    return success_response(
        {
            "companies_count": companies_count,
            "applicants_count": applicants_count,
            "vacancies_count": public_opportunity_counts[OpportunityType.VACANCY],
            "internships_count": public_opportunity_counts[OpportunityType.INTERNSHIP],
            "events_count": public_opportunity_counts[OpportunityType.CAREER_EVENT],
            "mentorships_count": public_opportunity_counts[OpportunityType.MENTORSHIP_PROGRAM],
        }
    )
