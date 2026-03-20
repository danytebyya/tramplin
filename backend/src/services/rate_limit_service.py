from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from threading import Lock

from src.utils.errors import AppError


@dataclass
class RateLimitBucket:
    attempts: deque[datetime] = field(default_factory=deque)
    blocked_until: datetime | None = None


class RateLimitService:
    def __init__(self) -> None:
        self._lock = Lock()
        self._buckets: dict[tuple[str, str], RateLimitBucket] = {}

    def ensure_allowed(
        self,
        namespace: str,
        key: str,
        *,
        limit: int,
        window_seconds: int,
        block_seconds: int,
        error_code: str,
        error_message: str,
    ) -> None:
        now = datetime.now(UTC)

        with self._lock:
            bucket = self._buckets.setdefault((namespace, key), RateLimitBucket())
            if bucket.blocked_until and bucket.blocked_until > now:
                raise AppError(
                    code=error_code,
                    message=error_message,
                    status_code=429,
                )

            self._prune_attempts(bucket, now, window_seconds)
            if len(bucket.attempts) >= limit:
                bucket.blocked_until = now + timedelta(seconds=block_seconds)
                raise AppError(
                    code=error_code,
                    message=error_message,
                    status_code=429,
                )

    def register_failure(
        self,
        namespace: str,
        key: str,
        *,
        limit: int,
        window_seconds: int,
        block_seconds: int,
    ) -> None:
        now = datetime.now(UTC)

        with self._lock:
            bucket = self._buckets.setdefault((namespace, key), RateLimitBucket())
            self._prune_attempts(bucket, now, window_seconds)
            bucket.attempts.append(now)
            if len(bucket.attempts) >= limit:
                bucket.blocked_until = now + timedelta(seconds=block_seconds)

    def register_attempt(
        self,
        namespace: str,
        key: str,
        *,
        limit: int,
        window_seconds: int,
        block_seconds: int,
    ) -> None:
        self.register_failure(
            namespace,
            key,
            limit=limit,
            window_seconds=window_seconds,
            block_seconds=block_seconds,
        )

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()

    def clear(self, namespace: str, key: str) -> None:
        with self._lock:
            self._buckets.pop((namespace, key), None)

    @staticmethod
    def _prune_attempts(bucket: RateLimitBucket, now: datetime, window_seconds: int) -> None:
        threshold = now - timedelta(seconds=window_seconds)
        while bucket.attempts and bucket.attempts[0] <= threshold:
            bucket.attempts.popleft()

        if bucket.blocked_until and bucket.blocked_until <= now:
            bucket.blocked_until = None


rate_limit_service = RateLimitService()
