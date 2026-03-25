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
  const [filmsLlmExportHandler, setFilmsLlmExportHandler] = useState<StatisticsExportHandler>(null);
  const [gamesExportHandler, setGamesExportHandler] = useState<StatisticsExportHandler>(null);
  const { showSnackbar } = useSnackbar();

  const activeExportHandler = activeTab === "films" ? filmsExportHandler : gamesExportHandler;
  const headerRight = (
    <div className={styles.headerMeta}>
      {activeTab === "films" ? (
        <button
          type="button"
          className="btnBase btnSecondary"
          onClick={() => {
            filmsLlmExportHandler?.();
            if (filmsLlmExportHandler) {
              showSnackbar("Експортовано llm_reco_context.txt");
            }
          }}
          disabled={!filmsLlmExportHandler}
        >
          Експорт LLM TXT
        </button>
      ) : null}
      <button
        type="button"
        className="btnBase btnSecondary"
        onClick={() => {
          activeExportHandler?.();
          if (activeExportHandler) {
            showSnackbar("Експортовано");
          }
        }}
        disabled={!activeExportHandler}
      >
        Експорт CSV
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
          onLlmExportReady={(handler) => setFilmsLlmExportHandler(() => handler)}
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
