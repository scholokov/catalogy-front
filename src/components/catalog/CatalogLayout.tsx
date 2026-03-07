import { ReactNode } from "react";
import Image from "next/image";
import styles from "./CatalogLayout.module.css";

type CatalogLayoutProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  headerRight?: ReactNode;
  showBrandLogo?: boolean;
};

export default function CatalogLayout({
  title,
  description,
  children,
  actions,
  headerRight,
  showBrandLogo = false,
}: CatalogLayoutProps) {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>{title}</h1>
          {showBrandLogo ? (
            <div className={styles.headerCenter}>
              <Image
                src="/images/logo_c3.png"
                alt="Catalogy"
                width={560}
                height={160}
                className={styles.headerLogo}
                priority
              />
            </div>
          ) : null}
          {headerRight ? (
            <div className={styles.headerRight}>{headerRight}</div>
          ) : null}
        </div>
        {description ? <p className={styles.text}>{description}</p> : null}
        {children}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </main>
    </div>
  );
}
