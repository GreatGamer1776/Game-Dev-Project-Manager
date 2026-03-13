export type AssetKind = 'image' | 'video' | 'audio' | 'other';

export const ASSET_LINK_DRAG_MIME = 'application/x-gdpm-asset';

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
