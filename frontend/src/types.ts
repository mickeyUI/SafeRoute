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
  severity?: number;
  attachmentName?: string;
  isBackendSynced?: boolean;
}

export interface SafeLocation {
  id: string;
  name: string;
  category: 'police_station' | 'hospital' | 'pharmacy' | 'verified_haven' | 'church' | 'cafe' | string;
  description?: string;
  contactPhone?: string;
  position: LatLng;
  is24_7: boolean;
  verificationStatus: 'verified' | 'pending';
}

export interface SosRequest {
  id: string;
  position: LatLng;
  createdAt: string;
  reason?: string;
  voiceAttached: boolean;
  pictureName?: string;
  status: 'Saved locally — demo only' | 'Sent to backend' | 'Emergency Active' | 'Resolved';
  journeyId?: string;
  shareToken?: string;
  shareUrl?: string;
  alertId?: string;
}

export interface NearbySosAlert {
  alertId: string;
  clientId?: string;
  position: LatLng;
  reason?: string;
  distanceMeters: number;
  shareToken?: string;
  shareUrl?: string;
  createdAt: string;
  expiresAt: string;
}

export interface PlaceResult {
  id: string;
  name: string;
  label: string;
  position: LatLng;
}

export interface BackendSafetyIndicator {
  overall_risk_score: number;
  risk_level: 'low' | 'moderate' | 'elevated' | 'high';
  data_coverage_score: number;
  incident_count: number;
  safe_haven_count: number;
  factors?: Record<string, number | null>;
  observations: string[];
}

