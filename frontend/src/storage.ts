import type { LatLng, SafetyReport, SosRequest } from './types';

const REPORTS_KEY = 'saferoute.demo.reports.v1';
const SOS_KEY = 'saferoute.demo.sos.v1';
const LAST_LOCATION_KEY = 'saferoute.last-location.v1';

function readArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export function loadReports(): SafetyReport[] {
  return readArray<SafetyReport>(REPORTS_KEY);
}

export function saveReports(reports: SafetyReport[]): void {
  try {
    localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
  } catch {
    // Keep the UI usable if browser storage is full or unavailable.
  }
}

export function loadSosRequests(): SosRequest[] {
  return readArray<SosRequest>(SOS_KEY);
}

export function saveSosRequests(requests: SosRequest[]): void {
  try {
    localStorage.setItem(SOS_KEY, JSON.stringify(requests));
  } catch {
    // Keep the UI usable if browser storage is full or unavailable.
  }
}

/** Last position seen on this device, used to find nearby SOS alerts before GPS starts. */
export function loadLastLocation(): LatLng | null {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      Array.isArray(value) && value.length === 2 &&
      typeof value[0] === 'number' && typeof value[1] === 'number'
    ) {
      return [value[0], value[1]] as LatLng;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLastLocation(position: LatLng): void {
  try {
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify(position));
  } catch {
    // Ignore storage errors; live location still works in memory.
  }
}
