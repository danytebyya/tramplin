import { MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { renderAsync } from "docx-preview";
import { getDocument, GlobalWorkerOptions, VerbosityLevel } from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import { Link, NavLink, Navigate, useNavigate } from "react-router-dom";

import arrowIcon from "../../assets/icons/arrow.svg";
import {
  getModerationAccessState,
  meRequest,
  performLogout,
  useAuthStore,
} from "../../features/auth";
import {
  approveEmployerVerificationRequest,
  EmployerVerificationRequestItem,
  EmployerVerificationRequestListResponse,
  EmployerVerificationRequestStatus,
  listEmployerVerificationRequestsRequest,
  rejectEmployerVerificationRequest,
  requestEmployerVerificationChanges,
} from "../../features/moderation";
import { apiClient } from "../../shared/api/client";
import { env } from "../../shared/config/env";
import { abbreviateLegalEntityName } from "../../shared/lib/legal-entity";
import { Button, Checkbox, Container, Input, Radio, Status } from "../../shared/ui";
import { Footer } from "../../widgets/footer";
import { buildModerationProfileMenuItems, CuratorHeaderNavigation, Header } from "../../widgets/header";
import "./employer-verification.css";

type VerificationStatusFilter = "all" | EmployerVerificationRequestStatus;
type VerificationPeriodFilter = "all" | "today" | "week" | "month";
type VerificationSortField = "date" | "alphabet";
type VerificationSortDirection = "asc" | "desc";

const PAGE_SIZE = 10;
const SKELETON_ROW_COUNT = 5;
const statusOptions: Array<{ value: EmployerVerificationRequestStatus; label: string }> = [
  { value: "pending", label: "На рассмотрении" },
  { value: "approved", label: "Одобрено" },
  { value: "rejected", label: "Отклонена" },
  { value: "suspended", label: "Запрос информации" },
];

const periodOptions: Array<{ value: VerificationPeriodFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "today", label: "За сегодня" },
  { value: "week", label: "За неделю" },
  { value: "month", label: "За месяц" },
];

const sortFieldOptions: Array<{ value: VerificationSortField; label: string }> = [
  { value: "date", label: "По дате" },
  { value: "alphabet", label: "По алфавиту" },
];

const EMPTY_VERIFICATION_ITEMS: EmployerVerificationRequestItem[] = [];

function easeOutQuad(value: number) {
  return 1 - (1 - value) * (1 - value);
}

function resolveStatusMeta(status: EmployerVerificationRequestStatus) {
  if (status === "approved") {
    return { label: "Одобрено", variant: "approved" as const };
  }

  if (status === "rejected") {
    return { label: "Отклонена", variant: "rejected" as const };
  }

  if (status === "suspended") {
    return { label: "Запрос информации", variant: "info-request" as const };
  }

  return { label: "На рассмотрении", variant: "pending-review" as const };
}

function resolveEmployerTypeLabel(value: string) {
  if (value === "company") {
    return "Компания";
  }

  if (value === "individual_entrepreneur") {
    return "ИП";
  }

  return "Работодатель";
}

function formatSubmissionDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

function formatFileSize(value: number) {
  if (value <= 0) {
    return "0 МБ";
  }

  const sizeInMb = value / (1024 * 1024);
  return `${sizeInMb.toFixed(1).replace(".", ",")} МБ`;
}

function hasSelectedText() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.getSelection()?.toString().trim());
}

function stopCheckboxEvent(event: ReactMouseEvent<HTMLInputElement>) {
  event.stopPropagation();
}

function isImageDocument(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isPdfDocument(mimeType: string, fileName: string) {
  return mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

function isDocxDocument(mimeType: string, fileName: string) {
  return (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".docx")
  );
}

function resolveDocumentUrl(fileUrl: string | null) {
  if (!fileUrl) {
    return null;
  }

  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://") || fileUrl.startsWith("blob:")) {
    return fileUrl;
  }

  if (fileUrl.startsWith("/")) {
    return `${env.apiBaseUrl.replace(/\/api\/v1$/, "")}${fileUrl}`;
  }

  return fileUrl;
}

GlobalWorkerOptions.workerPort = new PdfWorker();

type DocumentPreviewProps = {
  fileName: string;
  blobUrl: string | null;
  fileBlob: Blob | null;
  mimeType: string;
  unavailable?: boolean;
};

