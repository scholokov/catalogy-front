"use client";

import styles from "./CloseIconButton.module.css";

type CloseIconButtonProps = {
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

export default function CloseIconButton({
  onClick,
  className,
  disabled = false,
  ariaLabel = "Закрити",
}: CloseIconButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.button}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
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
  );
}
