from __future__ import annotations

import hashlib
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from secrets import compare_digest, randbelow
from threading import Lock

from src.core.config import settings
from src.utils.errors import AppError


@dataclass
class OtpCodeRecord:
    code_hash: str
    expires_at: datetime
    attempts_left: int
    debug_code: str


class OtpService:
    def __init__(self) -> None:
        self._lock = Lock()
        self._codes: dict[tuple[str, str], OtpCodeRecord] = {}
        self._request_log: dict[tuple[str, str], deque[datetime]] = defaultdict(deque)

    def issue_code(self, email: str, purpose: str) -> str:
        normalized_email = email.lower().strip()
        key = (purpose, normalized_email)
        now = datetime.now(UTC)

        with self._lock:
            requests = self._request_log[key]
            while requests and requests[0] <= now - timedelta(seconds=settings.otp_request_window_seconds):
                requests.popleft()

            if len(requests) >= settings.otp_request_limit:
                raise AppError(
                    code="AUTH_OTP_REQUEST_LIMIT_REACHED",
                    message="Слишком много запросов кода. Попробуйте позже.",
                    status_code=429,
                )

            code = self._generate_code()
            self._codes[key] = OtpCodeRecord(
                code_hash=self._hash_code(code),
                expires_at=now + timedelta(seconds=settings.otp_code_ttl_seconds),
                attempts_left=settings.otp_verify_attempt_limit,
                debug_code=code,
            )
            requests.append(now)
            return code

    def verify_code(self, email: str, purpose: str, code: str, *, consume: bool = True) -> None:
        normalized_email = email.lower().strip()
        key = (purpose, normalized_email)
        normalized_code = code.strip()
        now = datetime.now(UTC)

        with self._lock:
            record = self._codes.get(key)
            if record is None:
                raise AppError(
                    code="AUTH_OTP_NOT_FOUND",
                    message="Код подтверждения не найден. Запросите новый.",
                    status_code=400,
                )

            if record.expires_at <= now:
                self._codes.pop(key, None)
                raise AppError(
                    code="AUTH_OTP_EXPIRED",
                    message="Срок действия кода истёк. Запросите новый.",
                    status_code=400,
                )

            if not compare_digest(record.code_hash, self._hash_code(normalized_code)):
                record.attempts_left -= 1
                if record.attempts_left <= 0:
                    self._codes.pop(key, None)
                    raise AppError(
                        code="AUTH_OTP_ATTEMPTS_EXCEEDED",
                        message="Превышено число попыток ввода кода. Запросите новый код.",
                        status_code=400,
                    )

                raise AppError(
                    code="AUTH_OTP_INVALID",
                    message="Неверный код подтверждения.",
                    status_code=400,
                    details={"attempts_left": record.attempts_left},
                )

            if consume:
                self._codes.pop(key, None)

    def consume_debug_code(self, email: str, purpose: str) -> str | None:
        key = (purpose, email.lower().strip())
        with self._lock:
            record = self._codes.get(key)
            return record.debug_code if record else None

    def reset(self) -> None:
        with self._lock:
            self._codes.clear()
            self._request_log.clear()

    @staticmethod
    def _generate_code() -> str:
        return "".join(str(randbelow(10)) for _ in range(settings.otp_code_length))

    @staticmethod
    def _hash_code(code: str) -> str:
        return hashlib.sha256(code.encode("utf-8")).hexdigest()


otp_service = OtpService()
