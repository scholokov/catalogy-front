import CatalogLayout from "@/components/catalog/CatalogLayout";
import FilmsManager from "./FilmsManager";

export default function FilmsPage() {
  return (
    <CatalogLayout title="Films">
      <FilmsManager />
    </CatalogLayout>
  );
}
