import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";

const getSingleSearchParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const hasRecoveryParams = (params: Record<string, string | string[] | undefined>) => {
  const code = getSingleSearchParam(params.code);
  const tokenHash = getSingleSearchParam(params.token_hash);
  const type = getSingleSearchParam(params.type);
  const errorCode = getSingleSearchParam(params.error_code);

  return Boolean(code || tokenHash || errorCode || type === "recovery");
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;

  if (hasRecoveryParams(resolvedSearchParams)) {
    const nextParams = new URLSearchParams();

    Object.entries(resolvedSearchParams).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry) nextParams.append(key, entry);
        });
        return;
      }

      if (value) {
        nextParams.set(key, value);
      }
    });

    nextParams.set("mode", "reset-password");
    redirect(`/auth?${nextParams.toString()}`);
  }

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
