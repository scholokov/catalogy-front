"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type EmailOtpType, Session } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import CloseIconButton from "@/components/ui/CloseIconButton";
import AuthForm, { type AuthMode } from "@/components/auth/AuthForm";
import { supabase } from "@/lib/supabase/client";
import styles from "./page.module.css";

export default function AuthPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isProcessingAuthLink, setIsProcessingAuthLink] = useState(false);
  const [hasRecoveryFlow, setHasRecoveryFlow] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.location.hash.includes("type=recovery") ||
      window.location.search.includes("mode=reset-password") ||
      window.location.search.includes("type=recovery")
    );
  });
  const handledCodeRef = useRef<string | null>(null);
  const handledTokenHashRef = useRef<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const requestedMode = searchParams.get("mode");
  const authCode = searchParams.get("code");
  const authType = searchParams.get("type");
  const tokenHash = searchParams.get("token_hash");
  const mode = useMemo<AuthMode>(
    () => {
      if (hasRecoveryFlow) return "reset-password";
      if (
        requestedMode === "signup" ||
        requestedMode === "forgot-password" ||
        requestedMode === "reset-password"
      ) {
        return requestedMode;
      }
      return "signin";
    },
    [hasRecoveryFlow, requestedMode],
  );

  useEffect(() => {
    let isCancelled = false;

    const resolveAuthLink = async () => {
      if (authCode && handledCodeRef.current !== authCode) {
        handledCodeRef.current = authCode;
        setIsProcessingAuthLink(true);
        const { error } = await supabase.auth.exchangeCodeForSession(authCode);
        if (!isCancelled) {
          setIsProcessingAuthLink(false);
          if (!error && (requestedMode === "reset-password" || authType === "recovery")) {
            setHasRecoveryFlow(true);
          }
        }
        return;
      }

      if (
        tokenHash &&
        authType &&
        handledTokenHashRef.current !== tokenHash
      ) {
        handledTokenHashRef.current = tokenHash;
        setIsProcessingAuthLink(true);
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: authType as EmailOtpType,
        });
        if (!isCancelled) {
          setIsProcessingAuthLink(false);
          if (!error && authType === "recovery") {
            setHasRecoveryFlow(true);
            router.replace("/auth?mode=reset-password");
          }
        }
        return;
      }

      if (authType === "recovery") {
        setHasRecoveryFlow(true);
      }
    };

    void resolveAuthLink();

    return () => {
      isCancelled = true;
    };
  }, [authCode, authType, requestedMode, router, tokenHash]);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session ?? null);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        setSession(nextSession);
        if (event === "PASSWORD_RECOVERY") {
          setHasRecoveryFlow(true);
          return;
        }
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
    if (!session || redirectTo || hasRecoveryFlow || isProcessingAuthLink) return;
    router.replace("/");
  }, [hasRecoveryFlow, isProcessingAuthLink, redirectTo, router, session]);

  const setMode = (nextMode: AuthMode) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextMode === "signin") {
      nextParams.delete("mode");
    } else {
      nextParams.set("mode", nextMode);
    }
    setHasRecoveryFlow(nextMode === "reset-password");
    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `/auth?${nextSearch}` : "/auth");
  };

  const pageTitle =
    mode === "signup"
      ? "Реєстрація"
      : mode === "forgot-password"
        ? "Відновлення паролю"
        : mode === "reset-password"
          ? "Новий пароль"
          : "Авторизація";

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>{pageTitle}</h1>
          <CloseIconButton
            className={styles.closeButton}
            onClick={() => router.push("/")}
          />
        </div>
        <AuthForm key={mode} mode={mode} onModeChange={setMode} />
      </main>
    </div>
  );
}
