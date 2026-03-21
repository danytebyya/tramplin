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
  loginRequest,
  registerRequest,
  resolvePostAuthRoute,
  requestEmailVerificationCode,
  useAuthStore,
  verifyEmailVerificationCode,
} from "../../features/auth";
import { Button, Checkbox, CodeInput, Container, Input, Radio } from "../../shared/ui";
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
  values: RegisterFormValues;
  verificationCode: string;
  requestedAt: number;
  expiresAt: number;
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

export function AuthPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [step, setStep] = useState<VerificationStep>("form");
  const [apiError, setApiError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingValues, setPendingValues] = useState<RegisterFormValues | null>(null);
  const [resendCountdown, setResendCountdown] = useState(60);
  const lastAutoSubmittedCodeRef = useRef<string | null>(null);

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
    defaultValues: {
      role: "applicant",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const selectedRole = watch("role");
  const roleTheme = selectedRole === "applicant" ? "secondary" : "primary";
  const inputThemeClassName = roleTheme === "secondary" ? "input--secondary" : undefined;
  const checkboxTheme = roleTheme === "secondary" ? "secondary" : "primary";
  const resolveDisplayName = (email: string) => email.split("@")[0]?.trim() || email.trim();

  useEffect(() => {
    const persistedState = readPersistedVerificationState();

    if (!persistedState) {
      return;
    }

    reset(persistedState.values);
    setPendingValues(persistedState.values);
    setVerificationCode(persistedState.verificationCode);
    setStep("code");
    setApiError(null);
    setResendCountdown(
      Math.max(
        0,
        Math.ceil((persistedState.requestedAt + EMAIL_RESEND_COOLDOWN_MS - Date.now()) / 1000),
      ),
    );
  }, [reset]);

  useEffect(() => {
    if (step !== "code" || !pendingValues) {
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

    writePersistedVerificationState({
      ...persistedState,
      values: pendingValues,
      verificationCode,
    });
  }, [pendingValues, step, verificationCode]);

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
      setResendCountdown(60);
    }, Math.max(0, persistedState.expiresAt - Date.now()));

    return () => window.clearTimeout(timeoutId);
  }, [step]);

  const requestCodeMutation = useMutation({
    mutationFn: requestEmailVerificationCode,
    onSuccess: () => {
      const now = Date.now();

      setApiError(null);
      setResendCountdown(60);
      if (pendingValues) {
        writePersistedVerificationState({
          values: pendingValues,
          verificationCode: "",
          requestedAt: now,
          expiresAt: now + EMAIL_VERIFICATION_TTL_MS,
        });
      }
    },
    onError: (error: any) => {
      setResendCountdown(0);
      setApiError(
        error?.response?.data?.error?.message ??
          "Не удалось отправить код подтверждения. Попробуйте позже.",
      );
    },
  });

  const resendCodeMutation = useMutation({
    mutationFn: requestEmailVerificationCode,
    onSuccess: () => {
      const now = Date.now();

      setVerificationCode("");
      lastAutoSubmittedCodeRef.current = null;
      setApiError(null);
      setResendCountdown(60);
      if (pendingValues) {
        writePersistedVerificationState({
          values: pendingValues,
          verificationCode: "",
          requestedAt: now,
          expiresAt: now + EMAIL_VERIFICATION_TTL_MS,
        });
      }
    },
    onError: (error: any) => {
      setApiError(
        error?.response?.data?.error?.message ??
          "Не удалось отправить код повторно. Попробуйте позже.",
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
      await verifyEmailVerificationCode(values.email, code);

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

      return loginRequest({
        email: values.email,
        password: values.password,
      });
    },
    onSuccess: (data: any) => {
      const accessToken = data?.data?.access_token;
      const role = data?.data?.user?.role ?? pendingValues?.role ?? "applicant";
      const hasEmployerProfile = data?.data?.user?.has_employer_profile;

      if (accessToken) {
        setSession(accessToken, role);
      }

      clearPersistedVerificationState();
      navigate(resolvePostAuthRoute(role, hasEmployerProfile));
    },
    onError: (error: any) => {
      setApiError(
        error?.response?.data?.error?.message ??
          "Не удалось завершить регистрацию. Проверьте код и повторите попытку.",
      );
    },
  });

  const handleFormSubmit = (values: RegisterFormValues) => {
    const now = Date.now();

    setApiError(null);
    setPendingValues(values);
    setVerificationCode("");
    lastAutoSubmittedCodeRef.current = null;
    setStep("code");
    setResendCountdown(60);
    writePersistedVerificationState({
      values,
      verificationCode: "",
      requestedAt: now,
      expiresAt: now + EMAIL_VERIFICATION_TTL_MS,
    });
    requestCodeMutation.mutate(
      { email: values.email.trim(), forceResend: false },
      {
        onError: () => {
          clearPersistedVerificationState();
          setStep("form");
          setPendingValues(null);
          setVerificationCode("");
          lastAutoSubmittedCodeRef.current = null;
          setResendCountdown(0);
        },
      },
    );
  };

  const handleVerificationSubmit = () => {
    if (!pendingValues) {
      setStep("form");
      return;
    }

    if (verificationCode.length !== 6) {
      setApiError("Введите 6-значный код подтверждения");
      return;
    }

    setApiError(null);
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
    clearPersistedVerificationState();
    setStep("form");
    setPendingValues(null);
    setVerificationCode("");
    lastAutoSubmittedCodeRef.current = null;
    setApiError(null);
    setResendCountdown(60);
  };

  const handleResendCode = () => {
    if (!pendingValues || resendCountdown > 0) {
      return;
    }

    setApiError(null);
    resendCodeMutation.mutate({ email: pendingValues.email.trim(), forceResend: true }, {
      onSuccess: () => {},
    });
  };

  const isCodeStep = step === "code" && pendingValues;

  return (
    <main
      className={`auth-page ${roleTheme === "secondary" ? "auth-page--secondary-theme" : ""} ${
        isCodeStep ? "auth-page--verification" : ""
      }`}
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

        <section
          className={`auth-page__panel ${isCodeStep ? "auth-page__panel--verification" : ""}`}
        >
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
                  <div className="auth-form__roles" role="radiogroup" aria-label="Выбор роли">
                    <label className="auth-form__role">
                      <Radio
                        name="register-role"
                        variant="primary"
                        checked={selectedRole === "employer"}
                        onChange={() => setValue("role", "employer", { shouldValidate: true })}
                      />
                      <span className="auth-form__role-label">Работодатель</span>
                    </label>
                    <label className="auth-form__role">
                      <Radio
                        name="register-role"
                        variant="secondary"
                        checked={selectedRole === "applicant"}
                        onChange={() => setValue("role", "applicant", { shouldValidate: true })}
                      />
                      <span className="auth-form__role-label">Соискатель</span>
                    </label>
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
                  >
                    Продолжить
                  </Button>
                </form>
              ) : (
                <div className="auth-form auth-form--verification">
                  <div className="auth-verification">
                    <div className="auth-verification__group">
                      <label className="auth-form__control auth-form__control--verification">
                        <CodeInput
                          value={verificationCode}
                          variant={roleTheme}
                          error={apiError ?? undefined}
                          disabled={completeRegistrationMutation.isPending}
                          onChange={(nextValue) => {
                            setVerificationCode(nextValue);
                            if (apiError) {
                              setApiError(null);
                            }
                          }}
                        />
                      </label>

                      {apiError && <span className="auth-form__error">{apiError}</span>}

                      <div className="auth-verification__meta">
                        <div className="auth-verification__resend-block">
                          {resendCountdown > 0 ? (
                            <p className="auth-verification__timer">
                              Запросить код повторно можно через {resendCountdown} секунд
                            </p>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary-ghost"
                              size="md"
                              className="auth-verification__resend"
                              onClick={handleResendCode}
                              disabled={resendCodeMutation.isPending}
                            >
                              Запросить код повторно
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="auth-verification__group auth-verification__group--actions">
                      <Button
                        type="button"
                        variant={roleTheme}
                        fullWidth
                        loading={completeRegistrationMutation.isPending}
                        onClick={handleVerificationSubmit}
                      >
                        Подтвердить
                      </Button>

                      <div className="auth-verification__actions">
                        <Button
                          type="button"
                          variant="secondary-ghost"
                          size="md"
                          className="auth-verification__resend"
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
