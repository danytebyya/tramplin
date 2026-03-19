from enum import StrEnum


class UserRole(StrEnum):
    GUEST = "guest"
    APPLICANT = "applicant"
    EMPLOYER = "employer"
    CURATOR = "curator"
    ADMIN = "admin"
