import type {
  LatLng,
  PlaceResult,
  SafetyReport,
  ReportCategory,
  SafeLocation,
  BackendSafetyIndicator,
  NearbySosAlert,
} from './types';
import { getToken } from './auth';

const DEFAULT_API_BASE_URL = 'https://saferoute-ezbz.onrender.com/api/v1';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
const PHOTON_ENDPOINT = import.meta.env.VITE_GEOCODING_ENDPOINT || 'https://photon.komoot.io/api/';
const OSRM_ENDPOINT = import.meta.env.VITE_ROUTING_ENDPOINT || 'https://router.project-osrm.org/route/v1/driving';
const CLIENT_ID_KEY = 'saferoute-client-id';

/** Stable per-device id so a user's own SOS alerts are not shown as someone else's. */
export function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const created = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return `device-${Date.now()}`;
  }
}

let lastGeocodeAt = 0;
let lastRouteAt = 0;

// Category mapping between UI and Backend
export const CATEGORY_TO_BACKEND: Record<ReportCategory, string> = {
  Hazard: 'hazard',
  Accident: 'accident',
  'Suspicious activity': 'suspicious_activity',
  Harassment: 'harassment',
  Theft: 'theft',
  Other: 'other',
};

export const BACKEND_TO_CATEGORY: Record<string, ReportCategory> = {
  hazard: 'Hazard',
  accident: 'Accident',
  suspicious_activity: 'Suspicious activity',
  suspicious: 'Suspicious activity',
  harassment: 'Harassment',
  theft: 'Theft',
  poor_street_lighting: 'Hazard',
  unsafe_isolated_area: 'Hazard',
  unsafe_transport_stop: 'Hazard',
  stalking: 'Harassment',
  assault: 'Harassment',
  other: 'Other',
};

async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const token = getToken();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...authHeaders,
        ...(options?.headers || {}),
      },
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message = errBody?.error?.message || errBody?.detail || `API request failed with status ${res.status}`;
      throw new Error(message);
    }
    return (await res.json()) as T;
  } catch (error) {
    // If request failed and wasn't already calling Render backend, try deployed Render fallback
    if (!url.startsWith('https://saferoute-ezbz.onrender.com')) {
      try {
        const renderFallbackUrl = `https://saferoute-ezbz.onrender.com/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
        const res = await fetch(renderFallbackUrl, {
          ...options,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...authHeaders,
            ...(options?.headers || {}),
          },
        });
        if (res.ok) {
          return (await res.json()) as T;
        }
      } catch {
        // continue
      }
    }

    // Local dev fallback if running locally
    if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
      try {
        const localFallbackUrl = `http://127.0.0.1:8000/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
        const res = await fetch(localFallbackUrl, {
          ...options,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...authHeaders,
            ...(options?.headers || {}),
          },
        });
        if (res.ok) {
          return (await res.json()) as T;
        }
      } catch {
        // continue
      }
    }
    throw error;
  }
}

export async function checkBackendHealth(): Promise<{ online: boolean; version?: string; routingProvider?: string }> {
  try {
    const data = await apiRequest<{ status: string; version: string; routing_provider: string }>('/health');
    return {
      online: data.status === 'ok' || data.status === 'online',
      version: data.version,
      routingProvider: data.routing_provider,
    };
  } catch {
    try {
      const direct = await fetch('https://saferoute-ezbz.onrender.com/api/v1/health');
      if (direct.ok) {
        const data = await direct.json();
        return { online: true, version: data.version, routingProvider: data.routing_provider };
      }
    } catch {
      // offline
    }
    try {
      const local = await fetch('http://127.0.0.1:8000/health');
      if (local.ok) {
        const data = await local.json();
        return { online: true, version: data.version, routingProvider: data.routing_provider };
      }
    } catch {
      // offline
    }
    return { online: false };
  }
}

