"use client";

import { useEffect, useId, useState } from "react";
import SearchInput from "./SearchInput";
import styles from "./Search.module.css";

type SearchProps = {
  onSearch?: (query: string) => void | Promise<void>;
  label?: string;
  placeholder?: string;
  buttonLabel?: string;
  isLoading?: boolean;
  mode?: "submit" | "instant";
  onButtonClick?: () => void;
};

export default function Search({
  onSearch,
  label = "Пошук",
  placeholder = "Пошук",
  buttonLabel = "Пошук",
  isLoading = false,
  mode = "submit",
  onButtonClick,
}: SearchProps) {
  const inputId = useId();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (mode !== "instant" || !onSearch) return;
    void onSearch(value.trim());
  }, [mode, onSearch, value]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode !== "submit" || !onSearch) return;
    await onSearch(value.trim());
  };

  return (
    <div className={styles.search}>
      {label ? (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <form className={styles.row} onSubmit={handleSubmit}>
        <SearchInput
          id={inputId}
          placeholder={placeholder}
          ariaLabel={label || placeholder}
          value={value}
          onChange={setValue}
        />
        <button
          className={`${styles.button} btnPrimary`}
          type={mode === "submit" ? "submit" : "button"}
          disabled={isLoading}
          onClick={mode === "submit" ? undefined : onButtonClick}
        >
          {isLoading && mode === "submit" ? "Шукаємо..." : buttonLabel}
        </button>
      </form>
    </div>
  );
}
