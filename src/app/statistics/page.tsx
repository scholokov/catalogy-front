"use client";

import { useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import StatisticsFilmsPage from "./StatisticsFilmsPage";
import StatisticsGamesPage from "./StatisticsGamesPage";
import styles from "./StatisticsPage.module.css";

type StatisticsTab = "films" | "games";

export default function StatisticsPage() {
  const [filmsCount, setFilmsCount] = useState(0);
  const [gamesCount, setGamesCount] = useState(0);
  const [activeTab, setActiveTab] = useState<StatisticsTab>("films");

  const headerRight = activeTab === "films" ? `Фільми: ${filmsCount}` : `Ігри: ${gamesCount}`;

  return (
    <CatalogLayout
      title="Статистика"
      description="Єдина сторінка статистики з окремими вкладками для фільмів та ігор."
      headerRight={headerRight}
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
      {activeTab === "films" ? (
        <StatisticsFilmsPage onTotalChange={setFilmsCount} />
      ) : (
        <StatisticsGamesPage onTotalChange={setGamesCount} />
      )}
    </CatalogLayout>
  );
}