export async function fetchBackendReports(center: LatLng, radiusMeters = 5000): Promise<SafetyReport[]> {
  const data = await apiRequest<{
    type: string;
    features: Array<{
      properties: {
        id: string;
        category: string;
        description?: string;
        severity: number;
        status: string;
        reported_days_ago?: number;
      };
      geometry: { coordinates: [number, number] };
    }>;
  }>(`/reports/nearby?latitude=${center[0]}&longitude=${center[1]}&radius_meters=${radiusMeters}`);

  return (data.features ?? []).map((feat) => {
    const category = BACKEND_TO_CATEGORY[feat.properties.category] || 'Other';
    const statusText = feat.properties.status === 'approved' ? 'Approved' : 'Pending review';
    return {
      id: feat.properties.id,
      category,
      description: feat.properties.description || '',
      position: [feat.geometry.coordinates[1], feat.geometry.coordinates[0]] as LatLng,
      createdAt: new Date(Date.now() - (feat.properties.reported_days_ago || 0) * 86_400_000).toISOString(),
      status: statusText,
      severity: feat.properties.severity,
      isBackendSynced: true,
    };
  });
}

export async function submitBackendReport(report: {
  category: ReportCategory;
  description: string;
  position: LatLng;
  severity?: number;
  isAnonymous?: boolean;
}): Promise<{ id: string; status: string; message: string }> {
  const backendCategory = CATEGORY_TO_BACKEND[report.category] || 'other';
  const token = getToken();
  return apiRequest<{ id: string; status: string; message: string }>('/reports', {
    method: 'POST',
    body: JSON.stringify({
      category: backendCategory,
      latitude: report.position[0],
      longitude: report.position[1],
      severity: report.severity ?? 3,
      description: report.description,
      is_anonymous: report.isAnonymous ?? !token,
    }),
  });
}

export async function fetchBackendSafeLocations(center: LatLng, radiusMeters = 8000): Promise<SafeLocation[]> {
  const data = await apiRequest<{
    type: string;
    features: Array<{
      properties: {
        id: string;
        name: string;
        category: string;
        description?: string;
        contact_phone?: string;
        is_24_7?: boolean;
        verification_status?: string;
      };
      geometry: { coordinates: [number, number] };
    }>;
  }>(`/locations/safe?latitude=${center[0]}&longitude=${center[1]}&radius_meters=${radiusMeters}`);

  return (data.features ?? []).map((feat) => ({
    id: feat.properties.id,
    name: feat.properties.name,
    category: feat.properties.category,
    description: feat.properties.description,
    contactPhone: feat.properties.contact_phone,
    is24_7: feat.properties.is_24_7 ?? true,
    verificationStatus: (feat.properties.verification_status as 'verified' | 'pending') || 'verified',
    position: [feat.geometry.coordinates[1], feat.geometry.coordinates[0]] as LatLng,
  }));
}

export async function createBackendContact(contact: {
  name: string;
  phone: string;
  email?: string;
  relationship?: string;
}): Promise<{ id: string; name: string; phone: string }> {
  return apiRequest<{ id: string; name: string; phone: string }>('/contacts', {
    method: 'POST',
    body: JSON.stringify(contact),
  });
}

export async function fetchBackendContacts(): Promise<Array<{ id: string; name: string; phone: string }>> {
  return apiRequest<Array<{ id: string; name: string; phone: string }>>('/contacts', {
    method: 'GET',
  });
}

export interface SosTriggerOptions {
  radiusMeters?: number;
  clientId?: string;
}

export interface SosTriggerResult {
  reportId?: string;
  journeyId?: string;
  shareToken?: string;
  shareUrl?: string;
  alertId?: string;
  radiusMeters: number;
}

