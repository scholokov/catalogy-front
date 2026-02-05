import CatalogLayout from "@/components/catalog/CatalogLayout";
import GamesManager from "./GamesManager";

export default function GamesPage() {
  return (
    <CatalogLayout title="Games">
      <GamesManager />
    </CatalogLayout>
  );
}
