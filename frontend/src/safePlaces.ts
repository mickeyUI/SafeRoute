import type { SafeLocation } from './types';

export const SAFE_PLACE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'hospital', label: 'Hospitals' },
  { id: 'church', label: 'Churches' },
  { id: 'cafe', label: 'Cafés' },
  { id: 'police_station', label: 'Police' },
  { id: 'pharmacy', label: 'Pharmacies' },
] as const;

export type SafePlaceFilter = (typeof SAFE_PLACE_FILTERS)[number]['id'];

export const SAFE_PLACE_META: Record<string, { label: string; color: string }> = {
  hospital: { label: 'Hospital', color: '#e13e60' },
  church: { label: 'Church', color: '#8d67d8' },
  cafe: { label: 'Café', color: '#c2741a' },
  police_station: { label: 'Police station', color: '#2563eb' },
  pharmacy: { label: 'Pharmacy', color: '#398b69' },
  verified_haven: { label: 'Safe haven', color: '#10b981' },
};

export function safePlaceLabel(category: string): string {
  return SAFE_PLACE_META[category]?.label ?? category.replace(/_/g, ' ');
}

export function safePlaceColor(category: string): string {
  return SAFE_PLACE_META[category]?.color ?? '#398b69';
}

export function filterSafePlaces(
  places: SafeLocation[],
  filter: SafePlaceFilter,
): SafeLocation[] {
  return filter === 'all' ? places : places.filter((place) => place.category === filter);
}
