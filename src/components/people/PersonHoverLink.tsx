"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "@/components/catalog/CatalogSearch.module.css";

type PersonHoverLinkProps = {
  personId: string;
  name: string;
};

type PersonPreviewData = {
  id: string;
  name: string;
  originalName: string;
  englishName?: string;
  biography: string;
  placeOfBirth: string;
  knownForDepartment: string;
  popularity: number | null;
  profileUrl: string;
  filmography: Array<unknown>;
};

const previewCache = new Map<string, PersonPreviewData | null>();

const getRoleBadge = (department: string) => {
  const normalized = department.trim().toLowerCase();
  const isDirecting = normalized.includes("direct") || normalized.includes("режис");
  const isActing =
    normalized.includes("act") || normalized.includes("actor") || normalized.includes("acting");

  if (isDirecting && isActing) {
    return "Актор • Режисер";
  }
  if (isDirecting) {
    return "Режисер";
  }
  if (isActing) {
    return "Актор";
  }
  return department || "Персона";
};

export default function PersonHoverLink({ personId, name }: PersonHoverLinkProps) {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLSpanElement | null>(null);
  const [canHover, setCanHover] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [preview, setPreview] = useState<PersonPreviewData | null>(() => previewCache.get(personId) ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isOpen || previewCache.has(personId)) {
      return;
    }

    let isCancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        const response = await fetch(`/api/tmdb/person/${personId}`);
        if (!response.ok) {
          if (!isCancelled) {
            previewCache.set(personId, null);
            setPreview(null);
          }
          return;
        }

        const data = (await response.json()) as PersonPreviewData;
        if (!isCancelled) {
          previewCache.set(personId, data);
          setPreview(data);
        }
      } catch {
        if (!isCancelled) {
          previewCache.set(personId, null);
          setPreview(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, personId]);

  useEffect(() => {
    setPreview(previewCache.get(personId) ?? null);
    setIsOpen(false);
    setIsLoading(false);
    setPopoverStyle(null);
  }, [personId]);

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current || !popoverRef.current) {
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;

      if (!anchor || !popover) {
        return;
      }

      const dialog = anchor.closest('[role="dialog"]');
      const modalBoundary =
        dialog?.firstElementChild instanceof HTMLElement ? dialog.firstElementChild : null;
      const boundaryRect = modalBoundary?.getBoundingClientRect() ?? {
        left: 12,
        top: 12,
        right: window.innerWidth - 12,
        bottom: window.innerHeight - 12,
        width: window.innerWidth - 24,
        height: window.innerHeight - 24,
      };

      const margin = 12;
      const availableWidth = Math.max(
        180,
        Math.min(320, boundaryRect.right - boundaryRect.left - margin * 2, window.innerWidth - 24),
      );

      popover.style.width = `${availableWidth}px`;

      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();

      const minLeft = boundaryRect.left + margin;
      const maxLeft = Math.max(minLeft, boundaryRect.right - popoverRect.width - margin);
      const left = Math.min(Math.max(anchorRect.left, minLeft), maxLeft);

      const minTop = boundaryRect.top + margin;
      const belowTop = anchorRect.bottom + 10;
      const aboveTop = anchorRect.top - popoverRect.height - 10;
      const maxTop = Math.max(minTop, boundaryRect.bottom - popoverRect.height - margin);
      const top =
        belowTop <= maxTop
          ? belowTop
          : aboveTop >= minTop
            ? aboveTop
            : maxTop;

      setPopoverStyle({
        left,
        top,
        width: availableWidth,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, preview, isLoading]);

  const handleOpen = () => {
    if (!canHover) {
      return;
    }
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const biographyPreview =
    preview?.biography.trim()
      ? preview.biography.trim().slice(0, 180) + (preview.biography.trim().length > 180 ? "…" : "")
      : "";

  return (
    <span
      ref={anchorRef}
      className={styles.personHoverAnchor}
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
      onFocus={handleOpen}
      onBlur={handleClose}
    >
      <Link
        href={`/people/${personId}`}
        className={styles.metaEntityLink}
        onClick={(event) => event.stopPropagation()}
      >
        {name}
      </Link>
      {isOpen ? (
        <span
          ref={popoverRef}
          className={styles.personPreviewPopover}
          style={
            popoverStyle
              ? {
                  left: `${popoverStyle.left}px`,
                  top: `${popoverStyle.top}px`,
                  width: `${popoverStyle.width}px`,
                }
              : undefined
          }
        >
          {preview ? (
            <>
              <span className={styles.personPreviewHeader}>
                <span className={styles.personPreviewPoster}>
                  {preview.profileUrl ? (
                    <Image
                      src={preview.profileUrl}
                      alt={preview.name}
                      width={56}
                      height={84}
                      className={styles.personPreviewImage}
                    />
                  ) : (
                    <span className={styles.personPreviewPlaceholder}>Фото</span>
                  )}
                </span>
                <span className={styles.personPreviewMain}>
                  <span className={styles.personPreviewName}>{preview.name || name}</span>
                  <span className={styles.personPreviewBadge}>
                    {getRoleBadge(preview.knownForDepartment)}
                  </span>
                  {preview.originalName && preview.originalName !== preview.name ? (
                    <span className={styles.personPreviewMeta}>
                      Оригінальне ім’я: {preview.originalName}
                    </span>
                  ) : null}
                  {preview.englishName &&
                  preview.englishName !== preview.originalName &&
                  preview.englishName !== preview.name ? (
                    <span className={styles.personPreviewMeta}>
                      Англійське ім’я: {preview.englishName}
                    </span>
                  ) : null}
                  <span className={styles.personPreviewMeta}>
                    Фільмографія: {preview.filmography.length}
                  </span>
                  {preview.popularity !== null ? (
                    <span className={styles.personPreviewMeta}>
                      Популярність: {preview.popularity.toFixed(1)}
                    </span>
                  ) : null}
                  {preview.placeOfBirth ? (
                    <span className={styles.personPreviewMeta}>
                      Місце народження: {preview.placeOfBirth}
                    </span>
                  ) : null}
                </span>
              </span>
              {biographyPreview ? (
                <span className={styles.personPreviewBio}>{biographyPreview}</span>
              ) : null}
            </>
          ) : isLoading ? (
            <span className={styles.personPreviewLoading}>Завантаження…</span>
          ) : (
            <span className={styles.personPreviewLoading}>Прев’ю недоступне.</span>
          )}
        </span>
      ) : null}
    </span>
  );
}
