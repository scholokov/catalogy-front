"use client";

import type { FilmNormalizedPerson } from "@/lib/films/normalizedMetadata";
import type { GameCollectionTrailer } from "@/lib/games/collectionFlow";
import type { GameNormalizedGenre } from "@/lib/games/normalizedMetadata";
import type { ShishkaFitAssessment } from "@/lib/shishka/fitAssessment";

export type EditRouteMode = "modal" | "page";

export type FilmCollectionTrailer = {
  id: string;
  name: string;
  site: string;
  key: string;
  type: string;
  official: boolean;
  language: string;
  region: string;
  url: string;
};

export type FilmEditEntryView = {
  id: string;
  created_at: string;
  updated_at: string;
  viewed_at: string;
  rating: number | null;
  comment: string | null;
  view_percent: number;
  recommend_similar: boolean;
  is_viewed: boolean;
  availability: string | null;
  shishka_fit_label?: ShishkaFitAssessment["label"] | null;
  shishka_fit_reason?: string | null;
  shishka_fit_profile_analyzed_at?: string | null;
  shishka_fit_scope_value?: string | null;
  items: {
    id: string;
    title: string;
    title_uk: string | null;
    title_en: string | null;
    title_original: string | null;
    description: string | null;
    genres: string | null;
    director: string | null;
    actors: string | null;
    poster_url: string | null;
    external_id: string | null;
    film_media_type?: "movie" | "tv" | null;
    imdb_rating: string | null;
    trailers: FilmCollectionTrailer[] | null;
    year?: number | null;
    type: string;
  };
};

export type FilmEditEntry = {
  view: FilmEditEntryView;
  people: FilmNormalizedPerson[];
};

export type GameEditEntryView = {
  id: string;
  created_at: string;
  updated_at: string;
  viewed_at: string;
  rating: number | null;
  comment: string | null;
  view_percent: number;
  recommend_similar: boolean;
  is_viewed: boolean;
  availability: string | null;
  platforms: string[] | null;
  shishka_fit_label?: ShishkaFitAssessment["label"] | null;
  shishka_fit_reason?: string | null;
  shishka_fit_profile_analyzed_at?: string | null;
  shishka_fit_scope_value?: string | null;
  items: {
    id: string;
    title: string;
    description: string | null;
    genres: string | null;
    poster_url: string | null;
    external_id: string | null;
    imdb_rating: string | null;
    trailers: GameCollectionTrailer[] | null;
    year?: number | null;
    type: string;
  };
};

export type GameEditEntry = {
  view: GameEditEntryView;
};

export type GameGenreEditEntryView = {
  viewId: string;
  viewedAt: string;
  comment: string | null;
  recommendSimilar: boolean;
  isViewed: boolean;
  rating: number | null;
  viewPercent: number;
  availability: string | null;
  platforms: string[];
  shishkaFitLabel: ShishkaFitAssessment["label"] | null;
  shishkaFitReason: string | null;
  shishkaFitProfileAnalyzedAt: string | null;
  shishkaFitScopeValue: string | null;
  item: {
    id: string;
    title: string;
    description: string | null;
    genres: string | null;
    posterUrl: string | null;
    externalId: string | null;
    year: number | null;
    imdbRating: string | null;
    genreItems: GameNormalizedGenre[];
    trailers: GameCollectionTrailer[] | null;
  };
};

export type GameGenreEditEntry = {
  view: GameGenreEditEntryView;
};
