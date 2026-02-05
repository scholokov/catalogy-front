import styles from "./SearchInput.module.css";

type SearchInputProps = {
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  value?: string;
  onChange?: (value: string) => void;
};

export default function SearchInput({
  id,
  placeholder = "Пошук",
  ariaLabel = "Пошук",
  value,
  onChange,
}: SearchInputProps) {
  return (
    <input
      className={styles.input}
      id={id}
      type="search"
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoComplete="off"
      value={value}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
    />
  );
}