export async function triggerBackendSos(
  position: LatLng,
  reason?: string,
  options: SosTriggerOptions = {},
): Promise<SosTriggerResult> {
  const radiusMeters = options.radiusMeters ?? 2000;
  let reportId: string | undefined;
  let journeyId: string | undefined;
  let shareToken: string | undefined;
  let shareUrl: string | undefined;
  let alertId: string | undefined;

  try {
    const rep = await submitBackendReport({
      category: 'Hazard',
      severity: 5,
      description: `[EMERGENCY SOS ALERT] ${reason || 'User triggered emergency SOS request at this location.'}`,
      position,
    });
    reportId = rep.id;
  } catch {
    // Continue attempting journey creation
  }

  try {
    const journey = await apiRequest<{ journey_id: string; status: string }>('/journeys', {
      method: 'POST',
      body: JSON.stringify({
        origin: { latitude: position[0], longitude: position[1] },
        destination: { latitude: position[0], longitude: position[1] },
        estimated_duration_seconds: 1800,
      }),
    });
    journeyId = journey.journey_id;

    if (journeyId) {
      const share = await apiRequest<{ share_token: string }>(`/journeys/${journeyId}/share`, {
        method: 'POST',
        body: JSON.stringify({ valid_hours: 3 }),
      });
      shareToken = share.share_token;
      shareUrl = `/api/v1/shared/journeys/${shareToken}`;
    }
  } catch {
    // Journey optional
  }

  try {
    const alert = await apiRequest<{ alert_id: string }>('/sos/alerts', {
      method: 'POST',
      body: JSON.stringify({
        latitude: position[0],
        longitude: position[1],
        radius_meters: radiusMeters,
        reason: reason || null,
        client_id: options.clientId || null,
        share_token: shareToken || null,
        share_url: shareUrl || null,
        journey_id: journeyId || null,
        valid_hours: 3,
      }),
    });
    alertId = alert.alert_id;
  } catch (err) {
    console.warn('Nearby SOS broadcast unavailable:', err);
  }

  return { reportId, journeyId, shareToken, shareUrl, alertId, radiusMeters };
}

export async function fetchNearbySosAlerts(
  center: LatLng,
  radiusMeters = 25000,
): Promise<NearbySosAlert[]> {
  const data = await apiRequest<{
    alerts: Array<{
      alert_id: string;
      client_id?: string | null;
      latitude: number;
      longitude: number;
      reason?: string | null;
      distance_meters: number;
      share_token?: string | null;
      share_url?: string | null;
      created_at: string;
      expires_at: string;
    }>;
  }>(
    `/sos/alerts/nearby?latitude=${center[0]}&longitude=${center[1]}&radius_meters=${radiusMeters}`,
  );

  return (data.alerts ?? []).map((alert) => ({
    alertId: alert.alert_id,
    clientId: alert.client_id ?? undefined,
    position: [alert.latitude, alert.longitude] as LatLng,
    reason: alert.reason ?? undefined,
    distanceMeters: alert.distance_meters,
    shareToken: alert.share_token ?? undefined,
    shareUrl: alert.share_url ?? undefined,
    createdAt: alert.created_at,
    expiresAt: alert.expires_at,
  }));
}

