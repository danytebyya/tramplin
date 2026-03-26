import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";

import arrowIcon from "../../assets/icons/arrow.svg";
import { meRequest, performLogout, useAuthStore } from "../../features/auth";
import {
  EmployerVerificationDraftDocument,
  getEmployerVerificationDraft,
  upsertEmployerProfile,
  uploadEmployerVerificationDocuments,
  verifyEmployerInn,
} from "../../features/company-verification";
import { Button, Checkbox, Container, InfoTooltip, Input } from "../../shared/ui";
import "../auth/auth.css";
import "./employer-onboarding.css";

const employerOnboardingSchema = z
  .object({
    inn: z.string().trim().min(1, "Обязательное поле"),
    website: z
      .string()
      .trim()
      .optional()
      .refine((value) => !value || /^https?:\/\//.test(value), "Укажите ссылку с http:// или https://"),
    socialLink: z
      .string()
      .trim()
      .optional()
      .refine(
        (value) => !value || /^https?:\/\//.test(value),
        "Укажите ссылку с http:// или https://",
      ),
    phone: z.string().trim().min(1, "Обязательное поле"),
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

    if (![10, 12].includes(normalizedInn.length)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inn"],
        message: "ИНН должен содержать 10 или 12 цифр",
      });
    }
  });

type EmployerOnboardingValues = z.infer<typeof employerOnboardingSchema>;
type InnVerificationStatus = "idle" | "verifying" | "verified" | "failed";
type OnboardingStep = "verification" | "details";
type DocumentUploadStatus = "pending" | "uploading" | "ready";
type DocumentUploadItem = {
  key: string;
  source: "local" | "existing";
  documentId?: string;
  file?: File;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  status: DocumentUploadStatus;
  progress: number;
};
type VerifiedEmployerData = {
  employerType: "company" | "sole_proprietor";
  inn: string;
  fullName: string;
  subjectType: string;
  statusLabel: string;
  registrationDate: string;
  directorName: string;
};

function getInnLengthByEmployerType(employerType: "company" | "sole_proprietor") {
  return employerType === "sole_proprietor" ? 12 : 10;
}

function getInnPlaceholder(employerType: "company" | "sole_proprietor") {
  return employerType === "sole_proprietor"
    ? "Введите 12-значный ИНН физического лица"
    : "Введите 10-значный ИНН организации";
}

function getInnValidationMessage(employerType: "company" | "sole_proprietor") {
  return employerType === "sole_proprietor"
    ? "ИНН физического лица должен содержать 12 цифр"
    : "ИНН организации должен содержать 10 цифр";
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  const normalizedDigits =
    digits[0] === "7" || digits[0] === "8" ? `7${digits.slice(1, 11)}` : `7${digits.slice(0, 10)}`;
  const countryCode = normalizedDigits[0];
  const areaCode = normalizedDigits.slice(1, 4);
  const firstPart = normalizedDigits.slice(4, 7);
  const secondPart = normalizedDigits.slice(7, 9);
  const thirdPart = normalizedDigits.slice(9, 11);

  let formattedValue = `+${countryCode}`;

  if (areaCode) {
    formattedValue += ` (${areaCode}`;
  }

  if (areaCode.length === 3) {
    formattedValue += ")";
  }

  if (firstPart) {
    formattedValue += ` ${firstPart}`;
  }

  if (secondPart) {
    formattedValue += `-${secondPart}`;
  }

  if (thirdPart) {
    formattedValue += `-${thirdPart}`;
  }

  return formattedValue;
}

