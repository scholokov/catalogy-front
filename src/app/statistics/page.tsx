"use client";

import { useState } from "react";
import CatalogLayout from "@/components/catalog/CatalogLayout";
import { useSnackbar } from "@/components/ui/SnackbarProvider";
import StatisticsFilmsPage from "./StatisticsFilmsPage";
import StatisticsGamesPage from "./StatisticsGamesPage";
import styles from "./StatisticsPage.module.css";

type StatisticsTab = "films" | "games";
type StatisticsExportHandler = (() => void) | null;

export default function StatisticsPage() {
  const [, setFilmsCount] = useState(0);
  const [, setGamesCount] = useState(0);
  const [activeTab, setActiveTab] = useState<StatisticsTab>("films");
  const [filmsExportHandler, setFilmsExportHandler] = useState<StatisticsExportHandler>(null);
  const [gamesExportHandler, setGamesExportHandler] = useState<StatisticsExportHandler>(null);
  const { showSnackbar } = useSnackbar();

  const activeExportHandler = activeTab === "films" ? filmsExportHandler : gamesExportHandler;
  const headerRight = (
    <div className={styles.headerMeta}>
      <button
        type="button"
        className={`btnBase btnSecondary ${styles.exportButton}`}
        onClick={() => {
          activeExportHandler?.();
          if (activeExportHandler) {
            showSnackbar("Експортовано");
          }
        }}
        disabled={!activeExportHandler}
        aria-label="Експорт CSV"
      >
        <span className={styles.exportLabel}>Експорт CSV</span>
        <span className={styles.exportIcon} aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 -960 960 960"
            className={styles.exportIconSvg}
          >
            <path d="m648-140 112-112v92h40v-160H640v40h92L620-168l28 28Zm-448 20q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v268q-19-9-39-15.5t-41-9.5v-243H200v560h242q3 22 9.5 42t15.5 38H200Zm0-120v40-560 243-3 280Zm80-40h163q3-21 9.5-41t14.5-39H280v80Zm0-160h244q32-30 71.5-50t84.5-27v-3H280v80Zm0-160h400v-80H280v80ZM720-40q-83 0-141.5-58.5T520-240q0-83 58.5-141.5T720-440q83 0 141.5 58.5T920-240q0 83-58.5 141.5T720-40Z" />
          </svg>
        </span>
      </button>
    </div>
  );

  return (
    <CatalogLayout
      title="Статистика"
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
        <StatisticsFilmsPage
          onTotalChange={setFilmsCount}
          onExportReady={(handler) => setFilmsExportHandler(() => handler)}
        />
      ) : (
        <StatisticsGamesPage
          onTotalChange={setGamesCount}
          onExportReady={(handler) => setGamesExportHandler(() => handler)}
        />
      )}
    </CatalogLayout>
  );
}
