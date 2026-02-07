 "use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
 import { supabase } from "@/lib/supabase/client";

type LogoutButtonProps = {
  showLabel?: boolean;
};

export default function LogoutButton({ showLabel = false }: LogoutButtonProps) {
   const router = useRouter();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

   const handleLogout = async () => {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
    setIsLoggingOut(false);
   };

  const handleLogoutWithConfirm = async () => {
    setIsConfirmOpen(true);
  };

  const cancelLogout = () => {
    if (isLoggingOut) return;
    setIsConfirmOpen(false);
  };

  const confirmLogout = async () => {
    if (isLoggingOut) return;
    await handleLogout();
    setIsConfirmOpen(false);
  };

  if (showLabel) {
    return (
      <div className="navLogout">
        <button
          type="button"
          className="navLink"
          aria-label="Вийти з акаунту"
          onClick={handleLogoutWithConfirm}
        >
          <svg
            className="navIcon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 -960 960 960"
            aria-hidden="true"
          >
            <path d="M440-440q17 0 28.5-11.5T480-480q0-17-11.5-28.5T440-520q-17 0-28.5 11.5T400-480q0 17 11.5 28.5T440-440ZM280-120v-80l240-40v-445q0-15-9-27t-23-14l-208-34v-80l220 36q44 8 72 41t28 77v512l-320 54Zm-160 0v-80h80v-560q0-34 23.5-57t56.5-23h400q34 0 57 23t23 57v560h80v80H120Zm160-80h400v-560H280v560Z" />
          </svg>
          <span className="navLabel">Вийти</span>
        </button>
        {isConfirmOpen ? (
          <div
            className="confirmOverlay"
            role="dialog"
            aria-modal="true"
            onClick={cancelLogout}
          >
            <div
              className="confirmModal"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="confirmText">Вийти з акаунту?</p>
              <div className="confirmActions">
                <button
                  type="button"
                  className="btnBase btnPrimary"
                  onClick={cancelLogout}
                  disabled={isLoggingOut}
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  className="btnBase btnSecondary"
                  onClick={confirmLogout}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? "Вихід..." : "Вийти"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="navLogout">
      <button type="button" className="navLink" aria-label="Мій профіль">
        <svg
          className="navIcon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 -960 960 960"
          aria-hidden="true"
        >
          <path d="M367-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q560-607 560-640t-23.5-56.5Q513-720 480-720t-56.5 23.5Q400-673 400-640t23.5 56.5Q447-560 480-560t56.5-23.5ZM480-640Zm0 400Z" />
        </svg>
      </button>
      <div className="navTooltip" role="tooltip">
        <button
          type="button"
          className="navTooltipButton"
          onClick={handleLogoutWithConfirm}
        >
          Logout
        </button>
      </div>
      {isConfirmOpen ? (
        <div
          className="confirmOverlay"
          role="dialog"
          aria-modal="true"
          onClick={cancelLogout}
        >
          <div
            className="confirmModal"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="confirmText">Вийти з акаунту?</p>
            <div className="confirmActions">
              <button
                type="button"
                className="btnBase btnPrimary"
                onClick={cancelLogout}
                disabled={isLoggingOut}
              >
                Скасувати
              </button>
              <button
                type="button"
                className="btnBase btnSecondary"
                onClick={confirmLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Вихід..." : "Вийти"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
 }
