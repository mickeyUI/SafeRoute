/** API services and route/report helpers used by the map UI. */

import { apiRequest, ensureSession } from './api';
import type {
  LatLng,
  PlaceResult,
  ReportCategory,
  SafetyReport,
  SosRequest,
} from './types';

const PHOTON_ENDPOINT = import.meta.env.VITE_GEOCODING_ENDPOINT || 'https://photon.komoot.io/api/';

let lastGeocodeAt = 0;
let lastRouteAt = 0;

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

interface PhotonResponse {
  features?: PhotonFeature[];
}

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
}

export type RouteChoiceKind = 'shortest-safest' | 'longest-safest' | 'shortest-higher-risk';

export interface RouteChoice {
  kind: RouteChoiceKind;
  title: string;
  subtitle: string;
  route: RouteCandidate | null;
}

interface BackendSafetyFactors {
  report_penalty: number;
  coverage_bonus: number;
  length_penalty: number;
  nearby_report_count?: number;
}

interface BackendAlternative {
  id: string;
  rank: number;
  provider: string;
  distance_m: number;
  duration_s: number;
  safety_score: number;
  safety_confidence: number;
  safety_factors: BackendSafetyFactors;
  geometry: [number, number][];
}

/** Fetch alternatives from the SafeRoute backend and adapt them to the map UI shape. */
export async function getDrivingRoutes(start: LatLng, end: LatLng): Promise<RouteCandidate[]> {
  const now = Date.now();
  if (now - lastRouteAt < 700) throw new Error('Please wait a moment before requesting another route.');
  lastRouteAt = now;

  await ensureSession();
  const data = await apiRequest<{ alternatives: BackendAlternative[] }>(
    '/api/v1/routes/compare',
    {
      method: 'POST',
      body: JSON.stringify({
        origin: [start[1], start[0]],
        destination: [end[1], end[0]],
        travel_mode: 'drive',
        alternatives: 3,
      }),
    },
  );

  return data.alternatives.map((alternative, index) => ({
    id: alternative.id,
    coordinates: alternative.geometry.map(([lng, lat]) => [lat, lng] as LatLng),
    distanceMeters: alternative.distance_m,
    durationSeconds: alternative.duration_s,
    steps: [
      {
        id: `start-${index}`,
        instruction: 'Start your journey',
        distanceMeters: 0,
        durationSeconds: 0,
      },
      {
        id: `arrive-${index}`,
        instruction: 'Arrive at your destination',
        distanceMeters: alternative.distance_m,
        durationSeconds: alternative.duration_s,
      },
    ],
    nearbyReportCount: Math.round(alternative.safety_factors.nearby_report_count ?? 0),
    reportedRiskScore: Number((100 - alternative.safety_score).toFixed(2)),
  }));
}

type BackendReportType =
  | 'harassment'
  | 'assault'
  | 'suspicious'
  | 'unsafe_lighting'
  | 'other';

type BackendReportStatus = 'pending' | 'approved' | 'rejected';

interface BackendReport {
  id: string;
  type: BackendReportType;
  severity: number;
  description: string | null;
  location: [number, number];
  occurred_at: string;
  status: BackendReportStatus;
  created_at: string;
}

const CATEGORY_TO_BACKEND: Record<ReportCategory, { type: BackendReportType; severity: number }> = {
  Hazard: { type: 'unsafe_lighting', severity: 3 },
  Accident: { type: 'other', severity: 4 },
  'Suspicious activity': { type: 'suspicious', severity: 3 },
  Harassment: { type: 'harassment', severity: 4 },
  Theft: { type: 'other', severity: 3 },
  Other: { type: 'other', severity: 2 },
};

const BACKEND_TO_CATEGORY: Record<BackendReportType, ReportCategory> = {
  harassment: 'Harassment',
  assault: 'Harassment',
  suspicious: 'Suspicious activity',
  unsafe_lighting: 'Hazard',
  other: 'Other',
};

