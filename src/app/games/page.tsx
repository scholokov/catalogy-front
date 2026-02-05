import Link from "next/link";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import layoutStyles from "@/components/catalog/CatalogLayout.module.css";
import GamesManager from "./GamesManager";

export default function GamesPage() {
  return (
    <CatalogLayout
      title="Games"
      actions={
        <>
          <Link className={`${layoutStyles.actionButton} btnPrimary`} href="/">
            На головну
          </Link>
          <Link className={`${layoutStyles.actionButton} btnSecondary`} href="/games">
            Оновити
          </Link>
        </>
      }
    >
      <GamesManager />
    </CatalogLayout>
  );
}
