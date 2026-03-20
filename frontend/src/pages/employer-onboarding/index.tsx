import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { WaveAuraBackground } from "../../components/WaveAuraBackground/WaveAuraBackground";
import { upsertEmployerProfile } from "../../features/company-verification";
import { Button, Container, Input, Radio } from "../../shared/ui";
import "../auth/auth.css";
import "./employer-onboarding.css";

const employerOnboardingSchema = z
  .object({
    employerType: z.enum(["company", "sole_proprietor"]),
    companyName: z.string().trim().min(1, "Обязательное поле"),
    inn: z.string().trim().min(1, "Обязательное поле"),
    corporateEmail: z
      .string()
      .trim()
      .min(1, "Обязательное поле")
      .email("Введите корректный email"),
    website: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || /^https?:\/\//.test(value), "Укажите ссылку с http:// или https://"),
  })
  .superRefine((value, context) => {
    const normalizedInn = value.inn.replace(/\D/g, "");

    if (!normalizedInn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inn"],
        message: "Обязательное поле",
      });
      return;
    }

    if (value.employerType === "sole_proprietor" && normalizedInn.length !== 10) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inn"],
        message: "Для ИП укажите 10 цифр ИНН",
      });
    }

    if (value.employerType === "company" && normalizedInn.length !== 12) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inn"],
        message: "Для компании укажите 12 цифр ИНН",
      });
    }
  });

type EmployerOnboardingValues = z.infer<typeof employerOnboardingSchema>;

export function EmployerOnboardingPage() {
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EmployerOnboardingValues>({
    resolver: zodResolver(employerOnboardingSchema),
    defaultValues: {
      employerType: "company",
      companyName: "",
      inn: "",
      corporateEmail: "",
      website: "",
    },
  });

  const selectedEmployerType = watch("employerType");

  const onboardingMutation = useMutation({
    mutationFn: upsertEmployerProfile,
    onSuccess: () => {
      navigate("/dashboard/employer");
    },
    onError: (error: any) => {
      setApiError(
        error?.response?.data?.error?.message ??
          "Не удалось сохранить данные работодателя. Попробуйте ещё раз.",
      );
    },
  });

  const handleOnboardingSubmit = (values: EmployerOnboardingValues) => {
    setApiError(null);
    onboardingMutation.mutate({
      employer_type: values.employerType,
      company_name: values.companyName.trim(),
      inn: values.inn.replace(/\D/g, ""),
      corporate_email: values.corporateEmail.trim(),
      website: values.website?.trim() || undefined,
    });
  };

  return (
    <main className="auth-page employer-onboarding-page">
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
            <div className="auth-card employer-onboarding-card">
              <div className="auth-card__header employer-onboarding-card__header">
                <h2 className="auth-card__title">Данные работодателя</h2>
                <p className="auth-card__hint">
                  Заполните профиль компании, чтобы перейти к публикации возможностей и верификации.
                </p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit(handleOnboardingSubmit)}>
                <div className="auth-form__roles" role="radiogroup" aria-label="Тип работодателя">
                  <label className="auth-form__role">
                    <Radio
                      name="employer-type"
                      checked={selectedEmployerType === "company"}
                      onChange={() => setValue("employerType", "company", { shouldValidate: true })}
                    />
                    <span className="auth-form__role-label">Компания</span>
                  </label>
                  <label className="auth-form__role">
                    <Radio
                      name="employer-type"
                      checked={selectedEmployerType === "sole_proprietor"}
                      onChange={() =>
                        setValue("employerType", "sole_proprietor", { shouldValidate: true })
                      }
                    />
                    <span className="auth-form__role-label">ИП</span>
                  </label>
                </div>

                <div className="auth-form__fields">
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

                  <label className="auth-form__control">
                    <span className="auth-form__label">Корпоративный email</span>
                    <Input
                      placeholder="team@company.ru"
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
                    <span className="auth-form__label">Сайт</span>
                    <Input
                      placeholder="https://company.ru"
                      error={errors.website?.message}
                      clearable
                      {...register("website")}
                    />
                    {errors.website && (
                      <span className="auth-form__error">{errors.website.message}</span>
                    )}
                  </label>
                </div>

                {apiError && <span className="auth-form__error">{apiError}</span>}

                <Button type="submit" fullWidth loading={onboardingMutation.isPending}>
                  Сохранить и продолжить
                </Button>
              </form>
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
