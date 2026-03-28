import adminAvatarIcon from "../../assets/icons/admin.png";
import applicantAvatarIcon from "../../assets/icons/applicant.png";
import employerAvatarIcon from "../../assets/icons/employer.png";
import profileAvatarIcon from "../../assets/icons/profile.png";

export function resolveAvatarIcon(role: string | null | undefined) {
  if (role === "employer") {
    return employerAvatarIcon;
  }

  if (role === "applicant") {
    return applicantAvatarIcon;
  }

  if (role === "admin") {
    return adminAvatarIcon;
  }

  return profileAvatarIcon;
}
