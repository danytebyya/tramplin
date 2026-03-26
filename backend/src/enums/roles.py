from enum import StrEnum


class UserRole(StrEnum):
    GUEST = "guest"
    APPLICANT = "applicant"
    EMPLOYER = "employer"
    JUNIOR = "junior"
    CURATOR = "curator"
    ADMIN = "admin"
