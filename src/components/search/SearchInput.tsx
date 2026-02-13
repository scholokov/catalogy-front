import styles from "./SearchInput.module.css";

type SearchInputProps = {
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  value?: string;
  onChange?: (value: string) => void;
  autoFocus?: boolean;
};

export default function SearchInput({
  id,
  placeholder = "Пошук",
  ariaLabel = "Пошук",
  value,
  onChange,
  autoFocus = false,
}: SearchInputProps) {
  return (
    <input
      className={styles.input}
      id={id}
      type="search"
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoComplete="off"
      autoFocus={autoFocus}
      value={value}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
    />
  );
}
