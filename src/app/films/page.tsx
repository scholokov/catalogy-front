"use client";

import { useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import FilmsManager from "./FilmsManager";

export default function FilmsPage() {
  const [count, setCount] = useState(0);
  return (
    <CatalogLayout title="Films" headerRight={`Кількість: ${count}`}>
      <FilmsManager onCountChange={setCount} />
    </CatalogLayout>
  );
}