function DocumentPreview({
  fileName,
  blobUrl,
  fileBlob,
  mimeType,
  unavailable = false,
}: DocumentPreviewProps) {
  const DOCX_PREVIEW_CLASS = "docx-preview-thumb";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docxHostRef = useRef<HTMLDivElement | null>(null);
  const docxStageRef = useRef<HTMLDivElement | null>(null);
  const [pdfPreviewFailed, setPdfPreviewFailed] = useState(false);
  const [docxPreviewFailed, setDocxPreviewFailed] = useState(false);

  useEffect(() => {
    if (!blobUrl || !isPdfDocument(mimeType, fileName) || !canvasRef.current) {
      return;
    }

    let cancelled = false;
    const canvas = canvasRef.current;
    setPdfPreviewFailed(false);

    void (async () => {
      try {
        const loadingTask = getDocument({
          url: blobUrl,
          verbosity: VerbosityLevel.ERRORS,
          disableFontFace: true,
          useSystemFonts: false,
        });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const targetWidth = canvas.parentElement?.clientWidth ?? 60;
        const targetHeight = canvas.parentElement?.clientHeight ?? 85;
        const scale = Math.min(targetWidth / viewport.width, targetHeight / viewport.height, 1);
        const scaledViewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");

        if (!context || cancelled) {
          return;
        }

        canvas.width = Math.ceil(scaledViewport.width);
        canvas.height = Math.ceil(scaledViewport.height);

        await page.render({
          canvas,
          canvasContext: context,
          viewport: scaledViewport,
        }).promise;
      } catch {
        if (!cancelled) {
          setPdfPreviewFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blobUrl, fileName, mimeType]);

  useEffect(() => {
    if (!fileBlob || !isDocxDocument(mimeType, fileName) || !docxHostRef.current || !docxStageRef.current) {
      return;
    }

    let cancelled = false;
    const host = docxHostRef.current;
    const stage = docxStageRef.current;
    stage.innerHTML = "";
    stage.style.transform = "";
    stage.style.width = "";
    stage.style.height = "";
    stage.style.opacity = "0";
    setDocxPreviewFailed(false);

    void (async () => {
      try {
        await renderAsync(fileBlob, stage, undefined, {
          className: DOCX_PREVIEW_CLASS,
          inWrapper: false,
          hideWrapperOnPrint: true,
          breakPages: false,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: true,
          renderHeaders: false,
          renderFooters: false,
          renderFootnotes: false,
          renderEndnotes: false,
          useBase64URL: true,
        });

        if (cancelled) {
          return;
        }

        let previousWidth = 0;
        let previousHeight = 0;
        for (let frame = 0; frame < 4; frame += 1) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          });

          const renderedNode =
            (stage.querySelector(`section.${DOCX_PREVIEW_CLASS}`) as HTMLElement | null) ??
            (stage.querySelector(`.${DOCX_PREVIEW_CLASS}`) as HTMLElement | null) ??
            (stage.firstElementChild as HTMLElement | null);

          if (!renderedNode) {
            continue;
          }

          const nextWidth =
            renderedNode.offsetWidth ||
            renderedNode.scrollWidth ||
            renderedNode.getBoundingClientRect().width;
          const nextHeight =
            renderedNode.offsetHeight ||
            renderedNode.scrollHeight ||
            renderedNode.getBoundingClientRect().height;

          if (
            nextWidth > 0 &&
            nextHeight > 0 &&
            Math.abs(nextWidth - previousWidth) < 1 &&
            Math.abs(nextHeight - previousHeight) < 1
          ) {
            break;
          }

          previousWidth = nextWidth;
          previousHeight = nextHeight;
        }

        const renderedNode =
          (stage.querySelector(`section.${DOCX_PREVIEW_CLASS}`) as HTMLElement | null) ??
          (stage.querySelector(`.${DOCX_PREVIEW_CLASS}`) as HTMLElement | null) ??
          (stage.firstElementChild as HTMLElement | null);

        if (!renderedNode) {
          setDocxPreviewFailed(true);
          return;
        }

        Array.from(stage.children).forEach((child, index) => {
          if (index > 0) {
            (child as HTMLElement).style.display = "none";
          }
        });

        const contentWidth =
          renderedNode.offsetWidth ||
          renderedNode.scrollWidth ||
          renderedNode.getBoundingClientRect().width;
        const contentHeight =
          renderedNode.offsetHeight ||
          renderedNode.scrollHeight ||
          renderedNode.getBoundingClientRect().height;
        const availableWidth = host.clientWidth || 60;
        const availableHeight = host.clientHeight || 85;

        if (!contentWidth || !contentHeight) {
          setDocxPreviewFailed(true);
          return;
        }

        const scale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight, 1);
        stage.style.width = `${contentWidth}px`;
        stage.style.height = `${contentHeight}px`;
        stage.style.transform = `scale(${scale})`;
        stage.style.opacity = "1";
      } catch {
        if (!cancelled) {
          setDocxPreviewFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (stage) {
        stage.innerHTML = "";
      }
    };
  }, [fileBlob, fileName, mimeType]);

  if (blobUrl && isImageDocument(mimeType)) {
    return (
      <img
        src={blobUrl}
        alt={fileName}
        className="company-review-page__document-preview-image"
      />
    );
  }

  if (blobUrl && isPdfDocument(mimeType, fileName) && !pdfPreviewFailed) {
    return <canvas ref={canvasRef} className="company-review-page__document-preview-canvas" />;
  }

  if (fileBlob && isDocxDocument(mimeType, fileName) && !docxPreviewFailed) {
    return (
      <div ref={docxHostRef} className="company-review-page__document-preview-docx-host">
        <div ref={docxStageRef} className="company-review-page__document-preview-docx-stage" />
      </div>
    );
  }

  return (
    <span className="company-review-page__document-preview-fallback">
      {unavailable
        ? isPdfDocument(mimeType, fileName)
          ? "PDF"
          : isDocxDocument(mimeType, fileName)
            ? "DOCX"
          : fileName.split(".").pop()?.toUpperCase() ?? "FILE"
        : isPdfDocument(mimeType, fileName)
          ? "PDF"
          : isDocxDocument(mimeType, fileName)
            ? "DOCX"
          : fileName.split(".").pop()?.toUpperCase() ?? "FILE"}
    </span>
  );
}

type VerificationDocumentCardProps = {
  fileName: string;
  fileUrl: string | null;
  mimeType: string;
  fileSize: number;
};

function VerificationDocumentCard({
  fileName,
  fileUrl,
  mimeType,
  fileSize,
}: VerificationDocumentCardProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const resolvedFileUrl = resolveDocumentUrl(fileUrl);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!resolvedFileUrl) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setBlobUrl(null);
      setFileBlob(null);
      setIsUnavailable(true);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    setBlobUrl(null);
    setFileBlob(null);
    setIsUnavailable(false);
    setIsLoading(true);

    void (async () => {
      try {
    const response = await apiClient.get<Blob>(resolvedFileUrl, {
          responseType: "blob",
        });

        if (cancelled) {
          return;
        }

        const normalizedMimeType =
          response.data.type ||
          (fileName.toLowerCase().endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : mimeType);
        const normalizedBlob =
          normalizedMimeType && normalizedMimeType !== response.data.type
            ? response.data.slice(0, response.data.size, normalizedMimeType)
            : response.data;

        const nextObjectUrl = URL.createObjectURL(normalizedBlob);

        if (cancelled) {
          URL.revokeObjectURL(nextObjectUrl);
          return;
        }

        const previousObjectUrl = objectUrlRef.current;
        objectUrlRef.current = nextObjectUrl;
        setFileBlob(normalizedBlob);
        setBlobUrl(nextObjectUrl);
        setIsLoading(false);

        if (previousObjectUrl) {
          window.setTimeout(() => {
            URL.revokeObjectURL(previousObjectUrl);
          }, 0);
        }
      } catch {
        if (!cancelled) {
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
          }
          setFileBlob(null);
          setBlobUrl(null);
          setIsUnavailable(true);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileName, mimeType, resolvedFileUrl]);

  const content = (
    <>
      <div className="company-review-page__document-preview">
        <DocumentPreview
          fileName={fileName}
          blobUrl={blobUrl}
          fileBlob={fileBlob}
          mimeType={mimeType}
          unavailable={isUnavailable}
        />
      </div>
      <div className="company-review-page__document-meta">
        <span className="company-review-page__document-name">{fileName}</span>
        <span className="company-review-page__document-size">
          ({formatFileSize(fileSize)})
        </span>
        {isLoading ? (
          <span className="company-review-page__document-caption">Загрузка предпросмотра...</span>
        ) : null}
        {isUnavailable ? (
          <span className="company-review-page__document-unavailable">Файл недоступен</span>
        ) : null}
      </div>
    </>
  );

  if (!blobUrl || isUnavailable) {
    return <div className="company-review-page__document company-review-page__document--disabled">{content}</div>;
  }

  return (
    <a
      href={blobUrl}
      download={fileName}
      className="company-review-page__document"
    >
      {content}
    </a>
  );
}

function buildPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, "ellipsis", totalPages] as const;
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 2, totalPages - 1, totalPages] as const;
  }

  return [1, currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages] as const;
}

