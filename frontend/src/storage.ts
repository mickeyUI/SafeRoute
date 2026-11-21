import type { SafetyReport, SosRequest } from './types';

const REPORTS_KEY = 'saferoute.demo.reports.v1';
const SOS_KEY = 'saferoute.demo.sos.v1';

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
