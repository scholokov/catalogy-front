"use client";

import { useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import FilmsManager from "./FilmsManager";

export default function FilmsPage() {
  const [count, setCount] = useState(0);
  return (
    <CatalogLayout title="Фільми" headerRight={`Кількість: ${count}`} showBrandLogo>
      <FilmsManager onCountChange={setCount} />
    </CatalogLayout>
  );
}
