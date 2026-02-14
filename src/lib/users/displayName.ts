export const getReadableFallbackName = (userId: string) => {
  const compact = userId.replaceAll("-", "");
  const suffix = compact.slice(-6).toUpperCase();
  return `Користувач #${suffix || "USER"}`;
};

export const getDisplayName = (username: string | null | undefined, userId: string) => {
  const normalized = username?.trim();
  if (normalized) {
    return normalized;
  }
  return getReadableFallbackName(userId);
};
