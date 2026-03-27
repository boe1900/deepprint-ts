export const briefErrorText = (message: string, max = 180) => {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
};
