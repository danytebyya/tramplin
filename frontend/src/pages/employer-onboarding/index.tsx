import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ChangeEvent, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { WaveAuraBackground } from "../../components/WaveAuraBackground/WaveAuraBackground";
import { upsertEmployerProfile } from "../../features/company-verification";
import { Button, Checkbox, Container, Input } from "../../shared/ui";
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
    socialLink: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || /^https?:\/\//.test(value), "Укажите ссылку с http:// или https://"),
    confirmation: z.literal(true, {
      errorMap: () => ({ message: "Подтвердите достоверность данных" }),
    }),
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
  const [documentName, setDocumentName] = useState("");
  const documentInputRef = useRef<HTMLInputElement | null>(null);

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmployerOnboardingValues>({
    resolver: zodResolver(employerOnboardingSchema),
    defaultValues: {
      employerType: "company",
      companyName: "",
      inn: "",
      corporateEmail: "",
      website: "",
      socialLink: "",
      confirmation: true,
    },
  });

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

  const handleDocumentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    setDocumentName(nextFile?.name ?? "");
  };

  return (
    <main className="auth-page auth-page--verification employer-onboarding-page">
      <div className="employer-onboarding-page__background" aria-hidden="true">
        <div className="employer-onboarding-page__background-aura">
          <WaveAuraBackground />
        </div>
      </div>
      <Container className="auth-page__content" variant="auth-page">
        <section className="auth-page__panel employer-onboarding-page__panel">
          <div className="auth-page__panel-content">
            <div className="auth-card auth-card--verification employer-onboarding-card">
              <div className="auth-card__header employer-onboarding-card__header">
                <h2 className="auth-verification-header__title employer-onboarding-card__title">
                  <span className="auth-verification-header__title-accent">Верификация</span>{" "}
                  работодателя
                </h2>
                <p className="auth-verification-header__description employer-onboarding-card__description">
                  Заполните данные компании для проверки. После отправки заявки мы сверим информацию и
                  подтвердим профиль работодателя.
                </p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit(handleOnboardingSubmit)}>
                <div className="auth-form__fields employer-onboarding-form__fields">
                  <label className="auth-form__control employer-onboarding-form__control">
                    <span className="auth-form__label employer-onboarding-form__label">
                      Название компании
                    </span>
                    <Input
                      placeholder="Например: ООО Трамплин"
                      error={errors.companyName?.message}
                      clearable
                      {...register("companyName")}
                    />
                    {errors.companyName && (
                      <span className="auth-form__error">{errors.companyName.message}</span>
                    )}
                  </label>

                  <label className="auth-form__control employer-onboarding-form__control">
                    <span className="auth-form__label employer-onboarding-form__label">ИНН/ОГРН</span>
                    <Input
                      placeholder="Например: 7707083893"
                      inputMode="numeric"
                      error={errors.inn?.message}
                      clearable
                      {...register("inn")}
                    />
                    {errors.inn && <span className="auth-form__error">{errors.inn.message}</span>}
                  </label>

                  <label className="auth-form__control employer-onboarding-form__control">
                    <span className="auth-form__label employer-onboarding-form__label">
                      Корпоративная почта
                    </span>
                    <Input
                      placeholder="Например: hr@tramplin.ru"
                      autoComplete="email"
                      error={errors.corporateEmail?.message}
                      clearable
                      {...register("corporateEmail")}
                    />
                    {errors.corporateEmail && (
                      <span className="auth-form__error">{errors.corporateEmail.message}</span>
                    )}
                  </label>

                  <label className="auth-form__control employer-onboarding-form__control">
                    <span className="auth-form__label employer-onboarding-form__label">
                      Сайт компании
                    </span>
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

                  <label className="auth-form__control employer-onboarding-form__control">
                    <span className="auth-form__label employer-onboarding-form__label">
                      Ссылка на соцсети
                    </span>
                    <Input
                      placeholder="https://t.me/tramplin"
                      error={errors.socialLink?.message}
                      clearable
                      {...register("socialLink")}
                    />
                    {errors.socialLink && (
                      <span className="auth-form__error">{errors.socialLink.message}</span>
                    )}
                  </label>
                </div>

                <div className="employer-onboarding-upload">
                  <span className="auth-form__label employer-onboarding-form__label">
                    Загрузите документ
                  </span>
                  <input
                    ref={documentInputRef}
                    className="employer-onboarding-upload__input"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                    onChange={handleDocumentChange}
                  />
                  <button
                    type="button"
                    className="employer-onboarding-upload__dropzone"
                    onClick={() => documentInputRef.current?.click()}
                  >
                    <span className="employer-onboarding-upload__description">
                      {documentName || "Описание того, что надо загрузить"}
                    </span>
                    <span className="employer-onboarding-upload__icon" aria-hidden="true">
                      ↑
                    </span>
                  </button>
                </div>

                <label className="auth-form__terms employer-onboarding-form__terms">
                  <Controller
                    control={control}
                    name="confirmation"
                    render={({ field }) => (
                      <Checkbox
                        checked={Boolean(field.value)}
                        className={errors.confirmation ? "checkbox--error" : undefined}
                        onBlur={field.onBlur}
                        onChange={(event) => field.onChange(event.target.checked)}
                        ref={field.ref}
                      />
                    )}
                  />
                  <span>Подтверждаю достоверность предоставленной мною информации</span>
                </label>
                {errors.confirmation && (
                  <span className="auth-form__error">{errors.confirmation.message}</span>
                )}
                {apiError && <span className="auth-form__error">{apiError}</span>}

                <Button type="submit" fullWidth loading={onboardingMutation.isPending}>
                  Отправить на проверку
                </Button>
              </form>
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