export async function resolveSosAlert(alertId: string, clientId: string): Promise<void> {
  await apiRequest(`/sos/alerts/${alertId}/resolve?client_id=${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
  });
}

export function buildSmsUrl(phone: string, body: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return `sms:${cleaned}?body=${encodeURIComponent(body)}`;
}

/** Hand off to the device SMS app. The user still confirms the message in their SMS app. */
export function openSmsApp(smsUrl: string): void {
  const link = document.createElement('a');
  link.href = smsUrl;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}


interface PhotonFeature {
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
  };
  geometry?: { coordinates?: [number, number] };
}

interface PhotonResponse { features?: PhotonFeature[] }

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 3) throw new Error('Enter at least 3 characters to search.');

  const now = Date.now();
  if (now - lastGeocodeAt < 950) throw new Error('Please wait a moment before searching again.');
  lastGeocodeAt = now;

  const url = new URL(PHOTON_ENDPOINT);
  url.searchParams.set('q', cleanQuery);
  url.searchParams.set('limit', '7');
  url.searchParams.set('lang', 'en');

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Place search is temporarily unavailable.');
  const data = (await response.json()) as PhotonResponse;

  return (data.features ?? []).flatMap((feature, index) => {
    const coords = feature.geometry?.coordinates;
    if (!coords) return [];
    const p = feature.properties ?? {};
    const name = p.name || p.street || 'Selected place';
    const details = [p.housenumber, p.street, p.district, p.city, p.county, p.state, p.country]
      .filter((part, i, list): part is string => Boolean(part) && list.indexOf(part) === i);
    return [{
      id: `${index}-${coords[0]}-${coords[1]}`,
      name,
      label: details.length ? details.join(', ') : name,
      position: [coords[1], coords[0]] as LatLng,
    }];
  });
}

interface OsrmStep {
  distance: number;
  duration: number;
  name?: string;
  maneuver?: { type?: string; modifier?: string; exit?: number };
}

interface OsrmRouteResponse {
  code?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs?: Array<{ steps?: OsrmStep[] }>;
  }>;
}

export interface RouteStep {
  id: string;
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteCandidate {
  id: string;
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  nearbyReportCount: number;
  reportedRiskScore: number;
  safetyIndicator?: BackendSafetyIndicator;
  summary?: string;
  isBackendRanked?: boolean;
}

export type RouteChoiceKind = 'shortest-safest' | 'longest-safest' | 'shortest-higher-risk';

export interface RouteChoice {
  kind: RouteChoiceKind;
  title: string;
  subtitle: string;
  route: RouteCandidate | null;
}

function haversineM(c1: LatLng, c2: LatLng): number {
  const [lat1, lon1] = c1;
  const [lat2, lon2] = c2;
  const R = 6371000.0;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dphi = ((lat2 - lat1) * Math.PI) / 180;
  const dlam = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dphi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlam / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function removeDeadEndSpurs(points: LatLng[], junctionThresholdM = 45.0, minSpurPoints = 3): LatLng[] {
  if (points.length < minSpurPoints + 2) return points;

  let cleaned = [...points];
  let changed = true;
  let passes = 0;
  const maxPasses = 10;

  while (changed && passes < maxPasses) {
    passes += 1;
    changed = false;
    const n = cleaned.length;
    let bestI = -1;
    let bestJ = -1;
    let maxSpurLen = 0;

    for (let i = 0; i < n - minSpurPoints; i++) {
      for (let j = i + minSpurPoints; j < n; j++) {
        const distDirect = haversineM(cleaned[i], cleaned[j]);
        if (distDirect <= junctionThresholdM) {
          let pathDist = 0;
          for (let k = i; k < j; k++) {
            pathDist += haversineM(cleaned[k], cleaned[k + 1]);
          }

          if (pathDist > Math.max(40.0, distDirect * 2.5)) {
            let maxApexDist = 0;
            let apexIdx = i;
            for (let k = i; k <= j; k++) {
              const dK = haversineM(cleaned[i], cleaned[k]);
              if (dK > maxApexDist) {
                maxApexDist = dK;
                apexIdx = k;
              }
            }

            if (maxApexDist > Math.max(20.0, distDirect * 1.5) && apexIdx > i && apexIdx < j) {
              const spurLen = j - i;
              if (spurLen > maxSpurLen) {
                maxSpurLen = spurLen;
                bestI = i;
                bestJ = j;
              }
            }
          }
        }
      }
    }

    if (bestI !== -1 && bestJ !== -1) {
      cleaned = [...cleaned.slice(0, bestI + 1), ...cleaned.slice(bestJ + 1)];
      changed = true;
    }
  }

  return cleaned;
}

function interpolateSmoothCurve(points: LatLng[]): LatLng[] {
  if (points.length < 3) return points;
  const [start, mid, end] = points;
  const result: LatLng[] = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = (1 - t) ** 2 * start[0] + 2 * (1 - t) * t * mid[0] + t ** 2 * end[0];
    const lon = (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * mid[1] + t ** 2 * end[1];
    result.push([Number(lat.toFixed(6)), Number(lon.toFixed(6))]);
  }
  return result;
}

export async function snapToStreetGeometry(points: LatLng[]): Promise<LatLng[]> {
  if (points.length < 2) return points;
  try {
    const coordsStr = points.map(([lat, lon]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');
    let url = `https://router.project-osrm.org/route/v1/foot/${coordsStr}?overview=full&geometries=geojson`;
    let response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
      response = await fetch(url, { headers: { Accept: 'application/json' } });
    }
    if (response.ok) {
      const data = await response.json();
      if (data.code === 'Ok' && data.routes?.length) {
        const coords = data.routes[0].geometry.coordinates;
        if (coords?.length >= 2) {
          const latLngs = coords.map(([lon, lat]: [number, number]) => [lat, lon] as LatLng);
          return removeDeadEndSpurs(latLngs);
        }
      }
    }
  } catch {
    // Offline or network error
  }

  return removeDeadEndSpurs(interpolateSmoothCurve(points));
}

