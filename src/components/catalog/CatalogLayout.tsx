import { ReactNode } from "react";
import styles from "./CatalogLayout.module.css";

type CatalogLayoutProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  headerRight?: ReactNode;
};

export default function CatalogLayout({
  title,
  description,
  children,
  actions,
  headerRight,
}: CatalogLayoutProps) {
  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <div className={styles.headerRow}>
          <h1 className={styles.title}>{title}</h1>
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
