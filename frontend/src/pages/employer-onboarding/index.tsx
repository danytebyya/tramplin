import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { z } from "zod";

import { WaveAuraBackground } from "../../components/WaveAuraBackground/WaveAuraBackground";
import { meRequest } from "../../features/auth";
import { upsertEmployerProfile, verifyEmployerInn } from "../../features/company-verification";
import { Button, Checkbox, Container, Input, Radio } from "../../shared/ui";
import "../auth/auth.css";
import "./employer-onboarding.css";

const employerOnboardingSchema = z
  .object({
    employerType: z.enum(["company", "sole_proprietor"]),
    companyName: z.string().trim().min(1, "Обязательное поле"),
    inn: z.string().trim().min(1, "Обязательное поле"),
    website: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || /^https?:\/\//.test(value), "Укажите ссылку с http:// или https://"),
    socialLink: z
      .string()
      .trim()
      .min(1, "Обязательное поле")
      .refine((value) => /^https?:\/\//.test(value), "Укажите ссылку с http:// или https://"),
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
type InnVerificationStatus = "idle" | "verifying" | "verified" | "failed";

export function EmployerOnboardingPage() {
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [innVerificationStatus, setInnVerificationStatus] = useState<InnVerificationStatus>("idle");
  const [verifiedInnSnapshot, setVerifiedInnSnapshot] = useState<{
    employerType: EmployerOnboardingValues["employerType"];
    inn: string;
  } | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);

  const {
    clearErrors,
    control,
    getValues,
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EmployerOnboardingValues>({
    resolver: zodResolver(employerOnboardingSchema),
    defaultValues: {
      employerType: "company",
      companyName: "",
      inn: "",
      website: "",
      socialLink: "",
      confirmation: true,
    },
  });

  const selectedEmployerType = watch("employerType");
  const enteredInn = watch("inn");
  const innDigitsLimit = selectedEmployerType === "sole_proprietor" ? 10 : 12;
  const normalizedInn = enteredInn.replace(/\D/g, "");
  const currentUserQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    document.documentElement.classList.add("employer-onboarding-page-root");
    document.body.classList.add("employer-onboarding-page-root");

    return () => {
      document.documentElement.classList.remove("employer-onboarding-page-root");
      document.body.classList.remove("employer-onboarding-page-root");
    };
  }, []);

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

  const verifyInnMutation = useMutation({
    mutationFn: verifyEmployerInn,
    onMutate: () => {
      setInnVerificationStatus("verifying");
      clearErrors("inn");
    },
    onSuccess: () => {
      setInnVerificationStatus("verified");
      setVerifiedInnSnapshot({
        employerType: selectedEmployerType,
        inn: normalizedInn,
      });
      clearErrors("inn");
    },
    onError: (error: any) => {
      setInnVerificationStatus("failed");
      setVerifiedInnSnapshot(null);
      setError("inn", {
        type: "manual",
        message: error?.response?.data?.error?.message ?? "Не удалось проверить ИНН",
      });
    },
  });

  const handleOnboardingSubmit = (values: EmployerOnboardingValues) => {
    const currentUserEmail = currentUserQuery.data?.data?.user?.email?.trim();

    if (!currentUserEmail) {
      setApiError("Не удалось получить email текущего пользователя. Обновите страницу и попробуйте ещё раз.");
      return;
    }

    if (
      verifiedInnSnapshot?.inn !== values.inn.replace(/\D/g, "") ||
      verifiedInnSnapshot.employerType !== values.employerType
    ) {
      setError("inn", {
        type: "manual",
        message: "Дождитесь проверки ИНН перед отправкой формы",
      });
      return;
    }

    setApiError(null);
    onboardingMutation.mutate({
      employer_type: values.employerType,
      company_name: values.companyName.trim(),
      inn: values.inn.replace(/\D/g, ""),
      corporate_email: currentUserEmail,
      website: values.website?.trim() || undefined,
    });
  };

  const handleDocumentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0];
    setDocumentName(nextFile?.name ?? "");
  };

  const handleEmployerTypeChange = (nextEmployerType: EmployerOnboardingValues["employerType"]) => {
    const nextInnValue = getValues("inn")
      .replace(/\D/g, "")
      .slice(0, nextEmployerType === "sole_proprietor" ? 10 : 12);

    setValue("employerType", nextEmployerType, { shouldDirty: true });
    setValue("inn", nextInnValue, { shouldDirty: true });
    setInnVerificationStatus("idle");
    setVerifiedInnSnapshot(null);
    clearErrors("inn");
  };

  useEffect(() => {
    if (normalizedInn.length !== innDigitsLimit) {
      setInnVerificationStatus("idle");
      setVerifiedInnSnapshot(null);
      return;
    }

    if (
      verifiedInnSnapshot?.inn === normalizedInn &&
      verifiedInnSnapshot.employerType === selectedEmployerType
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      verifyInnMutation.mutate({
        employer_type: selectedEmployerType,
        inn: normalizedInn,
      });
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [innDigitsLimit, normalizedInn, selectedEmployerType, verifiedInnSnapshot, verifyInnMutation]);

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
                  Добавьте данные компании, и мы проверим их в течение часа. После этого профиль работодателя будет активирован.
                </p>
              </div>

              <form className="auth-form" onSubmit={handleSubmit(handleOnboardingSubmit)}>
                <div
                  className="auth-form__roles employer-onboarding-form__roles"
                  role="radiogroup"
                  aria-label="Тип работодателя"
                >
                  <label className="auth-form__role">
                    <Radio
                      name="employer-type"
                      variant="primary"
                      checked={selectedEmployerType === "company"}
                      onChange={() => handleEmployerTypeChange("company")}
                    />
                    <span className="auth-form__role-label">Компания</span>
                  </label>
                  <label className="auth-form__role">
                    <Radio
                      name="employer-type"
                      variant="primary"
                      checked={selectedEmployerType === "sole_proprietor"}
                      onChange={() => handleEmployerTypeChange("sole_proprietor")}
                    />
                    <span className="auth-form__role-label">ИП</span>
                  </label>
                </div>

                <div className="auth-form__fields employer-onboarding-form__fields">
                  <label className="auth-form__control employer-onboarding-form__control">
                    <span className="auth-form__label employer-onboarding-form__label">
                      Название компании <span className="employer-onboarding-form__required">*</span>
                    </span>
                    <Input
                      placeholder='Например: ООО "Трамплин"'
                      error={errors.companyName?.message}
                      clearable
                      {...register("companyName")}
                    />
                    {errors.companyName && (
                      <span className="auth-form__error">{errors.companyName.message}</span>
                    )}
                  </label>

                  <label className="auth-form__control employer-onboarding-form__control">
                    <span className="auth-form__label employer-onboarding-form__label">
                      ИНН <span className="employer-onboarding-form__required">*</span>
                    </span>
                    <div className="employer-onboarding-form__input-status">
                      <Input
                        placeholder={selectedEmployerType === "sole_proprietor" ? "10 цифр" : "12 цифр"}
                        inputMode="numeric"
                        maxLength={innDigitsLimit}
                        error={errors.inn?.message}
                        clearable={false}
                        className={
                          innVerificationStatus !== "idle"
                            ? "employer-onboarding-form__input employer-onboarding-form__input--with-status"
                            : "employer-onboarding-form__input"
                        }
                        {...register("inn", {
                          onChange: (event) => {
                            event.target.value = event.target.value
                              .replace(/\D/g, "")
                              .slice(0, innDigitsLimit);
                            setInnVerificationStatus("idle");
                            setVerifiedInnSnapshot(null);
                            clearErrors("inn");
                          },
                        })}
                      />
                      {innVerificationStatus === "verifying" ? (
                        <span
                          className="employer-onboarding-form__status employer-onboarding-form__status--loading"
                          aria-hidden="true"
                        />
                      ) : null}
                      {innVerificationStatus === "verified" ? (
                        <span
                          className="employer-onboarding-form__status employer-onboarding-form__status--verified"
                          aria-hidden="true"
                        />
                      ) : null}
                    </div>
                    {errors.inn && <span className="auth-form__error">{errors.inn.message}</span>}
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
                      {" "}
                      <span className="employer-onboarding-form__required">*</span>
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
                      {documentName ||
                        "Документы, подтверждающие связь с компанией."}
                    </span>
                    <svg
                      aria-hidden="true"
                      className="employer-onboarding-upload__icon"
                      viewBox="0 0 512 499"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M61.7045 499C44.4615 499 29.8667 493.028 17.92 481.085C5.97334 469.141 0 454.55 0 437.312V370.377C0 363.114 2.45191 357.034 7.35573 352.137C12.2539 347.235 18.3353 344.784 25.6 344.784C32.8647 344.784 38.9461 347.235 43.8443 352.137C48.7481 357.034 51.2 363.114 51.2 370.377V437.312C51.2 439.939 52.2951 442.345 54.4853 444.529C56.6699 446.719 59.0763 447.814 61.7045 447.814H450.295C452.924 447.814 455.33 446.719 457.515 444.529C459.705 442.345 460.8 439.939 460.8 437.312V370.377C460.8 363.114 463.252 357.034 468.156 352.137C473.054 347.235 479.135 344.784 486.4 344.784C493.665 344.784 499.746 347.235 504.644 352.137C509.548 357.034 512 363.114 512 370.377V437.312C512 454.55 506.027 469.141 494.08 481.085C482.133 493.028 467.539 499 450.295 499H61.7045ZM230.4 85.7032L164.762 151.324C159.681 156.397 153.654 158.903 146.679 158.84C139.699 158.772 133.561 156.09 128.265 150.795C123.321 145.506 120.761 139.514 120.585 132.82C120.408 126.126 122.968 120.132 128.265 114.837L234.402 8.72728C237.599 5.53097 240.97 3.27878 244.514 1.97068C248.058 0.656891 251.887 0 256 0C260.113 0 263.942 0.656891 267.486 1.97068C271.03 3.27878 274.401 5.53097 277.598 8.72728L383.736 114.837C388.81 119.91 391.316 125.851 391.253 132.658C391.185 139.46 388.679 145.506 383.736 150.795C378.439 156.09 372.358 158.826 365.491 159.002C358.619 159.179 352.535 156.619 347.238 151.324L281.6 85.7032V346.754C281.6 354.017 279.148 360.097 274.244 364.994C269.346 369.896 263.265 372.348 256 372.348C248.735 372.348 242.654 369.896 237.756 364.994C232.852 360.097 230.4 354.017 230.4 346.754V85.7032Z"
                        fill="currentColor"
                      />
                    </svg>
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

                <Button
                  type="submit"
                  fullWidth
                  loading={onboardingMutation.isPending || innVerificationStatus === "verifying"}
                >
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