export async function compareRoutesWithBackend(
  start: LatLng,
  end: LatLng,
  preference: 'safety' | 'balanced' | 'fastest' = 'safety',
): Promise<RouteChoice[]> {
  const payload = {
    origin: { latitude: start[0], longitude: start[1] },
    destination: { latitude: end[0], longitude: end[1] },
    preference,
    travel_mode: 'walk',
  };

  const data = await apiRequest<{
    routes: Array<{
      route_id: string;
      summary: string;
      distance_meters: number;
      duration_seconds: number;
      cost_score: number;
      safety_indicator: BackendSafetyIndicator;
      geometry: { type: string; coordinates: [number, number][] };
    }>;
  }>('/routes/compare', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!data.routes || !data.routes.length) {
    throw new Error('No candidate routes returned by safety engine.');
  }

  const candidates: RouteCandidate[] = data.routes.map((r, index) => {
    const coords: LatLng[] = (r.geometry.coordinates || []).map(
      ([lon, lat]) => [lat, lon] as LatLng,
    );
    const observations = r.safety_indicator.observations || [];
    const obsSummary = observations.length ? ` · ${observations.slice(0, 2).join('; ')}` : '';
    return {
      id: r.route_id || `route-${index}`,
      summary: r.summary,
      coordinates: coords,
      distanceMeters: r.distance_meters,
      durationSeconds: r.duration_seconds,
      steps: [
        {
          id: `step-${index}-1`,
          instruction: `Follow ${r.summary || 'pedestrian corridor'} towards destination${obsSummary}`,
          distanceMeters: r.distance_meters,
          durationSeconds: r.duration_seconds,
        },
      ],
      nearbyReportCount: r.safety_indicator.incident_count || 0,
      reportedRiskScore: r.safety_indicator.overall_risk_score || 0,
      safetyIndicator: r.safety_indicator,
      isBackendRanked: true,
    };
  });

  // Ensure every route candidate follows street curves and is free of dead-end spurs
  await Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.coordinates.length <= 4) {
        const streetCoords = await snapToStreetGeometry(candidate.coordinates);
        if (streetCoords.length > candidate.coordinates.length) {
          candidate.coordinates = streetCoords;
        }
      }
      candidate.coordinates = removeDeadEndSpurs(candidate.coordinates);
      if (candidate.coordinates.length >= 2) {
        let dist = 0;
        for (let i = 0; i < candidate.coordinates.length - 1; i++) {
          dist += haversineM(candidate.coordinates[i], candidate.coordinates[i + 1]);
        }
        candidate.distanceMeters = Math.round(dist);
        candidate.durationSeconds = Math.round(dist / 1.25);
      }
    }),
  );

  const safest = candidates[0] || null;
  const balanced = candidates.length > 1 ? candidates[1] : null;
  const higherRisk = candidates.length > 2
    ? candidates[candidates.length - 1]
    : candidates.find((c) => (c.safetyIndicator?.overall_risk_score ?? 0) > (safest?.safetyIndicator?.overall_risk_score ?? 0)) ?? null;

  return [
    {
      kind: 'shortest-safest',
      title: 'Safest route · Safety Engine',
      subtitle: safest?.safetyIndicator
        ? `Risk: ${safest.safetyIndicator.risk_level.toUpperCase()} (${safest.safetyIndicator.overall_risk_score.toFixed(1)}/100) · ${safest.safetyIndicator.safe_haven_count} safe havens`
        : 'Shortest option among paths with lowest verified exposure',
      route: safest,
    },
    {
      kind: 'longest-safest',
      title: 'Balanced alternative',
      subtitle: balanced?.safetyIndicator
        ? `Risk: ${balanced.safetyIndicator.risk_level.toUpperCase()} (${balanced.safetyIndicator.overall_risk_score.toFixed(1)}/100)`
        : 'Distinct pedestrian corridor with low exposure',
      route: balanced,
    },
    {
      kind: 'shortest-higher-risk',
      title: 'Faster · Higher risk corridor',
      subtitle: higherRisk?.safetyIndicator
        ? `Risk: ${higherRisk.safetyIndicator.risk_level.toUpperCase()} (${higherRisk.safetyIndicator.overall_risk_score.toFixed(1)}/100) · ${higherRisk.safetyIndicator.incident_count} reports`
        : 'Higher exposure corridor option',
      route: higherRisk,
    },
  ];
}

