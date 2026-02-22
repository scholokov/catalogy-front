"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import CloseIconButton from "@/components/ui/CloseIconButton";
import { supabase } from "@/lib/supabase/client";
import authStyles from "./auth/page.module.css";
import { useRouter } from "next/navigation";

const useInView = () => {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, inView] as const;
};

export default function HomeUnauthPage() {
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const router = useRouter();

  const [heroRef, heroInView] = useInView();
  const [moviesRef, moviesInView] = useInView();
  const [gamesRef, gamesInView] = useInView();
  const [friendsRef, friendsInView] = useInView();
  const [closingRef, closingInView] = useInView();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

  return (
    <div className="appContainer">
      <section className="heroSection" ref={heroRef}>
        <div className="heroMedia">
          <Image
            src="https://res.cloudinary.com/dmb4mtnpu/image/upload/v1770312464/d12e5905-8bd8-40ac-bd27-16fdf84393f8_wqfn6e.png"
            alt="Два світи. Один простір."
            fill
            className="heroImage"
            sizes="100vw"
            loading="lazy"
            unoptimized
          />
        </div>
        <div className="heroText">
          <div className={`textBlock${heroInView ? " textFadeIn" : ""}`}>
            <h1>Два світи. Один простір.</h1>
            <p>
              Фільми та ігри, які ти дивився і проходив. І ті, що ще чекають
              свого моменту.
            </p>
            <p>
              Без шуму. Без стрічок.
              <br />
              Просто — твоя особиста колекція.
            </p>
          </div>
        </div>
      </section>

      <section className="contentSection" ref={moviesRef}>
        <div className="imagePlaceholder contentMedia">
          <Image
            src="https://res.cloudinary.com/dmb4mtnpu/image/upload/v1770312742/ChatGPT_Image_5_%D0%BB%D1%8E%D1%82._2026_%D1%80._19_32_04_bdvnpv.png"
            alt="Кіно — це більше, ніж перегляд."
            width={720}
            height={480}
            className="contentImage"
            loading="lazy"
            unoptimized
          />
          <div className="contentText">
            <div className={`textBlock${moviesInView ? " textFadeIn" : ""}`}>
              <h2>Кіно — це більше, ніж перегляд.</h2>
              <p>Фільми — це вечори, настрої й періоди життя.</p>
              <p>
                Тут ти зберігаєш не «переглянуто», а те, що для тебе щось означає.
              </p>
              <p>
                Повертайся до улюбленого. Або відкладай те, що чекає свого часу.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="contentSection" ref={gamesRef}>
        <div className="imagePlaceholder contentMedia">
          <Image
            src="https://res.cloudinary.com/dmb4mtnpu/image/upload/v1770312908/ChatGPT_Image_5_%D0%BB%D1%8E%D1%82._2026_%D1%80._19_33_31_igruwo.png"
            alt="Ігри — це досвід, а не галочки."
            width={720}
            height={480}
            className="contentImage"
            loading="lazy"
            unoptimized
          />
          <div className="contentText">
            <div className={`textBlock${gamesInView ? " textFadeIn" : ""}`}>
              <h2>Ігри — це досвід, а не галочки.</h2>
              <p>Ігри — це вибір, шлях і враження. Не все треба проходити.</p>
              <p>Не все — закривати.</p>
              <p>Зберігай ігри так, як ти їх прожив. Або як плануєш прожити.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="contentSection" ref={friendsRef}>
        <div className="imagePlaceholder contentMedia">
          <Image
            src="https://res.cloudinary.com/dmb4mtnpu/image/upload/v1770312908/ChatGPT_Image_5_%D0%BB%D1%8E%D1%82._2026_%D1%80._19_34_43_uwqk12.png"
            alt="Найкращі рекомендації — від людей."
            width={720}
            height={480}
            className="contentImage"
            loading="lazy"
            unoptimized
          />
          <div className="contentText">
            <div className={`textBlock${friendsInView ? " textFadeIn" : ""}`}>
              <h2>Найкращі рекомендації — від людей.</h2>
              <p>Не алгоритми. Не тренди.</p>
              <p>А порада від людини, якій ти довіряєш.</p>
              <p>Ділись фільмами й іграми напряму. Особисто. Без зайвого шуму.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="heroSection" ref={closingRef}>
        <div className="heroMedia">
          <Image
            src="https://res.cloudinary.com/dmb4mtnpu/image/upload/v1770313019/ChatGPT_Image_5_%D0%BB%D1%8E%D1%82._2026_%D1%80._19_36_44_yzyfss.png"
            alt="Поки що тут порожньо."
            fill
            className="heroImage"
            sizes="100vw"
            loading="lazy"
            unoptimized
          />
        </div>
        <div className="heroText">
          <div className={`textBlock${closingInView ? " textFadeIn" : ""}`}>
            <h2>Поки що тут порожньо.</h2>
            <p>Але кожна колекція з чогось починається.</p>
            <p>З одного фільму. Або з однієї гри.</p>
            <p>Решта з’явиться з часом.</p>
          </div>
        </div>
      </section>

      <div className="joinBar">
        <button
          type="button"
          className={`btnBase joinButton${
            isScrolled ? " joinButtonSolid" : " joinButtonTransparent"
          }`}
          onClick={() => setIsAuthOpen(true)}
        >
          Приєднатися
        </button>
      </div>

      {isAuthOpen ? (
        <div
          className="authModalOverlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsAuthOpen(false)}
        >
          <div className="authModal" onClick={(event) => event.stopPropagation()}>
            <div className="authModalHeader">
              <h2 className={authStyles.title}>Авторизація</h2>
              <CloseIconButton
                className="authClose"
                onClick={() => {
                  setIsAuthOpen(false);
                  router.push("/");
                }}
              />
            </div>
            <p className={authStyles.text}>Увійди або зареєструйся.</p>
            <form className={authStyles.form} onSubmit={handleSignIn}>
              <label className={authStyles.label}>
                Email
                <input
                  className={authStyles.input}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className={authStyles.label}>
                Пароль
                <div className={authStyles.passwordField}>
                  <input
                    className={authStyles.input}
                    type={isPasswordVisible ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    className={authStyles.eyeButton}
                    type="button"
                    onClick={() => setIsPasswordVisible((prev) => !prev)}
                    aria-label={
                      isPasswordVisible ? "Сховати пароль" : "Показати пароль"
                    }
                  >
                    {isPasswordVisible ? (
                      <svg
                        aria-hidden="true"
                        viewBox="0 -960 960 960"
                        className={authStyles.eyeIcon}
                      >
                        <path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z" />
                      </svg>
                    ) : (
                      <svg
                        aria-hidden="true"
                        viewBox="0 -960 960 960"
                        className={authStyles.eyeIcon}
                      >
                        <path d="M607.5-372.5Q660-425 660-500t-52.5-127.5Q555-680 480-680t-127.5 52.5Q300-575 300-500t52.5 127.5Q405-320 480-320t127.5-52.5Zm-204-51Q372-455 372-500t31.5-76.5Q435-608 480-608t76.5 31.5Q588-545 588-500t-31.5 76.5Q525-392 480-392t-76.5-31.5ZM214-281.5Q94-363 40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200q-146 0-266-81.5ZM480-500Zm207.5 160.5Q782-399 832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280q113 0 207.5-59.5Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>
              <div className={authStyles.actions}>
                <button
                  className={`${authStyles.primary} btnPrimary`}
                  type="submit"
                  disabled={isLoading}
                >
                  {isLoading ? "Зачекай..." : "Увійти"}
                </button>
                <button
                  className={`${authStyles.secondary} btnSecondary`}
                  type="button"
                  onClick={handleSignUp}
                  disabled={isLoading}
                >
                  Зареєструватись
                </button>
              </div>
            </form>
            {message ? <p className={authStyles.message}>{message}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
