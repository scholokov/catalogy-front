import Link from "next/link";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import layoutStyles from "@/components/catalog/CatalogLayout.module.css";
import FilmsManager from "./FilmsManager";

export default function FilmsPage() {
  return (
    <CatalogLayout
      title="Films"
      actions={
        <>
          <Link className={`${layoutStyles.actionButton} btnPrimary`} href="/">
            На головну
          </Link>
          <Link className={`${layoutStyles.actionButton} btnSecondary`} href="/films">
            Оновити
          </Link>
        </>
      }
    >
      <FilmsManager />
    </CatalogLayout>
  );
}
