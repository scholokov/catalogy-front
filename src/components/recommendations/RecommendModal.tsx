"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getDisplayName } from "@/lib/users/displayName";
import styles from "./RecommendModal.module.css";

type ContactOption = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  disabledReason?: string;
};

type RecommendModalProps = {
  title: string;
  contacts: ContactOption[];
  onClose: () => void;
  onSend: (contactIds: string[], comment: string) => Promise<number>;
  onSent?: (sentCount: number) => void;
};

const MAX_COMMENT = 280;

export default function RecommendModal({
  title,
  contacts,
  onClose,
  onSend,
  onSent,
}: RecommendModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  const remaining = useMemo(
    () => MAX_COMMENT - comment.length,
    [comment.length],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const toggleContact = (id: string, disabledReason?: string) => {
    if (disabledReason) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectableContacts = useMemo(
    () => contacts.filter((contact) => !contact.disabledReason),
    [contacts],
  );

  useEffect(() => {
    const selectable = new Set(selectableContacts.map((contact) => contact.id));
    setSelectedIds((prev) => prev.filter((id) => selectable.has(id)));
  }, [selectableContacts]);

  const handleSend = async () => {
    if (selectedIds.length === 0) {
      setError("Оберіть хоча б одного контакта.");
      return;
    }

    setIsSending(true);
    setError("");

    try {
      const sentCount = await onSend(selectedIds, comment.trim());
      if (sentCount <= 0) {
        setError("Не вдалося надіслати рекомендацію.");
        return;
      }
      onSent?.(sentCount);
      onClose();
    } catch (sendError) {
      const message =
        sendError instanceof Error && sendError.message
          ? sendError.message
          : "Не вдалося надіслати рекомендацію.";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Порекомендувати: {title}</h2>
          <button
            type="button"
            className={`${styles.closeButton} btnSecondary`}
            onClick={onClose}
            aria-label="Закрити"
            disabled={isSending}
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {contacts.length === 0 ? (
            <p className={styles.empty}>Немає контактів для рекомендацій.</p>
          ) : (
            <div className={styles.contacts}>
              {contacts.map((contact) => (
                <label key={contact.id} className={styles.contactRow}>
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={selectedIds.includes(contact.id)}
                    onChange={() => toggleContact(contact.id, contact.disabledReason)}
                    disabled={isSending || Boolean(contact.disabledReason)}
                  />
                  {contact.avatarUrl ? (
                    <Image
                      src={contact.avatarUrl}
                      alt={contact.name}
                      className={styles.avatar}
                      width={28}
                      height={28}
                      unoptimized
                    />
                  ) : (
                    <div className={styles.avatarPlaceholder} />
                  )}
                  <span>{getDisplayName(contact.name, contact.id)}</span>
                  {contact.disabledReason ? (
                    <span className={styles.hintText}>{contact.disabledReason}</span>
                  ) : null}
                </label>
              ))}
            </div>
          )}

          <label className={styles.label}>
            Коментар (опційно)
            <textarea
              className={styles.textarea}
              value={comment}
              maxLength={MAX_COMMENT}
              onChange={(event) => setComment(event.target.value)}
              disabled={isSending}
            />
            <span className={styles.counter}>{remaining} / {MAX_COMMENT}</span>
          </label>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className="btnBase btnSecondary"
            onClick={onClose}
            disabled={isSending}
          >
            Відмінити
          </button>
          <button
            type="button"
            className="btnBase btnPrimary"
            onClick={handleSend}
            disabled={isSending || selectableContacts.length === 0}
          >
            {isSending ? "Надсилання..." : "Надіслати"}
          </button>
        </div>
      </div>
    </div>
  );
}
