"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CatalogModal from "@/components/catalog/CatalogModal";
import FilmMetadataContent from "@/components/films/FilmMetadataContent";
import PersonHoverLink from "@/components/people/PersonHoverLink";
import { useSnackbar } from "@/components/ui/SnackbarProvider";
import type {
  FilmNormalizedGenre,
  FilmNormalizedPerson,
} from "@/lib/films/normalizedMetadata";
import styles from "@/components/catalog/CatalogSearch.module.css";

type FilmCatalogModalProps = Omit<
  React.ComponentProps<typeof CatalogModal>,
  "children"
> & {
  imdbRating?: string | null;
  personalRating?: string | null;
  year?: string | number | null;
  mediaType?: "movie" | "tv" | null | string;
  originalTitle?: string | null;
  englishTitle?: string | null;
  director?: string | null;
  actors?: string | null;
  genres?: string | null;
  description?: string | null;
  people?: FilmNormalizedPerson[] | null;
  genreItems?: FilmNormalizedGenre[] | null;
  message?: React.ReactNode | null;
  children?: React.ReactNode;
};

export default function FilmCatalogModal({
  imdbRating,
  personalRating,
  year,
  mediaType,
  originalTitle,
  englishTitle,
  director,
  actors,
  genres,
  description,
  people,
  genreItems,
  message,
  children,
  ...catalogModalProps
}: FilmCatalogModalProps) {
  const { showSnackbar } = useSnackbar();
  const [isCopyTooltipSuppressed, setIsCopyTooltipSuppressed] = useState(false);
  const copyTooltipTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTooltipTimeoutRef.current !== null) {
        window.clearTimeout(copyTooltipTimeoutRef.current);
      }
    };
  }, []);

  const copyText = async (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    try {
      await navigator.clipboard.writeText(normalized);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = normalized;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
    }
    showSnackbar("Скопійовано");
  };

  const suppressCopyTooltip = () => {
    setIsCopyTooltipSuppressed(true);
    if (copyTooltipTimeoutRef.current !== null) {
      window.clearTimeout(copyTooltipTimeoutRef.current);
    }
    copyTooltipTimeoutRef.current = window.setTimeout(() => {
      setIsCopyTooltipSuppressed(false);
    }, 900);
  };

  const renderCopyableFilmTitle = (
    value: string | null | undefined,
    label: "оригінальну" | "англійську",
  ) => {
    const resolvedValue = value?.trim();
    if (!resolvedValue) {
      return null;
    }

    return (
      <button
        type="button"
        className={`${styles.copyableInlineButton} ${
          isCopyTooltipSuppressed ? styles.copyTooltipHidden : ""
        }`}
        onClick={() => {
          suppressCopyTooltip();
          void copyText(resolvedValue);
        }}
        data-copy-tooltip="Клікніть для копіювання"
        aria-label={`Скопіювати ${label} назву: ${resolvedValue}`}
      >
        {resolvedValue}
      </button>
    );
  };

  const renderPeopleLinks = (
    roleKind: FilmNormalizedPerson["roleKind"],
    limit: number,
  ) => {
    const filtered = (people ?? [])
      .filter((person) => person.roleKind === roleKind)
      .sort((left, right) => {
        const leftOrder = left.creditOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.creditOrder ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder;
      })
      .slice(0, limit);

    if (filtered.length === 0) {
      return null;
    }

    return (
      <span className={styles.metaEntityLinks}>
        {filtered.map((person, index) => (
          <span key={`${person.tmdbPersonId}-${index}`}>
            {index > 0 ? ", " : null}
            <PersonHoverLink personId={person.tmdbPersonId} name={person.name} />
          </span>
        ))}
      </span>
    );
  };

  const renderGenreLinks = () => {
    const resolvedGenres = (genreItems ?? []).slice(0, 8);

    if (resolvedGenres.length === 0) {
      return null;
    }

    return (
      <span className={styles.metaEntityLinks}>
        {resolvedGenres.map((genre, index) => (
          <span key={`${genre.tmdbGenreId}-${index}`}>
            {index > 0 ? ", " : null}
            <Link href={`/genres/${genre.tmdbGenreId}`} className={styles.metaEntityLink}>
              {genre.name}
            </Link>
          </span>
        ))}
      </span>
    );
  };

  const resolvedOriginalTitle = renderCopyableFilmTitle(originalTitle, "оригінальну");
  const resolvedEnglishTitle = renderCopyableFilmTitle(englishTitle, "англійську");
  const resolvedDirector = renderPeopleLinks("director", 6) ?? director;
  const resolvedWriters = renderPeopleLinks("writer", 6);
  const resolvedProducers = renderPeopleLinks("producer", 6);
  const resolvedActors = renderPeopleLinks("actor", 12) ?? actors;
  const resolvedGenres = renderGenreLinks() ?? genres;

  return (
    <>
      <CatalogModal {...catalogModalProps}>
        {({ fitBadge }) => (
          <FilmMetadataContent
            imdbRating={imdbRating}
            personalRating={personalRating}
            fitBadge={fitBadge}
            year={year}
            mediaType={mediaType}
            originalTitle={resolvedOriginalTitle}
            englishTitle={resolvedEnglishTitle}
            showEnglishTitle={
              Boolean(englishTitle?.trim()) && englishTitle?.trim() !== originalTitle?.trim()
            }
            director={resolvedDirector}
            writers={resolvedWriters}
            producers={resolvedProducers}
            actors={resolvedActors}
            genres={resolvedGenres}
            description={description}
            message={message}
          />
        )}
      </CatalogModal>
      {children}
    </>
  );
}
