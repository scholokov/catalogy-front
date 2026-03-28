"use client";

import { useEffect, useState } from "react";
import CloseIconButton from "@/components/ui/CloseIconButton";
import styles from "./ProfilePromptPreviewModal.module.css";

type ProfilePromptPreviewModalProps = {
  title: string;
  content: string;
  onClose: () => void;
};

export default function ProfilePromptPreviewModal({
  title,
  content,
  onClose,
}: ProfilePromptPreviewModalProps) {
  const [copyLabel, setCopyLabel] = useState("Скопіювати");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyLabel("Скопійовано");
      window.setTimeout(() => {
        setCopyLabel("Скопіювати");
      }, 1500);
    } catch {
      setCopyLabel("Не вдалося");
      window.setTimeout(() => {
        setCopyLabel("Скопіювати");
      }, 1500);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.headerActions}>
            <button type="button" className="btnBase btnSecondary" onClick={() => void handleCopy()}>
              {copyLabel}
            </button>
            <CloseIconButton
              className={`${styles.closeButton} btnSecondary`}
              onClick={onClose}
            />
          </div>
        </div>
        <pre className={styles.content}>{content}</pre>
      </div>
    </div>
  );
}
