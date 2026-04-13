"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import CloseIconButton from "@/components/ui/CloseIconButton";
import AuthForm, { type AuthMode } from "@/components/auth/AuthForm";

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
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [isScrolled, setIsScrolled] = useState(false);

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

  const authModalTitle =
    authMode === "signup"
      ? "Реєстрація"
      : authMode === "forgot-password"
        ? "Відновлення паролю"
        : authMode === "reset-password"
          ? "Новий пароль"
          : "Авторизація";

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
          onClick={() => {
            setAuthMode("signup");
            setIsAuthOpen(true);
          }}
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
              <h2>{authModalTitle}</h2>
              <CloseIconButton
                className="authClose"
                onClick={() => setIsAuthOpen(false)}
              />
            </div>
            <AuthForm key={authMode} mode={authMode} onModeChange={setAuthMode} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