function stepInstruction(step: OsrmStep): string {
  const type = step.maneuver?.type ?? 'continue';
  const modifier = step.maneuver?.modifier;
  const road = step.name?.trim();
  let instruction: string;

  if (type === 'depart') instruction = 'Start your journey';
  else if (type === 'arrive') instruction = 'Arrive at your destination';
  else if (type === 'roundabout' || type === 'rotary') {
    instruction = `Enter the roundabout${step.maneuver?.exit ? ` and take exit ${step.maneuver.exit}` : ''}`;
  } else if (type === 'turn' || type === 'fork' || type === 'end of road') {
    instruction = `${type === 'end of road' ? 'At the end of the road' : type === 'fork' ? 'Keep to the' : 'Turn'}${modifier ? ` ${modifier}` : ''}`;
  } else if (type === 'merge') instruction = `Merge${modifier ? ` ${modifier}` : ''}`;
  else if (type === 'on ramp' || type === 'off ramp') instruction = `${type === 'on ramp' ? 'Take the' : 'Exit via the'}${modifier ? ` ${modifier}` : ''} ramp`;
  else if (type === 'new name' || type === 'continue') instruction = `Continue${modifier ? ` ${modifier}` : ''}`;
  else instruction = `${type.charAt(0).toUpperCase()}${type.slice(1)}${modifier ? ` ${modifier}` : ''}`;

  if (road && type !== 'arrive') instruction += ` onto ${road}`;
  return instruction;
}

