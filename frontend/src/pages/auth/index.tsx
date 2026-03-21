import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import maxIcon from "../../assets/auth/max.png";
import vkIcon from "../../assets/auth/vk.png";
import { WaveAuraBackground } from "../../components/WaveAuraBackground/WaveAuraBackground";
import {
  loginRequest,
  registerRequest,
  resolvePostAuthRoute,
  requestEmailVerificationCode,
  useAuthStore,
  verifyEmailVerificationCode,
} from "../../features/auth";
import { Button, Checkbox, Container, Input, Radio } from "../../shared/ui";
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

export function AuthPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [step, setStep] = useState<VerificationStep>("form");
  const [apiError, setApiError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingValues, setPendingValues] = useState<RegisterFormValues | null>(null);
  const [resendCountdown, setResendCountdown] = useState(60);

  const {
    control,
    register,
    handleSubmit,
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
    if (step !== "code") {
      return;
    }

    setResendCountdown(60);
  }, [step]);

  useEffect(() => {
    if (step !== "code" || resendCountdown <= 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setResendCountdown((current) => current - 1);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [resendCountdown, step]);

  const requestCodeMutation = useMutation({
    mutationFn: requestEmailVerificationCode,
    onSuccess: () => {
      setVerificationCode("");
      setStep("code");
      setApiError(null);
    },
    onError: (error: any) => {
      setApiError(
        error?.response?.data?.error?.message ??
          "Не удалось отправить код подтверждения. Попробуйте ещё раз.",
      );
    },
  });

  const resendCodeMutation = useMutation({
    mutationFn: requestEmailVerificationCode,
    onSuccess: () => {
      setVerificationCode("");
      setApiError(null);
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
    setApiError(null);
    requestCodeMutation.mutate(values.email.trim(), {
      onSuccess: () => {
        setPendingValues(values);
      },
    });
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

  const handleBackToForm = () => {
    setStep("form");
    setVerificationCode("");
    setApiError(null);
  };

  const handleResendCode = () => {
    if (!pendingValues || resendCountdown > 0) {
      return;
    }

    setApiError(null);
    resendCodeMutation.mutate(pendingValues.email.trim(), {
      onSuccess: () => {
        setResendCountdown(60);
      },
    });
  };

  const isCodeStep = step === "code" && pendingValues;

  return (
    <main className={`auth-page ${roleTheme === "secondary" ? "auth-page--secondary-theme" : ""}`}>
      <Container className="auth-page__content" variant="auth-page">
        <section className="auth-page__hero">
          <div className="auth-page__hero-content">
            <div className="auth-page__brand-stage">
              <WaveAuraBackground variant={roleTheme} withInteractionOrb />
              <span className="auth-page__brand">Трамплин</span>
            </div>
          </div>
        </section>

        <section className="auth-page__panel">
          <div className="auth-page__panel-content">
            <div className="auth-card">
              <div className="auth-card__header">
                {isCodeStep ? (
                  <div className="auth-verification-header">
                    <button
                      type="button"
                      className="auth-verification-header__back"
                      aria-label="Назад"
                      onClick={handleBackToForm}
                    >
                      <span className="auth-verification-header__back-icon" aria-hidden="true" />
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

                  {errors.acceptTerms && (
                    <span className="auth-form__error">{errors.acceptTerms.message}</span>
                  )}
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
                    <label className="auth-form__control auth-form__control--verification">
                      <Input
                        value={verificationCode}
                        placeholder="000000"
                        inputMode="numeric"
                        maxLength={6}
                        clearable
                        className="auth-verification__input"
                        error={apiError ?? undefined}
                        disabled={completeRegistrationMutation.isPending}
                        onChange={(event) => {
                          const nextValue = event.target.value.replace(/\D/g, "").slice(0, 6);
                          setVerificationCode(nextValue);
                          if (apiError) {
                            setApiError(null);
                          }
                        }}
                      />
                    </label>

                    <p className="auth-verification__timer">
                      Запросить код повторно можно через {resendCountdown} секунд
                    </p>

                    <button
                      type="button"
                      className="auth-verification__link"
                      onClick={handleBackToForm}
                    >
                      Изменить адрес электронной почты
                    </button>

                    <div className="auth-verification__actions">
                      <Button
                        type="button"
                        variant={roleTheme}
                        fullWidth
                        loading={completeRegistrationMutation.isPending}
                        onClick={handleVerificationSubmit}
                      >
                        Подтвердить
                      </Button>

                      <button
                        type="button"
                        className="auth-verification__link"
                        onClick={handleResendCode}
                        disabled={resendCountdown > 0 || resendCodeMutation.isPending}
                      >
                        Не пришел код подтверждения?
                      </button>
                    </div>

                    {apiError && <span className="auth-form__error">{apiError}</span>}
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
