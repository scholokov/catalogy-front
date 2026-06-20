"use client";

const appendNavigationToken = (href: string, navigationToken?: string) =>
  navigationToken ? `${href}?nav=${encodeURIComponent(navigationToken)}` : href;

export const buildFriendFilmsHref = (friendId: string) => `/friends/${friendId}/films`;
export const buildFriendGamesHref = (friendId: string) => `/friends/${friendId}/games`;

export const buildFriendFilmViewHref = (
  friendId: string,
  viewId: string,
  navigationToken?: string,
) => appendNavigationToken(`${buildFriendFilmsHref(friendId)}/view/${viewId}`, navigationToken);

export const buildFriendGameViewHref = (
  friendId: string,
  viewId: string,
  navigationToken?: string,
) => appendNavigationToken(`${buildFriendGamesHref(friendId)}/view/${viewId}`, navigationToken);
