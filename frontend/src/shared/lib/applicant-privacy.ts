export type ApplicantProfileVisibility = "public" | "authorized" | "hidden";

export type ApplicantPrivacySettings = {
  profileVisibility: ApplicantProfileVisibility;
  showResume: boolean;
};

type ApplicantPrivacyRecord = ApplicantPrivacySettings & {
  userId?: string | null;
  publicId?: string | null;
};

type ApplicantPrivacyStorage = {
  records: ApplicantPrivacyRecord[];
};

const APPLICANT_PRIVACY_STORAGE_KEY = "tramplin.applicant-privacy";
const APPLICANT_PRIVACY_EVENT_NAME = "tramplin:applicant-privacy-updated";

export const DEFAULT_APPLICANT_PRIVACY_SETTINGS: ApplicantPrivacySettings = {
  profileVisibility: "public",
  showResume: true,
};

function readApplicantPrivacyStorage(): ApplicantPrivacyStorage {
  if (typeof window === "undefined") {
    return { records: [] };
  }

  try {
    const rawValue = window.localStorage.getItem(APPLICANT_PRIVACY_STORAGE_KEY);
    if (!rawValue) {
      return { records: [] };
    }

    const parsedValue = JSON.parse(rawValue) as ApplicantPrivacyStorage;
    if (!Array.isArray(parsedValue?.records)) {
      return { records: [] };
    }

    return {
      records: parsedValue.records.filter((item) => Boolean(item?.userId || item?.publicId)),
    };
  } catch {
    return { records: [] };
  }
}

function writeApplicantPrivacyStorage(nextValue: ApplicantPrivacyStorage) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(APPLICANT_PRIVACY_STORAGE_KEY, JSON.stringify(nextValue));
  window.dispatchEvent(new CustomEvent(APPLICANT_PRIVACY_EVENT_NAME));
}

export function getApplicantPrivacySettings(ids: {
  userId?: string | null;
  publicId?: string | null;
}): ApplicantPrivacySettings {
  const normalizedUserId = ids.userId?.trim() ?? "";
  const normalizedPublicId = ids.publicId?.trim() ?? "";
  const storage = readApplicantPrivacyStorage();

  const record = storage.records.find(
    (item) =>
      (normalizedPublicId && item.publicId === normalizedPublicId) ||
      (normalizedUserId && item.userId === normalizedUserId),
  );

  if (!record) {
    return DEFAULT_APPLICANT_PRIVACY_SETTINGS;
  }

  return {
    profileVisibility: record.profileVisibility ?? DEFAULT_APPLICANT_PRIVACY_SETTINGS.profileVisibility,
    showResume: record.showResume ?? DEFAULT_APPLICANT_PRIVACY_SETTINGS.showResume,
  };
}

export function saveApplicantPrivacySettings(
  ids: {
    userId?: string | null;
    publicId?: string | null;
  },
  settings: ApplicantPrivacySettings,
) {
  const normalizedUserId = ids.userId?.trim() ?? "";
  const normalizedPublicId = ids.publicId?.trim() ?? "";

  if (!normalizedUserId && !normalizedPublicId) {
    return;
  }

  const storage = readApplicantPrivacyStorage();
  const nextRecord: ApplicantPrivacyRecord = {
    userId: normalizedUserId || null,
    publicId: normalizedPublicId || null,
    profileVisibility: settings.profileVisibility,
    showResume: settings.showResume,
  };

  const nextRecords = storage.records.filter(
    (item) =>
      !(
        (normalizedPublicId && item.publicId === normalizedPublicId) ||
        (normalizedUserId && item.userId === normalizedUserId)
      ),
  );

  nextRecords.push(nextRecord);
  writeApplicantPrivacyStorage({ records: nextRecords });
}

export function subscribeApplicantPrivacy(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleUpdate = () => listener();
  window.addEventListener(APPLICANT_PRIVACY_EVENT_NAME, handleUpdate);
  window.addEventListener("storage", handleUpdate);

  return () => {
    window.removeEventListener(APPLICANT_PRIVACY_EVENT_NAME, handleUpdate);
    window.removeEventListener("storage", handleUpdate);
  };
}

export function canViewerAccessApplicantProfile(options: {
  settings: ApplicantPrivacySettings;
  isAuthenticated: boolean;
  isOwner?: boolean;
}) {
  if (options.isOwner) {
    return true;
  }

  if (options.settings.profileVisibility === "hidden") {
    return false;
  }

  if (options.settings.profileVisibility === "authorized") {
    return options.isAuthenticated;
  }

  return true;
}

export function canViewerSeeApplicantResume(options: {
  settings: ApplicantPrivacySettings;
  isAuthenticated: boolean;
  isOwner?: boolean;
}) {
  return options.settings.showResume && canViewerAccessApplicantProfile(options);
}
