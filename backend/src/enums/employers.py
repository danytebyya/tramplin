from enum import StrEnum


class EmployerType(StrEnum):
    COMPANY = "company"
    SOLE_PROPRIETOR = "sole_proprietor"


class MembershipRole(StrEnum):
    OWNER = "owner"
    RECRUITER = "recruiter"
    MANAGER = "manager"
    VIEWER = "viewer"


class VerificationDocumentType(StrEnum):
    REGISTRATION_CERTIFICATE = "registration_certificate"
    TAX_CERTIFICATE = "tax_certificate"
    POWER_OF_ATTORNEY = "power_of_attorney"
    WEBSITE_SCREENSHOT = "website_screenshot"
    EMPLOYER_CARD = "employer_card"
    OTHER = "other"


class MediaOwnerKind(StrEnum):
    LOGO = "logo"
    COVER = "cover"
    GALLERY = "gallery"
    DOCUMENT = "document"
    ATTACHMENT = "attachment"
