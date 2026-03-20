import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { WaveAuraBackground } from "../../components/WaveAuraBackground/WaveAuraBackground";
import { loginRequest, useAuthStore } from "../../features/auth";
import { Button, Container, Input } from "../../shared/ui";
import "../auth/auth.css";
import "./login.css";

const loginSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string().min(8, "Минимум 8 символов"),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type LoginSuccessResponse = {
  data?: {
    access_token?: string;
    user?: {
      role?: "applicant" | "employer";
    };
  };
};

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const loginMutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: (data: LoginSuccessResponse) => {
      const accessToken = data?.data?.access_token;
      const role = data?.data?.user?.role ?? "applicant";

      if (accessToken) {
        setSession(accessToken, role);
      }

      navigate(role === "employer" ? "/dashboard/employer" : "/dashboard/applicant");
    },
    onError: () => {
      setApiError("Не удалось выполнить вход. Проверьте email и пароль.");
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    setApiError(null);
    loginMutation.mutate(values);
  };

  return (
    <main className="auth-page login-page">
      <Container className="auth-page__content" variant="auth-page">
        <section className="auth-page__hero">
          <div className="auth-page__hero-content login-page__hero-content">
            <div className="auth-page__brand-stage">
              <WaveAuraBackground />
              <span className="auth-page__brand">Трамплин</span>
            </div>
          </div>
        </section>

        <section className="auth-page__panel">
          <div className="auth-page__panel-content">
            <div className="auth-card login-card">
              <div className="auth-card__header">
                <h2 className="auth-card__title">Авторизация</h2>
                <p className="auth-card__hint">
                  Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
                </p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
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

                  <label className="auth-form__control">
                    <span className="auth-form__label">Пароль</span>
                    <Input
                      type="password"
                      placeholder="Введите пароль"
                      autoComplete="current-password"
                      error={errors.password?.message}
                      clearable
                      {...register("password")}
                    />
                    {errors.password && <span className="auth-form__error">{errors.password.message}</span>}
                  </label>
                </div>

                {apiError && <span className="auth-form__error">{apiError}</span>}

                <div className="login-page__actions">
                  <Button type="submit" fullWidth loading={loginMutation.isPending}>
                    Войти
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
