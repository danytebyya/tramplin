import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import logoPrimaryBlack from "../../assets/icons/logo-primary-black-sm.svg";
import { WaveAuraBackground } from "../../components/WaveAuraBackground/WaveAuraBackground";
import {
  applyAuthSession,
  requestPasswordResetCode,
  resetPasswordRequest,
  resolvePostAuthRoute,
  verifyPasswordResetCode,
} from "../../features/auth";
import { Button, CodeInput, Container, Input } from "../../shared/ui";
import "../auth/auth.css";
import "./password-recovery.css";

type RecoveryStep = "email" | "code" | "password";

type RecoveryState = {
  email: string;
  code: string;
  step: RecoveryStep;
  requestedAt: number | null;
};

const PASSWORD_RECOVERY_STORAGE_KEY = "tramplin.auth.password-recovery";
const PASSWORD_RECOVERY_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RESEND_COOLDOWN_MS = 60 * 1000;

function isValidPassword(value: string) {
  return (
    value.length >= 8 &&
    !/\s/.test(value) &&
    /[a-z]/i.test(value) &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

function readPersistedState(): RecoveryState | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(PASSWORD_RECOVERY_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as RecoveryState;
    const isExpired =
      parsedValue.requestedAt !== null &&
      parsedValue.requestedAt + PASSWORD_RECOVERY_TTL_MS <= Date.now();

    if (isExpired) {
      window.sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
      return null;
    }

    return parsedValue;
  } catch {
    window.sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
    return null;
  }
}

function writePersistedState(state: RecoveryState) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(PASSWORD_RECOVERY_STORAGE_KEY, JSON.stringify(state));
}

function clearPersistedState() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
}