export async function getDrivingRoutes(start: LatLng, end: LatLng): Promise<RouteCandidate[]> {
  const now = Date.now();
  if (now - lastRouteAt < 950) throw new Error('Please wait a moment before requesting another route.');
  lastRouteAt = now;

  const coordinates = `${start[1]},${start[0]};${end[1]},${end[0]}`;
  const url = `${OSRM_ENDPOINT}/${coordinates}?overview=full&geometries=geojson&steps=true&alternatives=3`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('A route could not be found right now.');
  const data = (await response.json()) as OsrmRouteResponse;
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No driving route was found between those points.');

  interface ProcessedRoute {
    coordinates: LatLng[];
    distance: number;
    duration: number;
    steps: RouteStep[];
  }

  const processedRoutes: ProcessedRoute[] = [];

  for (const [rIdx, r] of (data.routes ?? []).entries()) {
    const rawCoords = r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng);
    const cleanedCoords = removeDeadEndSpurs(rawCoords);
    if (cleanedCoords.length < 2) continue;

    let dist = 0;
    for (let i = 0; i < cleanedCoords.length - 1; i++) {
      dist += haversineM(cleanedCoords[i], cleanedCoords[i + 1]);
    }
    const distM = Math.round(dist);

    if (!processedRoutes.some((p) => Math.abs(p.distance - distM) < 35)) {
      processedRoutes.push({
        coordinates: cleanedCoords,
        distance: distM,
        duration: Math.round(distM / 1.25),
        steps: (r.legs ?? []).flatMap((leg) => leg.steps ?? []).map((step, stepIndex) => ({
          id: `step-${rIdx}-${stepIndex}`,
          instruction: stepInstruction(step),
          distanceMeters: step.distance,
          durationSeconds: step.duration,
        })),
      });
    }
  }

  // If OSRM returned fewer than 3 routes, fetch lateral street corridor alternatives
  if (processedRoutes.length < 3) {
    const dLat = end[0] - start[0];
    const dLng = end[1] - start[1];
    const distDeg = Math.hypot(dLat, dLng) || 0.0001;
    const pLat = -dLng / distDeg;
    const pLng = dLat / distDeg;
    const latOffset = Math.max(0.0011, Math.min(0.0055, distDeg * 0.16));

    const candidateSpecs = [
      { frac: 0.5, off: latOffset },
      { frac: 0.5, off: -latOffset },
      { frac: 0.5, off: latOffset * 1.8 },
      { frac: 0.5, off: -latOffset * 1.8 },
      { frac: 0.35, off: latOffset * 0.8 },
      { frac: 0.35, off: -latOffset * 0.8 },
      { frac: 0.65, off: latOffset * 0.8 },
      { frac: 0.65, off: -latOffset * 0.8 },
    ];

    for (const spec of candidateSpecs) {
      if (processedRoutes.length >= 3) break;
      const viaLat = Number((start[0] + dLat * spec.frac + pLat * spec.off).toFixed(6));
      const viaLng = Number((start[1] + dLng * spec.frac + pLng * spec.off).toFixed(6));
      const viaCoords = `${start[1]},${start[0]};${viaLng},${viaLat};${end[1]},${end[0]}`;
      try {
        const altRes = await fetch(
          `${OSRM_ENDPOINT}/${viaCoords}?overview=full&geometries=geojson&steps=true&alternatives=false`,
          { headers: { Accept: 'application/json' } },
        );
        if (altRes.ok) {
          const altData = (await altRes.json()) as OsrmRouteResponse;
          if (altData.code === 'Ok' && altData.routes?.length) {
            const altRoute = altData.routes[0];
            const rawCoords = altRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng);
            const cleanedCoords = removeDeadEndSpurs(rawCoords);
            if (cleanedCoords.length >= 2) {
              let dist = 0;
              for (let i = 0; i < cleanedCoords.length - 1; i++) {
                dist += haversineM(cleanedCoords[i], cleanedCoords[i + 1]);
              }
              const distM = Math.round(dist);
              // Reject candidate if it was a dead-end spur that collapsed back to an existing route
              const isDistinct = !processedRoutes.some((p) => Math.abs(p.distance - distM) < 35);
              if (isDistinct) {
                processedRoutes.push({
                  coordinates: cleanedCoords,
                  distance: distM,
                  duration: Math.round(distM / 1.25),
                  steps: (altRoute.legs ?? []).flatMap((leg) => leg.steps ?? []).map((step, stepIndex) => ({
                    id: `step-alt-${processedRoutes.length}-${stepIndex}`,
                    instruction: stepInstruction(step),
                    distanceMeters: step.distance,
                    durationSeconds: step.duration,
                  })),
                });
              }
            }
          }
        }
      } catch {
        // continue
      }
    }
  }

  return processedRoutes.map((route, index) => ({
    id: `route-${index}`,
    coordinates: route.coordinates,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    steps: route.steps,
    nearbyReportCount: 0,
    reportedRiskScore: 0,
  }));
}

function pointToSegmentMeters(point: LatLng, a: LatLng, b: LatLng): number {
  const earth = 6371000;
  const latitude = (point[0] * Math.PI) / 180;
  const scaleX = Math.cos(latitude) * earth * Math.PI / 180;
  const scaleY = earth * Math.PI / 180;
  const px = point[1] * scaleX;
  const py = point[0] * scaleY;
  const ax = a[1] * scaleX;
  const ay = a[0] * scaleY;
  const bx = b[1] * scaleX;
  const by = b[0] * scaleY;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function routeDistanceToPoint(route: RouteCandidate, point: LatLng): number {
  const coordinates = route.coordinates;
  if (!coordinates.length) return Number.POSITIVE_INFINITY;
  if (coordinates.length === 1) return pointToSegmentMeters(point, coordinates[0], coordinates[0]);
  const stride = Math.max(1, Math.floor(coordinates.length / 220));
  let closest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < coordinates.length - 1; i += stride) {
    const nextIndex = Math.min(i + stride, coordinates.length - 1);
    closest = Math.min(closest, pointToSegmentMeters(point, coordinates[i], coordinates[nextIndex]));
    if (closest < 25) break;
  }
  return closest;
}

