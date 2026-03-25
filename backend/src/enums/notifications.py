from enum import StrEnum


class NotificationKind(StrEnum):
    SYSTEM = "system"
    PROFILE = "profile"
    OPPORTUNITY = "opportunity"
    APPLICATION = "application"
    EMPLOYER_VERIFICATION = "employer_verification"
    CANDIDATES = "candidates"


class NotificationSeverity(StrEnum):
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ATTENTION = "attention"
