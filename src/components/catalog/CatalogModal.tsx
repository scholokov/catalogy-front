"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useSnackbar } from "@/components/ui/SnackbarProvider";
import type { PosterMenuAction } from "@/lib/collection/serviceSearchLinks";
import {
  stripShishkaAssessmentFromComment,
  type ShishkaFitAssessment,
} from "@/lib/shishka/fitAssessment";
import styles from "./CatalogModal.module.css";

type CatalogModalProps = {
  title: string;
  posterUrl?: string;
  imageUrls?: string[];
  onClose: () => void;
  size?: "default" | "wide";
  readOnly?: boolean;
  platformOptions?: string[];
  availabilityOptions?: string[];
  onAdd?: (payload: {
    viewedAt: string;
    comment: string;
    recommendSimilar: boolean;
    isViewed: boolean;
    rating: number | null;
    viewPercent: number;
    platforms: string[];
    availability: string | null;
    shishkaFitAssessment: ShishkaFitAssessment | null;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  onRefresh?: () => Promise<void>;
  onEvaluate?: (payload: {
    viewedAt: string;
    comment: string;
    recommendSimilar: boolean;
    isViewed: boolean;
    rating: number | null;
    viewPercent: number;
    platforms: string[];
    availability: string | null;
    shishkaFitAssessment: ShishkaFitAssessment | null;
  }) => Promise<ShishkaFitAssessment>;
  onPersistEvaluatedAssessment?: (assessment: ShishkaFitAssessment) => Promise<void>;
  extraActions?: React.ReactNode;
  previewAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    icon?: React.ReactNode;
  };
  previewMenuAction?: PosterMenuAction;
  fitTargetText?: string;
  initialValues?: {
    viewedAt?: string;
    comment?: string | null;
    recommendSimilar?: boolean;
    isViewed?: boolean;
    rating?: number | null;
    viewPercent?: number | null;
    platforms?: string[] | null;
    availability?: string | null;
    shishkaFitAssessment?: ShishkaFitAssessment | null;
  };
  submitLabel?: string;
  onReadOnlyPrimaryAction?: () => Promise<void> | void;
  readOnlyPrimarySuccessMessage?: string | null;
  readOnlyPrimaryCloses?: boolean;
  showRecommendSimilar?: boolean;
  children:
    | React.ReactNode
    | ((context: {
        fitBadge: React.ReactNode | null;
      }) => React.ReactNode);
};

type FitPopoverPlacement = {
  horizontal: "left" | "right" | "center";
  vertical: "above" | "below";
};

const RATING_MIN = 1;
const RATING_MAX = 5;
const RATING_STEP = 0.5;
const VIEW_PERCENT_MIN = 0;
const VIEW_PERCENT_MAX = 100;
const VIEW_PERCENT_STEP = 10;
const PROFILE_REFRESH_REQUIRED_MESSAGE = "Спершу онови профіль, а потім запускай переоцінку.";

const normalizeRating = (value: number) => {
  const rounded = Math.round(value / RATING_STEP) * RATING_STEP;
  return Math.min(RATING_MAX, Math.max(RATING_MIN, rounded));
};

const formatRating = (value: number | null) => {
  if (value === null) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const normalizeViewPercent = (value: number) => {
  const rounded = Math.round(value / VIEW_PERCENT_STEP) * VIEW_PERCENT_STEP;
  return Math.min(VIEW_PERCENT_MAX, Math.max(VIEW_PERCENT_MIN, rounded));
};

export default function CatalogModal({
  title,
  posterUrl,
  imageUrls,
  onClose,
  onAdd,
  onDelete,
  onRefresh,
  onEvaluate,
  onPersistEvaluatedAssessment,
  extraActions,
  previewAction,
  previewMenuAction,
  fitTargetText = "цей тайтл",
  initialValues,
  platformOptions = [],
  availabilityOptions = [],
  size = "default",
  readOnly = false,
  submitLabel = "Додати",
  onReadOnlyPrimaryAction,
  readOnlyPrimarySuccessMessage = "Додано",
  readOnlyPrimaryCloses = true,
  showRecommendSimilar = true,
  children,
}: CatalogModalProps) {
  const { showSnackbar } = useSnackbar();
  const viewedAtId = useId();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const initialPlatformsKey = useMemo(
    () => (initialValues?.platforms ?? []).join("|"),
    [initialValues?.platforms],
  );
  const isEditMode = initialValues !== undefined;
  const initialViewedAt = initialValues?.viewedAt;
  const initialComment = initialValues?.comment;
  const initialRecommendSimilar = initialValues?.recommendSimilar;
  const initialIsViewed = initialValues?.isViewed;
  const initialRating = initialValues?.rating;
  const initialViewPercent = initialValues?.viewPercent;
  const initialAvailability = initialValues?.availability;
  const initialShishkaFitAssessment = initialValues?.shishkaFitAssessment ?? null;
  const images = useMemo(() => {
    if (imageUrls && imageUrls.length > 0) {
      const unique = Array.from(new Set(imageUrls.filter(Boolean)));
      if (posterUrl) {
        const withoutPoster = unique.filter((url) => url !== posterUrl);
        return [posterUrl, ...withoutPoster];
      }
      return unique;
    }
    return posterUrl ? [posterUrl] : [];
  }, [imageUrls, posterUrl]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [viewedAt, setViewedAt] = useState(today);
  const [comment, setComment] = useState("");
  const [recommendSimilar, setRecommendSimilar] = useState(false);
  const [isViewed, setIsViewed] = useState(true);
  const [rating, setRating] = useState<number | null>(null);
  const [ratingInput, setRatingInput] = useState("");
  const [viewPercent, setViewPercent] = useState(100);
  const [viewPercentInput, setViewPercentInput] = useState("100");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string | null>(null);
  const [shishkaFitAssessment, setShishkaFitAssessment] =
    useState<ShishkaFitAssessment | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isPlatformsOpen, setIsPlatformsOpen] = useState(false);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isFitPopoverOpen, setIsFitPopoverOpen] = useState(false);
  const [isPreviewMenuOpen, setIsPreviewMenuOpen] = useState(false);
  const [fitPopoverPlacement, setFitPopoverPlacement] = useState<FitPopoverPlacement>({
    horizontal: "left",
    vertical: "below",
  });
  const [fitPopoverStyle, setFitPopoverStyle] = useState<CSSProperties>({});
  const [previewMenuStyle, setPreviewMenuStyle] = useState<CSSProperties>({});
  const platformsRef = useRef<HTMLDivElement | null>(null);
  const availabilityRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const fitPopoverRef = useRef<HTMLDivElement | null>(null);
  const fitPopoverCardRef = useRef<HTMLDivElement | null>(null);
  const previewMenuRef = useRef<HTMLDivElement | null>(null);
  const previewMenuCardRef = useRef<HTMLDivElement | null>(null);
  const handleAddRef = useRef<(() => Promise<void>) | null>(null);
  const copyTooltipTimeoutRef = useRef<number | null>(null);
  const [isTitleTooltipSuppressed, setIsTitleTooltipSuppressed] = useState(false);

  useEffect(() => {
    if (!isEditMode) {
      setViewedAt(today);
      setComment("");
      setRecommendSimilar(false);
      setIsViewed(true);
      setRating(null);
      setRatingInput("");
      setViewPercent(100);
      setViewPercentInput("100");
      setPlatforms([]);
      setAvailability(null);
      setIsFitPopoverOpen(false);
      return;
    }

    const normalizeDate = (value?: string) => {
      if (!value) return today;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return today;
      return date.toISOString().slice(0, 10);
    };

    setViewedAt(normalizeDate(initialViewedAt));
    setComment(stripShishkaAssessmentFromComment(initialComment));
    setRecommendSimilar(Boolean(initialRecommendSimilar));
    setIsViewed(initialIsViewed ?? true);
    setRating(initialRating ?? null);
    setRatingInput(formatRating(initialRating ?? null));
    const normalizedInitialViewPercent = normalizeViewPercent(initialViewPercent ?? 100);
    setViewPercent(normalizedInitialViewPercent);
    setViewPercentInput(String(normalizedInitialViewPercent));
    setPlatforms(initialPlatformsKey ? initialPlatformsKey.split("|") : []);
    setAvailability(initialAvailability ?? null);
    setIsFitPopoverOpen(false);
  }, [
    isEditMode,
    today,
    initialAvailability,
    initialComment,
    initialIsViewed,
    initialRating,
    initialRecommendSimilar,
    initialViewPercent,
    initialViewedAt,
    initialPlatformsKey,
  ]);

  useEffect(() => {
    setShishkaFitAssessment(initialShishkaFitAssessment);
  }, [initialShishkaFitAssessment]);

  useEffect(() => {
    if (platformOptions.length === 0) {
      setIsPlatformsOpen(false);
      return;
    }
    setIsPlatformsOpen(false);
  }, [isEditMode, platformOptions.length]);

  useEffect(() => {
    if (availabilityOptions.length === 0) {
      setIsAvailabilityOpen(false);
      return;
    }
    setIsAvailabilityOpen(false);
  }, [availabilityOptions.length, isEditMode]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyTooltipTimeoutRef.current !== null) {
        window.clearTimeout(copyTooltipTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !isPlatformsOpen &&
      !isAvailabilityOpen &&
      !isMoreMenuOpen &&
      !isFitPopoverOpen &&
      !isPreviewMenuOpen
    ) {
      return;
    }
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        platformsRef.current &&
        !platformsRef.current.contains(event.target as Node)
      ) {
        setIsPlatformsOpen(false);
      }
      if (
        availabilityRef.current &&
        !availabilityRef.current.contains(event.target as Node)
      ) {
        setIsAvailabilityOpen(false);
      }
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setIsMoreMenuOpen(false);
      }
      if (
        fitPopoverRef.current &&
        !fitPopoverRef.current.contains(event.target as Node)
      ) {
        setIsFitPopoverOpen(false);
      }
      const targetNode = event.target as Node;
      const isPreviewTriggerClick = previewMenuRef.current?.contains(targetNode);
      const isPreviewMenuClick = previewMenuCardRef.current?.contains(targetNode);
      if (!isPreviewTriggerClick && !isPreviewMenuClick) {
        setIsPreviewMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [
    isAvailabilityOpen,
    isPlatformsOpen,
    isMoreMenuOpen,
    isFitPopoverOpen,
    isPreviewMenuOpen,
  ]);

  useEffect(() => {
    if (!previewMenuAction || previewMenuAction.items.length === 0) {
      setIsPreviewMenuOpen(false);
    }
  }, [previewMenuAction]);

  const updatePreviewMenuPlacement = useCallback(() => {
    const triggerNode = previewMenuRef.current;
    const menuNode = previewMenuCardRef.current;

    if (!triggerNode || !menuNode) {
      return;
    }

    const triggerRect = triggerNode.getBoundingClientRect();
    const menuRect = menuNode.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 16;
    const gap = 8;
    const width = Math.min(Math.max(triggerRect.width, 220), viewportWidth - margin * 2);
    const canOpenBelow = triggerRect.bottom + gap + menuRect.height <= viewportHeight - margin;
    const top = canOpenBelow
      ? triggerRect.bottom + gap
      : Math.max(margin, triggerRect.top - menuRect.height - gap);
    const left = Math.min(
      Math.max(margin, triggerRect.right - width),
      viewportWidth - margin - width,
    );

    setPreviewMenuStyle({
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
    });
  }, []);

  useEffect(() => {
    if (!isPreviewMenuOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      updatePreviewMenuPlacement();
    });

    const handleViewportChange = () => {
      updatePreviewMenuPlacement();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isPreviewMenuOpen, updatePreviewMenuPlacement]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [posterUrl, imageUrls]);

  const updateFitPopoverPlacement = useCallback(() => {
    const triggerNode = fitPopoverRef.current;
    const popoverNode = fitPopoverCardRef.current;

    if (!triggerNode || !popoverNode) {
      return;
    }

    const triggerRect = triggerNode.getBoundingClientRect();
    const popoverRect = popoverNode.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const horizontalMargin = 16;
    const verticalMargin = 16;
    const gap = 8;
    const canOpenRight =
      triggerRect.left + popoverRect.width <= viewportWidth - horizontalMargin;
    const canOpenLeft =
      triggerRect.right - popoverRect.width >= horizontalMargin;
    const canOpenBelow =
      triggerRect.bottom + gap + popoverRect.height <= viewportHeight - verticalMargin;
    const canOpenAbove =
      triggerRect.top - gap - popoverRect.height >= verticalMargin;
    const shouldCenter =
      viewportWidth <= 640 || (!canOpenRight && !canOpenLeft);
    const verticalPlacement: FitPopoverPlacement["vertical"] =
      canOpenBelow || !canOpenAbove ? "below" : "above";

    if (shouldCenter) {
      const centeredTop =
        verticalPlacement === "below"
          ? Math.min(
              triggerRect.bottom + gap,
              viewportHeight - popoverRect.height - verticalMargin,
            )
          : Math.max(
              verticalMargin,
              triggerRect.top - popoverRect.height - gap,
            );

      setFitPopoverPlacement({
        horizontal: "center",
        vertical: verticalPlacement,
      });
      setFitPopoverStyle({
        top: `${Math.max(verticalMargin, centeredTop)}px`,
      });
      return;
    }

    setFitPopoverPlacement({
      horizontal: canOpenRight || !canOpenLeft ? "left" : "right",
      vertical: verticalPlacement,
    });
    setFitPopoverStyle({});
  }, []);

  useEffect(() => {
    if (!isFitPopoverOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      updateFitPopoverPlacement();
    });

    const handleViewportChange = () => {
      updateFitPopoverPlacement();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isFitPopoverOpen, updateFitPopoverPlacement]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (isSaving || isConfirmOpen) {
          return;
        }
        event.preventDefault();
        void handleAddRef.current?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConfirmOpen, isSaving, onClose]);

  const handleAdd = async () => {
    if (readOnly) {
      if (!onReadOnlyPrimaryAction) {
        onClose();
        return;
      }
      setIsSaving(true);
      setSaveError("");
      try {
        await onReadOnlyPrimaryAction();
        if (readOnlyPrimarySuccessMessage) {
          showSnackbar(readOnlyPrimarySuccessMessage);
        }
        if (readOnlyPrimaryCloses) {
          onClose();
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Не вдалося виконати дію.";
        setSaveError(message);
      } finally {
        setIsSaving(false);
      }
      return;
    }
    if (!onAdd) {
      onClose();
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      await onAdd({
        viewedAt,
        comment,
        recommendSimilar,
        isViewed,
        rating: isViewed ? rating : null,
        viewPercent: isViewed ? viewPercent : 0,
        platforms,
        availability,
        shishkaFitAssessment,
      });
      showSnackbar(isEditMode ? "Збережено" : "Додано");
      onClose();
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Не вдалося зберегти.";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };
  handleAddRef.current = handleAdd;

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    setIsConfirmOpen(true);
  };

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    setSaveError("");
    try {
      await onRefresh();
      showSnackbar("Оновлено");
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Не вдалося оновити дані.";
      setSaveError(message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleEvaluate = async () => {
    if (!onEvaluate) return;
    setIsEvaluating(true);
    setSaveError("");
    try {
      const nextAssessment = await onEvaluate({
        viewedAt,
        comment,
        recommendSimilar,
        isViewed,
        rating: isViewed ? rating : null,
        viewPercent: isViewed ? viewPercent : 0,
        platforms,
        availability,
        shishkaFitAssessment,
      });
      if (onPersistEvaluatedAssessment) {
        await onPersistEvaluatedAssessment(nextAssessment);
      }
      setShishkaFitAssessment(nextAssessment);
      setIsFitPopoverOpen(true);
      showSnackbar("Оцінку оновлено");
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Не вдалося отримати оцінку.";
      if (message === PROFILE_REFRESH_REQUIRED_MESSAGE) {
        showSnackbar(message);
      } else {
        setSaveError(message);
      }
    } finally {
      setIsEvaluating(false);
    }
  };

  const confirmDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    setSaveError("");

    try {
      await onDelete();
      showSnackbar("Видалено");
      onClose();
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Не вдалося видалити.";
      setSaveError(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    if (isDeleting) return;
    setIsConfirmOpen(false);
  };

  const goPrev = () => {
    if (images.length < 2) return;
    setActiveImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goNext = () => {
    if (images.length < 2) return;
    setActiveImageIndex((prev) => (prev + 1) % images.length);
  };

  const renderChevronIcon = (variant: "single" | "double" | "triple", direction: "up" | "down") => {
    const pathByVariant = {
      single: "M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z",
      double:
        "M7.41,18.41L6,17L12,11L18,17L16.59,18.41L12,13.83L7.41,18.41M7.41,12.41L6,11L12,5L18,11L16.59,12.41L12,7.83L7.41,12.41Z",
      triple:
        "M16.59,9.42L12,4.83L7.41,9.42L6,8L12,2L18,8L16.59,9.42M16.59,15.42L12,10.83L7.41,15.42L6,14L12,8L18,14L16.59,15.42M16.59,21.42L12,16.83L7.41,21.42L6,20L12,14L18,20L16.59,21.42Z",
    } as const;

    return (
      <span
        className={`${styles.fitLabelIcon} ${
          direction === "down" ? styles.fitLabelIconDown : ""
        }`}
        aria-hidden="true"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
          <path d={pathByVariant[variant]} />
        </svg>
      </span>
    );
  };

  const renderFitLabel = (label: ShishkaFitAssessment["label"]) => {
    switch (label) {
      case "Навряд":
        return (
          <span className={styles.fitLabelContent}>
            {renderChevronIcon("double", "down")}
            <span>{label}</span>
          </span>
        );
      case "Слабко":
        return (
          <span className={styles.fitLabelContent}>
            {renderChevronIcon("single", "down")}
            <span>{label}</span>
          </span>
        );
      case "Можливо":
        return (
          <span className={styles.fitLabelContent}>
            {renderChevronIcon("single", "up")}
            <span>{label}</span>
          </span>
        );
      case "Схоже":
        return (
          <span className={styles.fitLabelContent}>
            {renderChevronIcon("double", "up")}
            <span>{label}</span>
          </span>
        );
      case "Явно":
        return (
          <span className={styles.fitLabelContent}>
            {renderChevronIcon("triple", "up")}
            <span>{label}</span>
          </span>
        );
      default:
        return label;
    }
  };

  const fitBadge = shishkaFitAssessment ? (
    <span className={styles.fitPopoverWrap} ref={fitPopoverRef}>
      <button
        type="button"
        className={`${styles.fitPopoverTrigger} ${
          isFitPopoverOpen ? styles.fitPopoverTriggerActive : ""
        }`}
        onClick={() => {
          setIsFitPopoverOpen((prev) => !prev);
        }}
        aria-expanded={isFitPopoverOpen}
        aria-label="Пояснення вірогідності сподобатись"
      >
        {renderFitLabel(shishkaFitAssessment.label)}
      </button>
      {isFitPopoverOpen ? (
        <div
          ref={fitPopoverCardRef}
          className={[
            styles.fitPopover,
            fitPopoverPlacement.horizontal === "center"
              ? styles.fitPopoverCentered
              : fitPopoverPlacement.horizontal === "right"
              ? styles.fitPopoverAlignRight
              : styles.fitPopoverAlignLeft,
            fitPopoverPlacement.horizontal === "center"
              ? ""
              : fitPopoverPlacement.vertical === "above"
              ? styles.fitPopoverAbove
              : styles.fitPopoverBelow,
          ].join(" ")}
          style={fitPopoverStyle}
          role="dialog"
          aria-modal="false"
        >
          <p className={styles.fitPopoverTitle}>
            Вірогідність того, що {fitTargetText} сподобається
          </p>
          <p className={styles.fitPopoverLabel}>{renderFitLabel(shishkaFitAssessment.label)}</p>
          <p className={styles.fitPopoverReason}>{shishkaFitAssessment.reason}</p>
        </div>
      ) : null}
    </span>
  ) : null;

  const viewedAtDisplay = isViewed ? viewedAt : "";
  const selectedPlatformsLabel =
    platforms.length > 0 ? platforms.join(", ") : "Оберіть платформу";
  const selectedAvailabilityLabel = availability ?? "Оберіть наявність";
  const isRatingDisabled = readOnly || !isViewed || isSaving;
  const isViewPercentDisabled = readOnly || !isViewed || isSaving;

  const decreaseRating = () => {
    if (rating === null) return;
    const next = rating <= RATING_MIN ? null : normalizeRating(rating - RATING_STEP);
    setRating(next);
    setRatingInput(formatRating(next));
  };

  const increaseRating = () => {
    const next =
      rating === null
        ? RATING_MIN
        : normalizeRating(Math.min(RATING_MAX, rating + RATING_STEP));
    setRating(next);
    setRatingInput(formatRating(next));
  };

  const handleRatingInputChange = (value: string) => {
    const normalizedValue = value.replace(",", ".");
    setRatingInput(normalizedValue);
    if (normalizedValue.trim() === "") {
      setRating(null);
      return;
    }
    const parsed = Number(normalizedValue);
    if (!Number.isFinite(parsed)) return;
    const normalized = normalizeRating(parsed);
    setRating(normalized);
    setRatingInput(formatRating(normalized));
  };

  const handleRatingInputBlur = () => {
    if (ratingInput.trim() === "") {
      setRating(null);
      setRatingInput("");
      return;
    }
    const parsed = Number(ratingInput);
    if (!Number.isFinite(parsed)) {
      setRatingInput(formatRating(rating));
      return;
    }
    const normalized = normalizeRating(parsed);
    setRating(normalized);
    setRatingInput(formatRating(normalized));
  };

  const decreaseViewPercent = () => {
    const next = normalizeViewPercent(viewPercent - VIEW_PERCENT_STEP);
    setViewPercent(next);
    setViewPercentInput(String(next));
  };

  const increaseViewPercent = () => {
    const next = normalizeViewPercent(viewPercent + VIEW_PERCENT_STEP);
    setViewPercent(next);
    setViewPercentInput(String(next));
  };

  const handleViewPercentInputChange = (value: string) => {
    const digitsOnly = value.replace(/[^\d]/g, "");
    setViewPercentInput(digitsOnly);
    if (digitsOnly.trim() === "") {
      setViewPercent(0);
      return;
    }
    const parsed = Number(digitsOnly);
    if (!Number.isFinite(parsed)) return;
    setViewPercent(normalizeViewPercent(parsed));
  };

  const handleViewPercentInputBlur = () => {
    if (viewPercentInput.trim() === "") {
      setViewPercent(0);
      setViewPercentInput("0");
      return;
    }
    const parsed = Number(viewPercentInput);
    if (!Number.isFinite(parsed)) {
      setViewPercentInput(String(viewPercent));
      return;
    }
    const normalized = normalizeViewPercent(parsed);
    setViewPercent(normalized);
    setViewPercentInput(String(normalized));
  };

  const copyText = async (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    try {
      await navigator.clipboard.writeText(normalized);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = normalized;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    showSnackbar("Скопійовано");
  };

  const suppressTitleTooltip = () => {
    setIsTitleTooltipSuppressed(true);
    if (copyTooltipTimeoutRef.current !== null) {
      window.clearTimeout(copyTooltipTimeoutRef.current);
    }
    copyTooltipTimeoutRef.current = window.setTimeout(() => {
      setIsTitleTooltipSuppressed(false);
    }, 900);
  };

  const previewMenuOverlay =
    isPreviewMenuOpen && previewMenuAction
      ? createPortal(
          <div
            ref={previewMenuCardRef}
            className={styles.previewMenu}
            style={previewMenuStyle}
            role="menu"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {previewMenuAction.items.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className={styles.previewMenuItem}
                role="menuitem"
                onClick={() => setIsPreviewMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`${styles.modal} ${size === "wide" ? styles.modalWide : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>
            <button
              type="button"
              className={`${styles.copyableTitleButton} ${
                isTitleTooltipSuppressed ? styles.copyTooltipHidden : ""
              }`}
              onClick={() => {
                suppressTitleTooltip();
                void copyText(title);
              }}
              data-copy-tooltip="Клікніть для копіювання"
              aria-label={`Скопіювати назву: ${title}`}
            >
              {title}
            </button>
          </h2>
          <div className={styles.headerActions}>
            {onDelete || onRefresh || onEvaluate ? (
              <div className={styles.headerMenu} ref={moreMenuRef}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                  aria-label="Більше дій"
                  aria-expanded={isMoreMenuOpen}
                  disabled={isSaving || isDeleting || isRefreshing || isEvaluating}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="20"
                    viewBox="0 -960 960 960"
                    width="20"
                    aria-hidden="true"
                  >
                    <path
                      fill="currentColor"
                      d="M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z"
                    />
                  </svg>
                </button>
                {isMoreMenuOpen ? (
                  <div className={styles.contextMenu} role="menu">
                    {onRefresh ? (
                      <button
                        type="button"
                        className={styles.contextMenuItem}
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          void handleRefresh();
                        }}
                        role="menuitem"
                        disabled={isSaving || isDeleting || isRefreshing || isEvaluating}
                      >
                        <span className={styles.contextMenuIcon} aria-hidden="true">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 -960 960 960"
                            width="18"
                            height="18"
                          >
                            <path
                              fill="currentColor"
                              d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"
                            />
                          </svg>
                        </span>
                        <span>Оновити</span>
                      </button>
                    ) : null}
                    {onEvaluate && !isViewed ? (
                      <button
                        type="button"
                        className={styles.contextMenuItem}
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          void handleEvaluate();
                        }}
                        role="menuitem"
                        disabled={isSaving || isDeleting || isRefreshing || isEvaluating}
                      >
                        <span className={styles.contextMenuIcon} aria-hidden="true">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 -960 960 960"
                            width="18"
                            height="18"
                          >
                            <path
                              fill="currentColor"
                              d="M360-240h220q17 0 31.5-8.5T632-272l84-196q2-5 3-10t1-10v-32q0-17-11.5-28.5T680-560H496l24-136q2-10-1-19t-10-16l-29-29-184 200q-8 8-12 18t-4 22v200q0 33 23.5 56.5T360-240ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"
                            />
                          </svg>
                        </span>
                        <span>{isEvaluating ? "Оцінюємо..." : "Оцінити"}</span>
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          void handleDelete();
                        }}
                        role="menuitem"
                        disabled={isSaving || isDeleting || isRefreshing || isEvaluating}
                      >
                        <span className={styles.contextMenuIcon} aria-hidden="true">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 -960 960 960"
                            width="18"
                            height="18"
                          >
                            <path
                              fill="currentColor"
                              d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"
                            />
                          </svg>
                        </span>
                        <span>Видалити</span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              className={styles.iconButton}
              onClick={onClose}
              aria-label="Закрити"
              disabled={isSaving || isRefreshing}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 -960 960 960"
                width="20"
                height="20"
                aria-hidden="true"
              >
                <path d="M256-200 200-256l224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
              </svg>
            </button>
          </div>
        </div>

        <div className={styles.content}>
          <div className={styles.posterBlock}>
            {images.length > 0 ? (
              <Image
                className={styles.poster}
                src={images[activeImageIndex]}
                alt={title}
                width={320}
                height={480}
                unoptimized
              />
            ) : (
              <div className={styles.posterPlaceholder}>No image</div>
            )}
            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  className={`${styles.arrowButton} ${styles.arrowLeft}`}
                  onClick={goPrev}
                  aria-label="Попереднє зображення"
                >
                  ←
                </button>
                <button
                  type="button"
                  className={`${styles.arrowButton} ${styles.arrowRight}`}
                  onClick={goNext}
                  aria-label="Наступне зображення"
                >
                  →
                </button>
              </>
            ) : null}
            {previewAction || previewMenuAction ? (
              previewAction && previewMenuAction ? (
                <div className={styles.previewActionsRow}>
                  <button
                    type="button"
                    className={styles.previewActionButton}
                    onClick={previewAction.onClick}
                    disabled={previewAction.disabled}
                  >
                    {previewAction.icon ? (
                      <span className={styles.previewActionIcon}>{previewAction.icon}</span>
                    ) : null}
                    <span className={styles.previewActionLabel}>{previewAction.label}</span>
                  </button>
                  <div className={styles.previewMenuWrap} ref={previewMenuRef}>
                    <button
                      type="button"
                      className={`${styles.previewMenuButton} ${
                        isPreviewMenuOpen ? styles.previewMenuButtonOpen : ""
                      }`}
                      onClick={() => setIsPreviewMenuOpen((prev) => !prev)}
                      aria-haspopup="menu"
                      aria-expanded={isPreviewMenuOpen}
                    >
                      <span className={styles.previewActionLabel}>{previewMenuAction.label}</span>
                      <span className={styles.previewMenuChevron}>▾</span>
                    </button>
                  </div>
                </div>
              ) : previewAction ? (
                <button
                  type="button"
                  className={styles.previewActionButton}
                  onClick={previewAction.onClick}
                  disabled={previewAction.disabled}
                >
                  {previewAction.icon ? (
                    <span className={styles.previewActionIcon}>{previewAction.icon}</span>
                  ) : null}
                  <span className={styles.previewActionLabel}>{previewAction.label}</span>
                </button>
              ) : (
                <div className={styles.previewMenuWrap} ref={previewMenuRef}>
                  <button
                    type="button"
                    className={`${styles.previewMenuButton} ${
                      isPreviewMenuOpen ? styles.previewMenuButtonOpen : ""
                    }`}
                    onClick={() => setIsPreviewMenuOpen((prev) => !prev)}
                    aria-haspopup="menu"
                    aria-expanded={isPreviewMenuOpen}
                  >
                    <span className={styles.previewActionLabel}>{previewMenuAction.label}</span>
                    <span className={styles.previewMenuChevron}>▾</span>
                  </button>
                </div>
              )
            ) : null}
          </div>
          <div className={styles.details}>
            {typeof children === "function" ? children({ fitBadge }) : children}

            <div className={styles.formBlock}>
              {platformOptions.length > 0 ? (
                <div className={`${styles.label} ${styles.platformsField}`} ref={platformsRef}>
                  Платформа
                  <button
                    type="button"
                    className={styles.multiSelectTrigger}
                    onClick={() => setIsPlatformsOpen((prev) => !prev)}
                    disabled={readOnly || isSaving}
                  >
                    <span className={styles.multiSelectText}>
                      {selectedPlatformsLabel}
                    </span>
                    <span className={styles.multiSelectChevron}>▾</span>
                  </button>
                  {isPlatformsOpen ? (
                    <div className={styles.multiSelectMenu}>
                      {platformOptions.map((option) => {
                        const checked = platforms.includes(option);
                        return (
                          <label key={option} className={styles.multiSelectOption}>
                            <input
                              className={styles.checkbox}
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setPlatforms((prev) =>
                                  checked
                                    ? prev.filter((value) => value !== option)
                                    : [...prev, option],
                                );
                              }}
                            />
                            {option}
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {availabilityOptions.length > 0 ? (
                <div className={`${styles.label} ${styles.platformsField}`} ref={availabilityRef}>
                  Наявність
                  <button
                    type="button"
                    className={styles.multiSelectTrigger}
                    onClick={() => {
                      setIsPlatformsOpen(false);
                      setIsAvailabilityOpen((prev) => !prev);
                    }}
                    disabled={readOnly || isSaving}
                  >
                    <span className={styles.multiSelectText}>
                      {selectedAvailabilityLabel}
                    </span>
                    <span className={styles.multiSelectChevron}>▾</span>
                  </button>
                  {isAvailabilityOpen ? (
                    <div className={styles.multiSelectMenu}>
                      {availabilityOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={styles.singleSelectOption}
                          onClick={() => {
                            setAvailability(option);
                            setIsAvailabilityOpen(false);
                          }}
                        >
                          <span>{option}</span>
                          {availability === option ? (
                            <span className={styles.singleSelectCheck}>✓</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.formRow}>
                <label className={styles.label}>
                  Коментар
                  <textarea
                    className={styles.textarea}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  disabled={readOnly || isSaving}
                  />
                </label>
              </div>

              <div
                className={`${styles.checkboxRow} ${
                  !isViewed ? styles.labelDisabled : ""
                }`}
              >
                <label className={styles.checkboxLabel}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={isViewed}
                    onChange={(event) => {
                      const nextIsViewed = event.target.checked;
                      setIsViewed(nextIsViewed);
                      if (nextIsViewed) {
                        setViewedAt(today);
                      }
                      if (nextIsViewed && viewPercent <= 0) {
                        setViewPercent(100);
                        setViewPercentInput("100");
                      }
                    }}
                    disabled={readOnly || isSaving}
                  />
                  Переглянуто
                </label>
                <div className={styles.checkboxRowTrailing}>
                  <div className={styles.ratingControl}>
                    <button
                      type="button"
                      className={styles.ratingStepButton}
                      onClick={decreaseViewPercent}
                      disabled={isViewPercentDisabled}
                      aria-label="Зменшити відсоток перегляду на 10"
                    >
                      -
                    </button>
                    <input
                      className={`${styles.input} ${styles.percentValueInput}`}
                      type="text"
                      inputMode="numeric"
                      value={viewPercentInput}
                      onChange={(event) => handleViewPercentInputChange(event.target.value)}
                      onBlur={handleViewPercentInputBlur}
                      disabled={isViewPercentDisabled}
                      aria-label="Відсоток перегляду від 0 до 100 з кроком 10"
                    />
                    <button
                      type="button"
                      className={styles.ratingStepButton}
                      onClick={increaseViewPercent}
                      disabled={isViewPercentDisabled}
                      aria-label="Збільшити відсоток перегляду на 10"
                    >
                      +
                    </button>
                  </div>
                  <span className={styles.percentLabel}>%</span>
                </div>
              </div>

              <label
                className={`${styles.label} ${styles.inlineLabel} ${
                  !isViewed ? styles.labelDisabled : ""
                }`}
              >
                <span>Дата перегляду</span>
                <input
                  id={viewedAtId}
                  className={`${styles.input} ${styles.dateInput}`}
                  type="date"
                  value={viewedAtDisplay}
                  onChange={(event) => setViewedAt(event.target.value)}
                  disabled={readOnly || !isViewed || isSaving}
                />
              </label>

              <label
                className={`${styles.label} ${styles.inlineLabel} ${
                  !isViewed ? styles.labelDisabled : ""
                }`}
              >
                <span className={styles.inlineLabelTitle}>Особистий рейтинг</span>
                <div className={styles.ratingControl}>
                  <button
                    type="button"
                    className={styles.ratingStepButton}
                    onClick={decreaseRating}
                    disabled={isRatingDisabled}
                    aria-label="Зменшити рейтинг на 0.5"
                  >
                    -
                  </button>
                  <input
                    className={`${styles.input} ${styles.ratingValueInput}`}
                    type="text"
                    inputMode="decimal"
                    value={ratingInput}
                    placeholder="-"
                    onChange={(event) => handleRatingInputChange(event.target.value)}
                    onBlur={handleRatingInputBlur}
                    disabled={isRatingDisabled}
                    aria-label="Особистий рейтинг від 1 до 5 з кроком 0.5"
                  />
                  <button
                    type="button"
                    className={styles.ratingStepButton}
                    onClick={increaseRating}
                    disabled={isRatingDisabled}
                    aria-label="Збільшити рейтинг на 0.5"
                  >
                    +
                  </button>
                </div>
              </label>

              {showRecommendSimilar ? (
                <label
                  className={`${styles.checkboxRow} ${
                    !isViewed ? styles.labelDisabled : ""
                  }`}
                >
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={recommendSimilar}
                    onChange={(event) => setRecommendSimilar(event.target.checked)}
                    disabled={readOnly || !isViewed || isSaving}
                  />
                  Рекомендувати подібне
                </label>
              ) : null}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          {saveError ? <p className={styles.error}>{saveError}</p> : null}
          <div className={styles.actions}>
            {extraActions ? (
              <div className={styles.actionsGroup}>{extraActions}</div>
            ) : null}
            <div className={styles.actionsPrimary}>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={onClose}
                disabled={isSaving || isRefreshing}
              >
                Закрити
              </button>
              <button
                type="button"
                className="btnBase btnPrimary"
                onClick={() => void handleAdd()}
                disabled={isSaving || isRefreshing}
              >
                {isSaving ? "Збереження..." : submitLabel}
              </button>
            </div>
          </div>
        </div>
        {isConfirmOpen ? (
          <div
            className={styles.confirmOverlay}
            role="dialog"
            aria-modal="true"
            onClick={cancelDelete}
          >
            <div
              className={styles.confirmModal}
              onClick={(event) => event.stopPropagation()}
            >
              <p className={styles.confirmText}>Видалити запис?</p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className="btnBase btnSecondary"
                  onClick={cancelDelete}
                  disabled={isDeleting}
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  className="btnBase btnPrimary"
                  onClick={confirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? "Видалення..." : "Видалити"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {previewMenuOverlay}
    </div>
  );
}
