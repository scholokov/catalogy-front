"use client";

import { useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import ProfileFilmsSection from "./ProfileFilmsSection";
import ProfileGamesSection from "./ProfileGamesSection";
import styles from "../statistics/StatisticsPage.module.css";

type ProfileTab = "films" | "games";

export default function ProfilePage() {
  const [activeTab, setActiveTab] = useState<ProfileTab>("films");

  return (
    <CatalogLayout
      title="Профайл"
      showBrandLogo
    >
      <div className={styles.tabSwitch}>
        <button
          type="button"
          className={`${styles.tabButton} ${
            activeTab === "films" ? styles.tabButtonActive : ""
          }`}
          onClick={() => setActiveTab("films")}
        >
          Фільми
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${
            activeTab === "games" ? styles.tabButtonActive : ""
          }`}
          onClick={() => setActiveTab("games")}
        >
          Ігри
        </button>
      </div>
      {activeTab === "films" ? <ProfileFilmsSection /> : <ProfileGamesSection />}
    </CatalogLayout>
  );
}
