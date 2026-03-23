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


class EmployerVerificationRequestStatus(StrEnum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"
