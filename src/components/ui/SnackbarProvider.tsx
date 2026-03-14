"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./SnackbarProvider.module.css";

type SnackbarContextValue = {
  showSnackbar: (message: string, durationMs?: number) => void;
};

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

type SnackbarProviderProps = {
  children: React.ReactNode;
};

export function SnackbarProvider({ children }: SnackbarProviderProps) {
  const timeoutRef = useRef<number | null>(null);
  const [message, setMessage] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  const showSnackbar = useCallback((nextMessage: string, durationMs = 1600) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setMessage(nextMessage);
    setIsVisible(true);
    timeoutRef.current = window.setTimeout(() => {
      setIsVisible(false);
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const value = useMemo(() => ({ showSnackbar }), [showSnackbar]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {message ? (
        <div className={styles.snackbarContainer} aria-live="polite" role="status">
          <div className={`${styles.snackbar} ${isVisible ? styles.snackbarVisible : ""}`}>
            {message}
          </div>
        </div>
      ) : null}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error("useSnackbar must be used within SnackbarProvider");
  }
  return context;
}
