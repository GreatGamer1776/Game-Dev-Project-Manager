export type AssetKind = 'image' | 'video' | 'audio' | 'other';

export const ASSET_LINK_DRAG_MIME = 'application/x-gdpm-asset';
const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getAssetMimeType = (data: string) => {
  const match = data.match(/^data:([^;]+);/i);
  return match?.[1]?.toLowerCase() || 'application/octet-stream';
};

export const getAssetKindFromMime = (mime: string): AssetKind => {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
};

export const getAssetKind = (data: string) => getAssetKindFromMime(getAssetMimeType(data));

export const getAssetExtensionFromMime = (mime: string) => {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/svg+xml':
      return 'svg';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/x-wav':
      return 'wav';
    case 'video/quicktime':
      return 'mov';
    default: {
      const [, subtype = 'bin'] = mime.split('/');
      return subtype.replace(/[^a-z0-9.+-]/gi, '') || 'bin';
    }
  }
};

export const sanitizeAssetLabel = (label: string, fallback: string) => {
  const sanitized = label.trim().replace(/[\[\]\(\)]/g, '');
  return sanitized || fallback;
};

export const getDefaultAssetLabel = (kind: AssetKind) => {
  switch (kind) {
    case 'image':
      return 'Image Asset';
    case 'video':
      return 'Video Asset';
    case 'audio':
      return 'Audio Asset';
    default:
      return 'Project Asset';
  }
};

export const getAssetDisplayName = (label: string | null | undefined, assetId: string, kind: AssetKind) => {
  const trimmed = label?.trim() || '';
  if (trimmed && trimmed !== assetId && !UUID_LIKE_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return getDefaultAssetLabel(kind);
};
