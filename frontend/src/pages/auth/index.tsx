import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { WaveAuraBackground } from "../../components/WaveAuraBackground/WaveAuraBackground";
import {
  loginRequest,
  registerRequest,
  requestEmailVerificationCode,
  useAuthStore,
  verifyEmailVerificationCode,
} from "../../features/auth";
import { Button, Checkbox, CodeInput, Container, Input, Radio, Select } from "../../shared/ui";
import "./auth.css";

const registerSchema = z
  .object({
    role: z.enum(["applicant", "employer"]),
    employerType: z.enum(["company", "sole_proprietor"]).optional(),
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
    companyName: z.string().optional(),
    inn: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.password && value.confirmPassword && value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Пароли не совпадают",
      });
    }

    if (value.role === "employer") {
      if (!value.employerType) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["employerType"],
          message: "Выберите тип работодателя",
        });
      }

      if (!value.companyName?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["companyName"],
          message: "Обязательное поле",
        });
      }

      const normalizedInn = value.inn?.replace(/\D/g, "") ?? "";

      if (!normalizedInn) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inn"],
          message: "Обязательное поле",
        });
      } else if (value.employerType === "sole_proprietor" && normalizedInn.length !== 10) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inn"],
          message: "Для ИП укажите 10 цифр ИНН",
        });
      } else if (value.employerType === "company" && normalizedInn.length !== 12) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inn"],
          message: "Для компании укажите 12 цифр ИНН",
        });
      }
    }
  });

type RegisterFormValues = z.infer<typeof registerSchema>;
type VerificationStep = "form" | "code";

