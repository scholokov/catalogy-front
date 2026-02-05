"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import styles from "./page.module.css";

const statusMessages: Record<string, string> = {
  accepted: "Контакт додано.",
  invalid: "Посилання недійсне.",
  expired: "Інвайт вже неактивний.",
  revoked: "Інвайт відкликано.",
  max_uses: "Ліміт використань вичерпано.",
  self: "Не можна додати себе.",
  unauthorized: "Потрібна авторизація.",
};

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [message, setMessage] = useState("Перевіряємо інвайт...");

  useEffect(() => {
    const accept = async () => {
      const token = params.token;
      if (!token) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace(`/auth?redirect=/invites/${token}`);
        return;
      }

      const { data, error } = await supabase.rpc("accept_invite", {
        invite_token: token,
      });

      if (error) {
        setMessage("Не вдалося прийняти інвайт.");
        return;
      }

      setMessage(statusMessages[data as string] ?? "Готово.");
    };

    accept();
  }, [params.token, router]);

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <h1 className={styles.title}>Прийняття інвайта</h1>
        <p className={styles.text}>{message}</p>
        <button
          type="button"
          className="btnBase btnPrimary"
          onClick={() => router.push("/friends")}
        >
          До рекомендацій
        </button>
      </main>
    </div>
  );
}