function EmployerVerificationRowSkeleton() {
  return (
    <article className="company-review-page__request company-review-page__request--skeleton" aria-hidden="true">
      <div className="company-review-page__request-summary">
        <div className="company-review-page__request-select" />
        <div className="company-review-page__request-overview">
          <div className="company-review-page__request-company">
            <span className="company-review-page__skeleton company-review-page__skeleton--title" />
          </div>
          <span className="company-review-page__skeleton company-review-page__skeleton--cell" />
          <span className="company-review-page__skeleton company-review-page__skeleton--cell" />
          <span className="company-review-page__skeleton company-review-page__skeleton--cell" />
        </div>
      </div>
    </article>
  );
}

export function EmployerVerificationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.role);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const moderationAccess = getModerationAccessState(role);
  const isAdmin = role === "admin";
  const isModerationRole = moderationAccess.isModerationRole;
  const canAccessEmployerVerification = moderationAccess.canAccessEmployerVerification;
  const themeRole = role === "admin" ? "admin" : "curator";
  const isAuthenticated = Boolean(accessToken || refreshToken);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const filtersRef = useRef<HTMLDivElement | null>(null);
  const sortingRef = useRef<HTMLDivElement | null>(null);
  const profileMenuCloseTimeoutRef = useRef<number | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isProfileMenuPinned, setIsProfileMenuPinned] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<VerificationStatusFilter[]>(["all"]);
  const [appliedStatuses, setAppliedStatuses] = useState<VerificationStatusFilter[]>(["all"]);
  const [selectedPeriod, setSelectedPeriod] = useState<VerificationPeriodFilter>("all");
  const [appliedPeriod, setAppliedPeriod] = useState<VerificationPeriodFilter>("all");
  const [page, setPage] = useState(1);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [selectedSortField, setSelectedSortField] = useState<VerificationSortField>("date");
  const [appliedSortField, setAppliedSortField] = useState<VerificationSortField>("date");
  const [selectedSortDirection, setSelectedSortDirection] = useState<VerificationSortDirection>("desc");
  const [appliedSortDirection, setAppliedSortDirection] = useState<VerificationSortDirection>("desc");
  const [moderatorComment, setModeratorComment] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const verificationRequestsQueryKey = [
    "moderation",
    "employer-verification-requests",
    appliedSearch,
    appliedStatuses,
    appliedPeriod,
    page,
  ] as const;

  const { data: meData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: meRequest,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const verificationRequestsQuery = useQuery({
    queryKey: verificationRequestsQueryKey,
    queryFn: () =>
      listEmployerVerificationRequestsRequest({
        search: appliedSearch,
        statuses:
          appliedStatuses.includes("all")
            ? []
            : Array.from(
                new Set(
                  (appliedStatuses as EmployerVerificationRequestStatus[]).flatMap((status) =>
                    status === "pending" ? ["pending", "under_review"] : [status],
                  ),
                ),
              ),
        period: appliedPeriod,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: isAuthenticated && canAccessEmployerVerification,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    const normalizedSearch = search.trim();
    if (normalizedSearch === appliedSearch) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAppliedSearch(normalizedSearch);
      setSelectedIds([]);
      setExpandedRequestId(null);
      setPage(1);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [appliedSearch, search]);

  const handleMutationSuccess = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["moderation", "dashboard"],
    });
    setExpandedRequestId(null);
    setModeratorComment("");
  };

  const handleMutationError = (error: any) => {
    setReviewError(
      error?.response?.data?.error?.message ??
        "Не удалось выполнить действие по заявке. Попробуйте ещё раз.",
    );
  };

  const applyOptimisticReviewUpdate = (
    requestId: string,
    nextStatus: EmployerVerificationRequestStatus,
  ) => {
    queryClient.setQueryData<EmployerVerificationRequestListResponse | undefined>(
      verificationRequestsQueryKey,
      (current) => {
        const currentItems = current?.data?.items;
        if (!currentItems) {
          return current;
        }

        return {
          ...current,
          data: {
            ...current.data,
            items: currentItems.map((item) =>
              item.id === requestId
                ? {
                    ...item,
                    status: nextStatus,
                  }
                : item,
            ),
          },
        };
      },
    );
    setExpandedRequestId((current) => (current === requestId ? null : current));
    setModeratorComment("");
    setSelectedIds((current) => current.filter((item) => item !== requestId));
  };

  const createReviewMutationHandlers = (
    nextStatus: EmployerVerificationRequestStatus,
  ) => ({
    onMutate: async ({ requestId }: { requestId: string; comment: string }) => {
      setReviewError(null);
      await queryClient.cancelQueries({
        queryKey: verificationRequestsQueryKey,
      });
      const previousData =
        queryClient.getQueryData<EmployerVerificationRequestListResponse | undefined>(
          verificationRequestsQueryKey,
        );
      applyOptimisticReviewUpdate(requestId, nextStatus);
      return { previousData };
    },
    onSuccess: handleMutationSuccess,
    onError: (
      error: unknown,
      _variables: { requestId: string; comment: string },
      context: { previousData?: EmployerVerificationRequestListResponse } | undefined,
    ) => {
      if (context?.previousData) {
        queryClient.setQueryData(verificationRequestsQueryKey, context.previousData);
      }
      handleMutationError(error);
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ requestId, comment }: { requestId: string; comment: string }) =>
      approveEmployerVerificationRequest(requestId, { moderator_comment: comment || null }),
    ...createReviewMutationHandlers("approved"),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ requestId, comment }: { requestId: string; comment: string }) =>
      rejectEmployerVerificationRequest(requestId, { moderator_comment: comment || null }),
    ...createReviewMutationHandlers("rejected"),
  });

  const requestChangesMutation = useMutation({
    mutationFn: ({ requestId, comment }: { requestId: string; comment: string }) =>
      requestEmployerVerificationChanges(requestId, { moderator_comment: comment || null }),
    ...createReviewMutationHandlers("suspended"),
  });

  const bulkActionMutation = useMutation({
    mutationFn: async ({
      action,
      requestIds,
    }: {
      action: "request-changes" | "reject" | "approve";
      requestIds: string[];
    }) => {
      if (action === "request-changes") {
        await Promise.all(
          requestIds.map((requestId) =>
            requestEmployerVerificationChanges(requestId, { moderator_comment: null }),
          ),
        );
        return;
      }

      if (action === "reject") {
        await Promise.all(
          requestIds.map((requestId) =>
            rejectEmployerVerificationRequest(requestId, { moderator_comment: null }),
          ),
        );
        return;
      }

      await Promise.all(
        requestIds.map((requestId) =>
          approveEmployerVerificationRequest(requestId, { moderator_comment: null }),
        ),
      );
    },
    onMutate: async ({
      action,
      requestIds,
    }: {
      action: "request-changes" | "reject" | "approve";
      requestIds: string[];
    }) => {
      setReviewError(null);
      await queryClient.cancelQueries({
        queryKey: verificationRequestsQueryKey,
      });
      const previousData =
        queryClient.getQueryData<EmployerVerificationRequestListResponse | undefined>(
          verificationRequestsQueryKey,
        );
      const nextStatus: EmployerVerificationRequestStatus =
        action === "approve" ? "approved" : action === "reject" ? "rejected" : "suspended";

      queryClient.setQueryData<EmployerVerificationRequestListResponse | undefined>(
        verificationRequestsQueryKey,
        (current) => {
          const currentItems = current?.data?.items;
          if (!currentItems) {
            return current;
          }

          return {
            ...current,
            data: {
              ...current.data,
              items: currentItems.map((item) =>
                requestIds.includes(item.id)
                  ? {
                      ...item,
                      status: nextStatus,
                    }
                  : item,
              ),
            },
          };
        },
      );

      return { previousData };
    },
    onSuccess: async () => {
      await handleMutationSuccess();
      setSelectedIds([]);
    },
    onError: (
      error,
      _variables,
      context: { previousData?: EmployerVerificationRequestListResponse } | undefined,
    ) => {
      if (context?.previousData) {
        queryClient.setQueryData(verificationRequestsQueryKey, context.previousData);
      }
      handleMutationError(error);
    },
  });

  const user = meData?.data?.user;
  const items = verificationRequestsQuery.data?.data?.items ?? EMPTY_VERIFICATION_ITEMS;
  const sortedItems = useMemo(() => {
    return [...items].sort((left, right) => {
      if (appliedSortField === "alphabet") {
        const comparison = abbreviateLegalEntityName(left.employer_name).localeCompare(
          abbreviateLegalEntityName(right.employer_name),
          "ru",
        );
        return appliedSortDirection === "asc" ? comparison : -comparison;
      }

      const leftTime = new Date(left.submitted_at).getTime();
      const rightTime = new Date(right.submitted_at).getTime();
      return appliedSortDirection === "desc" ? rightTime - leftTime : leftTime - rightTime;
    });
  }, [appliedSortDirection, appliedSortField, items]);
  const total = verificationRequestsQuery.data?.data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const pageNumbers = buildPageNumbers(page, totalPages);
  const selectableItems = useMemo(
    () => sortedItems.filter((item) => item.status === "pending" || item.status === "suspended"),
    [sortedItems],
  );
  const allRowsSelected =
    selectableItems.length > 0 && selectableItems.every((item) => selectedIds.includes(item.id));
  const currentExpandedItem = sortedItems.find((item) => item.id === expandedRequestId) ?? null;
  const selectedRequests = useMemo(() => {
    const selectedIdSet = new Set(selectedIds);
    return sortedItems.filter((item) => selectedIdSet.has(item.id));
  }, [selectedIds, sortedItems]);
  const hasAppliedFilters =
    appliedSearch.length > 0 ||
    !appliedStatuses.includes("all") ||
    appliedPeriod !== "all";
  const anyMutationPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    requestChangesMutation.isPending ||
    bulkActionMutation.isPending;
  const isBulkRequestChangesDisabled =
    anyMutationPending || selectedRequests.some((item) => item.status === "suspended");
  const isBulkRejectDisabled =
    anyMutationPending || selectedRequests.some((item) => item.status === "rejected");
  const isBulkApproveDisabled =
    anyMutationPending || selectedRequests.some((item) => item.status === "approved");
  const isTableLoading = verificationRequestsQuery.isPending;

  if (!canAccessEmployerVerification) {
    return <Navigate to={isModerationRole ? "/moderation/content" : "/"} replace />;
  }

  const clearProfileMenuCloseTimeout = () => {
    if (profileMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(profileMenuCloseTimeoutRef.current);
      profileMenuCloseTimeoutRef.current = null;
    }
  };

  const openProfileMenu = () => {
    clearProfileMenuCloseTimeout();
    setIsProfileMenuOpen(true);
  };

  const scheduleProfileMenuClose = () => {
    if (isProfileMenuPinned) {
      return;
    }

    clearProfileMenuCloseTimeout();
    profileMenuCloseTimeoutRef.current = window.setTimeout(() => {
      setIsProfileMenuOpen(false);
      profileMenuCloseTimeoutRef.current = null;
    }, 40);
  };

  const handleLogout = () => {
    void performLogout({
      beforeRedirect: () => {
        setIsProfileMenuPinned(false);
        setIsProfileMenuOpen(false);
      },
    });
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileMenuPinned(false);
        setIsProfileMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileMenuPinned(false);
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isProfileMenuOpen]);

  useEffect(() => {
    if (!isFilterOpen && !isSortOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (isFilterOpen && !filtersRef.current?.contains(target)) {
        setIsFilterOpen(false);
      }

      if (isSortOpen && !sortingRef.current?.contains(target)) {
        setIsSortOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFilterOpen(false);
        setIsSortOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isFilterOpen, isSortOpen]);

  useEffect(() => {
    if (!isFilterOpen) {
      return;
    }

    let scrollAnimationFrameId = 0;
    const frameId = window.requestAnimationFrame(() => {
      const filtersElement = filtersRef.current;
      if (!filtersElement) {
        return;
      }

      const viewportPadding = 16;
      const rect = filtersElement.getBoundingClientRect();
      const startScrollY = window.scrollY;
      const targetScrollY = Math.max(startScrollY + rect.top - viewportPadding, 0);
      const distance = targetScrollY - startScrollY;

      if (Math.abs(distance) < 4) {
        return;
      }

      const duration = 620;
      const animationStart = window.performance.now();

      const animateScroll = (currentTime: number) => {
        const elapsed = currentTime - animationStart;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutQuad(progress);

        window.scrollTo({
          top: startScrollY + distance * easedProgress,
          behavior: "auto",
        });

        if (progress < 1) {
          scrollAnimationFrameId = window.requestAnimationFrame(animateScroll);
        }
      };

      scrollAnimationFrameId = window.requestAnimationFrame(animateScroll);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(scrollAnimationFrameId);
    };
  }, [isFilterOpen]);

  useEffect(() => {
    if (!isSortOpen) {
      return;
    }

    let scrollAnimationFrameId = 0;
    const frameId = window.requestAnimationFrame(() => {
      const sortingElement = sortingRef.current;
      if (!sortingElement) {
        return;
      }

      const viewportPadding = 16;
      const rect = sortingElement.getBoundingClientRect();
      const startScrollY = window.scrollY;
      const targetScrollY = Math.max(startScrollY + rect.top - viewportPadding, 0);
      const distance = targetScrollY - startScrollY;

      if (Math.abs(distance) < 4) {
        return;
      }

      const duration = 620;
      const animationStart = window.performance.now();

      const animateScroll = (currentTime: number) => {
        const elapsed = currentTime - animationStart;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutQuad(progress);

        window.scrollTo({
          top: startScrollY + distance * easedProgress,
          behavior: "auto",
        });

        if (progress < 1) {
          scrollAnimationFrameId = window.requestAnimationFrame(animateScroll);
        }
      };

      scrollAnimationFrameId = window.requestAnimationFrame(animateScroll);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(scrollAnimationFrameId);
    };
  }, [isSortOpen]);

  useEffect(() => () => {
    clearProfileMenuCloseTimeout();
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [verificationRequestsQuery.data?.data?.items, appliedSortDirection, appliedSortField]);

  const profileMenuItems = buildModerationProfileMenuItems(navigate);

  const applyFilters = () => {
    setAppliedSearch(search.trim());
    setAppliedStatuses(selectedStatuses);
    setAppliedPeriod(selectedPeriod);
    setPage(1);
    setExpandedRequestId(null);
    setSelectedIds([]);
    setIsFilterOpen(false);
  };

  const resetFilters = () => {
    setSearch("");
    setAppliedSearch("");
    setSelectedStatuses(["all"]);
    setAppliedStatuses(["all"]);
    setSelectedPeriod("all");
    setAppliedPeriod("all");
    setPage(1);
    setIsFilterOpen(false);
  };

  const applySorting = () => {
    setAppliedSortField(selectedSortField);
    setAppliedSortDirection(selectedSortDirection);
    setPage(1);
    setExpandedRequestId(null);
    setSelectedIds([]);
    setIsSortOpen(false);
  };

  const resetSorting = () => {
    setSelectedSortField("date");
    setAppliedSortField("date");
    setSelectedSortDirection("desc");
    setAppliedSortDirection("desc");
    setPage(1);
    setExpandedRequestId(null);
    setSelectedIds([]);
    setIsSortOpen(false);
  };

  const toggleStatusFilter = (nextStatus: VerificationStatusFilter) => {
    if (nextStatus === "all") {
      setSelectedStatuses(["all"]);
      return;
    }

    setSelectedStatuses((current) => {
      const normalized = current.filter((item) => item !== "all");
      if (normalized.includes(nextStatus)) {
        const nextItems = normalized.filter((item) => item !== nextStatus);
        return nextItems.length > 0 ? nextItems : ["all"];
      }

      return [...normalized, nextStatus];
    });
  };

  const toggleSelectedId = (requestId: string) => {
    const targetItem = sortedItems.find((item) => item.id === requestId);
    if (!targetItem || (targetItem.status !== "pending" && targetItem.status !== "suspended")) {
      return;
    }

    setSelectedIds((current) =>
      current.includes(requestId)
        ? current.filter((item) => item !== requestId)
        : [...current, requestId],
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds(allRowsSelected ? [] : selectableItems.map((item) => item.id));
  };

  const handleExpand = (item: EmployerVerificationRequestItem) => {
    const nextId = expandedRequestId === item.id ? null : item.id;
    setExpandedRequestId(nextId);
    setModeratorComment(nextId ? item.moderator_comment ?? item.rejection_reason ?? "" : "");
  };

  const handleRowClick = (event: ReactMouseEvent<HTMLElement>, item: EmployerVerificationRequestItem) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, label")) {
      return;
    }

    if (hasSelectedText()) {
      return;
    }

    handleExpand(item);
  };

  const handleApprove = (requestId: string) => {
    approveMutation.mutate({ requestId, comment: moderatorComment.trim() });
  };

  const handleReject = (requestId: string) => {
    rejectMutation.mutate({ requestId, comment: moderatorComment.trim() });
  };

  const handleRequestChanges = (requestId: string) => {
    requestChangesMutation.mutate({ requestId, comment: moderatorComment.trim() });
  };

  const handleBulkAction = (action: "request-changes" | "reject" | "approve") => {
    if (selectedIds.length === 0) {
      return;
    }

    bulkActionMutation.mutate({
      action,
      requestIds: selectedIds,
    });
  };

  return (
    <main className={`company-review-page company-review-page--${themeRole}`}>
      <Header
        containerClassName="home-page__shell"
        profileMenuItems={profileMenuItems}
        theme="curator"
        topNavigation={null}
        notificationOnRealtimeMessage={() => {
          void queryClient.invalidateQueries({
            queryKey: ["moderation", "employer-verification-requests"],
          });
          void queryClient.invalidateQueries({
            queryKey: ["moderation", "dashboard"],
          });
          void queryClient.refetchQueries({
            queryKey: ["moderation", "employer-verification-requests"],
            type: "active",
          });
          void queryClient.refetchQueries({
            queryKey: ["moderation", "dashboard"],
            type: "active",
          });
        }}
        bottomContent={<CuratorHeaderNavigation isAdmin={isAdmin} currentPage="employers" />}
      />

      <Container className="company-review-page__shell">
        <header className="company-review-page__header">
          <h1 className="company-review-page__title">
            Верификация работодателей ({total})
          </h1>
          {reviewError ? (
            <p className="company-review-page__review-error">{reviewError}</p>
          ) : null}
        </header>

        <section className="company-review-page__toolbar">
          <label className="company-review-page__search header__search" aria-label="Поиск работодателей">
            <Input
              type="search"
              placeholder="Поиск"
              className="input--sm company-review-page__search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setAppliedSearch(search.trim());
                  setSelectedIds([]);
                  setExpandedRequestId(null);
                  setPage(1);
                }
              }}
            />
          </label>

          <div className="company-review-page__toolbar-actions">
            <div ref={filtersRef} className="company-review-page__filters">
              <button
                type="button"
                className="company-review-page__icon-button company-review-page__icon-button--filter"
                aria-label="Фильтры"
                aria-expanded={isFilterOpen}
                onClick={() => {
                  setIsSortOpen(false);
                  setIsFilterOpen((current) => !current);
                }}
              >
                <span
                  className={
                    isFilterOpen
                      ? "company-review-page__icon company-review-page__icon--filter-open"
                      : "company-review-page__icon company-review-page__icon--filter"
                  }
                  aria-hidden="true"
                />
              </button>

              {isFilterOpen ? (
                <div className="company-review-page__filters-popover">
                  <div className="company-review-page__filters-section">
                    <div className="company-review-page__filters-head">
                      <h2 className="company-review-page__filters-title">Фильтры</h2>
                      <button
                        type="button"
                        className="company-review-page__filters-reset"
                        onClick={resetFilters}
                      >
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="company-review-page__filters-section">
                    <div className="company-review-page__filters-head">
                      <h3 className="company-review-page__filters-group-title">По статусам</h3>
                      <button
                        type="button"
                        className="company-review-page__filters-reset"
                        onClick={() => setSelectedStatuses(["all"])}
                      >
                        Сбросить
                      </button>
                    </div>
                    <div className="company-review-page__filters-options company-review-page__filters-options--choices">
                      <label className="company-review-page__filter-option">
                        <Checkbox
                          checked={selectedStatuses.includes("all")}
                          onChange={() => toggleStatusFilter("all")}
                          variant="accent"
                        />
                        <span>Все</span>
                      </label>
                      {statusOptions.map((option) => (
                        <label key={option.value} className="company-review-page__filter-option">
                          <Checkbox
                            checked={selectedStatuses.includes(option.value)}
                            onChange={() => toggleStatusFilter(option.value)}
                            variant="accent"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="company-review-page__filters-section">
                    <div className="company-review-page__filters-head">
                      <h3 className="company-review-page__filters-group-title">Период</h3>
                      <button
                        type="button"
                        className="company-review-page__filters-reset"
                        onClick={() => setSelectedPeriod("all")}
                      >
                        Сбросить
                      </button>
                    </div>
                    <div className="company-review-page__filters-options company-review-page__filters-options--radio">
                      {periodOptions.map((option) => (
                        <label key={option.value} className="company-review-page__filter-option">
                          <Radio
                            checked={selectedPeriod === option.value}
                            onChange={() => setSelectedPeriod(option.value)}
                            variant="accent"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="company-review-page__filters-footer">
                    <Button type="button" variant="accent" size="sm" fullWidth onClick={applyFilters}>
                      Показать результаты
                    </Button>
                    <Button
                      type="button"
                      variant="accent-outline"
                      size="sm"
                      fullWidth
                      onClick={resetFilters}
                    >
                      Сбросить фильтры
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <div ref={sortingRef} className="company-review-page__sorting">
              <button
                type="button"
                className="company-review-page__icon-button company-review-page__icon-button--sorting"
                aria-label="Сортировка"
                aria-expanded={isSortOpen}
                onClick={() => {
                  setIsFilterOpen(false);
                  setIsSortOpen((current) => !current);
                }}
              >
                <span className="company-review-page__icon-stack" aria-hidden="true">
                  <span
                    className={
                      isSortOpen
                        ? `company-review-page__icon ${appliedSortDirection === "desc" ? "company-review-page__icon--sorting" : "company-review-page__icon--sorting company-review-page__icon--ascending"} company-review-page__icon--hidden`
                        : appliedSortDirection === "desc"
                          ? "company-review-page__icon company-review-page__icon--sorting"
                          : "company-review-page__icon company-review-page__icon--sorting company-review-page__icon--ascending"
                    }
                  />
                  <span
                    className={
                      isSortOpen
                        ? "company-review-page__icon company-review-page__icon--filter-open company-review-page__icon--visible"
                        : "company-review-page__icon company-review-page__icon--filter-open company-review-page__icon--hidden"
                    }
                  />
                </span>
              </button>

              {isSortOpen ? (
                <div className="company-review-page__sorting-popover">
                  <div className="company-review-page__filters-section">
                    <div className="company-review-page__filters-head">
                      <h2 className="company-review-page__filters-title">Сортировка</h2>
                      <button
                        type="button"
                        className="company-review-page__filters-reset"
                        onClick={resetSorting}
                      >
                        Сбросить
                      </button>
                    </div>
                  </div>

                  <div className="company-review-page__filters-section">
                    <div className="company-review-page__filters-options company-review-page__filters-options--radio">
                      {sortFieldOptions.map((option) => (
                        <label key={option.value} className="company-review-page__filter-option">
                          <Radio
                            checked={selectedSortField === option.value}
                            onChange={() => setSelectedSortField(option.value)}
                            variant="accent"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="company-review-page__filters-section">
                    <div className="company-review-page__filters-options company-review-page__filters-options--radio">
                      <label className="company-review-page__filter-option">
                        <Radio
                          checked={selectedSortDirection === "asc"}
                          onChange={() => setSelectedSortDirection("asc")}
                          variant="accent"
                        />
                        <span>
                          {selectedSortField === "alphabet" ? "А-Я" : "Сначала старые"}
                        </span>
                      </label>
                      <label className="company-review-page__filter-option">
                        <Radio
                          checked={selectedSortDirection === "desc"}
                          onChange={() => setSelectedSortDirection("desc")}
                          variant="accent"
                        />
                        <span>
                          {selectedSortField === "alphabet" ? "Я-А" : "Сначала новые"}
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="company-review-page__filters-footer">
                    <Button type="button" variant="accent" size="sm" fullWidth onClick={applySorting}>
                      Показать результаты
                    </Button>
                    <Button
                      type="button"
                      variant="accent-outline"
                      size="sm"
                      fullWidth
                      onClick={resetSorting}
                    >
                      Сбросить сортировку
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div
          className={
            selectedIds.length > 0
              ? "company-review-page__bulk-bar-shell company-review-page__bulk-bar-shell--visible"
              : "company-review-page__bulk-bar-shell"
          }
          aria-hidden={selectedIds.length === 0}
        >
          <div className="company-review-page__bulk-bar">
            <div className="company-review-page__bulk-bar-selection">
              <Checkbox checked={selectedIds.length > 0} variant="accent" disabled readOnly />
              <span className="company-review-page__bulk-bar-count">Выбрано: {selectedIds.length}</span>
            </div>

            <div className="company-review-page__bulk-bar-actions">
              <Button
                type="button"
                variant="accent-outline"
                size="md"
                className="company-review-page__bulk-bar-button company-review-page__bulk-bar-button--request"
                onClick={() => handleBulkAction("request-changes")}
                loading={bulkActionMutation.isPending}
                disabled={isBulkRequestChangesDisabled}
              >
                Запросить правки
              </Button>
              <Button
                type="button"
                variant="danger"
                size="md"
                className="company-review-page__bulk-bar-button"
                onClick={() => handleBulkAction("reject")}
                loading={bulkActionMutation.isPending}
                disabled={isBulkRejectDisabled}
              >
                Отклонить
              </Button>
              <Button
                type="button"
                variant="success"
                size="md"
                className="company-review-page__bulk-bar-button"
                onClick={() => handleBulkAction("approve")}
                loading={bulkActionMutation.isPending}
                disabled={isBulkApproveDisabled}
              >
                Одобрить
              </Button>
            </div>
          </div>
        </div>

        <section className="company-review-page__requests">
            <div className="company-review-page__table-head">
              <div className="company-review-page__table-cell company-review-page__table-cell--check">
              <Checkbox
                checked={allRowsSelected}
                onChange={toggleSelectAll}
                onClick={stopCheckboxEvent}
                onMouseDown={stopCheckboxEvent}
                variant="accent"
                disabled={selectableItems.length === 0}
              />
            </div>
            <div className="company-review-page__table-cell">Работодатель</div>
            <div className="company-review-page__table-cell">ИНН</div>
            <div className="company-review-page__table-cell">Дата подачи</div>
            <div className="company-review-page__table-cell company-review-page__table-cell--status">Статус</div>
          </div>

          <div className="company-review-page__requests">
            {isTableLoading
              ? Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
                  <EmployerVerificationRowSkeleton key={`skeleton-${index}`} />
                ))
              : sortedItems.map((item) => {
              const statusMeta = resolveStatusMeta(item.status);
              const isExpanded = expandedRequestId === item.id;
              const isVerifiedItem = item.status === "approved";
              const isSelectable = item.status === "pending" || item.status === "suspended";

              return (
                <article
                  key={item.id}
                  className="company-review-page__request"
                  onClick={(event) => handleRowClick(event, item)}
                >
                  <div
                    className={
                      isExpanded
                        ? "company-review-page__request-summary company-review-page__request-summary--expanded"
                        : isVerifiedItem
                          ? "company-review-page__request-summary company-review-page__request-summary--centered"
                        : "company-review-page__request-summary"
                    }
                  >
                    <div className="company-review-page__request-select">
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelectedId(item.id)}
                        onClick={stopCheckboxEvent}
                        onMouseDown={stopCheckboxEvent}
                        variant="accent"
                        disabled={!isSelectable}
                      />
                    </div>

                    <div
                      className="company-review-page__request-overview"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (hasSelectedText()) {
                          return;
                        }

                        handleExpand(item);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleExpand(item);
                        }
                      }}
                    >
                      <div className="company-review-page__request-company">
                        <strong className="company-review-page__request-title">
                          {abbreviateLegalEntityName(item.employer_name)}
                        </strong>
                        {!isExpanded && !isVerifiedItem ? (
                          <div className="company-review-page__request-actions">
                            <Button
                              type="button"
                              variant="success-ghost"
                              size="sm"
                              className="company-review-page__request-action company-review-page__request-action--approve"
                              onClick={(event) => {
                                event.stopPropagation();
                                approveMutation.mutate({ requestId: item.id, comment: "" });
                              }}
                              disabled={anyMutationPending}
                            >
                              <span>Одобрить</span>
                              <span
                                aria-hidden="true"
                                className="company-review-page__action-icon company-review-page__action-icon--approve"
                              />
                            </Button>
                            <Button
                              type="button"
                              variant="danger-ghost"
                              size="sm"
                              className="company-review-page__request-action company-review-page__request-action--reject"
                              onClick={(event) => {
                                event.stopPropagation();
                                rejectMutation.mutate({ requestId: item.id, comment: "" });
                              }}
                              disabled={anyMutationPending}
                            >
                              <span>Отклонить</span>
                              <span
                                aria-hidden="true"
                                className="company-review-page__action-icon company-review-page__action-icon--reject"
                              />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                      <div className="company-review-page__request-inn">{item.inn}</div>
                      <div className="company-review-page__request-date">{formatSubmissionDate(item.submitted_at)}</div>
                      <div className="company-review-page__request-status">
                        <Status variant={statusMeta.variant}>{statusMeta.label}</Status>
                      </div>
                    </div>
                  </div>

                  <div
                    className={
                      isExpanded
                        ? "company-review-page__request-details-shell company-review-page__request-details-shell--expanded"
                        : "company-review-page__request-details-shell"
                    }
                    aria-hidden={!isExpanded}
                  >
                    <div className="company-review-page__request-details">
                      <div className="company-review-page__detail-sections">
                        <div className="company-review-page__detail-section">
                          <div className="company-review-page__detail">
                            <div className="company-review-page__detail-label">Статус</div>
                            <div className="company-review-page__detail-value">
                              {resolveEmployerTypeLabel(item.employer_type)}
                            </div>
                          </div>
                          <div className="company-review-page__detail">
                            <div className="company-review-page__detail-label">Корпоративная почта</div>
                            <div className="company-review-page__detail-value">
                              {item.corporate_email ?? "Не указано"}
                            </div>
                          </div>
                          <div className="company-review-page__detail">
                            <div className="company-review-page__detail-label">Подтверждающие документы</div>
                            <div className="company-review-page__documents">
                              {item.documents.length > 0 ? (
                                item.documents.map((document) => (
                                  <VerificationDocumentCard
                                    key={document.id}
                                    fileName={document.file_name}
                                    fileUrl={document.file_url}
                                    mimeType={document.mime_type}
                                    fileSize={document.file_size}
                                  />
                                ))
                              ) : (
                                <span className="company-review-page__detail-value">Документы не приложены</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="company-review-page__detail-section">
                          <div className="company-review-page__detail">
                            <div className="company-review-page__detail-label">Сайт компании</div>
                            <div className="company-review-page__detail-value">
                              {item.website_url ?? "Не указано"}
                            </div>
                          </div>
                          <div className="company-review-page__detail">
                            <div className="company-review-page__detail-label">Соцсеть</div>
                            <div className="company-review-page__detail-value">
                              {item.social_link ?? "Не указано"}
                            </div>
                          </div>
                          <div className="company-review-page__detail">
                            <div className="company-review-page__detail-label">Телефон</div>
                            <div className="company-review-page__detail-value">
                              {item.phone ?? "Не указано"}
                            </div>
                          </div>
                        </div>

                        <div className="company-review-page__detail-section company-review-page__detail-section--actions">
                          <div className="company-review-page__detail">
                            <div className="company-review-page__detail-label">Комментарий</div>
                            <textarea
                              className="company-review-page__comment"
                              value={currentExpandedItem?.id === item.id ? moderatorComment : ""}
                              onChange={(event) => setModeratorComment(event.target.value)}
                              placeholder=""
                            />
                          </div>
                          {!isVerifiedItem ? (
                            <div className="company-review-page__detail-actions company-review-page__detail-actions--stacked">
                              <Button
                                type="button"
                                variant="accent-outline"
                                size="sm"
                                className="company-review-page__detail-action-request"
                                onClick={() => handleRequestChanges(item.id)}
                                loading={requestChangesMutation.isPending && currentExpandedItem?.id === item.id}
                                disabled={anyMutationPending}
                              >
                                Запросить правки
                              </Button>
                              <div className="company-review-page__detail-actions-group">
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  className="company-review-page__decision-button"
                                  onClick={() => handleReject(item.id)}
                                  loading={rejectMutation.isPending && currentExpandedItem?.id === item.id}
                                  disabled={anyMutationPending}
                                >
                                  Отклонить
                                </Button>
                                <Button
                                  type="button"
                                  variant="success"
                                  size="sm"
                                  className="company-review-page__decision-button"
                                  onClick={() => handleApprove(item.id)}
                                  loading={approveMutation.isPending && currentExpandedItem?.id === item.id}
                                  disabled={anyMutationPending}
                                >
                                  Одобрить
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}

            {!isTableLoading && sortedItems.length === 0 ? (
              <div className="company-review-page__empty">
                {hasAppliedFilters
                  ? "По выбранным параметрам записи не найдены."
                  : "Заявок на верификацию пока нет."}
              </div>
            ) : null}
          </div>

          {!isTableLoading && sortedItems.length > 0 && totalPages > 1 ? (
            <nav className="company-review-page__pagination" aria-label="Пагинация">
              <button
                type="button"
                className="company-review-page__pager-button"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={page === 1}
                aria-label="Предыдущая страница"
              >
                <img
                  src={arrowIcon}
                  alt=""
                  aria-hidden="true"
                  className="company-review-page__pager-button-icon company-review-page__pager-button-icon--prev"
                />
              </button>
              {pageNumbers.map((item, index) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="company-review-page__pagination-ellipsis">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={
                      item === page
                        ? "company-review-page__pagination-page company-review-page__pagination-page--active"
                        : "company-review-page__pagination-page"
                    }
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                className="company-review-page__pager-button"
                onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                disabled={page === totalPages}
                aria-label="Следующая страница"
              >
                <img
                  src={arrowIcon}
                  alt=""
                  aria-hidden="true"
                  className="company-review-page__pager-button-icon"
                />
              </button>
            </nav>
          ) : null}
        </section>
      </Container>

      <Footer hashPrefix="/" theme={themeRole} />
    </main>
  );
}
