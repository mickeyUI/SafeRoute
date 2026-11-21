export type LatLng = [number, number];

export const REPORT_CATEGORIES = [
  'Hazard',
  'Accident',
  'Suspicious activity',
  'Harassment',
  'Theft',
  'Other',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export type MapMode = 'idle' | 'report' | 'route-origin' | 'route-destination' | 'sos-location';

export interface SafetyReport {
  id: string;
  category: ReportCategory;
  description: string;
  position: LatLng;
  createdAt: string;
  status: 'Pending review' | 'Approved' | 'Rejected';
  attachmentName?: string;
}

export interface SosRequest {
  id: string;
  position: LatLng;
  createdAt: string;
  reason?: string;
  voiceAttached: boolean;
  pictureName?: string;
  status: 'Recorded — backend' | 'Saved locally — demo only';
}

export interface PlaceResult {
  id: string;
  name: string;
  label: string;
  position: LatLng;
}
