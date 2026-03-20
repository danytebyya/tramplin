import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { loginRequest, useAuthStore } from "../../features/auth";
import { Button, Card, Container, Input } from "../../shared/ui";
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
          <div className="auth-page__hero-surface login-page__hero-surface">
            <span className="auth-page__eyebrow">TRAMPLIN</span>
            <h1 className="auth-page__headline">Возвращайтесь в рабочий кабинет без лишней навигации.</h1>
            <p className="auth-page__description">
              Вход собран на тех же контролах и токенах, что и остальной интерфейс платформы.
            </p>
            <div className="login-page__notes">
              <div className="login-page__note">
                <span className="login-page__note-title">JWT flow</span>
                <span className="login-page__note-text">Готово к access/refresh архитектуре backend.</span>
              </div>
              <div className="login-page__note">
                <span className="login-page__note-title">Единая система</span>
                <span className="login-page__note-text">Поведение инпутов и кнопок уже синхронизировано.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-page__panel">
          <Card className="auth-card login-card">
            <div className="auth-card__tabs">
              <Link className="auth-card__tab" to="/register">
                Регистрация
              </Link>
              <span className="auth-card__tab auth-card__tab--active">Вход</span>
            </div>

            <div className="auth-card__header">
              <h2 className="auth-card__title">Войти в аккаунт</h2>
              <p className="auth-card__hint">
                Нет аккаунта? <Link to="/register">Создать сейчас</Link>
              </p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit(onSubmit)}>
              <div className="auth-form__grid auth-form__grid--single">
                <label className="auth-form__field auth-form__field--wide">
                  <span className="auth-form__label">Email</span>
                  <Input
                    placeholder="you@tramplin.ru"
                    autoComplete="email"
                    error={errors.email?.message}
                    {...register("email")}
                  />
                  {errors.email && <span className="auth-form__error">{errors.email.message}</span>}
                </label>

                <label className="auth-form__field auth-form__field--wide">
                  <span className="auth-form__label">Пароль</span>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    error={errors.password?.message}
                    {...register("password")}
                  />
                  {errors.password && <span className="auth-form__error">{errors.password.message}</span>}
                </label>
              </div>

              {apiError && <span className="auth-form__error">{apiError}</span>}

              <div className="login-page__actions">
                <Button type="submit" fullWidth loading={loginMutation.isPending} withArrow={!loginMutation.isPending}>
                  Войти
                </Button>
                <Link className="login-page__secondary-link" to="/register">
                  Нужна регистрация работодателя или соискателя
                </Link>
              </div>
            </form>
          </Card>
        </section>
      </Container>
    </main>
  );
}
