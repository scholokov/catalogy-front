"use client";

import { useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import GamesManager from "./GamesManager";

export default function GamesPage() {
  const [count, setCount] = useState(0);
  return (
    <CatalogLayout title="Games" headerRight={`Кількість: ${count}`}>
      <GamesManager onCountChange={setCount} />
    </CatalogLayout>
  );
}
