"use client";

export const buildFilmCatalogHref = () => "/films";
export const buildGameCatalogHref = () => "/games";

const appendNavigationToken = (href: string, navigationToken?: string) =>
  navigationToken ? `${href}?nav=${encodeURIComponent(navigationToken)}` : href;

export const buildFilmViewHref = (viewId: string, navigationToken?: string) =>
  appendNavigationToken(`${buildFilmCatalogHref()}/view/${viewId}`, navigationToken);

export const buildGameViewHref = (viewId: string, navigationToken?: string) =>
  appendNavigationToken(`${buildGameCatalogHref()}/view/${viewId}`, navigationToken);