function toFrontendReport(report: BackendReport): SafetyReport {
  const status: SafetyReport['status'] =
    report.status === 'approved'
      ? 'Approved'
      : report.status === 'rejected'
        ? 'Rejected'
        : 'Pending review';

  return {
    id: report.id,
    category: BACKEND_TO_CATEGORY[report.type] ?? 'Other',
    description: report.description ?? '',
    position: [report.location[1], report.location[0]],
    createdAt: report.occurred_at || report.created_at,
    status,
    attachmentName: undefined,
  };
}

export async function loadBackendReports(
  center: LatLng,
  radiusMetres = 10000,
): Promise<SafetyReport[]> {
  await ensureSession();
  const params = new URLSearchParams({
    lon: String(center[1]),
    lat: String(center[0]),
    radius_m: String(radiusMetres),
    limit: '100',
  });
  const data = await apiRequest<{ items: BackendReport[] }>(
    `/api/v1/reports/nearby?${params.toString()}`,
  );
  return data.items.map(toFrontendReport);
}

export async function createBackendReport(input: {
  position: LatLng;
  category: ReportCategory;
  description: string;
  attachmentName?: string;
}): Promise<SafetyReport> {
  const mapping = CATEGORY_TO_BACKEND[input.category];
  await ensureSession();
  const created = await apiRequest<BackendReport>('/api/v1/reports', {
    method: 'POST',
    body: JSON.stringify({
      type: mapping.type,
      severity: mapping.severity,
      description: input.description || null,
      location: [input.position[1], input.position[0]],
      occurred_at: new Date().toISOString(),
    }),
  });
  return toFrontendReport(created);
}

interface BackendSos {
  id: string;
  reporter_id: string;
  location: [number, number];
  reason: string | null;
  voice_attached: boolean;
  picture_name: string | null;
  status: 'active' | 'acknowledged' | 'cancelled';
  created_at: string;
}

function toFrontendSos(alert: BackendSos): SosRequest {
  return {
    id: alert.id,
    position: [alert.location[1], alert.location[0]],
    createdAt: alert.created_at,
    reason: alert.reason ?? undefined,
    voiceAttached: alert.voice_attached,
    pictureName: alert.picture_name ?? undefined,
    status: 'Recorded — backend',
  };
}

export async function createBackendSos(input: {
  position: LatLng;
  reason?: string;
  voiceAttached: boolean;
  pictureName?: string;
}): Promise<SosRequest> {
  await ensureSession();
  const created = await apiRequest<BackendSos>('/api/v1/sos', {
    method: 'POST',
    body: JSON.stringify({
      location: [input.position[1], input.position[0]],
      reason: input.reason || null,
      voice_attached: input.voiceAttached,
      picture_name: input.pictureName ?? null,
    }),
  });
  return toFrontendSos(created);
}

export async function loadBackendSos(): Promise<SosRequest[]> {
  await ensureSession();
  const data = await apiRequest<BackendSos[]>('/api/v1/sos/mine?limit=100');
  return data.map(toFrontendSos);
}

const CATEGORY_WEIGHT: Record<ReportCategory, number> = {
  Hazard: 1.6,
  Accident: 2.1,
  'Suspicious activity': 1.8,
  Harassment: 2.3,
  Theft: 1.7,
  Other: 1,
};

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

/** Re-rank backend alternatives using the reports currently shown on the map. */
export function scoreRoutesWithLocalReports(
  routes: RouteCandidate[],
  reports: SafetyReport[],
): RouteCandidate[] {
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
    return {
      ...route,
      nearbyReportCount: count,
      reportedRiskScore: Number((route.reportedRiskScore + score).toFixed(2)),
    };
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

  return [
    { kind: 'shortest-safest', title: 'Shortest & safest', subtitle: 'Shortest option among paths with the lowest local report exposure', route: shortestSafe },
    { kind: 'longest-safest', title: 'Longest & safest', subtitle: 'Longest distinct option with similarly low local report exposure', route: longestSafe ?? null },
    { kind: 'shortest-higher-risk', title: 'Shortest · higher reported risk', subtitle: 'Shortest distinct option with the highest local report exposure', route: shortestHigherRisk },
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
