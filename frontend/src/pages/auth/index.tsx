import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import maxIcon from "../../assets/auth/max.png";
import vkIcon from "../../assets/auth/vk.png";
import arrowIcon from "../../assets/icons/arrow.svg";
import { WaveAuraBackground } from "../../components/WaveAuraBackground/WaveAuraBackground";
import {
  applyAuthSession,
  loginRequest,
  registerRequest,
  resolvePostAuthRoute,
  requestEmailVerificationCode,
} from "../../features/auth";
import { Button, Checkbox, CodeInput, Container, Input } from "../../shared/ui";
import "./auth.css";

const registerSchema = z
  .object({
    role: z.enum(["applicant", "employer"]),
    email: z
      .string()
      .trim()
      .min(1, "Обязательное поле")
      .email("Введите корректный email"),
    password: z
      .string()
      .min(1, "Обязательное поле")
      .min(8, "Пароль должен содержать минимум 8 символов")
      .refine((value) => !/\s/.test(value), "Пароль не должен содержать пробелы")
      .refine((value) => /[a-z]/i.test(value), "Пароль должен содержать латинские буквы")
      .refine((value) => /[a-z]/.test(value), "Пароль должен содержать строчные буквы")
      .refine((value) => /[A-Z]/.test(value), "Пароль должен содержать заглавные буквы")
      .refine((value) => /\d/.test(value), "Пароль должен содержать цифры"),
    confirmPassword: z.string().min(1, "Обязательное поле"),
    acceptTerms: z.boolean().refine((value) => value, "Подтвердите согласие"),
  })
  .superRefine((value, context) => {
    if (value.password && value.confirmPassword && value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Пароли не совпадают",
      });
    }
  });

type RegisterFormValues = z.infer<typeof registerSchema>;
type VerificationStep = "form" | "code";

type PersistedVerificationState = {
  step: VerificationStep;
  values: RegisterFormValues;
  verificationCode: string;
  requestedAt: number;
  expiresAt: number;
  apiError: string | null;
  apiErrorCode: string | null;
};

const EMAIL_VERIFICATION_STORAGE_KEY = "tramplin.auth.email-verification";
const EMAIL_VERIFICATION_TTL_MS = 15 * 60 * 1000;
const EMAIL_RESEND_COOLDOWN_MS = 60 * 1000;

function clearPersistedVerificationState() {
  window.sessionStorage.removeItem(EMAIL_VERIFICATION_STORAGE_KEY);
}

function readPersistedVerificationState(): PersistedVerificationState | null {
  const rawValue = window.sessionStorage.getItem(EMAIL_VERIFICATION_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as PersistedVerificationState;

    if (
      !parsedValue ||
      (parsedValue.step !== "form" && parsedValue.step !== "code") ||
      !parsedValue.values ||
      typeof parsedValue.verificationCode !== "string" ||
      typeof parsedValue.requestedAt !== "number" ||
      typeof parsedValue.expiresAt !== "number"
    ) {
      clearPersistedVerificationState();
      return null;
    }

    if (parsedValue.expiresAt <= Date.now()) {
      clearPersistedVerificationState();
      return null;
    }

    return parsedValue;
  } catch {
    clearPersistedVerificationState();
    return null;
  }
}

function writePersistedVerificationState(state: PersistedVerificationState) {
  window.sessionStorage.setItem(EMAIL_VERIFICATION_STORAGE_KEY, JSON.stringify(state));
}

function getInitialPersistedVerificationState(): PersistedVerificationState | null {
  if (typeof window === "undefined") {
    return null;
  }

  return readPersistedVerificationState();
}

function blurActiveElement() {
  if (typeof document === "undefined") {
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement) {
    activeElement.blur();
  }
}