export function EmployerOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);
  const [apiError, setApiError] = useState<string | null>(null);
  const [documentFiles, setDocumentFiles] = useState<DocumentUploadItem[]>([]);
  const [deletedDocumentIds, setDeletedDocumentIds] = useState<string[]>([]);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [isDocumentDragActive, setIsDocumentDragActive] = useState(false);
  const [selectedEmployerType, setSelectedEmployerType] = useState<"company" | "sole_proprietor">(
    "company",
  );
  const [step, setStep] = useState<OnboardingStep>("verification");
  const [innVerificationStatus, setInnVerificationStatus] = useState<InnVerificationStatus>("idle");
  const [verifiedEmployerData, setVerifiedEmployerData] = useState<VerifiedEmployerData | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const documentDragDepthRef = useRef(0);
  const pendingInnRequestKeyRef = useRef<string | null>(null);
  const lastCheckedInnRequestKeyRef = useRef<string | null>(null);
  const verifyInnTimeoutRef = useRef<number | null>(null);
  const hasAppliedNotificationPrefillRef = useRef(false);
  const hasAppliedRejectedPrefillRef = useRef(false);
  const hasAppliedDraftPrefillRef = useRef(false);
  const shouldReturnHomeOnBackRef = useRef(false);

  const {
    clearErrors,
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors },
  } = useForm<EmployerOnboardingValues>({
    resolver: zodResolver(employerOnboardingSchema),
    defaultValues: {
      inn: "",
      website: "",
      socialLink: "",
      phone: "",
      confirmation: true,
    },
  });

  const enteredInn = watch("inn");
  const innDigitsLimit = getInnLengthByEmployerType(selectedEmployerType);
  const normalizedInn = enteredInn.replace(/\D/g, "");
  const isCurrentInnVerified = verifiedEmployerData?.inn === normalizedInn;
  const shouldShowInnStatus = innVerificationStatus === "verifying" || isCurrentInnVerified;
  const currentUserQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(accessToken),
    retry: false,
  });
  const verificationDraftQuery = useQuery({
    queryKey: ["companies", "verification-draft"],
    queryFn: getEmployerVerificationDraft,
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  });
  const notificationMode = searchParams.get("mode");
  const isChangesRequestedEntry = notificationMode === "changes-requested";
  const employerProfile = currentUserQuery.data?.data?.user?.employer_profile;
  const isRejectedEntry =
    notificationMode === "rejected" ||
    (employerProfile?.verification_status === "unverified" && Boolean(employerProfile?.moderator_comment));
  const rejectionReason = isRejectedEntry ? employerProfile?.moderator_comment?.trim() ?? "" : "";
  const verificationDraft = verificationDraftQuery.data?.data;

  useEffect(() => {
    document.documentElement.classList.add("employer-onboarding-page-root");
    document.body.classList.add("employer-onboarding-page-root");

    return () => {
      if (verifyInnTimeoutRef.current !== null) {
        window.clearTimeout(verifyInnTimeoutRef.current);
      }
      document.documentElement.classList.remove("employer-onboarding-page-root");
      document.body.classList.remove("employer-onboarding-page-root");
    };
  }, []);

  const resetInnVerificationState = () => {
    setInnVerificationStatus("idle");
    setVerifiedEmployerData(null);
    setStep("verification");
    pendingInnRequestKeyRef.current = null;
    lastCheckedInnRequestKeyRef.current = null;
  };

  const scheduleInnVerification = (
    inn: string,
    employerType: "company" | "sole_proprietor" = selectedEmployerType,
  ) => {
    const requestKey = `${employerType}:${inn}`;

    if (verifyInnTimeoutRef.current !== null) {
      window.clearTimeout(verifyInnTimeoutRef.current);
      verifyInnTimeoutRef.current = null;
    }

    if (inn.length !== getInnLengthByEmployerType(employerType)) {
      setInnVerificationStatus("idle");
      setVerifiedEmployerData(null);
      pendingInnRequestKeyRef.current = null;
      return;
    }

    if (verifiedEmployerData?.inn === inn) {
      setInnVerificationStatus("verified");
      return;
    }

    if (
      pendingInnRequestKeyRef.current === requestKey ||
      lastCheckedInnRequestKeyRef.current === requestKey
    ) {
      return;
    }

    verifyInnTimeoutRef.current = window.setTimeout(() => {
      verifyInnMutation.mutate({
        employer_type: employerType,
        inn,
      });
      verifyInnTimeoutRef.current = null;
    }, 350);
  };

  const onboardingMutation = useMutation({
    mutationFn: async (payload: {
      profile: Parameters<typeof upsertEmployerProfile>[0];
      documents: File[];
      verificationRequestId?: string;
      deletedDocumentIds?: string[];
      phone?: string;
      socialLink?: string;
    }) => {
      await upsertEmployerProfile(payload.profile);
      return uploadEmployerVerificationDocuments({
        files: payload.documents,
        verificationRequestId: payload.verificationRequestId,
        deletedDocumentIds: payload.deletedDocumentIds,
        phone: payload.phone,
        socialLink: payload.socialLink,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.invalidateQueries({ queryKey: ["companies", "verification-draft"] });
      await queryClient.refetchQueries({ queryKey: ["auth", "me"], type: "active" });
      navigate("/", { replace: true });
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
    onMutate: (variables) => {
      pendingInnRequestKeyRef.current = `${variables.employer_type ?? "unknown"}:${variables.inn}`;
      setInnVerificationStatus("verifying");
      clearErrors("inn");

      if (shouldReturnHomeOnBackRef.current) {
        setStep("details");
      }
    },
    onSuccess: (_data, variables) => {
      lastCheckedInnRequestKeyRef.current = `${variables.employer_type ?? "unknown"}:${variables.inn}`;
      pendingInnRequestKeyRef.current = null;
      setInnVerificationStatus("verified");
      setVerifiedEmployerData({
        employerType:
          _data?.data?.verification?.employer_type === "sole_proprietor"
            ? "sole_proprietor"
            : "company",
        inn: variables.inn,
        fullName:
          _data?.data?.verification?.full_name ||
          _data?.data?.verification?.name ||
          "Не указано",
        subjectType: _data?.data?.verification?.subject_type || "Не указано",
        statusLabel: _data?.data?.verification?.status_label || "Не указано",
        registrationDate: _data?.data?.verification?.registration_date || "Не указано",
        directorName: _data?.data?.verification?.director_name || "Не указано",
      });
      clearErrors("inn");
    },
    onError: (error: any, variables) => {
      lastCheckedInnRequestKeyRef.current = `${variables.employer_type ?? "unknown"}:${variables.inn}`;
      pendingInnRequestKeyRef.current = null;
      setInnVerificationStatus("failed");
      setVerifiedEmployerData(null);
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

    if (!verifiedEmployerData || verifiedEmployerData.inn !== values.inn.replace(/\D/g, "")) {
      setError("inn", {
        type: "manual",
        message: "Дождитесь проверки ИНН перед отправкой формы",
      });
      return;
    }

    if (documentFiles.length === 0) {
      setDocumentError("Загрузите хотя бы один документ");
      return;
    }

    setApiError(null);
    setDocumentError(null);
    setDocumentFiles((currentFiles) =>
      currentFiles.map((item) => ({
        ...item,
        status: item.source === "local" ? "uploading" : item.status,
        progress: item.source === "local" ? 1 : item.progress,
      })),
    );
    onboardingMutation.mutate({
      profile: {
        employer_type: verifiedEmployerData.employerType,
        company_name: verifiedEmployerData.fullName,
        inn: values.inn.replace(/\D/g, ""),
        corporate_email: currentUserEmail,
        website: values.website?.trim() || undefined,
        phone: values.phone.trim() || undefined,
        social_link: values.socialLink?.trim() || undefined,
      },
      documents: documentFiles.flatMap((item) => (item.source === "local" && item.file ? [item.file] : [])),
      verificationRequestId: verificationDraft?.verification_request_id ?? undefined,
      deletedDocumentIds,
      phone: values.phone.trim() || undefined,
      socialLink: values.socialLink?.trim() || undefined,
    });
  };

  const mergeDocumentFiles = (nextFiles: File[]) => {
    setDocumentFiles((currentFiles) => {
      const nextEntries = new Map(currentFiles.map((item) => [item.key, item]));

      nextFiles.forEach((file) => {
        const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
        if (!nextEntries.has(fileKey)) {
          nextEntries.set(fileKey, {
            key: fileKey,
            source: "local",
            file,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            status: "pending",
            progress: 0,
          });
        }
      });

      return Array.from(nextEntries.values());
    });
    setDocumentError(null);
  };

  const handleDocumentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files ?? []);
    if (nextFiles.length === 0) {
      return;
    }

    mergeDocumentFiles(nextFiles);
    event.target.value = "";
  };

  const handleDocumentDragEnter = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    documentDragDepthRef.current += 1;
    setIsDocumentDragActive(true);
  };

  const handleDocumentDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setIsDocumentDragActive(true);
  };

  const handleDocumentDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    documentDragDepthRef.current = Math.max(0, documentDragDepthRef.current - 1);

    if (documentDragDepthRef.current === 0) {
      setIsDocumentDragActive(false);
    }
  };

  const handleDocumentDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    documentDragDepthRef.current = 0;
    setIsDocumentDragActive(false);

    const nextFiles = Array.from(event.dataTransfer.files ?? []);
    if (nextFiles.length === 0) {
      return;
    }

    mergeDocumentFiles(nextFiles);
  };

  const handleDocumentRemove = (itemToRemove: DocumentUploadItem) => {
    if (itemToRemove.source === "existing" && itemToRemove.documentId) {
      setDeletedDocumentIds((currentIds) =>
        currentIds.includes(itemToRemove.documentId!) ? currentIds : [...currentIds, itemToRemove.documentId!],
      );
      setDocumentFiles((currentFiles) => currentFiles.filter((item) => item.key !== itemToRemove.key));
      setDocumentError(null);
      return;
    }

    setDocumentFiles((currentFiles) => currentFiles.filter((item) => item.key !== itemToRemove.key));
    setDocumentError(null);
  };

  const handleContinue = () => {
    if (!verifiedEmployerData || verifiedEmployerData.inn !== normalizedInn) {
      setError("inn", {
        type: "manual",
        message: "Сначала дождитесь успешной проверки ИНН",
      });
      return;
    }

    setStep("details");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    if (isRejectedEntry && step === "verification") {
      return;
    }

    if (shouldReturnHomeOnBackRef.current) {
      navigate("/", { replace: true });
      return;
    }

    if (step === "details") {
      setStep("verification");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    void performLogout({ redirectTo: "/login" });
  };

  useEffect(() => {
    const handleUploadProgress = (event: Event) => {
      const customEvent = event as CustomEvent<{ fileKey: string; progress: number }>;

      setDocumentFiles((currentFiles) =>
        currentFiles.map((item) =>
          item.key === customEvent.detail.fileKey
            ? {
                ...item,
                status: customEvent.detail.progress >= 100 ? "ready" : "uploading",
                progress: customEvent.detail.progress,
              }
            : item,
        ),
      );
    };

    window.addEventListener(
      "tramplin:employer-document-upload-progress",
      handleUploadProgress as EventListener,
    );

    return () => {
      window.removeEventListener(
        "tramplin:employer-document-upload-progress",
        handleUploadProgress as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (!verificationDraft || hasAppliedDraftPrefillRef.current) {
      return;
    }

    hasAppliedDraftPrefillRef.current = true;
    setValue("website", verificationDraft.website ?? "", { shouldDirty: false });
    setValue("phone", verificationDraft.phone ?? "", { shouldDirty: false });
    setValue("socialLink", verificationDraft.social_link ?? "", { shouldDirty: false });
    setDocumentError(null);

    setDocumentFiles((currentFiles) => {
      const localItems = currentFiles.filter((item) => item.source === "local");
      const existingItems = (verificationDraft.documents ?? []).map((document: EmployerVerificationDraftDocument) => ({
        key: `existing:${document.id}`,
        source: "existing" as const,
        documentId: document.id,
        fileName: document.file_name,
        fileSize: document.file_size,
        mimeType: document.mime_type,
        status: "ready" as const,
        progress: 100,
      }));
      return [...existingItems, ...localItems];
    });
  }, [setValue, verificationDraft]);

  useEffect(() => {
    if (!isChangesRequestedEntry || hasAppliedNotificationPrefillRef.current || !employerProfile) {
      return;
    }

    if (employerProfile.verification_status !== "changes_requested" || !employerProfile.inn) {
      return;
    }

    hasAppliedNotificationPrefillRef.current = true;
    shouldReturnHomeOnBackRef.current = true;

    const normalizedProfileInn = employerProfile.inn.replace(/\D/g, "");
    const employerType =
      employerProfile.employer_type === "sole_proprietor" ? "sole_proprietor" : "company";

    setSelectedEmployerType(employerType);
    setValue("inn", normalizedProfileInn, { shouldValidate: true, shouldDirty: false });
    clearErrors("inn");

    if (verifyInnTimeoutRef.current !== null) {
      window.clearTimeout(verifyInnTimeoutRef.current);
      verifyInnTimeoutRef.current = null;
    }

    verifyInnMutation.mutate({
      employer_type: employerType,
      inn: normalizedProfileInn,
    });
  }, [clearErrors, employerProfile, isChangesRequestedEntry, setValue, verifyInnMutation]);

  useEffect(() => {
    if (!isRejectedEntry || hasAppliedRejectedPrefillRef.current || !employerProfile?.inn) {
      return;
    }

    hasAppliedRejectedPrefillRef.current = true;

    const normalizedProfileInn = employerProfile.inn.replace(/\D/g, "");
    const employerType =
      employerProfile.employer_type === "sole_proprietor" ? "sole_proprietor" : "company";

    setSelectedEmployerType(employerType);
    setStep("verification");
    setInnVerificationStatus("idle");
    setVerifiedEmployerData(null);
    setValue("inn", normalizedProfileInn, { shouldValidate: true, shouldDirty: false });
    clearErrors("inn");
  }, [clearErrors, employerProfile, isRejectedEntry, setValue]);

  return (
    <main className="auth-page auth-page--verification employer-onboarding-page">
      <Container className="auth-page__content" variant="auth-page">
        <section className="auth-page__panel employer-onboarding-page__panel">
          <div className="auth-page__panel-content">
            <div className="auth-card auth-card--verification employer-onboarding-card">
                <div className="employer-onboarding-card__intro">
                  <div className="auth-card__header">
                    <div className="auth-verification-header employer-onboarding-card__header">
                    <button
                      type="button"
                      className="auth-verification-header__back"
                      aria-label="Назад"
                      onClick={handleBack}
                    >
                      <img
                        src={arrowIcon}
                        alt=""
                        className="auth-verification-header__back-icon"
                        aria-hidden="true"
                      />
                    </button>
                    <div className="auth-verification-header__content employer-onboarding-card__header-content">
                      <div className="employer-onboarding-card__title-spacer" aria-hidden="true" />
                      <h2 className="auth-verification-header__title employer-onboarding-card__title">
                        <span className="auth-verification-header__title-accent">Верификация</span>{" "}
                        работодателя
                      </h2>
                      <InfoTooltip
                        className="employer-onboarding-card__info"
                        text="Верификация подтверждает, что вы действительно представляете организацию. Это защищает соискателей от мошенников и повышает доверие к вашим публикациям. Проверка занимает 1-3 рабочих дня."
                      />
                    </div>
                  </div>
                </div>

                {rejectionReason ? (
                  <div className="employer-onboarding-card__rejection-note">
                    <span className="employer-onboarding-card__rejection-title">
                      Верификация отклонена
                    </span>
                    <span className="employer-onboarding-card__rejection-text">{rejectionReason}</span>
                  </div>
                ) : null}

                {step === "verification" ? (
                  <div
                    className={
                      selectedEmployerType === "sole_proprietor"
                        ? "segmented-switch segmented-switch--second-active"
                        : "segmented-switch"
                    }
                  >
                    <span className="segmented-switch__indicator" aria-hidden="true" />
                    <button
                      type="button"
                      className={
                        selectedEmployerType === "company"
                          ? "segmented-switch__option segmented-switch__option--active"
                          : "segmented-switch__option"
                      }
                      onClick={() => {
                        if (selectedEmployerType === "company") {
                          return;
                        }

                        setSelectedEmployerType("company");
                        resetInnVerificationState();
                        clearErrors("inn");
                        if (normalizedInn) {
                          scheduleInnVerification(normalizedInn, "company");
                        }
                      }}
                    >
                      Организация
                    </button>
                    <button
                      type="button"
                      className={
                        selectedEmployerType === "sole_proprietor"
                          ? "segmented-switch__option segmented-switch__option--active"
                          : "segmented-switch__option"
                      }
                      onClick={() => {
                        if (selectedEmployerType === "sole_proprietor") {
                          return;
                        }

                        setSelectedEmployerType("sole_proprietor");
                        resetInnVerificationState();
                        clearErrors("inn");
                        if (normalizedInn) {
                          scheduleInnVerification(normalizedInn, "sole_proprietor");
                        }
                      }}
                    >
                      Физическое лицо
                    </button>
                  </div>
                ) : null}
              </div>

              <form className="auth-form" onSubmit={handleSubmit(handleOnboardingSubmit)}>
                {step === "verification" ? (
                  <div className="auth-form__fields employer-onboarding-form__fields">
                    <label className="auth-form__control employer-onboarding-form__control">
                      <span className="auth-form__label employer-onboarding-form__label">
                        ИНН <span className="employer-onboarding-form__required">*</span>
                      </span>
                      <div className="employer-onboarding-form__input-status">
                        <Input
                          placeholder={getInnPlaceholder(selectedEmployerType)}
                          inputMode="numeric"
                          maxLength={innDigitsLimit}
                          error={errors.inn?.message}
                          clearable={!shouldShowInnStatus}
                          className={
                            shouldShowInnStatus
                              ? "employer-onboarding-form__input employer-onboarding-form__input--with-status"
                              : "employer-onboarding-form__input"
                          }
                          {...register("inn", {
                            validate: (value) => {
                              const normalizedValue = value.replace(/\D/g, "");

                              if (!normalizedValue) {
                                return "Обязательное поле";
                              }

                              if (normalizedValue.length !== innDigitsLimit) {
                                return getInnValidationMessage(selectedEmployerType);
                              }

                              return true;
                            },
                            onChange: (event) => {
                              const nextInnValue = event.target.value
                                .replace(/\D/g, "")
                                .slice(0, innDigitsLimit);
                              event.target.value = nextInnValue;
                              resetInnVerificationState();
                              clearErrors("inn");
                              scheduleInnVerification(nextInnValue);
                            },
                          })}
                        />
                        {innVerificationStatus === "verifying" ? (
                          <span
                            className="employer-onboarding-form__status employer-onboarding-form__status--loading"
                            aria-hidden="true"
                          >
                            <span className="employer-onboarding-form__status-spinner" />
                          </span>
                        ) : null}
                        {isCurrentInnVerified ? (
                          <span
                            className="employer-onboarding-form__status employer-onboarding-form__status--verified"
                            aria-hidden="true"
                          >
                            <span className="employer-onboarding-form__status-check" />
                          </span>
                        ) : null}
                      </div>
                      {errors.inn && <span className="auth-form__error">{errors.inn.message}</span>}
                    </label>

                    {verifiedEmployerData ? (
                      <>
                        <label className="auth-form__control employer-onboarding-form__control">
                          <span className="auth-form__label employer-onboarding-form__label">
                            {selectedEmployerType === "sole_proprietor"
                              ? "ФИО физического лица"
                              : "Полное наименование организации"}
                          </span>
                          <Input value={verifiedEmployerData.fullName} disabled />
                        </label>

                        <label className="auth-form__control employer-onboarding-form__control">
                          <span className="auth-form__label employer-onboarding-form__label">
                            Тип субъекта
                          </span>
                          <Input value={verifiedEmployerData.subjectType} disabled />
                        </label>

                        <label className="auth-form__control employer-onboarding-form__control">
                          <span className="auth-form__label employer-onboarding-form__label">
                            Статус
                          </span>
                          <Input value={verifiedEmployerData.statusLabel} disabled />
                        </label>

                        <label className="auth-form__control employer-onboarding-form__control">
                          <span className="auth-form__label employer-onboarding-form__label">
                            Дата регистрации
                          </span>
                          <Input value={verifiedEmployerData.registrationDate} disabled />
                        </label>

                        <label className="auth-form__control employer-onboarding-form__control">
                          <span className="auth-form__label employer-onboarding-form__label">
                            ФИО руководителя
                          </span>
                          <Input value={verifiedEmployerData.directorName} disabled />
                        </label>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {step === "verification" && verifiedEmployerData ? (
                  <Button
                    type="button"
                    fullWidth
                    onClick={handleContinue}
                  >
                    Продолжить
                  </Button>
                ) : null}

                {step === "details" ? (
                  <>
                    <div className="auth-form__fields employer-onboarding-form__fields">
                      {verifiedEmployerData ? (
                        <label className="auth-form__control employer-onboarding-form__control">
                          <span className="auth-form__label employer-onboarding-form__label">
                            {selectedEmployerType === "sole_proprietor"
                              ? "ФИО физического лица"
                              : "Наименование компании"}
                          </span>
                          <Input value={verifiedEmployerData.fullName} disabled />
                        </label>
                      ) : null}

                      <label className="auth-form__control employer-onboarding-form__control">
                        <span className="auth-form__label employer-onboarding-form__label">
                          Сайт организации
                        </span>
                        <Input
                          placeholder="https://tramplin.ru"
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
                          placeholder="https://max.chat/tramplin"
                          error={errors.socialLink?.message}
                          clearable
                          {...register("socialLink")}
                        />
                        {errors.socialLink && (
                          <span className="auth-form__error">{errors.socialLink.message}</span>
                        )}
                      </label>

                      <label className="auth-form__control employer-onboarding-form__control">
                        <span className="auth-form__label employer-onboarding-form__label">
                          Номер телефона <span className="employer-onboarding-form__required">*</span>
                        </span>
                        <Input
                          placeholder="+7 (999) 000-00-00"
                          inputMode="tel"
                          error={errors.phone?.message}
                          clearable
                          {...register("phone", {
                            onChange: (event) => {
                              event.target.value = formatPhoneNumber(event.target.value);
                            },
                          })}
                        />
                        {errors.phone && (
                          <span className="auth-form__error">{errors.phone.message}</span>
                        )}
                      </label>

                      <div className="employer-onboarding-upload">
                        <div className="employer-onboarding-upload__guide">
                          <span className="auth-form__label employer-onboarding-form__label">
                            Загрузите документы <span className="employer-onboarding-form__required">*</span>
                          </span>
                          <ul className="employer-onboarding-upload__guide-list">
                            <li>Выписка из ЕГРЮЛ (или ИНН и ОГРН)</li>
                            <li>
                              <span>Письмо на бланке компании с подписью руководителя</span>
                              <InfoTooltip
                                className="employer-onboarding-upload__guide-tooltip"
                                text="Официальное письмо от руководителя компании, подтверждающее, что сотрудник имеет право работать с платформой."
                              />
                            </li>
                          </ul>
                          <p className="employer-onboarding-upload__guide-section">
                            Если Вы директор компании:
                          </p>
                          <ul className="employer-onboarding-upload__guide-list">
                            <li>
                              <span>Приказ о назначении или протокол учредителей</span>
                              <InfoTooltip
                                className="employer-onboarding-upload__guide-tooltip"
                                text="Приказ о назначении - документ, подтверждающий, что человек действительно является директором компании. Протокол учредителей - официальное решение владельцев компании о назначении директора."
                              />
                            </li>
                          </ul>
                          <p className="employer-onboarding-upload__guide-section">
                            Если Вы сотрудник:
                          </p>
                          <ul className="employer-onboarding-upload__guide-list">
                            <li>
                              <span>Доверенность от руководителя</span>
                              <InfoTooltip
                                className="employer-onboarding-upload__guide-tooltip"
                                text="Доверенность - документ, дающий право сотруднику действовать от имени компании."
                              />
                            </li>
                          </ul>
                        </div>
                        <input
                          ref={documentInputRef}
                          className="employer-onboarding-upload__input"
                          type="file"
                          multiple
                          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                          onChange={handleDocumentChange}
                        />
                        <button
                          type="button"
                          className={
                            isDocumentDragActive
                              ? "employer-onboarding-upload__dropzone employer-onboarding-upload__dropzone--active"
                              : "employer-onboarding-upload__dropzone"
                          }
                          onClick={() => documentInputRef.current?.click()}
                          onDragEnter={handleDocumentDragEnter}
                          onDragOver={handleDocumentDragOver}
                          onDragLeave={handleDocumentDragLeave}
                          onDrop={handleDocumentDrop}
                        >
                          <span className="employer-onboarding-upload__description">
                            Выберите или перетащите файлы
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
                        {documentFiles.length > 0 ? (
                          <div className="employer-onboarding-upload__files">
                            {documentFiles.map((item) => (
                              <div key={item.key} className="employer-onboarding-upload__file">
                                <div
                                  className={
                                    item.status === "uploading"
                                      ? "employer-onboarding-upload__file-icon employer-onboarding-upload__file-icon--uploading"
                                      : "employer-onboarding-upload__file-icon"
                                  }
                                  aria-hidden="true"
                                >
                                  <span
                                    className={
                                      item.status === "uploading"
                                        ? "employer-onboarding-upload__file-icon-spinner"
                                        : "employer-onboarding-upload__file-icon-mark"
                                    }
                                    style={
                                      item.status === "uploading"
                                        ? ({ "--upload-progress": `${item.progress}%` } as React.CSSProperties)
                                        : undefined
                                    }
                                  />
                                </div>
                                <div className="employer-onboarding-upload__file-body">
                                  <span className="employer-onboarding-upload__file-name">
                                    {item.fileName}
                                  </span>
                                  <span className="employer-onboarding-upload__file-type">
                                    {item.status === "uploading"
                                      ? "Загрузка..."
                                      : item.status === "pending"
                                        ? "Ожидает отправки"
                                        : item.mimeType || "Документ"}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="employer-onboarding-upload__file-remove"
                                  aria-label={`Удалить файл ${item.fileName}`}
                                  onClick={() => handleDocumentRemove(item)}
                                  disabled={onboardingMutation.isPending}
                                >
                                  <span
                                    className="employer-onboarding-upload__file-remove-icon"
                                    aria-hidden="true"
                                  />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {documentError ? <span className="auth-form__error">{documentError}</span> : null}
                      </div>
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
                  </>
                ) : null}
              </form>
            </div>
          </div>
        </section>
      </Container>
    </main>
  );
}
