import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.brandLogoBar} aria-hidden="true">
        <Image
          className={styles.brandLogo}
          src="/images/logo_c3.png"
          alt=""
          width={560}
          height={160}
          priority
        />
      </div>
      <main className={styles.main}>
        <div className={styles.ctas}>
          <Link className={styles.ctaCard} href="/games">
            <Image
              className={styles.ctaImage}
              src="https://res.cloudinary.com/dmb4mtnpu/image/upload/v1770301005/games_pkcdm7.png"
              alt="Ігри"
              width={520}
              height={320}
              unoptimized
            />
            <span className={styles.ctaLabel}>Ігри</span>
          </Link>
          <Link className={styles.ctaCard} href="/films">
            <Image
              className={styles.ctaImage}
              src="https://res.cloudinary.com/dmb4mtnpu/image/upload/v1770301015/films_jsfhkz.png"
              alt="Кіно"
              width={520}
              height={320}
              unoptimized
            />
            <span className={styles.ctaLabel}>Фільми</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
