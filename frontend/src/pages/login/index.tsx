import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import maxIcon from "../../assets/auth/max.png";
import vkIcon from "../../assets/auth/vk.png";
import logoPrimary from "../../assets/icons/logo-primary.svg";
import { WaveAuraBackground } from "../../components/WaveAuraBackground/WaveAuraBackground";
import {
  applyAuthSession,
  isCompanyInviteReturnTo,
  loginRequest,
  readCompanyInviteReturnTo,
  resolvePostAuthRoute,
} from "../../features/auth";
import { Button, Container, Input } from "../../shared/ui";
import "../auth/auth.css";
import "./login.css";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Обязательное поле")
    .email("Введите корректный email"),
  password: z
    .string()
    .min(1, "Обязательное поле")
    .min(8, "Пароль должен содержать минимум 8 символов"),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type LoginSuccessResponse = {
  data?: {
    user?: {
      role?: "applicant" | "employer" | "junior" | "curator" | "admin";
      has_employer_profile?: boolean;
    };
  };
};

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const searchParams = new URLSearchParams(location.search);
  const returnTo = searchParams.get("returnTo") ?? readCompanyInviteReturnTo();
  const isCompanyInviteLogin = isCompanyInviteReturnTo(returnTo);
  const brandLogo = logoPrimary;

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
      const role = data?.data?.user?.role ?? "applicant";
      const hasEmployerProfile = data?.data?.user?.has_employer_profile;

      applyAuthSession(data);

      navigate(returnTo || resolvePostAuthRoute(role, hasEmployerProfile));
    },
    onError: (error: any) => {
      setApiError(
        error?.response?.data?.error?.message ?? "Неверный email или пароль",
      );
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
              <WaveAuraBackground variant="primary" withInteractionOrb />
              <img src={brandLogo} alt="Трамплин" className="auth-page__brand" />
            </div>
          </div>
        </section>

        <section className="auth-page__panel">
          <div className="auth-page__panel-content">
            <div className="auth-card login-card">
              <div className="auth-card__header">
                <h2 className="auth-card__title">Авторизация</h2>
                <p className="auth-card__hint">
                  Нет аккаунта? <Link to={returnTo ? `/register?returnTo=${encodeURIComponent(returnTo)}` : "/register"}>Зарегистрироваться</Link>
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

                  {apiError && <span className="auth-form__error login-page__error">{apiError}</span>}
                </div>

                <div className="login-page__actions">
                  <Button type="submit" variant="primary" fullWidth loading={loginMutation.isPending}>
                    Войти
                  </Button>
                </div>
              </form>

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
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
