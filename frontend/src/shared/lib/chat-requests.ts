export type ApplicantChatRequestStatus = "pending" | "accepted" | "rejected";

export type ApplicantChatRequestRecord = {
  requesterUserId: string;
  recipientUserId: string;
  status: ApplicantChatRequestStatus;
  createdAt: string;
  updatedAt: string;
};

type ApplicantChatRequestStorage = {
  records: ApplicantChatRequestRecord[];
};

const APPLICANT_CHAT_REQUESTS_STORAGE_KEY = "tramplin.applicant-chat-requests";
const APPLICANT_CHAT_REQUESTS_EVENT_NAME = "tramplin:applicant-chat-requests-updated";

function readApplicantChatRequestStorage(): ApplicantChatRequestStorage {
  if (typeof window === "undefined") {
    return { records: [] };
  }

  try {
    const rawValue = window.localStorage.getItem(APPLICANT_CHAT_REQUESTS_STORAGE_KEY);
    if (!rawValue) {
      return { records: [] };
    }

    const parsedValue = JSON.parse(rawValue) as ApplicantChatRequestStorage;
    if (!Array.isArray(parsedValue?.records)) {
      return { records: [] };
    }

    return { records: parsedValue.records };
  } catch {
    return { records: [] };
  }
}

function writeApplicantChatRequestStorage(nextValue: ApplicantChatRequestStorage) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(APPLICANT_CHAT_REQUESTS_STORAGE_KEY, JSON.stringify(nextValue));
  window.dispatchEvent(new CustomEvent(APPLICANT_CHAT_REQUESTS_EVENT_NAME));
}

export function getApplicantChatRequest(
  currentUserId?: string | null,
  counterpartUserId?: string | null,
) {
  if (!currentUserId || !counterpartUserId) {
    return null;
  }

  const storage = readApplicantChatRequestStorage();
  return (
    storage.records.find(
      (item) =>
        (item.requesterUserId === currentUserId && item.recipientUserId === counterpartUserId) ||
        (item.requesterUserId === counterpartUserId && item.recipientUserId === currentUserId),
    ) ?? null
  );
}

export function createApplicantChatRequest(payload: {
  requesterUserId: string;
  recipientUserId: string;
}) {
  const storage = readApplicantChatRequestStorage();
  const existingRecord = getApplicantChatRequest(payload.requesterUserId, payload.recipientUserId);
  if (existingRecord) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(APPLICANT_CHAT_REQUESTS_EVENT_NAME));
    }
    return existingRecord;
  }

  const now = new Date().toISOString();
  const nextRecord: ApplicantChatRequestRecord = {
    requesterUserId: payload.requesterUserId,
    recipientUserId: payload.recipientUserId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  writeApplicantChatRequestStorage({
    records: [...storage.records, nextRecord],
  });

  return nextRecord;
}

export function updateApplicantChatRequestStatus(payload: {
  requesterUserId: string;
  recipientUserId: string;
  status: ApplicantChatRequestStatus;
}) {
  const storage = readApplicantChatRequestStorage();
  const updatedAt = new Date().toISOString();
  const nextRecords = storage.records.map((item) =>
    item.requesterUserId === payload.requesterUserId && item.recipientUserId === payload.recipientUserId
      ? { ...item, status: payload.status, updatedAt }
      : item,
  );

  writeApplicantChatRequestStorage({ records: nextRecords });
}

export function subscribeApplicantChatRequests(listener: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleUpdate = () => listener();
  window.addEventListener(APPLICANT_CHAT_REQUESTS_EVENT_NAME, handleUpdate);
  window.addEventListener("storage", handleUpdate);

  return () => {
    window.removeEventListener(APPLICANT_CHAT_REQUESTS_EVENT_NAME, handleUpdate);
    window.removeEventListener("storage", handleUpdate);
  };
}