export function PasswordRecoveryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const persistedState = readPersistedState();
  const presetEmail = searchParams.get("email")?.trim() ?? "";
  const presetStep = searchParams.get("step") === "code" ? "code" : null;
  const initialState =
    presetEmail && presetStep
      ? {
          email: presetEmail,
          code: "",
          step: "code" as RecoveryStep,
          requestedAt: Date.now(),
        }
      : persistedState ?? {
          email: presetEmail,
          code: "",
          step: "email" as RecoveryStep,
          requestedAt: null,
        };

  const [step, setStep] = useState<RecoveryStep>(initialState.step);
  const [email, setEmail] = useState(initialState.email);
  const [code, setCode] = useState(initialState.code);
  const [requestedAt, setRequestedAt] = useState<number | null>(initialState.requestedAt);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(() => {
    if (!initialState.requestedAt) {
      return 0;
    }

    return Math.max(
      0,
      Math.ceil((initialState.requestedAt + PASSWORD_RESEND_COOLDOWN_MS - Date.now()) / 1000),
    );
  });

  useEffect(() => {
    if (step !== "code" || resendCountdown <= 0) {
      return;
    }

    const timerId = window.setInterval(() => {
      setResendCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [resendCountdown, step]);

  useEffect(() => {
    if (!email.trim()) {
      clearPersistedState();
      return;
    }

    writePersistedState({
      email: email.trim(),
      code,
      step,
      requestedAt,
    });
  }, [code, email, requestedAt, step]);

  const requestResetMutation = useMutation({
    mutationFn: requestPasswordResetCode,
    onSuccess: () => {
      const requestedAt = Date.now();
      setError(null);
      setSuccessMessage("Код отправлен на вашу почту.");
      setStep("code");
      setCode("");
      setRequestedAt(requestedAt);
      setResendCountdown(Math.ceil(PASSWORD_RESEND_COOLDOWN_MS / 1000));
      writePersistedState({
        email: email.trim(),
        code: "",
        step: "code",
        requestedAt,
      });
    },
    onError: (mutationError: any) => {
      setSuccessMessage(null);
      setError(
        mutationError?.response?.data?.error?.message ??
          "Не удалось отправить код. Попробуйте еще раз.",
      );
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: ({ nextEmail, nextCode }: { nextEmail: string; nextCode: string }) =>
      verifyPasswordResetCode(nextEmail, nextCode),
    onSuccess: () => {
      setError(null);
      setSuccessMessage(null);
      setStep("password");
      setRequestedAt(Date.now());
      writePersistedState({
        email: email.trim(),
        code,
        step: "password",
        requestedAt: Date.now(),
      });
    },
    onError: (mutationError: any) => {
      setSuccessMessage(null);
      setError(
        mutationError?.response?.data?.error?.message ?? "Не удалось подтвердить код. Попробуйте еще раз.",
      );
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: resetPasswordRequest,
    onSuccess: (response) => {
      clearPersistedState();
      setError(null);
      applyAuthSession(response);
      const role = response?.data?.user?.role ?? "applicant";
      const hasEmployerProfile = response?.data?.user?.has_employer_profile;
      navigate(resolvePostAuthRoute(role, hasEmployerProfile), { replace: true });
    },
    onError: (mutationError: any) => {
      setError(
        mutationError?.response?.data?.error?.message ??
          "Не удалось обновить пароль. Попробуйте еще раз.",
      );
    },
  });

  const isEmailStep = step === "email";
  const isCodeStep = step === "code";
  const isPasswordStep = step === "password";
  const isEmailValid = useMemo(() => /\S+@\S+\.\S+/.test(email.trim()), [email]);
  const isCodeValid = code.trim().length === 6;
  const isPasswordValid = isValidPassword(newPassword);
  const arePasswordsMatching = newPassword === confirmPassword;

  const handleRequestCode = () => {
    if (!isEmailValid) {
      setError("Введите корректный email");
      return;
    }

    setError(null);
    requestResetMutation.mutate({ email: email.trim() });
  };

  const handleVerifyCode = () => {
    if (!isCodeValid) {
      setError("Введите код из 6 цифр");
      return;
    }

    setError(null);
    verifyCodeMutation.mutate({ nextEmail: email.trim(), nextCode: code.trim() });
  };

  const handleResetPassword = () => {
    if (!isPasswordValid) {
      setError(
        "Пароль должен содержать минимум 8 символов, латинские буквы в разном регистре и цифры.",
      );
      return;
    }

    if (!arePasswordsMatching) {
      setError("Пароли не совпадают");
      return;
    }

    setError(null);
    resetPasswordMutation.mutate({
      email: email.trim(),
      code: code.trim(),
      new_password: newPassword,
    });
  };

  return (
    <main className="auth-page auth-page--verification">
      <Container className="auth-page__auth-shell" variant="auth-page">
        <section className="auth-page__hero">
          <div className="auth-page__hero-stage">
            <div className="auth-page__brand-stage">
              <WaveAuraBackground variant="primary" withInteractionOrb />
              <div className="auth-page__brand-lockup">
                <Link to="/" aria-label="На главную">
                  <img src={logoPrimaryBlack} alt="Трамплин" className="auth-page__brand" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-page__panel">
          <div className="auth-page__panel-summary">
            <div className="auth-card auth-card--verification">
              <div className="auth-card__header">
                <h1 className="auth-verification-header__title">Восстановление пароля</h1>
                <p className="password-recovery-page__hint">
                  {isEmailStep && "Введите email, на который зарегистрирован аккаунт."}
                  {isCodeStep && `Введите код, отправленный на ${email.trim()}.`}
                  {isPasswordStep && "Задайте новый пароль и подтвердите его."}
                </p>
              </div>

              <div className="auth-form">
                <div className="auth-form__fields">
                  {isEmailStep ? (
                    <label className="auth-form__control">
                      <span className="auth-form__label">Email</span>
                      <Input
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@tramplin.ru"
                        autoComplete="email"
                        clearable
                      />
                    </label>
                  ) : null}

                  {isCodeStep ? (
                    <div className="auth-form__control">
                      <span className="auth-form__label">Код из письма</span>
                      <CodeInput value={code} onChange={setCode} variant="primary" />
                    </div>
                  ) : null}

                  {isPasswordStep ? (
                    <>
                      <label className="auth-form__control">
                        <span className="auth-form__label">Новый пароль</span>
                        <Input
                          type="password"
                          value={newPassword}
                          onChange={(event) => setNewPassword(event.target.value)}
                          placeholder="Введите новый пароль"
                          autoComplete="new-password"
                          clearable
                        />
                      </label>
                      <label className="auth-form__control">
                        <span className="auth-form__label">Подтверждение пароля</span>
                        <Input
                          type="password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          placeholder="Повторите новый пароль"
                          autoComplete="new-password"
                          clearable
                        />
                      </label>
                    </>
                  ) : null}

                  {successMessage ? (
                    <span className="auth-form__success password-recovery-page__message">
                      {successMessage}
                    </span>
                  ) : null}
                  {error ? <span className="auth-form__error">{error}</span> : null}
                </div>

                <div className="password-recovery-page__actions">
                  {isEmailStep ? (
                    <Button
                      type="button"
                      variant="primary"
                      fullWidth
                      loading={requestResetMutation.isPending}
                      onClick={handleRequestCode}
                    >
                      Продолжить
                    </Button>
                  ) : null}

                  {isCodeStep ? (
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        fullWidth
                        loading={verifyCodeMutation.isPending}
                        onClick={handleVerifyCode}
                      >
                        Подтвердить код
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        fullWidth
                        disabled={resendCountdown > 0 || requestResetMutation.isPending}
                        onClick={() => {
                          setError(null);
                          requestResetMutation.mutate({
                            email: email.trim(),
                            force_resend: true,
                          });
                        }}
                      >
                        {resendCountdown > 0
                          ? `Отправить код повторно через ${resendCountdown} с`
                          : "Отправить код повторно"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        fullWidth
                        onClick={() => {
                          setStep("email");
                          setCode("");
                          setRequestedAt(null);
                          setSuccessMessage(null);
                        }}
                      >
                        Изменить email
                      </Button>
                    </>
                  ) : null}

                  {isPasswordStep ? (
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        fullWidth
                        loading={resetPasswordMutation.isPending}
                        onClick={handleResetPassword}
                      >
                        Сохранить новый пароль
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        fullWidth
                        onClick={() => {
                          setStep("code");
                          setNewPassword("");
                          setConfirmPassword("");
                          setError(null);
                        }}
                      >
                        Вернуться к коду
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              <p className="password-recovery-page__footer">
                <Link to="/login">Вернуться ко входу</Link>
              </p>
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
