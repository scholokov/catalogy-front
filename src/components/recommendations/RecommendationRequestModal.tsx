"use client";

import { useEffect, useMemo, useState } from "react";
import CloseIconButton from "@/components/ui/CloseIconButton";
import styles from "./RecommendationRequestModal.module.css";

export type RecommendationRequestOption = {
  value: string;
  label: string;
};

type RecommendationRequestModalProps = {
  title: string;
  scopeLabel: string;
  options: RecommendationRequestOption[];
  emptyMessage: string;
  isLoading: boolean;
  isSubmitting: boolean;
  statusMessage?: string;
  statusTone?: "info" | "error";
  canPreviewPrompt?: boolean;
  isPreviewingPrompt?: boolean;
  promptPreview?: string;
  placeholder: string;
  onClose: () => void;
  onPreviewPrompt?: (scopeValue: string, wishes: string) => Promise<void>;
  onSubmit: (scopeValue: string, wishes: string) => Promise<void>;
};

const MAX_WISHES = 280;

export default function RecommendationRequestModal({
  title,
  scopeLabel,
  options,
  emptyMessage,
  isLoading,
  isSubmitting,
  statusMessage,
  statusTone = "info",
  canPreviewPrompt = false,
  isPreviewingPrompt = false,
  promptPreview,
  placeholder,
  onClose,
  onPreviewPrompt,
  onSubmit,
}: RecommendationRequestModalProps) {
  const [selectedScope, setSelectedScope] = useState("");
  const [wishes, setWishes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  const remaining = useMemo(() => MAX_WISHES - wishes.length, [wishes.length]);
  const activeSelectedScope = useMemo(() => {
    if (options.some((option) => option.value === selectedScope)) {
      return selectedScope;
    }
    return options[0]?.value ?? "";
  }, [options, selectedScope]);

  const handleSubmit = async () => {
    if (!activeSelectedScope) {
      setError(`Оберіть ${scopeLabel.toLowerCase()}.`);
      return;
    }
    setError("");
    await onSubmit(activeSelectedScope, wishes.trim());
  };

  const handlePreviewPrompt = async () => {
    if (!activeSelectedScope) {
      setError(`Оберіть ${scopeLabel.toLowerCase()}.`);
      return;
    }
    if (!onPreviewPrompt) {
      return;
    }
    setError("");
    await onPreviewPrompt(activeSelectedScope, wishes.trim());
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <CloseIconButton
            className={`${styles.closeButton} btnSecondary`}
            onClick={onClose}
            disabled={isSubmitting}
          />
        </div>

        <div className={styles.body}>
          {isLoading ? (
            <p className={styles.empty}>Завантаження доступних варіантів…</p>
          ) : options.length === 0 ? (
            <p className={styles.empty}>{emptyMessage}</p>
          ) : (
            <label className={styles.label}>
              {scopeLabel}
              <div className={styles.options}>
                {options.map((option) => (
                  <label key={option.value} className={styles.optionRow}>
                    <input
                      className={styles.radio}
                      type="radio"
                      name="recommendation-scope"
                      value={option.value}
                      checked={activeSelectedScope === option.value}
                      onChange={() => setSelectedScope(option.value)}
                      disabled={isSubmitting}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </label>
          )}

          <label className={styles.label}>
            Побажання до рекомендації
            <textarea
              className={styles.textarea}
              value={wishes}
              maxLength={MAX_WISHES}
              onChange={(event) => setWishes(event.target.value)}
              placeholder={placeholder}
              disabled={isSubmitting || isLoading}
            />
            <span className={styles.counter}>{remaining} / {MAX_WISHES}</span>
          </label>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {statusMessage ? (
          <p
            className={statusTone === "error" ? styles.statusError : styles.status}
            aria-live="polite"
          >
            {statusMessage}
          </p>
        ) : null}
        {promptPreview ? (
          <div className={styles.previewPanel}>
            <span className={styles.previewLabel}>Prompt preview</span>
            <pre className={styles.previewContent}>{promptPreview}</pre>
          </div>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className="btnBase btnSecondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Закрити
          </button>
          {canPreviewPrompt ? (
            <button
              type="button"
              className="btnBase btnSecondary"
              onClick={() => {
                void handlePreviewPrompt();
              }}
              disabled={isSubmitting || isLoading || isPreviewingPrompt || options.length === 0}
            >
              {isPreviewingPrompt ? "Готуємо prompt..." : "Показати prompt"}
            </button>
          ) : null}
          <button
            type="button"
            className="btnBase btnPrimary"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={isSubmitting || isLoading || options.length === 0}
          >
            {isSubmitting ? "Рекомендуємо..." : "Рекомендувати"}
          </button>
        </div>
      </div>
    </div>
  );
}
