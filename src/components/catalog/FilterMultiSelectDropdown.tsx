"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/components/catalog/CatalogSearch.module.css";

type FilterMultiSelectDropdownProps = {
  title: string;
  options: string[];
  selectedValues: string[];
  allSelected: boolean;
  allLabel?: string;
  emptyLabel: string;
  disabled?: boolean;
  onChange: (nextState: { selectedValues: string[]; allSelected: boolean }) => void;
};

export default function FilterMultiSelectDropdown({
  title,
  options,
  selectedValues,
  allSelected,
  allLabel = "Обрати всі",
  emptyLabel,
  disabled = false,
  onChange,
}: FilterMultiSelectDropdownProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const resolvedOptions = useMemo(() => (Array.isArray(options) ? options : []), [options]);
  const resolvedSelectedValues = useMemo(
    () => (Array.isArray(selectedValues) ? selectedValues : []),
    [selectedValues],
  );
  const resolvedAllSelected = Boolean(allSelected);
  const isDisabled = disabled || resolvedOptions.length === 0;
  const isMenuOpen = isOpen && !resolvedAllSelected && !isDisabled;
  const selectedLabel = useMemo(
    () => (resolvedSelectedValues.length > 0 ? resolvedSelectedValues.join(", ") : emptyLabel),
    [emptyLabel, resolvedSelectedValues],
  );

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  return (
    <div className={styles.filtersGroup}>
      <p className={styles.filtersGroupTitle}>{title}</p>
      <div className={styles.filtersControls}>
        <label className={styles.filtersOption}>
          <input
            className={styles.filtersCheckbox}
            type="checkbox"
            checked={resolvedAllSelected}
            disabled={isDisabled}
            onChange={(event) => {
              const checked = event.target.checked;
              onChange({
                allSelected: checked,
                selectedValues: checked ? [] : resolvedSelectedValues,
              });
              setIsOpen(!checked);
            }}
          />
          {allLabel}
        </label>
      </div>
      <div
        ref={containerRef}
        className={`${styles.filtersDropdownField} ${
          resolvedAllSelected || isDisabled ? styles.filtersDropdownFieldDisabled : ""
        }`}
      >
        <button
          type="button"
          className={styles.filtersDropdownTrigger}
          disabled={resolvedAllSelected || isDisabled}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <span className={styles.filtersDropdownText}>{selectedLabel}</span>
          <span className={styles.filtersDropdownChevron}>▾</span>
        </button>
        {isMenuOpen ? (
          <div className={styles.filtersDropdownMenu}>
            {resolvedOptions.map((option) => {
              const checked = resolvedSelectedValues.includes(option);
              return (
                <label key={option} className={styles.filtersDropdownOption}>
                  <input
                    className={styles.filtersCheckbox}
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const nextValues = checked
                        ? resolvedSelectedValues.filter((value) => value !== option)
                        : [...resolvedSelectedValues, option];
                      onChange({
                        selectedValues: nextValues,
                        allSelected: nextValues.length === 0,
                      });
                    }}
                  />
                  {option}
                </label>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
