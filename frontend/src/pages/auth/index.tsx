import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { registerRequest, useAuthStore } from "../../features/auth";
import { Button, Card, Checkbox, Container, Input, Radio } from "../../shared/ui";
import "./auth.css";

const registerSchema = z
  .object({
    role: z.enum(["applicant", "employer"]),
    displayName: z.string().min(2, "Введите имя профиля"),
    email: z.string().email("Введите корректный email"),
    password: z.string().min(8, "Минимум 8 символов"),
    confirmPassword: z.string().min(8, "Минимум 8 символов"),
    acceptTerms: z.boolean().refine((value) => value, "Подтвердите согласие"),
    fullName: z.string().optional(),
    companyName: z.string().optional(),
    inn: z.string().optional(),
    corporateEmail: z.string().optional(),
    website: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Пароли не совпадают",
      });
    }

    if (value.role === "applicant" && !value.fullName?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fullName"],
        message: "Введите ФИО",
      });
    }

    if (value.role === "employer") {
      if (!value.companyName?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["companyName"],
          message: "Введите название компании",
        });
      }

      if (!value.inn?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inn"],
          message: "Введите ИНН",
        });
      }

      if (!value.corporateEmail?.trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["corporateEmail"],
          message: "Введите корпоративный email",
        });
      }
    }
  });

type RegisterFormValues = z.infer<typeof registerSchema>;
type RegisterSuccessResponse = {
  data?: {
    access_token?: string;
    user?: {
      role?: "applicant" | "employer";
    };
  };
};

