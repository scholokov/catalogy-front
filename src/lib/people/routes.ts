"use client";

export const buildPersonHref = (personId: string) => `/people/${personId}`;

export const buildPersonFilmViewHref = (
  personId: string,
  viewId: string,
  navigationToken?: string,
) => {
  const href = `${buildPersonHref(personId)}/view/${viewId}`;
  return navigationToken ? `${href}?nav=${encodeURIComponent(navigationToken)}` : href;
};