export function AuthPage() {
  const employerTypeOptions = [
    { value: "company", label: "Компания" },
    { value: "sole_proprietor", label: "ИП" },
  ];

  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [step, setStep] = useState<VerificationStep>("form");
  const [apiError, setApiError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingValues, setPendingValues] = useState<RegisterFormValues | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: "applicant",
      employerType: undefined,
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
      companyName: "",
      inn: "",
    },
  });

  const selectedRole = watch("role");
  const selectedEmployerType = watch("employerType");
  const resolveDisplayName = (email: string) => email.split("@")[0]?.trim() || email.trim();

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
        employer_profile:
          values.role === "employer"
            ? {
                company_name: values.companyName?.trim() ?? "",
                inn: values.inn?.replace(/\D/g, "") ?? "",
                corporate_email: values.email.trim(),
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

      if (accessToken) {
        setSession(accessToken, role);
      }

      navigate(role === "employer" ? "/dashboard/employer" : "/dashboard/applicant");
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
    if (!pendingValues) {
      return;
    }

    setApiError(null);
    resendCodeMutation.mutate(pendingValues.email.trim());
  };

  const isCodeStep = step === "code" && pendingValues;

  return (
    <main className="auth-page">
      <Container className="auth-page__content" variant="auth-page">
        <section className="auth-page__hero">
          <div className="auth-page__hero-content">
            <div className="auth-page__brand-stage">
              <WaveAuraBackground />
              <span className="auth-page__brand">Трамплин</span>
            </div>
          </div>
        </section>

        <section className="auth-page__panel">
          <div className="auth-page__panel-content">
            <div className="auth-card">
              <div className="auth-card__header">
                <h2 className="auth-card__title">
                  {isCodeStep ? "Подтверждение email" : "Регистрация"}
                </h2>
                <p className="auth-card__hint">
                  Уже есть аккаунт? <Link to="/login">Войти</Link>
                </p>
              </div>

              {!isCodeStep ? (
                <form className="auth-form" onSubmit={handleSubmit(handleFormSubmit)}>
                  <div className="auth-form__roles" role="radiogroup" aria-label="Выбор роли">
                    <label className="auth-form__role">
                      <Radio
                        name="register-role"
                        checked={selectedRole === "employer"}
                        onChange={() => setValue("role", "employer", { shouldValidate: true })}
                      />
                      <span className="auth-form__role-label">Работодатель</span>
                    </label>
                    <label className="auth-form__role">
                      <Radio
                        name="register-role"
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
                        {...register("email")}
                      />
                      {errors.email && <span className="auth-form__error">{errors.email.message}</span>}
                    </label>

                    {selectedRole === "employer" && (
                      <>
                        <div className="auth-form__control">
                          <span className="auth-form__label">Тип работодателя</span>
                          <Select
                            error={errors.employerType?.message}
                            placeholder="Выберите тип работодателя"
                            value={selectedEmployerType ?? ""}
                            options={employerTypeOptions}
                            onValueChange={(nextValue) =>
                              setValue(
                                "employerType",
                                nextValue as "company" | "sole_proprietor",
                                { shouldValidate: true },
                              )
                            }
                          />
                          {errors.employerType && (
                            <span className="auth-form__error">{errors.employerType.message}</span>
                          )}
                        </div>

                        <label className="auth-form__control">
                          <span className="auth-form__label">Название компании</span>
                          <Input
                            placeholder='ООО "Трамплин"'
                            error={errors.companyName?.message}
                            clearable
                            {...register("companyName")}
                          />
                          {errors.companyName && (
                            <span className="auth-form__error">{errors.companyName.message}</span>
                          )}
                        </label>

                        <label className="auth-form__control">
                          <span className="auth-form__label">ИНН</span>
                          <Input
                            placeholder={selectedEmployerType === "sole_proprietor" ? "10 цифр" : "12 цифр"}
                            inputMode="numeric"
                            error={errors.inn?.message}
                            clearable
                            {...register("inn")}
                          />
                          {errors.inn && <span className="auth-form__error">{errors.inn.message}</span>}
                        </label>
                      </>
                    )}

                    <label className="auth-form__control">
                      <span className="auth-form__label">Пароль</span>
                      <Input
                        type="password"
                        placeholder="Введите пароль"
                        autoComplete="new-password"
                        error={errors.password?.message}
                        clearable
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
                        placeholder="Повторите пароль"
                        autoComplete="new-password"
                        error={errors.confirmPassword?.message}
                        clearable
                        {...register("confirmPassword")}
                      />
                      {errors.confirmPassword && (
                        <span className="auth-form__error">{errors.confirmPassword.message}</span>
                      )}
                    </label>
                  </div>

                  <label className="auth-form__terms">
                    <Checkbox checked={watch("acceptTerms")} {...register("acceptTerms")} />
                    <span>
                      Я принимаю <Link to="/terms">условия использования</Link> и{" "}
                      <Link to="/privacy">политику конфиденциальности</Link>
                    </span>
                  </label>

                  {errors.acceptTerms && (
                    <span className="auth-form__error">{errors.acceptTerms.message}</span>
                  )}
                  {apiError && <span className="auth-form__error">{apiError}</span>}

                  <Button type="submit" fullWidth loading={requestCodeMutation.isPending}>
                    Продолжить
                  </Button>
                </form>
              ) : (
                <div className="auth-form auth-form--verification">
                  <div className="auth-verification">
                    <p className="auth-verification__text">
                      Мы отправили 6-значный код на <strong>{pendingValues.email}</strong>
                    </p>

                    <label className="auth-form__control">
                      <span className="auth-form__label">Код подтверждения</span>
                      <CodeInput
                        value={verificationCode}
                        onChange={(nextValue) => {
                          setVerificationCode(nextValue);
                          if (apiError) {
                            setApiError(null);
                          }
                        }}
                        error={apiError ?? undefined}
                        disabled={completeRegistrationMutation.isPending}
                      />
                    </label>

                    <div className="auth-verification__actions">
                      <Button
                        type="button"
                        fullWidth
                        loading={completeRegistrationMutation.isPending}
                        onClick={handleVerificationSubmit}
                      >
                        Завершить регистрацию
                      </Button>
                      <Button type="button" variant="secondary" fullWidth onClick={handleResendCode} loading={resendCodeMutation.isPending}>
                        Отправить код ещё раз
                      </Button>
                      <Button type="button" variant="ghost" fullWidth onClick={handleBackToForm}>
                        Изменить данные
                      </Button>
                    </div>

                    {apiError && <span className="auth-form__error">{apiError}</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