export function AuthPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [apiError, setApiError] = useState<string | null>(null);

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
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
      fullName: "",
      companyName: "",
      inn: "",
      corporateEmail: "",
      website: "",
    },
  });

  const selectedRole = watch("role");

  const registerMutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: (data: RegisterSuccessResponse) => {
      const accessToken = data?.data?.access_token;
      const role = data?.data?.user?.role ?? selectedRole;

      if (accessToken) {
        setSession(accessToken, role);
      }

      navigate(role === "employer" ? "/dashboard/employer" : "/dashboard/applicant");
    },
    onError: () => {
      setApiError("Не удалось завершить регистрацию. Проверьте данные и повторите попытку.");
    },
  });

  const onSubmit = (values: RegisterFormValues) => {
    setApiError(null);

    registerMutation.mutate({
      email: values.email,
      password: values.password,
      display_name: values.displayName,
      role: values.role,
      applicant_profile:
        values.role === "applicant"
          ? {
              full_name: values.fullName?.trim() || values.displayName,
            }
          : undefined,
      employer_profile:
        values.role === "employer"
          ? {
              company_name: values.companyName?.trim() ?? "",
              inn: values.inn?.trim() ?? "",
              corporate_email: values.corporateEmail?.trim() ?? "",
              website: values.website?.trim() || undefined,
            }
          : undefined,
    });
  };

  return (
    <main className="auth-page">
      <Container className="auth-page__content" variant="auth-page">
        <section className="auth-page__hero">
          <div className="auth-page__hero-surface">
            <span className="auth-page__eyebrow">TRAMPLIN</span>
            <h1 className="auth-page__headline">Платформа карьерного старта для студентов и работодателей.</h1>
            <p className="auth-page__description">
              Соберите профиль, подтвердите роль и выходите на рабочий контур продукта без лишних
              шагов.
            </p>
            <div className="auth-page__metrics">
              <div className="auth-page__metric">
                <span className="auth-page__metric-value">01</span>
                <span className="auth-page__metric-label">Роли и onboarding</span>
              </div>
              <div className="auth-page__metric">
                <span className="auth-page__metric-value">02</span>
                <span className="auth-page__metric-label">Единая система UI</span>
              </div>
              <div className="auth-page__metric">
                <span className="auth-page__metric-value">03</span>
                <span className="auth-page__metric-label">Готовность к API auth</span>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-page__panel">
          <Card className="auth-card">
            <div className="auth-card__tabs">
              <span className="auth-card__tab auth-card__tab--active">Регистрация</span>
              <Link className="auth-card__tab" to="/login">
                Вход
              </Link>
            </div>

            <div className="auth-card__header">
              <h2 className="auth-card__title">Создать аккаунт</h2>
              <p className="auth-card__hint">
                Уже зарегистрированы? <Link to="/login">Перейти ко входу</Link>
              </p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
              <div className="auth-form__roles" role="radiogroup" aria-label="Выбор роли">
                <label className="auth-form__role">
                  <Radio
                    name="register-role"
                    checked={selectedRole === "applicant"}
                    onChange={() => setValue("role", "applicant", { shouldValidate: true })}
                  />
                  <span className="auth-form__role-label">Соискатель</span>
                </label>
                <label className="auth-form__role">
                  <Radio
                    name="register-role"
                    checked={selectedRole === "employer"}
                    onChange={() => setValue("role", "employer", { shouldValidate: true })}
                  />
                  <span className="auth-form__role-label">Работодатель</span>
                </label>
              </div>

              <div className="auth-form__grid">
                <label className="auth-form__field">
                  <span className="auth-form__label">Имя профиля</span>
                  <Input
                    placeholder="Как отображать аккаунт"
                    error={errors.displayName?.message}
                    {...register("displayName")}
                  />
                  {errors.displayName && <span className="auth-form__error">{errors.displayName.message}</span>}
                </label>

                <label className="auth-form__field">
                  <span className="auth-form__label">Email</span>
                  <Input
                    placeholder="you@tramplin.ru"
                    autoComplete="email"
                    error={errors.email?.message}
                    {...register("email")}
                  />
                  {errors.email && <span className="auth-form__error">{errors.email.message}</span>}
                </label>

                {selectedRole === "applicant" ? (
                  <label className="auth-form__field auth-form__field--wide">
                    <span className="auth-form__label">ФИО</span>
                    <Input
                      placeholder="Полное имя"
                      error={errors.fullName?.message}
                      {...register("fullName")}
                    />
                    {errors.fullName && <span className="auth-form__error">{errors.fullName.message}</span>}
                  </label>
                ) : (
                  <>
                    <label className="auth-form__field auth-form__field--wide">
                      <span className="auth-form__label">Название компании</span>
                      <Input
                        placeholder="ООО Трамплин"
                        error={errors.companyName?.message}
                        {...register("companyName")}
                      />
                      {errors.companyName && (
                        <span className="auth-form__error">{errors.companyName.message}</span>
                      )}
                    </label>

                    <label className="auth-form__field">
                      <span className="auth-form__label">ИНН</span>
                      <Input placeholder="7707083893" error={errors.inn?.message} {...register("inn")} />
                      {errors.inn && <span className="auth-form__error">{errors.inn.message}</span>}
                    </label>

                    <label className="auth-form__field">
                      <span className="auth-form__label">Корпоративный email</span>
                      <Input
                        placeholder="hr@company.ru"
                        autoComplete="email"
                        error={errors.corporateEmail?.message}
                        {...register("corporateEmail")}
                      />
                      {errors.corporateEmail && (
                        <span className="auth-form__error">{errors.corporateEmail.message}</span>
                      )}
                    </label>

                    <label className="auth-form__field auth-form__field--wide">
                      <span className="auth-form__label">Сайт компании</span>
                      <Input placeholder="https://company.ru" {...register("website")} />
                    </label>
                  </>
                )}

                <label className="auth-form__field">
                  <span className="auth-form__label">Пароль</span>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    error={errors.password?.message}
                    {...register("password")}
                  />
                  {errors.password && <span className="auth-form__error">{errors.password.message}</span>}
                </label>

                <label className="auth-form__field">
                  <span className="auth-form__label">Подтверждение пароля</span>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    error={errors.confirmPassword?.message}
                    {...register("confirmPassword")}
                  />
                  {errors.confirmPassword && (
                    <span className="auth-form__error">{errors.confirmPassword.message}</span>
                  )}
                </label>
              </div>

              <label className="auth-form__terms">
                <Checkbox {...register("acceptTerms")} />
                <span>
                  Принимаю <a href="#">пользовательское соглашение</a> и условия обработки данных
                </span>
              </label>
              {errors.acceptTerms && <span className="auth-form__error">{errors.acceptTerms.message}</span>}
              {apiError && <span className="auth-form__error">{apiError}</span>}

              <Button type="submit" fullWidth loading={registerMutation.isPending} withArrow={!registerMutation.isPending}>
                Создать аккаунт
              </Button>
            </form>
          </Card>
        </section>
      </Container>
    </main>
  );
}
