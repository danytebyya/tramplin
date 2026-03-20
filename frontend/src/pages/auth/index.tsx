import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { registerRequest, useAuthStore } from "../../features/auth";
import { WaveAuraBackground } from "../../components/WaveAuraBackground/WaveAuraBackground";
import { Button, Checkbox, Container, Input, Radio } from "../../shared/ui";
import "./auth.css";

const registerSchema = z
  .object({
    role: z.enum(["applicant", "employer"]),
    email: z.string().email("Введите корректный email"),
    password: z.string().min(8, "Минимум 8 символов"),
    confirmPassword: z.string().min(8, "Минимум 8 символов"),
    acceptTerms: z.boolean().refine((value) => value, "Подтвердите согласие"),
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
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
      companyName: "",
      inn: "",
      corporateEmail: "",
      website: "",
    },
  });

  const selectedRole = watch("role");
  const resolveDisplayName = (email: string) => email.split("@")[0]?.trim() || email.trim();

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
      display_name: resolveDisplayName(values.email),
      role: values.role,
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
                <h2 className="auth-card__title">Регистрация</h2>
                <p className="auth-card__hint">
                  Уже есть аккаунт? <Link to="/login">Войти</Link>
                </p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
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
                      <label className="auth-form__control">
                        <span className="auth-form__label">Название компании</span>
                        <Input
                          placeholder="ООО Трамплин"
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
                          placeholder="7707083893"
                          error={errors.inn?.message}
                          clearable
                          {...register("inn")}
                        />
                        {errors.inn && <span className="auth-form__error">{errors.inn.message}</span>}
                      </label>

                      <label className="auth-form__control">
                        <span className="auth-form__label">Корпоративный email</span>
                        <Input
                          placeholder="hr@company.ru"
                          autoComplete="email"
                          error={errors.corporateEmail?.message}
                          clearable
                          {...register("corporateEmail")}
                        />
                        {errors.corporateEmail && (
                          <span className="auth-form__error">{errors.corporateEmail.message}</span>
                        )}
                      </label>

                      <label className="auth-form__control">
                        <span className="auth-form__label">Сайт компании</span>
                        <Input placeholder="https://company.ru" clearable {...register("website")} />
                      </label>
                    </>
                  )}

                  <label className="auth-form__control">
                    <span className="auth-form__label">Пароль</span>
                    <Input
                      type="password"
                      placeholder="qwerty!"
                      autoComplete="new-password"
                      error={errors.password?.message}
                      clearable
                      {...register("password")}
                    />
                    {errors.password && <span className="auth-form__error">{errors.password.message}</span>}
                  </label>

                  <label className="auth-form__control">
                    <span className="auth-form__label">Подтверждение пароля</span>
                    <Input
                      type="password"
                      placeholder="qwerty!"
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
                  <Checkbox {...register("acceptTerms")} />
                  <span>
                    Принимаю <a href="#">пользовательское соглашение</a> и{" "}
                    <a href="#">условия обработки персональных данных</a>
                  </span>
                </label>
                {errors.acceptTerms && <span className="auth-form__error">{errors.acceptTerms.message}</span>}
                {apiError && <span className="auth-form__error">{apiError}</span>}

                <Button type="submit" fullWidth loading={registerMutation.isPending}>
                  Зарегистрироваться
                </Button>
              </form>
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
