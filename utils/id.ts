// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost).
// When the app is served over plain HTTP on a LAN/IP it is undefined, so
// fall back to a manual UUID v4 generator instead of crashing.
export const uid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
