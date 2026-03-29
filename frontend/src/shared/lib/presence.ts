type PresenceStatus = {
  isOnline: boolean;
  lastSeenAt: string | null;
};

function formatCount(value: number, one: string, few: string, many: string) {
  const normalizedValue = Math.abs(value) % 100;
  const remainder = normalizedValue % 10;

  if (normalizedValue > 10 && normalizedValue < 20) {
    return many;
  }

  if (remainder > 1 && remainder < 5) {
    return few;
  }

  if (remainder === 1) {
    return one;
  }

  return many;
}

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

  if (diffMinutes < 60) {
    return `Был(а) в сети ${diffMinutes} ${formatCount(diffMinutes, "минуту", "минуты", "минут")} назад`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `Был(а) в сети ${diffHours} ${formatCount(diffHours, "час", "часа", "часов")} назад`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Был(а) в сети ${diffDays} ${formatCount(diffDays, "день", "дня", "дней")} назад`;
}
