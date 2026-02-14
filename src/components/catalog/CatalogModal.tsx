"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import styles from "./CatalogModal.module.css";

type CatalogModalProps = {
  title: string;
  posterUrl?: string;
  imageUrls?: string[];
  onClose: () => void;
  size?: "default" | "wide";
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
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
  extraActions?: React.ReactNode;
  initialValues?: {
    viewedAt?: string;
    comment?: string | null;
    recommendSimilar?: boolean;
    isViewed?: boolean;
    rating?: number | null;
    viewPercent?: number | null;
    platforms?: string[] | null;
    availability?: string | null;
  };
  submitLabel?: string;
  children: React.ReactNode;
};

const ratingOptions = [3, 2, 1, 0, -1, -2, -3];

export default function CatalogModal({
  title,
  posterUrl,
  imageUrls,
  onClose,
  onAdd,
  onDelete,
  extraActions,
  initialValues,
  platformOptions = [],
  availabilityOptions = [],
  size = "default",
  submitLabel = "Додати",
  children,
}: CatalogModalProps) {
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
  const [rating, setRating] = useState(0);
  const [viewPercent, setViewPercent] = useState(100);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isPlatformsOpen, setIsPlatformsOpen] = useState(false);
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);
  const platformsRef = useRef<HTMLDivElement | null>(null);
  const availabilityRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isEditMode) {
      setViewedAt(today);
      setComment("");
      setRecommendSimilar(false);
      setIsViewed(true);
      setRating(0);
      setViewPercent(100);
      setPlatforms([]);
      setAvailability(null);
      return;
    }

    const normalizeDate = (value?: string) => {
      if (!value) return today;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return today;
      return date.toISOString().slice(0, 10);
    };

    setViewedAt(normalizeDate(initialViewedAt));
    setComment(initialComment ?? "");
    setRecommendSimilar(Boolean(initialRecommendSimilar));
    setIsViewed(initialIsViewed ?? true);
    setRating(initialRating ?? 0);
    setViewPercent(initialViewPercent ?? 100);
    setPlatforms(initialPlatformsKey ? initialPlatformsKey.split("|") : []);
    setAvailability(initialAvailability ?? null);
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (!isPlatformsOpen && !isAvailabilityOpen) return;
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
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, [isAvailabilityOpen, isPlatformsOpen]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [posterUrl, imageUrls]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleAdd = async () => {
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
      });
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

  const handleDelete = async () => {
    if (!onDelete) {
      return;
    }

    setIsConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    setSaveError("");

    try {
      await onDelete();
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

  const viewedAtDisplay = isViewed ? viewedAt : "";
  const selectedPlatformsLabel =
    platforms.length > 0 ? platforms.join(", ") : "Оберіть платформу";
  const selectedAvailabilityLabel = availability ?? "Оберіть наявність";

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
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.headerActions}>
            {onDelete ? (
              <button
                type="button"
                className={`${styles.iconButton} ${styles.deleteButton}`}
                onClick={handleDelete}
                aria-label="Видалити"
                disabled={isSaving || isDeleting}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 -960 960 960"
                  width="20"
                  height="20"
                  aria-hidden="true"
                >
                  <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
                </svg>
              </button>
            ) : null}
            <button
              type="button"
              className={`${styles.iconButton} btnSecondary`}
              onClick={onClose}
              aria-label="Закрити"
              disabled={isSaving}
            >
              ✕
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
          </div>
          <div className={styles.details}>
            {children}

            <div className={styles.formBlock}>
              {platformOptions.length > 0 ? (
                <div className={`${styles.label} ${styles.platformsField}`} ref={platformsRef}>
                  Платформа
                  <button
                    type="button"
                    className={styles.multiSelectTrigger}
                    onClick={() => setIsPlatformsOpen((prev) => !prev)}
                    disabled={isSaving}
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
                    disabled={isSaving}
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
                  disabled={isSaving}
                  />
                </label>
              </div>

              <div className={styles.checkboxRow}>
                <label className={styles.checkboxLabel}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={isViewed}
                    onChange={(event) => {
                      const nextIsViewed = event.target.checked;
                      setIsViewed(nextIsViewed);
                      if (nextIsViewed && viewPercent <= 0) {
                        setViewPercent(100);
                      }
                    }}
                    disabled={isSaving}
                  />
                  Переглянуто
                </label>
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={100}
                  value={viewPercent}
                  onChange={(event) =>
                    setViewPercent(Number(event.target.value))
                  }
                  disabled={!isViewed || isSaving}
                  aria-label="Відсоток перегляду"
                />
                <span className={styles.percentLabel}>%</span>
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
                  disabled={!isViewed || isSaving}
                />
              </label>

              <label
                className={`${styles.label} ${styles.inlineLabel} ${
                  !isViewed ? styles.labelDisabled : ""
                }`}
              >
                <span>Особистий рейтинг</span>
                <select
                  className={`${styles.select} ${styles.inlineSelect}`}
                  value={rating}
                  onChange={(event) => setRating(Number(event.target.value))}
                  disabled={!isViewed || isSaving}
                >
                  {ratingOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

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
                  disabled={!isViewed || isSaving}
                />
                Рекомендувати подібне
              </label>
            </div>
          </div>
        </div>

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
              disabled={isSaving || isDeleting}
            >
              Відмінити
            </button>
            <button
              type="button"
              className="btnBase btnPrimary"
              onClick={handleAdd}
              disabled={isSaving || isDeleting}
            >
              {isSaving ? "Збереження..." : submitLabel}
            </button>
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
    </div>
  );
}
