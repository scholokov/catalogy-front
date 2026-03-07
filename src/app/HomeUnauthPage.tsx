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
  const [addStoriesRef, addStoriesInView] = useInView();
  const [manageStoriesRef, manageStoriesInView] = useInView();
  const [discoverStoriesRef, discoverStoriesInView] = useInView();
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
      <section className="heroSection heroSectionFirst" ref={heroRef}>
        <div className="heroMediaFirst">
          <Image
            src="https://res.cloudinary.com/dmb4mtnpu/image/upload/f_auto,q_auto,dpr_auto,w_auto,c_limit,fl_progressive/v1770312464/d12e5905-8bd8-40ac-bd27-16fdf84393f8_wqfn6e.png"
            alt="Два світи. Один простір."
            width={1920}
            height={1080}
            className="heroImage heroImageFirst"
            sizes="100vw"
            loading="lazy"
            unoptimized
          />
          <div className="heroText heroTextFirst">
            <div className={`textBlock${heroInView ? " textFadeIn" : ""}`}>
              <h1>Два світи. Один простір</h1>
              <p>
                Фільми та ігри, які стали частиною твоєї історії
              </p>
              <p>
                <br />
                І ті, що ще попереду
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="contentSection contentSectionSplit" ref={moviesRef}>
        <div className="contentSplit">
          <div className="contentSplitText">
            <div className={`textBlock${moviesInView ? " textFadeIn" : ""}`}>
              <h2>Твоя колекція фільмів</h2>
              <p>
                Зберігай фільми, які стали частиною твоєї історії.
                <br />
                І ті, що ще попереду.
              </p>
              <p>
                <br />
                Оцінюй, залишай нотатки
                <br />
                та веди власну історію переглядів.
              </p>
            </div>
          </div>
          <div className="contentSplitMedia">
            <Image
              src="https://res.cloudinary.com/dmb4mtnpu/image/upload/f_auto,q_auto,dpr_auto,w_auto,c_limit,fl_progressive/v1772896573/3c3612d8-3cae-4cc9-93f2-c3b39f8be8f0.png"
              alt="Кіно — це більше, ніж перегляд."
              width={1400}
              height={900}
              className="contentImage"
              sizes="(max-width: 980px) 100vw, 60vw"
              loading="lazy"
              unoptimized
            />
          </div>
        </div>
      </section>

      <section
        className="contentSection contentSectionSplit contentSectionSplitReverse"
        ref={gamesRef}
      >
        <div className="contentSplit contentSplitReverse contentSplitMobileTextFirst">
          <div className="contentSplitMedia">
            <Image
              src="https://res.cloudinary.com/dmb4mtnpu/image/upload/f_auto,q_auto,dpr_auto,w_auto,c_limit,fl_progressive/v1772896589/275629d0-ae92-4de7-8085-2cc262ab36d3.png"
              alt="Твоя колекція ігор"
              width={1400}
              height={900}
              className="contentImage"
              sizes="(max-width: 980px) 100vw, 60vw"
              loading="lazy"
              unoptimized
            />
          </div>
          <div className="contentSplitText">
            <div className={`textBlock${gamesInView ? " textFadeIn" : ""}`}>
              <h2>Твоя колекція ігор</h2>
              <p>
                Додавай ігри, у які грав,
                <br />
                і ті, що ще чекають свого часу.
              </p>
              <p>
                Оцінюй, веди історію проходження
                <br />
                та повертайся до улюблених світів.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="contentSection contentSectionSplit" ref={addStoriesRef}>
        <div className="contentSplit">
          <div className="contentSplitText">
            <div className={`textBlock${addStoriesInView ? " textFadeIn" : ""}`}>
              <h2>Додавай нові історії</h2>
              <p>Просто введи назву — і сервіс знайде гру або фільм.</p>
              <p>
                <br />
                Додай її до своєї колекції,
                <br />
                оціни або залиш на потім.
              </p>
            </div>
          </div>
          <div className="contentSplitMedia">
            <Image
              src="https://res.cloudinary.com/dmb4mtnpu/image/upload/f_auto,q_auto,dpr_auto,w_auto,c_limit,fl_progressive/v1772891352/306531ae-3a9a-454d-be3f-88685d601023.png"
              alt="Додавай нові історії"
              width={1400}
              height={900}
              className="contentImage"
              sizes="(max-width: 980px) 100vw, 60vw"
              loading="lazy"
              unoptimized
            />
          </div>
        </div>
      </section>

      <section
        className="contentSection contentSectionSplit contentSectionSplitReverse"
        ref={manageStoriesRef}
      >
        <div className="contentSplit contentSplitReverse contentSplitMobileTextFirst">
          <div className="contentSplitMedia">
            <Image
              src="https://res.cloudinary.com/dmb4mtnpu/image/upload/f_auto,q_auto,dpr_auto,w_auto,c_limit,fl_progressive/v1772891240/31b82ec2-d349-43be-a2fb-27bfc329fbb5.png"
              alt="Керуй своєю історією"
              width={1400}
              height={900}
              className="contentImage"
              sizes="(max-width: 980px) 100vw, 60vw"
              loading="lazy"
              unoptimized
            />
          </div>
          <div className="contentSplitText">
            <div className={`textBlock${manageStoriesInView ? " textFadeIn" : ""}`}>
              <h2>Керуй своєю історією</h2>
              <p>
                Відкрий картку гри або фільму,
                <br />
                постав власну оцінку,
                <br />
                додай нотатку або зміни статус.
              </p>
              <p>
                <br />
                Повертайся до історій,
                <br />
                які хочеш пам’ятати.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="contentSection contentSectionSplit" ref={discoverStoriesRef}>
        <div className="discoverStoriesStack">
          <div className="discoverStoriesText">
            <div className={`textBlock${discoverStoriesInView ? " textFadeIn" : ""}`}>
              <h2>Відкривай нові історії разом</h2>
              <p>
                Додавай друзів і дивись,
                <br />
                що вони рекомендують.
              </p>
              <p>
                <br />
                Відкривай нові фільми та ігри,
                <br />
                які могли б пройти повз тебе.
              </p>
            </div>
          </div>
          <div className="discoverStoriesMedia">
            <Image
              src="https://res.cloudinary.com/dmb4mtnpu/image/upload/f_auto,q_auto,dpr_auto,w_auto,c_limit,fl_progressive/v1772890487/43426b76-fe48-4a3d-8233-f1aaf9083a9f.png"
              alt="Відкривай нові історії разом"
              width={1400}
              height={900}
              className="contentImage"
              sizes="100vw"
              loading="lazy"
              unoptimized
            />
          </div>
        </div>
      </section>

      <section className="featureCardsSection" ref={friendsRef}>
        <div className={`featureCardsGrid textBlock${friendsInView ? " textFadeIn" : ""}`}>
          <article className="featureCard">
            <svg
              className="featureCardIcon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 -960 960 960"
              fill="#e3e3e3"
              aria-hidden="true"
            >
              <path d="M320-320h480v-480h-80v280l-100-60-100 60v-280H320v480Zm0 80q-33 0-56.5-23.5T240-320v-480q0-33 23.5-56.5T320-880h480q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H320ZM160-80q-33 0-56.5-23.5T80-160v-560h80v560h560v80H160Zm360-720h200-200Zm-200 0h480-480Z" />
            </svg>
            <h3>Збирай свою бібліотеку</h3>
            <p>
              Додавай фільми та ігри,
              <br />
              які дивився або плануєш пройти.
            </p>
          </article>
          <article className="featureCard">
            <svg
              className="featureCardIcon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 -960 960 960"
              fill="#e3e3e3"
              aria-hidden="true"
            >
              <path d="M480-644v236l96 74-36-122 90-64H518l-38-124ZM233-120l93-304L80-600h304l96-320 96 320h304L634-424l93 304-247-188-247 188Z" />
            </svg>
            <h3>Оцінюй</h3>
            <p>
              Фіксуй власну оцінку
              <br />
              і формуй свою систему рейтингів.
            </p>
          </article>
          <article className="featureCard">
            <svg
              className="featureCardIcon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 -960 960 960"
              fill="#e3e3e3"
              aria-hidden="true"
            >
              <path d="M120-240v-80h480v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z" />
            </svg>
            <h3>Залишай нотатки</h3>
            <p>
              Пам’ятай, чому ця історія
              <br />
              стала для тебе важливою.
            </p>
          </article>
          <article className="featureCard">
            <svg
              className="featureCardIcon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 -960 960 960"
              fill="#e3e3e3"
              aria-hidden="true"
            >
              <path d="M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v255l-80 80v-175H200v400h248l80 80H200Zm0-560h560v-80H200v80Zm0 0v-80 80ZM662-60 520-202l56-56 85 85 170-170 56 57L662-60Z" />
            </svg>
            <h3>Плануй перегляд</h3>
            <p>
              Зберігай фільми та ігри,
              <br />
              до яких хочеш повернутися.
            </p>
          </article>
        </div>
      </section>

      <section className="storySection" ref={closingRef}>
        <div className="storyMedia">
          <Image
            src="https://res.cloudinary.com/dmb4mtnpu/image/upload/f_auto,q_auto,dpr_auto,w_auto,c_limit,fl_progressive/v1770312908/ChatGPT_Image_5_%D0%BB%D1%8E%D1%82._2026_%D1%80._19_34_43_uwqk12.png"
            alt="Кожна історія залишає слід"
            width={1920}
            height={1080}
            className="storyImage"
            sizes="100vw"
            loading="lazy"
            unoptimized
          />
          <div className="storyOverlay">
            <div className={`storyText textBlock${closingInView ? " textFadeIn" : ""}`}>
              <h2>Кожна історія залишає слід</h2>
              <p>Фільми і ігри — це не просто контент.</p>
              <p>
                <br />
                Це вечори, настрій,
                <br />
                періоди життя
                <br />
                і світи, у яких ми жили.
              </p>
              <p>
                <br />
                Зберігай те, що стало частиною твоєї історії.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="joinBar">
        <div className="joinLogoWrap" aria-hidden="true">
          <Image
            src="/images/logo_c3.png"
            alt=""
            width={560}
            height={160}
            className="joinLogoImage"
            priority
          />
        </div>
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
