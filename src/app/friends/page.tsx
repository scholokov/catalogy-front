import CatalogLayout from "@/components/catalog/CatalogLayout";
import FriendsManager from "./FriendsManager";

export default function FriendsPage() {
  return (
    <CatalogLayout title="Рекомендації друзів" showBrandLogo>
      <FriendsManager />
    </CatalogLayout>
  );
}