const CATEGORY_WEIGHT: Record<SafetyReport['category'], number> = {
  Hazard: 1.6,
  Accident: 2.1,
  'Suspicious activity': 1.8,
  Harassment: 2.3,
  Theft: 1.7,
  Other: 1,
};

export function scoreRoutesWithLocalReports(routes: RouteCandidate[], reports: SafetyReport[]): RouteCandidate[] {
  return routes.map((route) => {
    let score = 0;
    let count = 0;
    for (const report of reports) {
      const distance = routeDistanceToPoint(route, report.position);
      if (distance > 220) continue;
      count += 1;
      const ageDays = Math.max(0, (Date.now() - new Date(report.createdAt).getTime()) / 86_400_000);
      const recency = Number.isFinite(ageDays) ? Math.max(0.25, Math.exp(-ageDays / 120)) : 0.5;
      const proximity = 1 - distance / 260;
      score += CATEGORY_WEIGHT[report.category] * recency * Math.max(0, proximity);
    }
    return { ...route, nearbyReportCount: count, reportedRiskScore: Number(score.toFixed(2)) };
  });
}

export function buildRouteChoices(routes: RouteCandidate[]): RouteChoice[] {
  const riskRanked = [...routes].sort((a, b) => a.reportedRiskScore - b.reportedRiskScore || a.distanceMeters - b.distanceMeters);
  const lowestRisk = riskRanked[0]?.reportedRiskScore ?? 0;
  const saferPool = routes.filter((route) => route.reportedRiskScore <= lowestRisk + Math.max(0.75, lowestRisk * 0.3));
  const shortestSafe = [...saferPool].sort((a, b) => a.distanceMeters - b.distanceMeters)[0] ?? riskRanked[0] ?? null;
  const longestSafe = saferPool.length > 1
    ? [...saferPool].filter((route) => route.id !== shortestSafe?.id).sort((a, b) => b.distanceMeters - a.distanceMeters)[0]
    : null;
  const usedIds = new Set([shortestSafe?.id, longestSafe?.id].filter((id): id is string => Boolean(id)));
  const higherExposurePool = routes.filter((route) => !usedIds.has(route.id) && route.reportedRiskScore > lowestRisk + 0.05);
  const highestExposure = higherExposurePool.length
    ? Math.max(...higherExposurePool.map((route) => route.reportedRiskScore))
    : null;
  const shortestHigherRisk = highestExposure === null
    ? null
    : higherExposurePool.filter((route) => route.reportedRiskScore >= highestExposure - 0.05).sort((a, b) => a.distanceMeters - b.distanceMeters)[0] ?? null;

  // Fallbacks if incident exposure is uniform or no reports exist in area
  const remaining = routes.filter((r) => !usedIds.has(r.id));
  const secondary = longestSafe ?? (remaining.length ? remaining[0] : null);
  if (secondary) usedIds.add(secondary.id);
  const remainingAfterSecondary = routes.filter((r) => !usedIds.has(r.id));
  const thirdRoute = shortestHigherRisk ?? (remainingAfterSecondary.length ? remainingAfterSecondary[0] : null);

  return [
    { kind: 'shortest-safest', title: 'Shortest & safest', subtitle: 'Shortest option among paths with the lowest local report exposure', route: shortestSafe },
    { kind: 'longest-safest', title: 'Balanced alternative', subtitle: 'Distinct pedestrian corridor with low exposure', route: secondary },
    { kind: 'shortest-higher-risk', title: 'Faster · Higher risk corridor', subtitle: 'Alternative corridor option with direct passage', route: thirdRoute },
  ];
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
