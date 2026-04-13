"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "./AuthForm.module.css";

export type AuthMode =
  | "signin"
  | "signup"
  | "forgot-password"
  | "reset-password";

type AuthFormProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  externalFeedback?: { type: "error" | "success"; text: string } | null;
};

type FeedbackState =
  | { type: "idle"; text: "" }
  | { type: "error" | "success"; text: string };

type ValidationErrors = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

const MODE_COPY: Record<
  AuthMode,
  {
    description: string;
    submitLabel: string;
    alternatePrompt: string;
    alternateAction: string;
    alternateMode: AuthMode;
  }
> = {
  signin: {
    description: "Увійди у свій акаунт, щоб повернутися до власної колекції.",
    submitLabel: "Увійти",
    alternatePrompt: "Ще немає акаунта?",
    alternateAction: "Зареєструватися",
    alternateMode: "signup",
  },
  signup: {
    description: "Створи акаунт, щоб зберігати фільми та ігри у власній історії.",
    submitLabel: "Створити акаунт",
    alternatePrompt: "Вже є акаунт?",
    alternateAction: "Увійти",
    alternateMode: "signin",
  },
  "forgot-password": {
    description: "Введи email, і ми надішлемо посилання для відновлення паролю.",
    submitLabel: "Надіслати лист",
    alternatePrompt: "Згадав пароль?",
    alternateAction: "Повернутися до входу",
    alternateMode: "signin",
  },
  "reset-password": {
    description: "Введи новий пароль для свого акаунта.",
    submitLabel: "Зберегти новий пароль",
    alternatePrompt: "Хочеш повернутися до входу?",
    alternateAction: "До авторизації",
    alternateMode: "signin",
  },
};

const EXISTING_ACCOUNT_MESSAGE =
  "Акаунт з таким email уже існує. Спробуй увійти замість повторної реєстрації.";

const mapAuthErrorMessage = (message: string) => {
  if (message === "Email not confirmed") {
    return "Email ще не підтверджено.";
  }

  if (message === "Invalid login credentials") {
    return "Невірний email або пароль.";
  }

  if (message === "Auth session missing!") {
    return "Сесія відновлення пароля відсутня або вже недійсна. Запроси новий лист.";
  }

  return message;
};

