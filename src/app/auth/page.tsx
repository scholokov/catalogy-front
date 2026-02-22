"use client";

import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import CloseIconButton from "@/components/ui/CloseIconButton";
import { supabase } from "@/lib/supabase/client";
import styles from "./page.module.css";

export default function AuthPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session ?? null);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession && redirectTo) {
          router.push(redirectTo);
        }
      },
    );

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [redirectTo, router]);

  useEffect(() => {
    if (!session || redirectTo) return;
    router.replace("/");
  }, [redirectTo, router, session]);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Успішний вхід.");
    }

    setIsLoading(false);
  };

  const handleSignUp = async () => {
    setIsLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Перевір пошту для підтвердження реєстрації.");
    }

    setIsLoading(false);
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    setMessage("");
    await supabase.auth.signOut();
    setIsLoading(false);
  };

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Авторизація</h1>
          <CloseIconButton
            className={styles.closeButton}
            onClick={() => router.push("/")}
          />
        </div>
        <p className={styles.text}>Увійди або зареєструйся.</p>

        <form className={styles.form} onSubmit={handleSignIn}>
          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className={styles.label}>
            Пароль
            <div className={styles.passwordField}>
              <input
                className={styles.input}
                type={isPasswordVisible ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
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
          </label>

          <div className={styles.actions}>
            <button
              className={`${styles.primary} btnPrimary`}
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Зачекай..." : "Увійти"}
            </button>
            <button
              className={`${styles.secondary} btnSecondary`}
              type="button"
              onClick={handleSignUp}
              disabled={isLoading}
            >
              Зареєструватись
            </button>
          </div>
        </form>

        {session ? (
          <div className={styles.session}>
            <p className={styles.sessionText}>
              Ви увійшли як <strong>{session.user.email}</strong>
            </p>
            <button
              className={`${styles.secondary} btnSecondary`}
              type="button"
              onClick={handleSignOut}
              disabled={isLoading}
            >
              Вийти
            </button>
          </div>
        ) : null}

        {message ? <p className={styles.message}>{message}</p> : null}
      </main>
    </div>
  );
}
