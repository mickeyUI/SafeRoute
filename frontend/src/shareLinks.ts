import type { LatLng } from './types';

export const TRACK_PATH_PREFIX = '/track/';

/**
 * Share tokens used to be stored as the full in-app path (`/track/share_x`) and
 * then encoded again into the SMS link. Accept both forms so old links keep
 * working as well as freshly generated ones.
 */
export function normalizeShareToken(value: string): string {
  let token = value.trim();

  // Undo repeated percent-encoding, e.g. %2Ftrack%2Fshare_x -> /track/share_x.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const decoded = decodeURIComponent(token);
      if (decoded === token) break;
      token = decoded;
    } catch {
      break;
    }
  }

  // Drop the legacy `/track/` prefix if it is still present.
  const marker = token.lastIndexOf(TRACK_PATH_PREFIX);
  if (marker !== -1) token = token.slice(marker + TRACK_PATH_PREFIX.length);

  return token.replace(/^\/+/, '');
}

/** In-app path for the public tracking page. */
export function buildTrackPath(shareToken: string): string {
  return `${TRACK_PATH_PREFIX}${encodeURIComponent(normalizeShareToken(shareToken))}`;
}

/** Read a share token from the tracking page path, including legacy double-encoded links. */
export function getTrackTokenFromPath(pathname: string): string | null {
  if (!pathname.startsWith(TRACK_PATH_PREFIX)) return null;
  const remainder = pathname.slice(TRACK_PATH_PREFIX.length);
  // Some clients decode %2F into a real slash; keep the rest of the path then.
  const segment = remainder.split('/')[0] || remainder;
  if (!segment) return null;
  const token = normalizeShareToken(segment);
  return token || null;
}

/**
 * Short Google Maps link with the exact coordinate visible in the URL.
 * Rebuilt from the latest check-in on refresh.
 */
export function buildGoogleMapsUrl(point: LatLng): string {
  return `https://maps.google.com/?q=${point[0]},${point[1]}`;
}
