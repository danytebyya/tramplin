from enum import StrEnum


class UserStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    BLOCKED = "blocked"
    ARCHIVED = "archived"


class EmployerVerificationStatus(StrEnum):
    UNVERIFIED = "unverified"
    PENDING_REVIEW = "pending_review"
    VERIFIED = "verified"
    REJECTED = "rejected"
    CHANGES_REQUESTED = "changes_requested"
