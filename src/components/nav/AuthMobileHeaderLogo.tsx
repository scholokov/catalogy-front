import Image from "next/image";
import Link from "next/link";
import styles from "./AuthMobileHeaderLogo.module.css";

export default function AuthMobileHeaderLogo() {
  return (
    <Link className={styles.link} href="/" aria-label="Catalogy">
      <Image
        src="/images/logo_c3.png"
        alt="Catalogy"
        width={560}
        height={160}
        className={styles.image}
        priority
      />
    </Link>
  );
}