export function AuthPage() {
  const initialPersistedState = getInitialPersistedVerificationState();
  const navigate = useNavigate();
  const [step, setStep] = useState<VerificationStep>(initialPersistedState?.step ?? "form");
  const [apiError, setApiError] = useState<string | null>(initialPersistedState?.apiError ?? null);
  const [apiErrorCode, setApiErrorCode] = useState<string | null>(
    initialPersistedState?.apiErrorCode ?? null,
  );
  const [verificationCode, setVerificationCode] = useState(initialPersistedState?.verificationCode ?? "");
  const [pendingValues, setPendingValues] = useState<RegisterFormValues | null>(
    initialPersistedState?.step === "code" ? initialPersistedState.values : null,
  );
  const [resendCountdown, setResendCountdown] = useState(
    initialPersistedState
      ? Math.max(
          0,
          Math.ceil(
            (initialPersistedState.requestedAt + EMAIL_RESEND_COOLDOWN_MS - Date.now()) / 1000,
          ),
        )
      : 60,
  );
  const [codeInputFocusTrigger, setCodeInputFocusTrigger] = useState(
    initialPersistedState?.step === "code" && !initialPersistedState.verificationCode ? 1 : 0,
  );
  const [codeInputErrorFocusTrigger, setCodeInputErrorFocusTrigger] = useState(0);
  const lastAutoSubmittedCodeRef = useRef<string | null>(null);
  const registrationSubmitLockRef = useRef(false);
  const previousEmailRef = useRef<string>("");

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: initialPersistedState?.values ?? {
      role: "applicant",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const selectedRole = watch("role");
  const selectedEmail = watch("email");
  const roleTheme = selectedRole === "applicant" ? "secondary" : "primary";
  const roleGhostVariant = roleTheme === "secondary" ? "secondary-ghost" : "ghost";
  const inputThemeClassName = roleTheme === "secondary" ? "input--secondary" : undefined;
  const checkboxTheme = roleTheme === "secondary" ? "secondary" : "primary";
  const resolveDisplayName = (email: string) => email.split("@")[0]?.trim() || email.trim();
  const isTemporarilyRateLimited =
    apiErrorCode === "AUTH_OTP_REQUEST_LIMIT_REACHED" ||
    apiErrorCode === "AUTH_OTP_VERIFICATION_BLOCKED";
  const isVerificationLocked = step === "code" && isTemporarilyRateLimited;

  useEffect(() => {
    if (step !== "form") {
      previousEmailRef.current = selectedEmail;
      return;
    }

    if (previousEmailRef.current && previousEmailRef.current !== selectedEmail && isTemporarilyRateLimited) {
      setApiError(null);
      setApiErrorCode(null);
      clearPersistedVerificationState();
    }

    previousEmailRef.current = selectedEmail;
  }, [apiErrorCode, isTemporarilyRateLimited, selectedEmail, step]);

  useEffect(() => {
    if (step !== "code" || !pendingValues) {
      return;
    }

    const persistedState = readPersistedVerificationState();

    if (!persistedState) {
      setStep("form");
      setPendingValues(null);
      setVerificationCode("");
      setApiErrorCode(null);
      setResendCountdown(60);
      return;
    }

    writePersistedVerificationState({
      ...persistedState,
      values: pendingValues,
      verificationCode,
      apiError,
      apiErrorCode,
    });
  }, [apiError, apiErrorCode, pendingValues, step, verificationCode]);

  useEffect(() => {
    if (step !== "code" || resendCountdown <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setResendCountdown((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [resendCountdown, step]);

  useEffect(() => {
    if (step !== "code") {
      return;
    }

    const persistedState = readPersistedVerificationState();

    if (!persistedState) {
      setStep("form");
      setPendingValues(null);
      setVerificationCode("");
      setResendCountdown(60);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      clearPersistedVerificationState();
      setStep("form");
      setPendingValues(null);
      setVerificationCode("");
      setApiError(null);
      setApiErrorCode(null);
      setResendCountdown(60);
    }, Math.max(0, persistedState.expiresAt - Date.now()));

    return () => window.clearTimeout(timeoutId);
  }, [step]);

  const requestCodeMutation = useMutation({
    mutationFn: requestEmailVerificationCode,
  });

  const resendCodeMutation = useMutation({
    mutationFn: requestEmailVerificationCode,
    onSuccess: () => {
      const now = Date.now();

      setVerificationCode("");
      lastAutoSubmittedCodeRef.current = null;
      setApiError(null);
      setApiErrorCode(null);
      setResendCountdown(60);
      setCodeInputFocusTrigger((current) => current + 1);
      if (pendingValues) {
        writePersistedVerificationState({
          step: "code",
          values: pendingValues,
          verificationCode: "",
          requestedAt: now,
          expiresAt: now + EMAIL_VERIFICATION_TTL_MS,
          apiError: null,
          apiErrorCode: null,
        });
      }
    },
    onError: (error: any) => {
      setApiErrorCode(error?.response?.data?.error?.code ?? null);
      setCodeInputErrorFocusTrigger((current) => current + 1);
      setApiError(
        error?.response?.data?.error?.message ??
          "Не удалось отправить код подтверждения. Попробуйте позже.",
      );
    },
  });

  const completeRegistrationMutation = useMutation({
    mutationFn: async ({
      values,
      code,
    }: {
      values: RegisterFormValues;
      code: string;
    }) => {
      try {
        await registerRequest({
          email: values.email,
          password: values.password,
          verification_code: code,
          display_name: resolveDisplayName(values.email),
          role: values.role,
          applicant_profile:
            values.role === "applicant"
              ? {
                  full_name: resolveDisplayName(values.email),
                }
              : undefined,
        });
      } catch (error: any) {
        const errorCode = error?.response?.data?.error?.code;
        if (errorCode !== "AUTH_EMAIL_EXISTS") {
          throw error;
        }
      }

      return loginRequest({
        email: values.email,
        password: values.password,
      });
    },
    onSuccess: (data: any) => {
      registrationSubmitLockRef.current = false;
      const role = data?.data?.user?.role ?? pendingValues?.role ?? "applicant";
      const hasEmployerProfile = data?.data?.user?.has_employer_profile;

      applyAuthSession(data);

      clearPersistedVerificationState();
      setApiErrorCode(null);
      navigate(resolvePostAuthRoute(role, hasEmployerProfile));
    },
    onError: (error: any) => {
      registrationSubmitLockRef.current = false;
      setApiErrorCode(error?.response?.data?.error?.code ?? null);
      setApiError(
        error?.response?.data?.error?.message ??
          "Не удалось завершить регистрацию. Проверьте код и повторите попытку.",
      );
    },
  });

  const handleFormSubmit = async (values: RegisterFormValues) => {
    const now = Date.now();

    setApiError(null);
    setApiErrorCode(null);
    try {
      await requestCodeMutation.mutateAsync({ email: values.email.trim(), forceResend: false });

      blurActiveElement();
      setPendingValues(values);
      setVerificationCode("");
      lastAutoSubmittedCodeRef.current = null;
      setStep("code");
      setResendCountdown(60);
      setCodeInputFocusTrigger((current) => current + 1);
      writePersistedVerificationState({
        step: "code",
        values,
        verificationCode: "",
        requestedAt: now,
        expiresAt: now + EMAIL_VERIFICATION_TTL_MS,
        apiError: null,
        apiErrorCode: null,
      });
    } catch (error: any) {
      const nextApiErrorCode = error?.response?.data?.error?.code ?? null;
      const nextApiError =
        error?.response?.data?.error?.message ??
        "Не удалось отправить код подтверждения. Попробуйте позже.";

      writePersistedVerificationState({
        step: "form",
        values,
        verificationCode: "",
        requestedAt: now,
        expiresAt: now + EMAIL_VERIFICATION_TTL_MS,
        apiError: nextApiError,
        apiErrorCode: nextApiErrorCode,
      });
      setStep("form");
      setPendingValues(null);
      setVerificationCode("");
      lastAutoSubmittedCodeRef.current = null;
      setResendCountdown(0);
      setApiError(nextApiError);
      setApiErrorCode(nextApiErrorCode);
    }
  };

  const handleVerificationSubmit = () => {
    if (!pendingValues) {
      setStep("form");
      return;
    }

    if (completeRegistrationMutation.isPending || registrationSubmitLockRef.current) {
      return;
    }

    if (verificationCode.length !== 6) {
      setApiError("Введите 6-значный код подтверждения");
      return;
    }

    registrationSubmitLockRef.current = true;
    setApiError(null);
    setApiErrorCode(null);
    completeRegistrationMutation.mutate({
      values: pendingValues,
      code: verificationCode,
    });
  };

  useEffect(() => {
    if (step !== "code" || !pendingValues || completeRegistrationMutation.isPending) {
      return;
    }

    if (verificationCode.length !== 6) {
      lastAutoSubmittedCodeRef.current = null;
      return;
    }

    if (lastAutoSubmittedCodeRef.current === verificationCode) {
      return;
    }

    lastAutoSubmittedCodeRef.current = verificationCode;
    handleVerificationSubmit();
  }, [completeRegistrationMutation.isPending, pendingValues, step, verificationCode]);

  const handleBackToForm = () => {
    blurActiveElement();
    clearPersistedVerificationState();
    setStep("form");
    setPendingValues(null);
    setVerificationCode("");
    lastAutoSubmittedCodeRef.current = null;
    registrationSubmitLockRef.current = false;
    setApiError(null);
    setApiErrorCode(null);
    setResendCountdown(60);
  };

  const handleResendCode = () => {
    if (!pendingValues || resendCountdown > 0) {
      return;
    }

    setApiError(null);
    setApiErrorCode(null);
    setVerificationCode("");
    lastAutoSubmittedCodeRef.current = null;
    registrationSubmitLockRef.current = false;
    setCodeInputFocusTrigger((current) => current + 1);
    setResendCountdown(60);
    resendCodeMutation.mutate({ email: pendingValues.email.trim(), forceResend: true }, {
      onSuccess: () => {},
    });
  };

  const isCodeStep = step === "code" && pendingValues;

  return (
    <main
      className={`auth-page ${isCodeStep ? "auth-page--verification" : ""} ${roleTheme === "secondary" ? "auth-page--secondary-theme" : ""}`.trim()}
    >
      <Container className="auth-page__content" variant="auth-page">
        {!isCodeStep ? (
          <section className="auth-page__hero">
            <div className="auth-page__hero-content">
              <div className="auth-page__brand-stage">
                <WaveAuraBackground variant={roleTheme} withInteractionOrb />
                <span className="auth-page__brand">Трамплин</span>
              </div>
            </div>
          </section>
        ) : null}

        <section className="auth-page__panel">
          <div className="auth-page__panel-content">
            <div className={`auth-card ${isCodeStep ? "auth-card--verification" : ""}`}>
              <div className="auth-card__header">
                {isCodeStep ? (
                  <div className="auth-verification-header">
                    <button
                      type="button"
                      className="auth-verification-header__back"
                      aria-label="Назад"
                      onClick={handleBackToForm}
                    >
                      <img
                        src={arrowIcon}
                        alt=""
                        className="auth-verification-header__back-icon"
                        aria-hidden="true"
                      />
                    </button>
                    <div className="auth-verification-header__content">
                      <h2 className="auth-verification-header__title">
                        <span className="auth-verification-header__title-accent">Подтверждение</span>{" "}
                        адреса электронной почты
                      </h2>
                      <p className="auth-verification-header__description">
                        На указанный e-mail было отправлено письмо с кодом подтверждения регистрации
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2 className="auth-card__title">Регистрация</h2>
                    <p className="auth-card__hint">
                      Уже есть аккаунт? <Link to="/login">Войти</Link>
                    </p>
                  </>
                )}
              </div>

              {!isCodeStep ? (
                <form className="auth-form" onSubmit={handleSubmit(handleFormSubmit)}>
                  <div
                    className={
                      selectedRole === "applicant"
                        ? "segmented-switch segmented-switch--second-active auth-form__role-switch"
                        : "segmented-switch auth-form__role-switch"
                    }
                    role="tablist"
                    aria-label="Выбор роли"
                  >
                    <span className="segmented-switch__indicator" aria-hidden="true" />
                    <button
                      type="button"
                      className={
                        selectedRole === "employer"
                          ? "segmented-switch__option segmented-switch__option--active"
                          : "segmented-switch__option"
                      }
                      onClick={() => setValue("role", "employer", { shouldValidate: true })}
                    >
                      Работодатель
                    </button>
                    <button
                      type="button"
                      className={
                        selectedRole === "applicant"
                          ? "segmented-switch__option segmented-switch__option--active"
                          : "segmented-switch__option"
                      }
                      onClick={() => setValue("role", "applicant", { shouldValidate: true })}
                    >
                      Соискатель
                    </button>
                  </div>

                  <div className="auth-form__fields">
                    <label className="auth-form__control">
                      <span className="auth-form__label">Email</span>
                      <Input
                        placeholder="you@tramplin.ru"
                        autoComplete="email"
                        error={errors.email?.message}
                        clearable
                        className={inputThemeClassName}
                        {...register("email")}
                      />
                      {errors.email && <span className="auth-form__error">{errors.email.message}</span>}
                    </label>

                    <label className="auth-form__control">
                      <span className="auth-form__label">Пароль</span>
                      <Input
                        type="password"
                        placeholder="Не менее 8 символов"
                        autoComplete="new-password"
                        error={errors.password?.message}
                        clearable
                        className={inputThemeClassName}
                        {...register("password")}
                      />
                      {errors.password && (
                        <span className="auth-form__error">{errors.password.message}</span>
                      )}
                    </label>

                    <label className="auth-form__control">
                      <span className="auth-form__label">Повторите пароль</span>
                      <Input
                        type="password"
                        placeholder=""
                        autoComplete="new-password"
                        error={errors.confirmPassword?.message}
                        clearable
                        className={inputThemeClassName}
                        {...register("confirmPassword")}
                      />
                      {errors.confirmPassword && (
                        <span className="auth-form__error">{errors.confirmPassword.message}</span>
                      )}
                    </label>
                  </div>

                  <label className="auth-form__terms">
                    <Controller
                      control={control}
                      name="acceptTerms"
                      render={({ field }) => (
                        <Checkbox
                          checked={Boolean(field.value)}
                          variant={checkboxTheme}
                          className={errors.acceptTerms ? "checkbox--error" : undefined}
                          onBlur={field.onBlur}
                          onChange={(event) => field.onChange(event.target.checked)}
                          ref={field.ref}
                        />
                      )}
                    />
                    <span>
                      Я согласен с условиями <Link to="/terms">пользовательского соглашения</Link> и даю
                      согласие на обработку моей персональной информации на условиях, определенных{" "}
                      <Link to="/privacy">политикой конфиденциальности</Link>
                    </span>
                  </label>
                  {apiError && <span className="auth-form__error">{apiError}</span>}

                  <Button
                    type="submit"
                    variant={roleTheme}
                    fullWidth
                    loading={requestCodeMutation.isPending}
                  >
                    Продолжить
                  </Button>
                </form>
              ) : (
                <div className="auth-form auth-form--verification">
                  <div className="auth-verification">
                    <div className="auth-verification__content">
                      <div className="auth-verification__group">
                        <label className="auth-form__control auth-form__control--verification">
                          <CodeInput
                            value={verificationCode}
                            variant={roleTheme}
                            focusTrigger={codeInputFocusTrigger}
                            errorFocusTrigger={codeInputErrorFocusTrigger}
                            error={apiError ?? undefined}
                            disabled={completeRegistrationMutation.isPending || isVerificationLocked}
                            onChange={(nextValue) => {
                              setVerificationCode(nextValue);
                              registrationSubmitLockRef.current = false;
                              if (apiError) {
                                setApiError(null);
                                setApiErrorCode(null);
                              }
                            }}
                          />
                        </label>

                        {apiError && <span className="auth-form__error">{apiError}</span>}

                        <div className="auth-verification__meta">
                          <div className="auth-verification__resend-block">
                            {!isTemporarilyRateLimited ? (
                              resendCountdown > 0 ? (
                                <p className="auth-verification__timer">
                                  Запросить код повторно можно через {resendCountdown} секунд
                                </p>
                              ) : (
                                <Button
                                  type="button"
                                  variant={roleGhostVariant}
                                  size="md"
                                  className="auth-verification__resend"
                                  onClick={handleResendCode}
                                  disabled={resendCodeMutation.isPending || isVerificationLocked}
                                >
                                  Запросить код повторно
                                </Button>
                              )
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="auth-verification__group auth-verification__group--actions">
                      <Button
                        type="button"
                        variant={roleTheme}
                        fullWidth
                        disabled={isVerificationLocked}
                        loading={completeRegistrationMutation.isPending}
                        onClick={handleVerificationSubmit}
                      >
                        Подтвердить
                      </Button>

                      <div className="auth-verification__actions">
                        <Button
                          type="button"
                          variant={roleGhostVariant}
                          size="md"
                          className="auth-verification__resend"
                          disabled={isVerificationLocked}
                        >
                          Не пришел код подтверждения?
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!isCodeStep ? (
                <div className="auth-social">
                  <div className="auth-social__divider" aria-hidden="true">
                    <span className="auth-social__divider-line" />
                    <span className="auth-social__divider-text">или</span>
                    <span className="auth-social__divider-line" />
                  </div>

                  <div className="auth-social__actions">
                    <button type="button" className="auth-social__button" aria-label="Войти через VK">
                      <img src={vkIcon} alt="" className="auth-social__icon" />
                    </button>
                    <button type="button" className="auth-social__button" aria-label="Войти через Max">
                      <img src={maxIcon} alt="" className="auth-social__icon" />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
