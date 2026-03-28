type PresenceStatus = {
  isOnline: boolean;
  lastSeenAt: string | null;
};

export function formatPresenceStatus({ isOnline, lastSeenAt }: PresenceStatus): string {
  if (isOnline) {
    return "Online";
  }

  if (!lastSeenAt) {
    return "Не в сети";
  }

  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));

  if (diffMinutes <= 1) {
    return "Был(а) в сети только что";
  }

  return `Был(а) в сети ${diffMinutes} мин назад`;
}