export default function AuthForm({
  mode,
  onModeChange,
  externalFeedback = null,
}: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});
  const [feedback, setFeedback] = useState<FeedbackState>({
    type: "idle",
    text: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [signupSuccessEmail, setSignupSuccessEmail] = useState<string | null>(null);
  const [passwordResetEmail, setPasswordResetEmail] = useState<string | null>(null);
  const [passwordResetComplete, setPasswordResetComplete] = useState(false);

  const copy = MODE_COPY[mode];
  const isTabMode = mode === "signin" || mode === "signup";
  const showEmailField =
    mode === "signin" || mode === "signup" || mode === "forgot-password";
  const showPasswordField =
    mode === "signin" || mode === "signup" || mode === "reset-password";
  const showConfirmPasswordField =
    mode === "signup" || mode === "reset-password";

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === mode || isLoading) return;
    onModeChange(nextMode);
  };

  const validateForm = () => {
    const nextErrors: ValidationErrors = {};

    if (showEmailField) {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        nextErrors.email = "Введи email.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        nextErrors.email = "Введи коректний email.";
      }
    }

    if (showPasswordField) {
      if (!password) {
        nextErrors.password = "Введи пароль.";
      } else if (password.length < 6) {
        nextErrors.password = "Пароль має містити щонайменше 6 символів.";
      }
    }

    if (showConfirmPasswordField) {
      if (!confirmPassword) {
        nextErrors.confirmPassword =
          mode === "reset-password"
            ? "Підтвердь новий пароль."
            : "Підтвердь пароль.";
      } else if (confirmPassword.length < 6) {
        nextErrors.confirmPassword = "Пароль має містити щонайменше 6 символів.";
      } else if (password !== confirmPassword) {
        nextErrors.confirmPassword = "Паролі не збігаються.";
      }
    }

    return nextErrors;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback({ type: "idle", text: "" });
    const nextErrors = validateForm();
    setValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsLoading(true);

    if (mode === "forgot-password") {
      const redirectTo = `${window.location.origin}/auth?mode=reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        setFeedback({ type: "error", text: mapAuthErrorMessage(error.message) });
      } else {
        setPasswordResetEmail(email);
        setValidationErrors({});
        setFeedback({
          type: "success",
          text: "Лист для відновлення паролю надіслано.",
        });
      }

      setIsLoading(false);
      return;
    }

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setFeedback({ type: "error", text: mapAuthErrorMessage(error.message) });
      } else {
        setValidationErrors({});
        setFeedback({ type: "success", text: "Успішний вхід." });
      }

      setIsLoading(false);
      return;
    }

    if (mode === "reset-password") {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setFeedback({ type: "error", text: mapAuthErrorMessage(error.message) });
      } else {
        setPassword("");
        setConfirmPassword("");
        setPasswordResetComplete(true);
        setValidationErrors({});
        setFeedback({
          type: "success",
          text: "Новий пароль збережено.",
        });
      }

      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setFeedback({ type: "error", text: mapAuthErrorMessage(error.message) });
      setIsLoading(false);
      return;
    }

    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setFeedback({ type: "error", text: EXISTING_ACCOUNT_MESSAGE });
      setIsLoading(false);
      return;
    }

    setSignupSuccessEmail(email);
    setPassword("");
    setConfirmPassword("");
    setValidationErrors({});
    setFeedback({
      type: "success",
      text: "Підтвердження реєстрації надіслано на пошту.",
    });
    setIsLoading(false);
  };

  return (
    <div className={styles.root}>
      {isTabMode ? (
        <div className={styles.modeSwitcher} role="tablist" aria-label="Режим авторизації">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={`${styles.modeButton}${
              mode === "signin" ? ` ${styles.modeButtonActive}` : ""
            }`}
            onClick={() => switchMode("signin")}
            disabled={isLoading}
          >
            Увійти
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={`${styles.modeButton}${
              mode === "signup" ? ` ${styles.modeButtonActive}` : ""
            }`}
            onClick={() => switchMode("signup")}
            disabled={isLoading}
          >
            Зареєструватися
          </button>
        </div>
      ) : null}

      <p className={styles.text}>{copy.description}</p>

      {signupSuccessEmail ? (
        <div className={styles.successPanel}>
          <h3 className={styles.successTitle}>Перевір пошту</h3>
          <p className={styles.successText}>
            Ми надіслали лист для підтвердження реєстрації на <strong>{signupSuccessEmail}</strong>.
          </p>
          <p className={styles.successText}>
            Після підтвердження повернися сюди та увійди у свій акаунт.
          </p>
          <button
            type="button"
            className="btnBase btnPrimary"
            onClick={() => onModeChange("signin")}
          >
            Перейти до входу
          </button>
        </div>
      ) : passwordResetEmail ? (
        <div className={styles.successPanel}>
          <h3 className={styles.successTitle}>Перевір пошту</h3>
          <p className={styles.successText}>
            Ми надіслали лист для відновлення паролю на <strong>{passwordResetEmail}</strong>.
          </p>
          <p className={styles.successText}>
            Відкрий посилання з листа, щоб задати новий пароль.
          </p>
          <button
            type="button"
            className="btnBase btnPrimary"
            onClick={() => onModeChange("signin")}
          >
            Повернутися до входу
          </button>
        </div>
      ) : passwordResetComplete ? (
        <div className={styles.successPanel}>
          <h3 className={styles.successTitle}>Пароль оновлено</h3>
          <p className={styles.successText}>
            Новий пароль успішно збережено. Тепер можна продовжити з оновленими даними входу.
          </p>
          <button
            type="button"
            className="btnBase btnPrimary"
            onClick={() => onModeChange("signin")}
          >
            Продовжити
          </button>
        </div>
      ) : (
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          {showEmailField ? (
            <label className={styles.label}>
              Email
              <input
                className={`${styles.input} ${styles.inputPlain}${
                  validationErrors.email ? ` ${styles.inputError}` : ""
                }`}
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setValidationErrors((prev) => ({ ...prev, email: undefined }));
                }}
                autoComplete="email"
                aria-invalid={Boolean(validationErrors.email)}
                aria-describedby={validationErrors.email ? "auth-email-error" : undefined}
              />
              {validationErrors.email ? (
                <span id="auth-email-error" className={styles.fieldError}>
                  {validationErrors.email}
                </span>
              ) : null}
            </label>
          ) : null}

          {showPasswordField ? (
            <label className={styles.label}>
              {mode === "reset-password" ? "Новий пароль" : "Пароль"}
              <div className={styles.passwordField}>
                <input
                  className={`${styles.input}${
                    validationErrors.password ? ` ${styles.inputError}` : ""
                  }`}
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setValidationErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  aria-invalid={Boolean(validationErrors.password)}
                  aria-describedby={validationErrors.password ? "auth-password-error" : undefined}
                />
                <button
                  className={styles.eyeButton}
                  type="button"
                  onClick={() => setIsPasswordVisible((prev) => !prev)}
                  aria-label={isPasswordVisible ? "Сховати пароль" : "Показати пароль"}
                >
                  {isPasswordVisible ? (
                    <svg
                      aria-hidden="true"
                      viewBox="0 -960 960 960"
                      className={styles.eyeIcon}
                    >
                      <path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z" />
                    </svg>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 -960 960 960"
                      className={styles.eyeIcon}
                    >
                      <path d="M607.5-372.5Q660-425 660-500t-52.5-127.5Q555-680 480-680t-127.5 52.5Q300-575 300-500t52.5 127.5Q405-320 480-320t127.5-52.5Zm-204-51Q372-455 372-500t31.5-76.5Q435-608 480-608t76.5 31.5Q588-545 588-500t-31.5 76.5Q525-392 480-392t-76.5-31.5ZM214-281.5Q94-363 40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200q-146 0-266-81.5ZM480-500Zm207.5 160.5Q782-399 832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280q113 0 207.5-59.5Z" />
                    </svg>
                  )}
                </button>
              </div>
              {validationErrors.password ? (
                <span id="auth-password-error" className={styles.fieldError}>
                  {validationErrors.password}
                </span>
              ) : null}
            </label>
          ) : null}

          {mode === "signin" ? (
            <button
              type="button"
              className={styles.inlineLinkButton}
              onClick={() => switchMode("forgot-password")}
              disabled={isLoading}
            >
              Забули пароль?
            </button>
          ) : null}

          {showConfirmPasswordField ? (
            <>
              <label className={styles.label}>
                {mode === "reset-password"
                  ? "Підтвердження нового пароля"
                  : "Підтвердження пароля"}
                <div className={styles.passwordField}>
                  <input
                    className={`${styles.input}${
                      validationErrors.confirmPassword ? ` ${styles.inputError}` : ""
                    }`}
                    type={isPasswordVisible ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      setValidationErrors((prev) => ({
                        ...prev,
                        confirmPassword: undefined,
                      }));
                    }}
                    autoComplete="new-password"
                    aria-invalid={Boolean(validationErrors.confirmPassword)}
                    aria-describedby={
                      validationErrors.confirmPassword ? "auth-confirm-password-error" : undefined
                    }
                  />
                  <button
                    className={styles.eyeButton}
                    type="button"
                    onClick={() => setIsPasswordVisible((prev) => !prev)}
                    aria-label={isPasswordVisible ? "Сховати пароль" : "Показати пароль"}
                  >
                    {isPasswordVisible ? (
                      <svg
                        aria-hidden="true"
                        viewBox="0 -960 960 960"
                        className={styles.eyeIcon}
                      >
                        <path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z" />
                      </svg>
                    ) : (
                      <svg
                        aria-hidden="true"
                        viewBox="0 -960 960 960"
                        className={styles.eyeIcon}
                      >
                        <path d="M607.5-372.5Q660-425 660-500t-52.5-127.5Q555-680 480-680t-127.5 52.5Q300-575 300-500t52.5 127.5Q405-320 480-320t127.5-52.5Zm-204-51Q372-455 372-500t31.5-76.5Q435-608 480-608t76.5 31.5Q588-545 588-500t-31.5 76.5Q525-392 480-392t-76.5-31.5ZM214-281.5Q94-363 40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200q-146 0-266-81.5ZM480-500Zm207.5 160.5Q782-399 832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280q113 0 207.5-59.5Z" />
                      </svg>
                    )}
                  </button>
                </div>
                {validationErrors.confirmPassword ? (
                  <span id="auth-confirm-password-error" className={styles.fieldError}>
                    {validationErrors.confirmPassword}
                  </span>
                ) : null}
              </label>
            </>
          ) : null}

          {feedback.type !== "idle" ? (
            <p
              className={`${styles.feedback} ${
                feedback.type === "error" ? styles.feedbackError : styles.feedbackSuccess
              }`}
            >
              {feedback.text}
            </p>
          ) : externalFeedback ? (
            <p
              className={`${styles.feedback} ${
                externalFeedback.type === "error"
                  ? styles.feedbackError
                  : styles.feedbackSuccess
              }`}
            >
              {externalFeedback.text}
            </p>
          ) : null}

          <div className={styles.actions}>
            <button
              className={`btnBase btnPrimary ${styles.submitButton}`}
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Зачекай..." : copy.submitLabel}
            </button>
          </div>
        </form>
      )}

      {!isTabMode ? (
        <div className={styles.footer}>
          <p className={styles.footerText}>{copy.alternatePrompt}</p>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => switchMode(copy.alternateMode)}
            disabled={isLoading}
          >
            {copy.alternateAction}
          </button>
        </div>
      ) : null}
    </div>
  );
}
