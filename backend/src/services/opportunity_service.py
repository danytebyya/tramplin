from decimal import Decimal

from src.models import Opportunity
from src.repositories import OpportunityRepository


class OpportunityService:
    def __init__(self, repo: OpportunityRepository) -> None:
        self.repo = repo

    def list_public_feed(self) -> list[dict]:
        opportunities = self.repo.list_public_feed()
        return [self._serialize_opportunity(opportunity, index) for index, opportunity in enumerate(opportunities)]

    def _serialize_opportunity(self, opportunity: Opportunity, index: int) -> dict:
        tags = [link.tag.name for link in opportunity.tag_links if link.tag is not None][:6]
        location = opportunity.location
        format_value = self._normalize_format(opportunity.work_format)
        city = location.city if location and location.city else "Россия"

        return {
            "id": str(opportunity.id),
            "title": opportunity.title,
            "company_name": opportunity.employer.display_name,
            "company_verified": opportunity.employer.verification_status == "approved",
            "salary_label": self._build_salary_label(opportunity),
            "location_label": f"{city}, {self._format_label(format_value)}",
            "format": format_value,
            "kind": "vacancy",
            "level_label": self._level_label(opportunity.level),
            "employment_label": self._employment_label(opportunity.employment_type),
            "description": opportunity.description,
            "tags": tags,
            "latitude": float(location.latitude or Decimal("56.130000")),
            "longitude": float(location.longitude or Decimal("47.250000")),
            "accent": ["cyan", "amber", "blue", "slate"][index % 4],
        }

    @staticmethod
    def _build_salary_label(opportunity: Opportunity) -> str:
        compensation = opportunity.compensation
        if compensation is None:
            return "По договоренности"

        if compensation.salary_from is not None:
            amount = int(compensation.salary_from)
            return f"от {amount:,} ₽".replace(",", " ")

        if compensation.stipend_text:
            return compensation.stipend_text

        return "По договоренности"

    @staticmethod
    def _normalize_format(value: str) -> str:
        if value in {"office", "offline"}:
            return "office"
        if value == "hybrid":
            return "hybrid"
        return "remote"

    @staticmethod
    def _format_label(value: str) -> str:
        return {
            "office": "офис",
            "hybrid": "гибрид",
            "remote": "удалённо",
        }[value]

    @staticmethod
    def _level_label(value: str | None) -> str:
        mapping = {
            "intern": "Intern",
            "junior": "Junior",
            "middle": "Middle",
            "senior": "Senior",
            "lead": "Lead",
            "student": "Student",
        }
        if value is None:
            return "Middle"
        return mapping.get(value, value.replace("_", " ").title())

    @staticmethod
    def _employment_label(value: str | None) -> str:
        mapping = {
            "full_time": "Full-time",
            "part_time": "Part-time",
            "project": "Project",
            "internship": "Internship",
        }
        if value is None:
            return "Full-time"
        return mapping.get(value, value.replace("_", " ").title())
