import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Onboarding from './Onboarding';
import { clearToken, getCachedUser, getPreferences, type UserPreferences, type UserRead } from './auth';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Church,
  Coffee,
  Copy,
  Crosshair,
  Filter,
  Hospital,
  ImagePlus,
  Landmark,
  MessageCircle,
  Navigation,
  LocateFixed,
  LogIn,
  LogOut,
  MapPin,
  MapPinned,
  Mic,
  Minus,
  Plus,
  Palette,
  Phone,
  Pill,
  Route as RouteIcon,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Square,
  User,
  X,
} from 'lucide-react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import {
  buildRouteChoices,
  buildSmsUrl,
  buildTrackUrl,
  cancelJourney,
  checkBackendHealth,
  resolveAppUrl,
  compareRoutesWithBackend,
  fetchBackendReports,
  fetchBackendSafeLocations,
  fetchNearbySosAlerts,
  formatDistance,
  formatDuration,
  getClientId,
  getDrivingRoutes,
  scoreRoutesWithLocalReports,
  searchPlaces,
  openSmsApp,
  resolveSosAlert,
  sendJourneyCheckin,
  submitBackendReport,
  triggerBackendSos,
  type RouteCandidate,
  type RouteChoice,
  type RouteChoiceKind,
} from './services';
import { buildGoogleMapsUrl, buildTrackPath } from './shareLinks';
import {
  filterSafePlaces,
  SAFE_PLACE_FILTERS,
  safePlaceColor,
  safePlaceLabel,
  type SafePlaceFilter,
} from './safePlaces';
import {
  loadLastLocation,
  loadReports,
  loadSosRequests,
  saveLastLocation,
  saveReports,
  saveSosRequests,
} from './storage';
import {
  REPORT_CATEGORIES,
  type LatLng,
  type MapMode,
  type NearbySosAlert,
  type PlaceResult,
  type ReportCategory,
  type SafeLocation,
  type SafetyReport,
  type SosRequest,
} from './types';

const DEFAULT_CENTER: LatLng = [9.03, 38.74];
const REPORT_COLORS: Record<ReportCategory, string> = {
  Hazard: '#df477c',
  Accident: '#e58b37',
  'Suspicious activity': '#8d67d8',
  Harassment: '#c6539c',
  Theft: '#d35b55',
  Other: '#68758a',
};

type Panel = 'report' | 'sos' | 'sos-confirm' | 'sos-result' | null;
type ThemeId = 'rose' | 'midnight' | 'ocean' | 'forest' | 'lavender';

const SOS_RADIUS_METERS = 2000;
const UNSAFE_RADIUS_METERS = 250;
const SAFETY_MONITOR_KEY = 'saferoute-safety-monitoring';

interface SosResult {
  position: LatLng;
  reason?: string;
  alertId?: string;
  journeyId?: string;
  sharePath?: string;
  shareUrl?: string;
  googleMapsUrl: string;
  smsUrl?: string;
  contactName?: string;
  contactPhone?: string;
  online: boolean;
}

const THEMES: Array<{ id: ThemeId; name: string; description: string; color: string }> = [
  { id: 'rose', name: 'Rose', description: 'Original white and pink', color: '#d94f91' },
  { id: 'midnight', name: 'Midnight', description: 'Dark plum and violet', color: '#9b8cff' },
  { id: 'ocean', name: 'Ocean', description: 'Cool blue and cyan', color: '#278fbe' },
  { id: 'forest', name: 'Forest', description: 'Calm green', color: '#398b69' },
  { id: 'lavender', name: 'Lavender', description: 'Soft violet', color: '#8664c5' },
];

function getSavedTheme(): ThemeId {
  try {
    const saved = localStorage.getItem('saferoute-theme');
    return THEMES.some((theme) => theme.id === saved) ? (saved as ThemeId) : 'rose';
  } catch { return 'rose'; }
}

function MapInteraction({
  mode,
  onPick,
  flyTo,
}: {
  mode: MapMode;
  onPick: (point: LatLng) => void;
  flyTo: LatLng | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (flyTo) map.flyTo(flyTo, 15, { duration: 0.8 });
  }, [flyTo, map]);

  useMapEvents({
    click(event) {
      if (mode !== 'idle') onPick([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
}

function MapControls({ onLocate }: { onLocate: () => void }) {
  const map = useMap();

  return (
    <div className="map-zoom-controls" aria-label="Map controls" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => map.zoomIn()}>
        <Plus size={17} />
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => map.zoomOut()}>
        <Minus size={17} />
      </button>
      <span className="control-divider" />
      <button type="button" aria-label="Use my location" title="Use my location" onClick={onLocate}>
        <LocateFixed size={17} />
      </button>
    </div>
  );
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `sr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatCoordinate(point: LatLng | null): string {
  if (!point) return 'Location not selected';
  return `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Just now'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function readGpsPoint(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser does not support device location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve([position.coords.latitude, position.coords.longitude]),
      () => reject(new Error('Location permission was not granted.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    );
  });
}

/** Straight-line distance between two points in metres (good enough for nearby alerts). */
function distanceMeters(a: LatLng, b: LatLng): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getSavedSafetyMonitoring(): boolean {
  try {
    return localStorage.getItem(SAFETY_MONITOR_KEY) === 'true';
  } catch {
    return false;
  }
}

function safePlaceIcon(category: string) {
  switch (category) {
    case 'hospital': return Hospital;
    case 'church': return Church;
    case 'cafe': return Coffee;
    case 'police_station': return Landmark;
    case 'pharmacy': return Pill;
    default: return ShieldCheck;
  }
}

export default function App() {
  // ── Auth & Preferences state ────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<UserRead | null>(() => getCachedUser());
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(() => getPreferences());
  const [showOnboarding, setShowOnboarding] = useState(() => !getCachedUser());

  const handleAuthComplete = useCallback((user: UserRead, _token: string, preferences?: UserPreferences) => {
    setCurrentUser(user);
    if (preferences) {
      setUserPreferences(preferences);
    }
    setShowOnboarding(false);
  }, []);

  const handleSkipOnboarding = useCallback(() => {
    // Onboarding may have saved preferences (including the emergency contact)
    // even when the user chose to skip sign-in — pick them up here.
    setUserPreferences(getPreferences() ?? null);
    setShowOnboarding(false);
  }, []);

  function handleSignOut() {
    clearToken();
    setCurrentUser(null);
    setShowOnboarding(true);
  }

  // ── Map / UI state ──────────────────────────────────────────────────────
  const [reports, setReports] = useState<SafetyReport[]>(() => loadReports());
  const [sosRequests, setSosRequests] = useState<SosRequest[]>(() => loadSosRequests());
  const [mapMode, setMapMode] = useState<MapMode>('idle');
  const [panel, setPanel] = useState<Panel>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(() => getSavedTheme());
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
  const [enabledCategories, setEnabledCategories] = useState<Record<ReportCategory, boolean>>(() =>
    Object.fromEntries(REPORT_CATEGORIES.map((category) => [category, true])) as Record<ReportCategory, boolean>,
  );
  const [showSosMarkers, setShowSosMarkers] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchMarker, setSearchMarker] = useState<LatLng | null>(null);
  const [flyTo, setFlyTo] = useState<LatLng | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const [reportPoint, setReportPoint] = useState<LatLng | null>(null);
  const [reportCategory, setReportCategory] = useState<ReportCategory>('Hazard');
  const [reportDescription, setReportDescription] = useState('');
  const [reportPhoto, setReportPhoto] = useState<File | null>(null);

  const [sosPoint, setSosPoint] = useState<LatLng | null>(null);
  const [sosReason, setSosReason] = useState('');
  const [sosPhoto, setSosPhoto] = useState<File | null>(null);
  const [voiceAttached, setVoiceAttached] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [routeOrigin, setRouteOrigin] = useState<LatLng | null>(null);
  const [routeDestination, setRouteDestination] = useState<LatLng | null>(null);
  const [routeChoices, setRouteChoices] = useState<RouteChoice[]>([]);
  const [routePreview, setRoutePreview] = useState<RouteCandidate | null>(null);
  const [selectedRouteKind, setSelectedRouteKind] = useState<RouteChoiceKind>('shortest-safest');
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeError, setRouteError] = useState('');
  const [safeLocations, setSafeLocations] = useState<SafeLocation[]>([]);
  const [showSafeHavens, setShowSafeHavens] = useState(true);
  const [safePlacesOpen, setSafePlacesOpen] = useState(false);
  const [safePlacesLoading, setSafePlacesLoading] = useState(false);
  const [safePlacesLocating, setSafePlacesLocating] = useState(false);
  const [safePlacesCenter, setSafePlacesCenter] = useState<LatLng | null>(null);
  const [safePlacesFilter, setSafePlacesFilter] = useState<SafePlaceFilter>('all');
  const [safePlacesError, setSafePlacesError] = useState('');
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [lastSosShareUrl, setLastSosShareUrl] = useState<string | null>(null);
  const lastKnownLocation = useMemo(() => loadLastLocation(), []);

  // Ask for the real device position once on startup. Without this, the map,
  // nearby reports, and safe places silently use the demo center or a stale
  // saved position, which makes "my location" look wrong.
  useEffect(() => {
    if (!navigator.geolocation) return;
    let active = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active) return;
        const point: LatLng = [position.coords.latitude, position.coords.longitude];
        setUserLocation(point);
        setFlyTo(point);
      },
      () => {
        // Keep the last known area until the user explicitly retries with the locate button.
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
    return () => { active = false; };
  }, []);

  // Round to ~100 m so continuous GPS updates don't refetch backend data on every fix.
  const backendSyncCenter = useMemo<LatLng | null>(() => {
    const center = userLocation ?? lastKnownLocation;
    return center ? [Number(center[0].toFixed(3)), Number(center[1].toFixed(3))] : null;
  }, [userLocation, lastKnownLocation]);

  // ── One-tap SOS state ────────────────────────────────────────────────────
  const clientId = useMemo(() => getClientId(), []);
  const [sosConfirmPoint, setSosConfirmPoint] = useState<LatLng | null>(null);
  const [sosSending, setSosSending] = useState(false);
  const [sosResult, setSosResult] = useState<SosResult | null>(null);
  const [nearbySosAlerts, setNearbySosAlerts] = useState<NearbySosAlert[]>([]);
  const smsAutoOpenedRef = useRef(false);

  // ── Unsafe-area warnings ────────────────────────────────────────────────
  const [safetyMonitoring, setSafetyMonitoring] = useState(getSavedSafetyMonitoring);
  const [unsafeNearbyReports, setUnsafeNearbyReports] = useState<SafetyReport[]>([]);
  const [unsafeAlertDismissed, setUnsafeAlertDismissed] = useState(false);
  const [unsafeDetailsOpen, setUnsafeDetailsOpen] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const warnedReportIdsRef = useRef<Set<string>>(new Set());
  const lastUnsafeSignatureRef = useRef('');
  const userLocationRef = useRef<LatLng | null>(null);

  useEffect(() => {
    let active = true;
    async function syncWithBackend() {
      const health = await checkBackendHealth();
      if (!active) return;
      setBackendOnline(health.online);

      if (health.online && backendSyncCenter) {
        try {
          const backendHavens = await fetchBackendSafeLocations(backendSyncCenter, 25000);
          if (!active) return;
          if (backendHavens.length) setSafeLocations(backendHavens);
        } catch (e) {
          console.warn('Backend sync error:', e);
        }
      }
    }
    void syncWithBackend();
    const interval = window.setInterval(syncWithBackend, 25000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [backendSyncCenter]);

  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);

  // Keep community reports fresh around the device so new reports from other
  // users can trigger warnings as soon as they are picked up by the backend.
  useEffect(() => {
    if (!backendOnline || !backendSyncCenter) return;
    let active = true;
    async function syncReports() {
      const center = backendSyncCenter;
      if (!center) return;
      try {
        const backendReps = await fetchBackendReports(center, 25000);
        if (!active) return;
        if (backendReps.length) {
          setReports((prev) => {
            const map = new Map<string, SafetyReport>();
            prev.forEach((r) => map.set(r.id, r));
            // Backend data wins so status and sync state stay accurate.
            backendReps.forEach((r) => map.set(r.id, r));
            return Array.from(map.values());
          });
        }
      } catch (e) {
        console.warn('Report sync error:', e);
      }
    }
    void syncReports();
    const interval = window.setInterval(syncReports, 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [backendOnline, backendSyncCenter]);

  // Keep the last known position so nearby SOS discovery still works before GPS starts.
  useEffect(() => {
    if (userLocation) saveLastLocation(userLocation);
  }, [userLocation]);

  // While an SOS is active, follow the device so the tracking link shows movement.
  // Safety alerts already run their own watcher, so don't start a duplicate one.
  useEffect(() => {
    const journeyId = sosResult?.journeyId;
    if (!journeyId || safetyMonitoring || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => setUserLocation([position.coords.latitude, position.coords.longitude]),
      () => { /* The locate button can retry if permission is lost. */ },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [sosResult?.journeyId, safetyMonitoring]);

  // Push the current position to the shared journey every 15 seconds. The
  // tracking page refreshes on the same cadence.
  useEffect(() => {
    const journeyId = sosResult?.journeyId;
    if (!journeyId) return;

    const initialPoint = userLocationRef.current ?? sosResult?.position;
    if (initialPoint) {
      void sendJourneyCheckin(journeyId, initialPoint).catch(() => {});
    }

    const interval = window.setInterval(() => {
      const point = userLocationRef.current;
      if (point) void sendJourneyCheckin(journeyId, point).catch(() => {});
    }, 15000);

    return () => window.clearInterval(interval);
  }, [sosResult]);

  // Poll the backend for SOS alerts broadcast by other nearby users. Without a
  // real position there is nowhere meaningful to search, so skip instead of
  // querying a hard-coded city that would miss alerts everywhere else.
  useEffect(() => {
    const searchCenter = userLocation ?? lastKnownLocation;
    if (!searchCenter) {
      setNearbySosAlerts([]);
      return;
    }
    let active = true;
    const loadNearbyAlerts = async () => {
      try {
        const alerts = await fetchNearbySosAlerts(searchCenter, 25000);
        if (!active) return;
        setNearbySosAlerts(alerts.filter((alert) => alert.clientId !== clientId));
      } catch {
        // Offline mode: previously seen alerts remain until the next successful poll.
      }
    };
    void loadNearbyAlerts();
    const interval = window.setInterval(loadNearbyAlerts, 12000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [userLocation, lastKnownLocation, clientId]);

  // Continuously follow the device while safety monitoring is on, so entering a
  // reported road/area can be detected without the user tapping anything.
  useEffect(() => {
    if (!safetyMonitoring) {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      warnedReportIdsRef.current.clear();
      setUnsafeNearbyReports([]);
      return;
    }
    if (!navigator.geolocation) {
      setSafetyMonitoring(false);
      setNotice('This browser does not support location tracking.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation([position.coords.latitude, position.coords.longitude]);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setSafetyMonitoring(false);
          setNotice('Location permission was not granted. Safety alerts are off.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
    watchIdRef.current = watchId;

    return () => {
      navigator.geolocation?.clearWatch(watchId);
      watchIdRef.current = null;
    };
  }, [safetyMonitoring]);

  useEffect(() => {
    try { localStorage.setItem(SAFETY_MONITOR_KEY, String(safetyMonitoring)); } catch { /* Preference stays in memory. */ }
  }, [safetyMonitoring]);

  // Warn when the device enters the radius of a community report.
  useEffect(() => {
    if (!safetyMonitoring || !userLocation) return;

    const nearby = reports
      .filter((report) => enabledCategories[report.category])
      .map((report) => ({ report, distance: distanceMeters(userLocation, report.position) }))
      .filter((item) => item.distance <= UNSAFE_RADIUS_METERS)
      .sort((a, b) => a.distance - b.distance)
      .map((item) => item.report);

    const currentIds = new Set(nearby.map((report) => report.id));
    const newlyEntered = nearby.filter((report) => !warnedReportIdsRef.current.has(report.id));
    warnedReportIdsRef.current = currentIds;
    setUnsafeNearbyReports(nearby);

    // Reset a dismissed warning when the set of nearby reports changes.
    const signature = nearby.map((report) => report.id).sort().join('|');
    if (signature !== lastUnsafeSignatureRef.current) {
      lastUnsafeSignatureRef.current = signature;
      setUnsafeAlertDismissed(false);
    }

    if (newlyEntered.length > 0) {
      const closest = newlyEntered[0];
      const distance = distanceMeters(userLocation, closest.position);
      setNotice(
        `Unsafe area ahead: ${closest.category} reported ${formatDistance(distance)} from you.`,
      );
    }
  }, [safetyMonitoring, userLocation, reports, enabledCategories]);

  useEffect(() => saveReports(reports), [reports]);
  useEffect(() => saveSosRequests(sosRequests), [sosRequests]);
  useEffect(() => {
    try { localStorage.setItem('saferoute-theme', theme); } catch { /* Theme remains active for this session. */ }
  }, [theme]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 4300);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => () => {
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  }, [voiceUrl]);

  const visibleReports = useMemo(
    () => reports.filter((report) => enabledCategories[report.category]),
    [reports, enabledCategories],
  );
  const unsafeReportIds = useMemo(
    () => new Set(unsafeNearbyReports.map((report) => report.id)),
    [unsafeNearbyReports],
  );

  const knownSafePlacesCenter = safePlacesCenter ?? userLocation ?? lastKnownLocation;
  const safePlacesSearchCenter = knownSafePlacesCenter ?? DEFAULT_CENTER;
  const visibleSafePlaces = useMemo(() => {
    const sorted = [...safeLocations].sort(
      (a, b) => distanceMeters(safePlacesSearchCenter, a.position) - distanceMeters(safePlacesSearchCenter, b.position),
    );
    return filterSafePlaces(sorted, safePlacesFilter);
  }, [safeLocations, safePlacesFilter, safePlacesSearchCenter]);

  const filteredCount = Object.values(enabledCategories).filter(Boolean).length;
  const destinationReports = useMemo(() => {
    if (!selectedPlace) return [];
    return reports.filter((report) => distanceMeters(selectedPlace.position, report.position) <= 1000);
  }, [selectedPlace, reports]);

  const destinationSafeHavens = useMemo(() => {
    if (!selectedPlace) return [];
    return safeLocations.filter((haven) => distanceMeters(selectedPlace.position, haven.position) <= 2500);
  }, [selectedPlace, safeLocations]);

  function getCurrentLocation(
    onSuccess?: (point: LatLng) => void,
    onError?: (message: string) => void,
  ) {
    if (!navigator.geolocation) {
      setNotice('This browser does not support device location. Choose a point on the map instead.');
      return;
    }

    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: LatLng = [position.coords.latitude, position.coords.longitude];
        setUserLocation(point);
        setFlyTo(point);
        setLocationBusy(false);
        onSuccess?.(point);
        if (mapMode === 'route-origin') {
          if (routeDestination) {
            void requestRoute(point, routeDestination);
          } else {
            setRouteOrigin(point);
            setMapMode('route-destination');
            setNotice('GPS starting point selected. Now choose your destination.');
          }
        } else {
          setNotice('Your current location is ready.');
        }
      },
      (error) => {
        setLocationBusy(false);
        const message = error.code === error.PERMISSION_DENIED
          ? 'Location permission was not granted. You can choose a point on the map.'
          : 'Could not get your location. Try again or choose a point on the map.';
        setNotice(message);
        onError?.(message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
    );
  }

  async function loadSafePlacesAround(center: LatLng) {
    setSafePlacesCenter(center);
    setSafePlacesLocating(false);
    setSafePlacesLoading(true);
    setSafePlacesError('');
    setFlyTo(center);
    try {
      const places = await fetchBackendSafeLocations(center, 5000);
      setSafeLocations(places);
      if (!places.length) {
        setSafePlacesError('No verified safe places within 5 km. Use the map search link below.');
      }
    } catch {
      setSafeLocations([]);
      setSafePlacesError('Could not reach the safe-places service. Check your connection and try again.');
    } finally {
      setSafePlacesLoading(false);
    }
  }

  function findSafePlaces() {
    setSafePlacesOpen(true);
    setSafePlacesFilter('all');
    setShowSafeHavens(true);
    setPanel(null);
    setFilterOpen(false);
    setSafeLocations([]);

    const remembered = userLocationRef.current ?? lastKnownLocation;
    if (remembered) {
      void loadSafePlacesAround(remembered);
      return;
    }

    setSafePlacesCenter(null);
    setSafePlacesLoading(true);
    setSafePlacesLocating(true);
    setSafePlacesError('');
    getCurrentLocation(
      (point) => void loadSafePlacesAround(point),
      (message) => {
        setSafePlacesLoading(false);
        setSafePlacesLocating(false);
        setSafePlacesError(`${message} Allow location access or choose a point on the map first.`);
      },
    );
  }

  function toggleSafetyMonitoring() {
    const next = !safetyMonitoring;
    setSafetyMonitoring(next);
    if (!next) {
      setUnsafeAlertDismissed(false);
      setUnsafeDetailsOpen(false);
    }
    setNotice(
      next
        ? 'Live safety alerts on — we’ll warn you when you enter a reported unsafe area.'
        : 'Live safety alerts off.',
    );
  }

  function startReport() {
    setPanel(null);
    setFilterOpen(false);
    setMapMode('report');
    setNotice('Tap the map to place the incident marker.');
  }

  function startRoute() {
    setPanel(null);
    setFilterOpen(false);
    setRoutePreview(null);
    setRouteChoices([]);
    setRouteError('');
    setRouteDestination(selectedPlace?.position ?? null);
    if (selectedPlace) {
      if (userLocation) {
        void requestRoute(userLocation, selectedPlace.position);
      } else {
        setRouteOrigin(null);
        setMapMode('route-origin');
        setNotice('Choose your starting point on the map or use GPS.');
      }
    } else if (userLocation) {
      setRouteOrigin(userLocation);
      setRouteDestination(null);
      setMapMode('route-destination');
      setNotice('Tap the map or search for your destination.');
    } else {
      setRouteOrigin(null);
      setRouteDestination(null);
      setMapMode('route-origin');
      setNotice('Choose a starting point on the map, or use GPS.');
    }
  }

  async function requestRoute(start: LatLng, end: LatLng) {
    setRouteBusy(true);
    setRouteError('');
    setRoutePreview(null);
    setRouteChoices([]);
    try {
      let choices: RouteChoice[] = [];
      let isBackendScored = false;

      try {
        choices = await compareRoutesWithBackend(start, end, 'safety', reports);
        if (choices.some((c) => c.route)) {
          isBackendScored = true;
        }
      } catch (err) {
        console.warn('Backend route scoring unavailable, falling back to local provider:', err);
      }

      if (!choices.length || !choices.some((c) => c.route)) {
        const routes = await getDrivingRoutes(start, end);
        const scoredRoutes = scoreRoutesWithLocalReports(routes, reports);
        choices = buildRouteChoices(scoredRoutes);
      }

      setRouteChoices(choices);
      setSelectedRouteKind('shortest-safest');
      setRoutePreview(choices.find((choice) => choice.kind === 'shortest-safest')?.route ?? choices[0]?.route ?? null);
      setRouteOrigin(start);
      setRouteDestination(end);
      setMapMode('idle');
      setFlyTo(end);
      setSearchExpanded(false);
      setNotice(
        isBackendScored
          ? 'Route evaluated and ranked by SafeRoute Safety Engine.'
          : 'Route alternatives calculated using fallback routing.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not calculate the route.';
      setRouteError(message);
      setNotice(message);
    } finally {
      setRouteBusy(false);
    }
  }

  function handleMapPick(point: LatLng) {
    setFlyTo(point);
    if (mapMode === 'report') {
      setReportPoint(point);
      setReportCategory('Hazard');
      setReportDescription('');
      setReportPhoto(null);
      setPanel('report');
      setMapMode('idle');
      return;
    }

    if (mapMode === 'sos-location') {
      setSosPoint(point);
      setPanel('sos');
      setMapMode('idle');
      setNotice('SOS location selected from the map.');
      return;
    }

    if (mapMode === 'route-origin') {
      if (routeDestination) {
        void requestRoute(point, routeDestination);
      } else {
        setRouteOrigin(point);
        setMapMode('route-destination');
        setNotice('Starting point selected. Now choose your destination.');
      }
      return;
    }

    if (mapMode === 'route-destination') {
      if (!routeOrigin) {
        setRouteOrigin(point);
        setMapMode('route-destination');
        setNotice('Starting point selected. Now choose your destination.');
        return;
      }
      setRouteDestination(point);
      void requestRoute(routeOrigin, point);
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!searchText.trim()) return;
    setSearching(true);
    setSearchError('');
    setSearchResults([]);
    setSelectedPlace(null);
    setSearchMarker(null);
    try {
      const results = await searchPlaces(searchText);
      setSearchResults(results);
      if (!results.length) setSearchError('No matching places were found. Try a more specific search.');
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Place search failed.');
    } finally {
      setSearching(false);
    }
  }

  function choosePlace(place: PlaceResult) {
    setSearchText(place.name);
    setSelectedPlace(place);
    setSearchExpanded(false);
    setSearchResults([]);
    setSearchError('');
    setSearchMarker(place.position);
    setFlyTo(place.position);

    if (mapMode === 'route-origin') {
      setSelectedPlace(null);
      setRouteOrigin(place.position);
      setMapMode('route-destination');
      setNotice('Starting point selected. Search or tap the map for a destination.');
      return;
    }
    if (mapMode === 'route-destination' && routeOrigin) {
      setRouteDestination(place.position);
      void requestRoute(routeOrigin, place.position);
      return;
    }
    setNotice(`Showing ${place.name} on the map.`);
  }

  function routeToSelectedPlace() {
    if (!selectedPlace) return;
    setRouteDestination(selectedPlace.position);
    setRoutePreview(null);
    setRouteChoices([]);
    setRouteError('');
    if (userLocation) {
      void requestRoute(userLocation, selectedPlace.position);
    } else {
      setRouteOrigin(null);
      setMapMode('route-origin');
      setNotice('Choose your starting point on the map or use GPS.');
    }
  }

  function selectRouteChoice(choice: RouteChoice) {
    if (!choice.route) return;
    setSelectedRouteKind(choice.kind);
    setRoutePreview(choice.route);
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportPoint) {
      setNotice('Choose the incident location on the map first.');
      return;
    }
    let reportId = createId();
    let backendSuccess = false;
    let reportStatus: 'Pending review' | 'Approved' = 'Pending review';

    try {
      const res = await submitBackendReport({
        category: reportCategory,
        description: reportDescription.trim(),
        position: reportPoint,
      });
      backendSuccess = true;
      reportId = res.id;
      if (res.status === 'approved') reportStatus = 'Approved';
    } catch (err) {
      console.warn('Backend submission error, saved locally:', err);
    }

    const report: SafetyReport = {
      id: reportId,
      category: reportCategory,
      description: reportDescription.trim(),
      position: reportPoint,
      createdAt: new Date().toISOString(),
      status: reportStatus,
      attachmentName: reportPhoto?.name,
      isBackendSynced: backendSuccess,
    };
    setReports((current) => [report, ...current]);
    setPanel(null);
    setReportPhoto(null);
    setReportDescription('');
    setNotice(
      backendSuccess
        ? 'Report submitted to SafeRoute community database & safety engine.'
        : 'Report saved in local storage (offline mode).',
    );
  }

  function openSos() {
    setPanel('sos');
    setMapMode('idle');
    setSosPoint(userLocation);
    setSosReason('');
    setSosPhoto(null);
    setVoiceAttached(false);
    setVoiceUrl(null);
    setNotice('Getting your current location. You can also choose a point on the map.');
    getCurrentLocation((point) => setSosPoint(point));
  }

  function chooseSosLocationOnMap() {
    setPanel(null);
    setMapMode('sos-location');
    setNotice('Tap the map to choose the SOS location.');
  }

  /** First tap on the SOS dock button: ask for confirmation while GPS starts. */
  function openQuickSos() {
    setFilterOpen(false);
    setMapMode('idle');
    setSosResult(null);
    smsAutoOpenedRef.current = false;
    setSosConfirmPoint(userLocation);
    setPanel('sos-confirm');

    if (!navigator.geolocation) {
      setNotice('This browser has no GPS. Use "Add details" to choose a point on the map.');
      return;
    }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point: LatLng = [position.coords.latitude, position.coords.longitude];
        setUserLocation(point);
        setSosConfirmPoint(point);
        setLocationBusy(false);
      },
      () => {
        setLocationBusy(false);
        if (!userLocation) {
          setNotice('GPS was unavailable. Use "Add details" to choose the SOS location on the map.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
    );
  }

  /** Second tap: save the coordinate, broadcast the alert, build links, hand off the SMS. */
  async function dispatchSos(
    position: LatLng,
    reason: string,
    details: { voiceAttached?: boolean; pictureName?: string } = {},
  ) {
    setSosSending(true);

    // Keep the emergency coordinate on this device before any network call so
    // the last known position survives a reload, even if the backend is offline.
    saveLastLocation(position);

    let shareInfo: Awaited<ReturnType<typeof triggerBackendSos>> | undefined;
    try {
      shareInfo = await triggerBackendSos(position, reason, {
        radiusMeters: SOS_RADIUS_METERS,
        clientId,
      });
    } catch (err) {
      console.warn('Backend SOS broadcast failed:', err);
    }

    // buildTrackUrl() needs the RAW token. Passing the already-built
    // `/track/share_x` path produced the broken /track/%2Ftrack%2Fshare_x link.
    const shareToken = shareInfo?.shareToken;
    const sharePath = shareToken ? buildTrackPath(shareToken) : undefined;
    const shareUrl = shareToken ? buildTrackUrl(shareToken) : undefined;
    const googleMapsUrl = buildGoogleMapsUrl(position);
    const contactName = userPreferences?.emergencyContactName?.trim() || 'my emergency contact';
    const contactPhone = userPreferences?.emergencyContactPhone?.trim() || '';
    const message = [
      'SAFEROUTE EMERGENCY ALERT',
      reason.trim() ? `Situation: ${reason.trim()}` : null,
      `I triggered an SOS at ${new Date().toLocaleString()}.`,
      shareUrl ? `Track my live location: ${shareUrl}` : null,
      `Google Maps: ${googleMapsUrl}`,
      `Coordinates: ${position[0].toFixed(5)}, ${position[1].toFixed(5)}`,
    ].filter(Boolean).join('\n');
    const smsUrl = contactPhone ? buildSmsUrl(contactPhone, message) : undefined;

    const request: SosRequest = {
      id: createId(),
      position,
      createdAt: new Date().toISOString(),
      reason: reason.trim() || undefined,
      voiceAttached: details.voiceAttached ?? false,
      pictureName: details.pictureName,
      status: shareInfo?.alertId ? 'Emergency Active' : 'Saved locally — demo only',
      journeyId: shareInfo?.journeyId,
      shareToken,
      shareUrl: sharePath,
      alertId: shareInfo?.alertId,
    };
    setSosRequests((current) => [request, ...current]);
    if (sharePath) setLastSosShareUrl(sharePath);
    setSosResult({
      position,
      reason: reason.trim() || undefined,
      alertId: shareInfo?.alertId,
      journeyId: shareInfo?.journeyId,
      sharePath,
      shareUrl: shareUrl ?? googleMapsUrl,
      googleMapsUrl,
      smsUrl,
      contactName: contactPhone ? contactName : undefined,
      contactPhone: contactPhone || undefined,
      online: Boolean(shareInfo?.alertId),
    });
    setPanel('sos-result');
    setNotice(
      shareInfo?.alertId
        ? 'Emergency SOS shared with nearby SafeRoute users.'
        : 'SOS saved locally — the backend is offline.',
    );

    if (smsUrl && !smsAutoOpenedRef.current) {
      smsAutoOpenedRef.current = true;
      openSmsApp(smsUrl);
    }
    setSosSending(false);
  }

  async function confirmQuickSos() {
    const point = sosConfirmPoint ?? userLocation;
    if (point) {
      await dispatchSos(point, '');
      return;
    }
    try {
      const gps = await readGpsPoint();
      setUserLocation(gps);
      setSosConfirmPoint(gps);
      await dispatchSos(gps, '');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not read your GPS location.');
    }
  }

  async function resolveCurrentSos() {
    const alertId = sosResult?.alertId;
    const journeyId = sosResult?.journeyId;
    if (!alertId && !journeyId) {
      setNotice('This alert was only saved on this device.');
      return;
    }
    try {
      if (alertId) await resolveSosAlert(alertId, clientId);
      if (journeyId) await cancelJourney(journeyId);
      setSosRequests((current) => current.map((request) => (
        (alertId && request.alertId === alertId) || (journeyId && request.journeyId === journeyId)
          ? { ...request, status: 'Resolved' }
          : request
      )));
      if (alertId) {
        setNearbySosAlerts((current) => current.filter((alert) => alert.alertId !== alertId));
      }
      setSosResult(null);
      setNotice('SOS resolved. Location sharing has stopped.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not stop sharing this alert.');
    }
  }

  async function copyTrackingLink() {
    if (!sosResult?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(sosResult.shareUrl);
      setNotice('Tracking link copied to clipboard.');
    } catch {
      setNotice('Select the link in the box to copy it manually.');
    }
  }

  async function toggleVoiceRecording() {
    if (voiceRecording) {
      mediaRecorderRef.current?.stop();
      setVoiceRecording(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setNotice('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (audioBlob.size > 0) {
          if (voiceUrl) URL.revokeObjectURL(voiceUrl);
          setVoiceUrl(URL.createObjectURL(audioBlob));
          setVoiceAttached(true);
        }
        stream.getTracks().forEach((track) => track.stop());
        setVoiceRecording(false);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setVoiceRecording(true);
    } catch {
      setNotice('Microphone permission was not granted or recording could not start.');
    }
  }

  async function submitSos(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sosPoint) {
      setNotice('Choose GPS location or select a point on the map before sending SOS.');
      return;
    }
    if (voiceRecording) {
      mediaRecorderRef.current?.stop();
    }
    smsAutoOpenedRef.current = false;
    await dispatchSos(sosPoint, sosReason, {
      voiceAttached: voiceAttached || voiceRecording,
      pictureName: sosPhoto?.name,
    });
  }

  function clearRoute() {
    setRoutePreview(null);
    setRouteChoices([]);
    setRouteOrigin(null);
    setRouteDestination(null);
    setRouteError('');
    setMapMode('idle');
    setNotice('Route preview cleared.');
  }

  const emergencyContactName = userPreferences?.emergencyContactName?.trim() || 'my emergency contact';
  const emergencyContactPhone = userPreferences?.emergencyContactPhone?.trim();
  const unsafeCategorySummary = (() => {
    const categories = [...new Set(unsafeNearbyReports.map((report) => report.category))];
    const shown = categories.slice(0, 2).join(', ');
    return categories.length > 2 ? `${shown} +${categories.length - 2} more` : shown;
  })();
  const showUnsafeAlert = safetyMonitoring && unsafeNearbyReports.length > 0 && !unsafeAlertDismissed;

  const modeMessage = mapMode === 'report'
    ? 'Tap anywhere on the map to place the report marker'
    : mapMode === 'route-origin'
      ? 'Choose the starting point on the map'
      : mapMode === 'route-destination'
        ? 'Choose the destination on the map or use search'
        : mapMode === 'sos-location'
          ? 'Tap the map to set the SOS location'
          : '';

  return (
    <>
      {showOnboarding && (
        <Onboarding onComplete={handleAuthComplete} onSkip={handleSkipOnboarding} />
      )}
      {!showOnboarding && (
    <main className={`app-shell ${mapMode !== 'idle' ? 'map-picking' : ''} ${showUnsafeAlert ? 'unsafe-alert-visible' : ''}`} data-theme={theme}>
      <MapContainer
        className="map-canvas"
        center={userLocation ?? lastKnownLocation ?? DEFAULT_CENTER}
        zoom={6}
        minZoom={3}
        maxZoom={19}
        zoomControl={false}
        scrollWheelZoom
        attributionControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapInteraction mode={mapMode} onPick={handleMapPick} flyTo={flyTo} />
        <MapControls onLocate={() => getCurrentLocation()} />

        {showSafeHavens && safeLocations.map((loc) => (
          <CircleMarker
            key={loc.id}
            center={loc.position}
            radius={9}
            pathOptions={{ color: '#ffffff', weight: 2.5, fillColor: safePlaceColor(loc.category), fillOpacity: 0.95 }}
          >
            <Popup>
              <div className="map-popup">
                <div className="popup-kicker popup-safe">{safePlaceLabel(loc.category)}{loc.is24_7 ? ' · Open 24/7' : ''}</div>
                <strong>{loc.name}</strong>
                <p>{loc.description || `Verified ${safePlaceLabel(loc.category).toLowerCase()} nearby.`}</p>
                {loc.contactPhone && (
                  <p className="popup-haven-phone">
                    <Phone size={12} />
                    <a href={`tel:${loc.contactPhone}`}>{loc.contactPhone}</a>
                  </p>
                )}
                <small className="popup-coordinate">{formatCoordinate(loc.position)}</small>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {safetyMonitoring && unsafeNearbyReports.map((report) => (
          <Circle
            key={`unsafe-zone-${report.id}`}
            center={report.position}
            radius={UNSAFE_RADIUS_METERS}
            pathOptions={{ color: '#dc2626', weight: 1, fillColor: '#dc2626', fillOpacity: 0.12 }}
          />
        ))}

        {visibleReports.map((report) => (
          <CircleMarker
            key={report.id}
            center={report.position}
            radius={unsafeReportIds.has(report.id) ? 11 : 8}
            pathOptions={{
              color: '#ffffff',
              weight: unsafeReportIds.has(report.id) ? 3 : 2.5,
              fillColor: REPORT_COLORS[report.category],
              fillOpacity: 0.96,
              className: unsafeReportIds.has(report.id) ? 'unsafe-report-marker' : undefined,
            }}
          >
            <Popup>
              <div className="map-popup">
                <div className={`popup-kicker ${unsafeReportIds.has(report.id) ? 'popup-danger' : ''}`}>
                  {unsafeReportIds.has(report.id)
                    ? 'Unsafe area · You are nearby'
                    : report.isBackendSynced
                      ? 'Shared community report'
                      : 'On this device only · Pending sync'}
                </div>
                <strong>{report.category}</strong>
                <p>{report.description || 'No additional description was provided.'}</p>
                <small>{formatDate(report.createdAt)}</small>
                <small className="popup-coordinate">{formatCoordinate(report.position)}</small>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {showSosMarkers && sosRequests.map((request) => (
          <CircleMarker
            key={request.id}
            center={request.position}
            radius={10}
            pathOptions={{ color: '#ffffff', weight: 2.5, fillColor: '#e13e60', fillOpacity: 1 }}
          >
            <Popup>
              <div className="map-popup">
                <div className="popup-kicker popup-danger">
                  {request.status === 'Resolved' ? 'Resolved SOS' : 'Your SOS alert'}
                </div>
                <strong>Emergency request</strong>
                <p>{request.reason || 'No reason was added.'}</p>
                <small>{formatDate(request.createdAt)}</small>
                <small className="popup-coordinate">
                  {request.alertId
                    ? 'Location shared with nearby SafeRoute users.'
                    : 'Saved on this device (offline demo).'}
                </small>
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {showSosMarkers && nearbySosAlerts.map((alert) => {
          const trackingUrl = alert.shareUrl
            ? resolveAppUrl(alert.shareUrl)
            : alert.shareToken
              ? buildTrackUrl(alert.shareToken)
              : null;
          return (
            <CircleMarker
              key={alert.alertId}
              center={alert.position}
              radius={12}
              pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#dc2626', fillOpacity: 0.92, className: 'sos-alert-marker' }}
            >
              <Popup>
                <div className="map-popup">
                  <div className="popup-kicker popup-danger">Emergency nearby · Live SOS</div>
                  <strong>Someone needs help</strong>
                  <p>{alert.reason || 'An emergency SOS was triggered at this location.'}</p>
                  <small>{formatDate(alert.createdAt)} · {formatDistance(alert.distanceMeters)} away</small>
                  <small className="popup-coordinate">{formatCoordinate(alert.position)}</small>
                  {trackingUrl && (
                    <p className="popup-haven-phone">
                      <a href={trackingUrl} target="_blank" rel="noreferrer">Open live location →</a>
                    </p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {userLocation && (
          <>
            <CircleMarker center={userLocation} radius={13} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#4189ed', fillOpacity: 0.2 }} />
            <CircleMarker center={userLocation} radius={6} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2877e8', fillOpacity: 1 }}>
              <Popup><div className="map-popup"><strong>Your current location</strong><small>{formatCoordinate(userLocation)}</small></div></Popup>
            </CircleMarker>
          </>
        )}

        {searchMarker && !routePreview && (
          <CircleMarker center={searchMarker} radius={8} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#db4f91', fillOpacity: 1 }}>
            <Popup><div className="map-popup"><strong>Selected place</strong><small>{formatCoordinate(searchMarker)}</small></div></Popup>
          </CircleMarker>
        )}

        {routeOrigin && routeDestination && (
          <>
            <CircleMarker center={routeOrigin} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#1d9b75', fillOpacity: 1 }} />
            <CircleMarker center={routeDestination} radius={7} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#db4f91', fillOpacity: 1 }} />
          </>
        )}
        {routeChoices
          .filter((choice) => choice.route && choice.kind !== selectedRouteKind)
          .map((choice) => (
            <Polyline
              key={`alt-${choice.kind}`}
              positions={choice.route!.coordinates}
              pathOptions={{
                color: '#64748b',
                weight: 5,
                opacity: 0.55,
                dashArray: '8, 8',
                lineCap: 'round',
                lineJoin: 'round',
              }}
              eventHandlers={{
                click: () => selectRouteChoice(choice),
              }}
            />
          ))}
        {routePreview && (
          <Polyline
            positions={routePreview.coordinates}
            pathOptions={{
              color: THEMES.find((item) => item.id === theme)?.color ?? '#d94f91',
              weight: 6,
              opacity: 0.92,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}
      </MapContainer>

      <header className={`top-layer ${searchExpanded ? 'search-is-expanded' : ''}`}>
        <a className="brand-chip" href="#home" aria-label="SafeRoute home" onClick={(event) => event.preventDefault()}>
          <span className="brand-icon"><ShieldCheck size={20} strokeWidth={2.4} /></span>
          <span className="brand-copy"><strong>SafeRoute</strong><small>Community safety map</small></span>
        </a>

        <div className={`search-wrap ${searchExpanded ? 'search-expanded' : ''}`}>
          <form className="map-search" onSubmit={submitSearch} role="search">
            <Search size={18} className="search-icon" />
            <input
              aria-label="Search for a place or destination"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onFocus={() => setSearchExpanded(true)}
              onKeyDown={(event) => { if (event.key === 'Escape') setSearchExpanded(false); }}
              placeholder="Search an event venue, place or address"
            />
            {searchText && (
              <button className="search-clear" type="button" aria-label="Clear search" onClick={() => {
                setSearchText('');
                setSearchResults([]);
                setSearchError('');
                setSelectedPlace(null);
                setSearchMarker(null);
              }}>
                <X size={15} />
              </button>
            )}
            <button className="search-submit" type="submit" disabled={searching} aria-label="Search">
              {searching ? <span className="spinner" /> : <ArrowRight size={17} />}
            </button>
          </form>
          {(searchExpanded || searchResults.length > 0 || searchError) && (
            <div className="search-results">
              {searchExpanded && <div className="search-guide"><strong>Check a destination</strong><span>Search the venue or address where an event is held, or find a hotel, restaurant, or public place. Event titles appear only when they match a mapped place.</span><button type="button" onClick={() => setSearchExpanded(false)} aria-label="Close search panel"><X size={15} /></button></div>}
              {searchResults.map((place) => (
                <button className="search-result" key={place.id} type="button" onClick={() => choosePlace(place)}>
                  <span className="result-icon"><MapPin size={17} /></span>
                  <span className="result-copy"><strong>{place.name}</strong><small>{place.label}</small></span>
                  <ArrowRight size={15} className="result-arrow" />
                </button>
              ))}
              {searchError && <p className="search-error">{searchError}</p>}
              {(searchResults.length > 0 || searchError) && <div className="search-provider">Place search by Photon · OpenStreetMap data</div>}
            </div>
          )}
        </div>

        <div className="top-right-group">
          <div className="top-status">
            <span className={`status-dot ${backendOnline === true ? 'online' : backendOnline === false ? 'offline' : ''}`} />
            <span>{backendOnline === true ? 'Engine Connected' : backendOnline === false ? 'Local Mode' : 'Connecting…'}</span>
          </div>

          {currentUser ? (
            <div className="user-profile-chip" title={`Signed in as ${currentUser.email}`}>
              <span className="user-avatar-icon"><User size={13} /></span>
              <span className="user-name">{currentUser.full_name || currentUser.email.split('@')[0]}</span>
              <button
                type="button"
                className="user-signout-btn"
                onClick={handleSignOut}
                title="Sign out of SafeRoute"
                aria-label="Sign out"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="user-signin-btn"
              onClick={() => setShowOnboarding(true)}
              title="Sign in or create account"
            >
              <LogIn size={13} />
              <span>Sign in / Join</span>
            </button>
          )}
        </div>
      </header>

      <div className="map-side-tools">
        <button
          className={`floating-tool safe-places-tool ${safePlacesOpen ? 'tool-active' : ''}`}
          type="button"
          title="Find safe places nearby"
          aria-label="Find safe places nearby"
          onClick={() => void findSafePlaces()}
        >
          <ShieldCheck size={18} />
          <span className="tool-label">Safe places</span>
        </button>
        <button
          className={`floating-tool safety-tool ${safetyMonitoring ? 'safety-tool-active' : ''}`}
          type="button"
          title={safetyMonitoring ? 'Turn off live safety alerts' : 'Turn on live safety alerts'}
          aria-label={safetyMonitoring ? 'Turn off live safety alerts' : 'Turn on live safety alerts'}
          aria-pressed={safetyMonitoring}
          onClick={toggleSafetyMonitoring}
        >
          <Shield size={18} />
          <span className="tool-label">Safety alerts</span>
          <span className={`safety-tool-dot ${safetyMonitoring ? 'on' : ''}`} />
        </button>
        <button className={`floating-tool ${themeOpen ? 'tool-active' : ''}`} type="button" title="Change theme" aria-label="Change theme" onClick={() => { setThemeOpen((open) => !open); setFilterOpen(false); }}>
          <Palette size={18} /><span className="tool-label">Theme</span>
        </button>
        {themeOpen && (
          <section className="theme-panel" aria-label="Choose app theme">
            <div className="panel-heading"><strong>Choose a theme</strong><button type="button" aria-label="Close themes" onClick={() => setThemeOpen(false)}><X size={16} /></button></div>
            {THEMES.map((item) => (
              <button className={`theme-option ${theme === item.id ? 'theme-option-active' : ''}`} key={item.id} type="button" onClick={() => { setTheme(item.id); setThemeOpen(false); }}>
                <span className="theme-swatch" style={{ background: item.color }} />
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
                {theme === item.id && <Check size={15} />}
              </button>
            ))}
          </section>
        )}
        <button
          className={`floating-tool ${filterOpen ? 'tool-active' : ''}`}
          type="button"
          title="Filter map markers"
          aria-label="Filter map markers"
          onClick={() => setFilterOpen((open) => !open)}
        >
          <Filter size={19} />
          <span className="tool-label">Filters</span>
          <span className="filter-count">{filteredCount}</span>
        </button>
        {filterOpen && (
          <section className="filter-panel" aria-label="Map filters">
            <div className="panel-heading"><strong>Map filters</strong><button type="button" aria-label="Close filters" onClick={() => setFilterOpen(false)}><X size={16} /></button></div>
            <p>Show report markers</p>
            {REPORT_CATEGORIES.map((category) => (
              <label className="filter-option" key={category}>
                <span className="filter-color" style={{ backgroundColor: REPORT_COLORS[category] }} />
                <span>{category}</span>
                <input
                  type="checkbox"
                  checked={enabledCategories[category]}
                  onChange={(event) => setEnabledCategories((current) => ({ ...current, [category]: event.target.checked }))}
                />
              </label>
            ))}
            <div className="filter-divider" />
            <label className="filter-option">
              <span className="filter-color haven-filter-dot" />
              <span>Safe Havens ({safeLocations.length})</span>
              <input type="checkbox" checked={showSafeHavens} onChange={(event) => setShowSafeHavens(event.target.checked)} />
            </label>
            <label className="filter-option">
              <span className="filter-color sos-filter-dot" />
              <span>SOS markers</span>
              <input type="checkbox" checked={showSosMarkers} onChange={(event) => setShowSosMarkers(event.target.checked)} />
            </label>
            <button className="filter-reset" type="button" onClick={() => {
              setEnabledCategories(Object.fromEntries(REPORT_CATEGORIES.map((category) => [category, true])) as Record<ReportCategory, boolean>);
              setShowSosMarkers(true);
              setShowSafeHavens(true);
            }}>Show everything</button>
          </section>
        )}
      </div>

      {safePlacesOpen && (
        <section className="safe-places-panel">
          <div className="safe-places-head">
            <span className="panel-icon haven-icon"><ShieldCheck size={18} /></span>
            <div>
              <strong>Safe places nearby</strong>
              <small>
                {knownSafePlacesCenter
                  ? `within 5 km of ${formatCoordinate(knownSafePlacesCenter)}`
                  : 'waiting for your location…'}
              </small>
            </div>
            <button
              className="safe-places-refresh"
              type="button"
              title="Use my current location"
              aria-label="Use my current location"
              onClick={() => getCurrentLocation((point) => void loadSafePlacesAround(point))}
            >
              <LocateFixed size={15} />
            </button>
            <button className="close-panel" type="button" aria-label="Close safe places" onClick={() => setSafePlacesOpen(false)}><X size={16} /></button>
          </div>

          <div className="safe-place-filters">
            {SAFE_PLACE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={safePlacesFilter === filter.id ? 'safe-place-filter-active' : ''}
                onClick={() => setSafePlacesFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {safePlacesLoading ? (
            <p className="safe-places-status">
              <span className="spinner" />
              {safePlacesLocating ? 'Getting your location…' : 'Finding safe places…'}
            </p>
          ) : (
            <>
              {safePlacesError && <p className="safe-places-error"><AlertTriangle size={13} /> {safePlacesError}</p>}
              <div className="safe-place-list">
                {visibleSafePlaces.map((place) => {
                  const Icon = safePlaceIcon(place.category);
                  const color = safePlaceColor(place.category);
                  return (
                    <div className="safe-place-item" key={place.id}>
                      <span className="safe-place-icon" style={{ color, backgroundColor: `${color}1f` }}><Icon size={16} /></span>
                      <div className="safe-place-copy">
                        <strong>{place.name}</strong>
                        <small>
                          {safePlaceLabel(place.category)}
                          {place.is24_7 ? ' · Open 24/7' : ''}
                          {' · '}{formatDistance(distanceMeters(safePlacesSearchCenter, place.position))} away
                        </small>
                        {place.description && <p>{place.description}</p>}
                        <div className="safe-place-actions">
                          <button type="button" onClick={() => setFlyTo(place.position)}><MapPin size={12} /> Show on map</button>
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${place.position[0]},${place.position[1]}`} target="_blank" rel="noreferrer"><Navigation size={12} /> Directions</a>
                          {place.contactPhone && <a href={`tel:${place.contactPhone}`}><Phone size={12} /> Call</a>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!visibleSafePlaces.length && !safePlacesError && (
                  <p className="safe-places-status">No places in this category nearby.</p>
                )}
              </div>
              {knownSafePlacesCenter && (
                <a
                  className="safe-places-fallback"
                  href={`https://www.google.com/maps/search/church+cafe+hospital/@${knownSafePlacesCenter[0]},${knownSafePlacesCenter[1]},14z`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Search more places on Google Maps →
                </a>
              )}
            </>
          )}
        </section>
      )}

      {modeMessage && (
        <div className="map-mode-banner">
          <Crosshair size={17} />
          <span>{modeMessage}</span>
          <button type="button" onClick={() => setMapMode('idle')}>Cancel</button>
        </div>
      )}

      {showUnsafeAlert && (
        <div className="unsafe-area-alert" role="alert">
          <span className="unsafe-alert-icon"><ShieldAlert size={20} /></span>
          <div className="unsafe-alert-copy">
            <strong>You may not be in a safe place</strong>
            <span>
              {unsafeNearbyReports.length} community report{unsafeNearbyReports.length === 1 ? '' : 's'} within{' '}
              {formatDistance(UNSAFE_RADIUS_METERS)} · {unsafeCategorySummary}
            </span>
          </div>
          <div className="unsafe-alert-actions">
            <button type="button" onClick={() => setUnsafeDetailsOpen((open) => !open)}>
              {unsafeDetailsOpen ? 'Hide details' : 'Details'}
            </button>
            <button type="button" onClick={() => setFlyTo(unsafeNearbyReports[0].position)}>
              <Crosshair size={13} /> Show on map
            </button>
            <button
              type="button"
              className="unsafe-alert-close"
              aria-label="Dismiss unsafe-area warning"
              onClick={() => { setUnsafeAlertDismissed(true); setUnsafeDetailsOpen(false); }}
            >
              <X size={15} />
            </button>
          </div>
          {unsafeDetailsOpen && (
            <div className="unsafe-alert-details">
              {unsafeNearbyReports.map((report) => (
                <div key={report.id}>
                  <i style={{ background: REPORT_COLORS[report.category] }} />
                  <span>
                    <strong>{report.category}</strong>
                    <small>{report.description || 'No description was provided.'}</small>
                  </span>
                  <small>
                    {userLocation ? formatDistance(distanceMeters(userLocation, report.position)) : 'Nearby'}
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {routeBusy && (
        <div className="route-progress"><span className="spinner" /> Calculating a route preview…</div>
      )}

      {selectedPlace && !routePreview && !routeBusy && (
        <section className="destination-card" aria-label="Destination safety overview">
          <div className="destination-card-heading"><span className="route-summary-icon"><ShieldCheck size={17} /></span><div><strong>Destination overview</strong><small>{selectedPlace.name}</small></div><button type="button" aria-label="Close destination overview" onClick={() => setSelectedPlace(null)}><X size={16} /></button></div>
          <p className="destination-address">{selectedPlace.label}</p>
          <div className="destination-report-count"><strong>{destinationReports.length}</strong><span>community report{destinationReports.length === 1 ? '' : 's'} within 1 km</span></div>
          {destinationSafeHavens.length > 0 && (
            <div className="destination-report-count" style={{ marginTop: '6px' }}>
              <strong style={{ color: '#059669' }}>{destinationSafeHavens.length}</strong>
              <span>verified safe haven{destinationSafeHavens.length === 1 ? '' : 's'} within 2.5 km</span>
            </div>
          )}
          {destinationReports.length ? (
            <div className="destination-report-list">
              {REPORT_CATEGORIES.filter((category) => destinationReports.some((report) => report.category === category)).slice(0, 4).map((category) => (
                <span key={category}><i style={{ background: REPORT_COLORS[category] }} />{category} · {destinationReports.filter((report) => report.category === category).length}</span>
              ))}
            </div>
          ) : <p className="destination-no-reports">No reports were found around this destination yet.</p>}
          <p className="destination-caveat">Reports are shared when the backend is online, but remain community reports and are not verified. No reports does not mean a place is safe.</p>
          <button className="destination-route-button" type="button" onClick={routeToSelectedPlace}><RouteIcon size={15} /> Plan a route here</button>
        </section>
      )}

      {routeChoices.length > 0 && (
        <section className="route-summary route-options-panel" aria-label="Route options and directions">
          <div className="route-summary-top"><span className="route-summary-icon"><RouteIcon size={17} /></span><div><strong>Compare route options</strong><small>{routeChoices.filter((choice) => choice.route).length} alternative route(s) returned</small></div><button type="button" aria-label="Close routes" onClick={clearRoute}><X size={17} /></button></div>
          <div className="route-choice-list">
            {routeChoices.map((choice) => (
              <button key={choice.kind} type="button" disabled={!choice.route} className={`route-choice ${selectedRouteKind === choice.kind && routePreview ? 'route-choice-active' : ''} ${choice.route && choice.route.nearbyReportCount > 0 ? 'route-choice-reported' : ''}`} onClick={() => selectRouteChoice(choice)}>
                <span className="route-choice-copy">
                  <strong>{choice.title} {choice.route && choice.route.nearbyReportCount > 0 && <span className="route-reported-tag"><AlertTriangle size={11} /> Reported zone</span>}</strong>
                  <small>{choice.route ? choice.subtitle : choice.kind === 'shortest-higher-risk' ? 'No route with higher reported exposure was identified.' : 'The routing service did not return another distinct low-exposure path.'}</small>
                </span>
                {choice.route ? <span className="route-choice-metric"><strong>{formatDistance(choice.route.distanceMeters)}</strong><small>{formatDuration(choice.route.durationSeconds)}</small><small>{choice.route.nearbyReportCount} report{choice.route.nearbyReportCount === 1 ? '' : 's'} on path</small></span> : <span className="route-unavailable">Unavailable</span>}
              </button>
            ))}
          </div>
          {routePreview && (
            <>
              <div className="route-detail-heading">
                <strong>{routePreview.summary || 'Directions'}</strong>
                <span>{formatDistance(routePreview.distanceMeters)} · {formatDuration(routePreview.durationSeconds)}</span>
              </div>
              {routePreview.safetyIndicator && (
                <div style={{ margin: '6px 0 10px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={`route-safety-badge ${routePreview.safetyIndicator.risk_level}`}>
                    Risk: {routePreview.safetyIndicator.risk_level.toUpperCase()} ({routePreview.safetyIndicator.overall_risk_score.toFixed(1)}/100)
                  </span>
                  {routePreview.safetyIndicator.safe_haven_count > 0 && (
                    <span className="route-safety-badge low">
                      <Shield size={12} /> {routePreview.safetyIndicator.safe_haven_count} safe haven(s) on route
                    </span>
                  )}
                </div>
              )}
              {routePreview.safetyIndicator?.observations && routePreview.safetyIndicator.observations.length > 0 && (
                <div className="route-observations">
                  <strong>Safety Engine Observations:</strong>
                  <ul>
                    {routePreview.safetyIndicator.observations.map((obs, idx) => (
                      <li key={idx}>{obs}</li>
                    ))}
                  </ul>
                </div>
              )}
              <ol className="direction-list">
                {routePreview.steps.length ? routePreview.steps.map((step) => (
                  <li key={step.id}><span className="direction-step-icon"><RouteIcon size={13} /></span><span className="direction-step-copy"><strong>{step.instruction}</strong><small>{formatDistance(step.distanceMeters)} · {formatDuration(step.durationSeconds)}</small></span></li>
                )) : <li><span className="direction-step-copy"><strong>Turn-by-turn steps were not provided.</strong><small>Use the route preview as a map reference only.</small></span></li>}
              </ol>
              {routePreview.nearbyReportCount > 0 && (
                <div className="route-reported-warning">
                  <AlertTriangle size={15} />
                  <span>
                    This route passes <strong>{routePreview.nearbyReportCount} reported unsafe zone{routePreview.nearbyReportCount === 1 ? '' : 's'}</strong> (within 250 m). Choose a route marked “avoids reports” when one is available.
                  </span>
                </div>
              )}
              <div className="route-risk-note">
                <AlertTriangle size={14} />
                <span>
                  {routePreview.nearbyReportCount > 0
                    ? 'Risk is raised to HIGH because reports are on this path, regardless of other safety factors.'
                    : routePreview.isBackendRanked
                      ? `Scored by SafeRoute engine against community reports, safe havens, and day/night lighting models.`
                      : 'No community reports were detected within 250 m of this route.'}
                </span>
              </div>
            </>
          )}
        </section>
      )}
      {routeError && !routeBusy && <div className="route-error"><AlertCircle size={15} />{routeError}<button type="button" onClick={() => setRouteError('')} aria-label="Dismiss"><X size={14} /></button></div>}

      <div className="bottom-layer">
        <div className="map-legend"><span><i className="legend-dot report-dot" /> Community reports</span><span><i className="legend-dot user-dot" /> Your location</span></div>
        <nav className="action-dock" aria-label="Map actions">
          <button className={`dock-action ${mapMode.startsWith('route') ? 'dock-selected' : ''}`} type="button" onClick={startRoute}>
            <span className="dock-icon"><RouteIcon size={19} /></span>
            <span>Route</span>
          </button>
          <span className="dock-separator" />
          <button className={`dock-action ${mapMode === 'report' ? 'dock-selected' : ''}`} type="button" onClick={startReport}>
            <span className="dock-icon"><MapPinned size={19} /></span>
            <span>Report</span>
          </button>
          <span className="dock-separator" />
          <button className="dock-action dock-sos" type="button" onClick={openQuickSos}>
            <span className="dock-icon"><ShieldAlert size={19} /></span>
            <span>SOS</span>
          </button>
        </nav>
      </div>

      {panel === 'sos-confirm' && (
        <div className="panel-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget && !sosSending) setPanel(null); }}>
          <section className="action-panel sos-panel sos-confirm-panel" aria-labelledby="sos-confirm-title">
            <div className="action-panel-heading">
              <span className="panel-icon sos-icon"><ShieldAlert size={20} /></span>
              <div><strong id="sos-confirm-title">Send emergency SOS?</strong><small>Confirm and help is alerted immediately</small></div>
              <button className="close-panel" type="button" aria-label="Cancel SOS" onClick={() => setPanel(null)}><X size={18} /></button>
            </div>

            <div className={`location-summary ${sosConfirmPoint ? 'location-ready' : 'location-missing'}`}>
              <LocateFixed size={17} />
              <div>
                <strong>{sosConfirmPoint ? 'Your GPS location is ready' : locationBusy ? 'Getting your GPS location…' : 'Location unavailable'}</strong>
                <small>{formatCoordinate(sosConfirmPoint)}</small>
              </div>
              <span className="location-status">
                {locationBusy && !sosConfirmPoint ? <span className="spinner" /> : sosConfirmPoint ? <Check size={16} /> : <AlertTriangle size={16} />}
              </span>
            </div>

            <div className="sos-action-list">
              <div className="sos-action-item">
                <Navigation size={16} />
                <span>
                  <strong>Share my live location</strong>
                  <small>Nearby SafeRoute users within {formatDistance(SOS_RADIUS_METERS)} will see an active SOS alert on their map for 3 hours.</small>
                </span>
              </div>
              <div className="sos-action-item">
                <MessageCircle size={16} />
                <span>
                  <strong>{emergencyContactPhone ? `Open SMS to ${emergencyContactName}` : 'No emergency contact saved'}</strong>
                  <small>
                    {emergencyContactPhone
                      ? `${emergencyContactPhone} — a ready-to-send message will open in your SMS app.`
                      : 'You can still send the SOS; add a contact later in onboarding.'}
                  </small>
                </span>
              </div>
            </div>

            <p className="sos-demo-warning"><AlertTriangle size={15} /><span>Only confirm if you are in danger. A false alert can put responders and neighbours at risk.</span></p>

            <button
              className="sos-submit-button"
              type="button"
              disabled={!sosConfirmPoint || sosSending}
              onClick={() => void confirmQuickSos()}
            >
              {sosSending ? <span className="spinner" /> : <ShieldAlert size={17} />}
              {sosSending ? 'Sending emergency alert…' : 'Yes, send SOS now'}
            </button>
            <button className="secondary-button sos-details-link" type="button" disabled={sosSending} onClick={openSos}>
              Add a reason, voice note or picture instead
            </button>
          </section>
        </div>
      )}

      {panel === 'sos-result' && sosResult && (
        <div className="panel-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
          <section className="action-panel sos-panel sos-result-panel" aria-labelledby="sos-result-title">
            <div className="action-panel-heading">
              <span className="panel-icon result-icon"><Check size={20} /></span>
              <div><strong id="sos-result-title">Emergency alert sent</strong><small>{sosResult.online ? 'Nearby users can see your SOS' : 'Saved locally — backend offline'}</small></div>
              <button className="close-panel" type="button" aria-label="Close SOS result" onClick={() => setPanel(null)}><X size={18} /></button>
            </div>

            {sosResult.reason && <p className="sos-result-reason">“{sosResult.reason}”</p>}

            <div className="sos-result-checklist">
              <div><span className="result-check"><Check size={13} /></span><span>Location shared with SafeRoute users nearby</span></div>
              <div><span className="result-check"><Check size={13} /></span><span>{sosResult.smsUrl ? `SMS opened for ${sosResult.contactName}` : 'No emergency contact number was saved'}</span></div>
              {sosResult.shareUrl && <div><span className="result-check"><Check size={13} /></span><span>Live tracking link created</span></div>}
            </div>

            {sosResult.shareUrl && (
              <div className="share-link-banner">
                <strong>{sosResult.sharePath ? 'Live tracking link' : 'Location link'}</strong>
                <a href={sosResult.shareUrl} target="_blank" rel="noreferrer">{sosResult.shareUrl}</a>
                <button className="secondary-button" type="button" onClick={() => void copyTrackingLink()}><Copy size={14} /> Copy link</button>
              </div>
            )}

            <div className="share-link-banner">
              <strong>Google Maps link</strong>
              <a href={sosResult.googleMapsUrl} target="_blank" rel="noreferrer">{sosResult.googleMapsUrl}</a>
              <small>Opens Google Maps at the saved coordinate. The live tracking link above keeps updating while sharing is active.</small>
            </div>

            {sosResult.smsUrl && (
              <a className="sos-sms-direct-btn sos-result-sms-btn" href={sosResult.smsUrl}>
                <MessageCircle size={14} />
                <span>Open SMS app again</span>
              </a>
            )}

            <p className="sos-result-note">
              In your SMS app, press <strong>Send</strong> to notify {sosResult.contactName || 'your emergency contact'}. They can open the live tracking link or the Google Maps link from the message.
            </p>

            {sosResult.alertId && (
              <button className="secondary-button resolve-sos-btn" type="button" onClick={() => void resolveCurrentSos()}>
                <Check size={14} /> I'm safe — stop sharing my location
              </button>
            )}
            <button className="primary-button" type="button" onClick={() => setPanel(null)}>Done</button>
          </section>
        </div>
      )}

      {panel === 'report' && (
        <div className="panel-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
          <section className="action-panel" aria-labelledby="report-title">
            <div className="action-panel-heading">
              <span className="panel-icon pink-icon"><MapPinned size={20} /></span>
              <div><strong id="report-title">Report an incident</strong><small>Pin it on the map and add details</small></div>
              <button className="close-panel" type="button" aria-label="Close report panel" onClick={() => setPanel(null)}><X size={18} /></button>
            </div>
            <form onSubmit={submitReport} className="panel-form">
              <div className="location-summary"><MapPin size={16} /><div><strong>Incident location</strong><small>{formatCoordinate(reportPoint)}</small></div><button type="button" onClick={() => { setPanel(null); setMapMode('report'); setNotice('Tap the map to move the incident marker.'); }}>Change</button></div>
              <label className="field-label" htmlFor="report-category">Incident category</label>
              <div className="select-wrap"><select id="report-category" value={reportCategory} onChange={(event) => setReportCategory(event.target.value as ReportCategory)}>{REPORT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={16} /></div>
              <label className="field-label" htmlFor="report-description">Description <span>Optional</span></label>
              <textarea id="report-description" rows={3} maxLength={500} value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} placeholder="Share useful details about what happened…" />
              <label className="field-label" htmlFor="report-photo">Photo <span>Optional</span></label>
              <label className="upload-field" htmlFor="report-photo"><ImagePlus size={18} /><span>{reportPhoto ? reportPhoto.name : 'Add a photo'}</span><input id="report-photo" type="file" accept="image/*" onChange={(event) => setReportPhoto(event.target.files?.[0] ?? null)} /></label>
              <p className="panel-note"><AlertCircle size={14} /> Reports are submitted to the SafeRoute community engine and evaluated dynamically.</p>
              <button className="primary-button" type="submit"><Send size={16} /> Submit report</button>
            </form>
          </section>
        </div>
      )}

      {panel === 'sos' && (
        <div className="panel-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
          <section className="action-panel sos-panel" aria-labelledby="sos-title">
            <div className="action-panel-heading">
              <span className="panel-icon sos-icon"><ShieldAlert size={20} /></span>
              <div><strong id="sos-title">SOS emergency request</strong><small>Location is required; details are optional</small></div>
              <button className="close-panel" type="button" aria-label="Close SOS panel" onClick={() => setPanel(null)}><X size={18} /></button>
            </div>
            <form onSubmit={submitSos} className="panel-form">
              <div className={`location-summary ${sosPoint ? 'location-ready' : 'location-missing'}`}>
                <LocateFixed size={17} />
                <div><strong>{sosPoint ? 'Location selected' : 'Location needed'}</strong><small>{formatCoordinate(sosPoint)}</small></div>
                <span className="location-status">{sosPoint ? <Check size={16} /> : <AlertTriangle size={16} />}</span>
              </div>
              <div className="location-choice-row">
                <button className="secondary-button" type="button" disabled={locationBusy} onClick={() => getCurrentLocation((point) => setSosPoint(point))}><LocateFixed size={15} /> {locationBusy ? 'Getting GPS…' : 'Use my GPS'}</button>
                <button className="secondary-button" type="button" onClick={chooseSosLocationOnMap}><MapPin size={15} /> Choose on map</button>
              </div>
              <button className="safe-places-inline" type="button" onClick={() => void findSafePlaces()}>
                <ShieldCheck size={15} /> Not an emergency? Find a safe place nearby
              </button>
              <label className="field-label" htmlFor="sos-reason">What is happening? <span>Optional</span></label>
              <textarea id="sos-reason" rows={3} maxLength={500} value={sosReason} onChange={(event) => setSosReason(event.target.value)} placeholder="Add a short message if you can…" />
              <div className="optional-tools">
                <div className="optional-tool-heading">Optional details</div>
                <button className={`secondary-button ${voiceRecording ? 'recording-button' : ''}`} type="button" onClick={() => void toggleVoiceRecording()}>
                  {voiceRecording ? <Square size={15} /> : <Mic size={15} />}
                  {voiceRecording ? 'Stop recording' : voiceAttached ? 'Voice attached' : 'Add voice'}
                </button>
                <label className="secondary-button upload-compact" htmlFor="sos-photo"><ImagePlus size={15} />{sosPhoto ? 'Picture attached' : 'Add picture'}<input id="sos-photo" type="file" accept="image/*" onChange={(event) => setSosPhoto(event.target.files?.[0] ?? null)} /></label>
              </div>
              {voiceRecording && <p className="recording-hint"><span className="recording-pulse" /> Recording voice note. Press stop when finished.</p>}
              {voiceUrl && <audio className="voice-preview" controls src={voiceUrl}>Audio preview</audio>}
              {sosPhoto && <p className="attachment-name">Picture selected: {sosPhoto.name}</p>}
              {userPreferences?.emergencyContactName && (
                <div className="sos-trusted-contact-info">
                  <Phone size={13} />
                  <span>
                    Emergency contact: <strong>{userPreferences.emergencyContactName}</strong>{' '}
                    {userPreferences.emergencyContactPhone && `(${userPreferences.emergencyContactPhone})`}
                  </span>
                </div>
              )}
              <div className="sos-demo-warning"><AlertTriangle size={15} /><span>{backendOnline ? 'Emergency SOS creates a live tracking link and alerts SafeRoute users nearby.' : 'Offline mode: SOS request will be stored locally.'}</span></div>
              <button className="sos-submit-button" type="submit" disabled={!sosPoint}><ShieldAlert size={17} /> Send SOS emergency alert</button>
              {lastSosShareUrl && (
                <div className="share-link-banner">
                  <strong>Active Emergency Tracking Link:</strong>
                  <a href={resolveAppUrl(lastSosShareUrl)} target="_blank" rel="noreferrer">
                    {resolveAppUrl(lastSosShareUrl)}
                  </a>
                  <small>Share this link with trusted contacts to follow your journey live.</small>
                  {userPreferences?.emergencyContactPhone && (
                    <a
                      className="sos-sms-direct-btn"
                      href={buildSmsUrl(
                        userPreferences.emergencyContactPhone || '',
                        [
                          'SAFEROUTE EMERGENCY ALERT',
                          `Track my live location: ${resolveAppUrl(lastSosShareUrl)}`,
                          sosResult?.googleMapsUrl ? `Google Maps: ${sosResult.googleMapsUrl}` : null,
                        ].filter(Boolean).join('\n'),
                      )}
                    >
                      <Phone size={13} />
                      <span>SMS tracking link to {userPreferences.emergencyContactName || 'emergency contact'}</span>
                    </a>
                  )}
                </div>
              )}
              {!sosPoint && <p className="required-location-note">Choose GPS or a point on the map to enable sending.</p>}
            </form>
          </section>
        </div>
      )}

      {notice && (
        <div className="toast-message" role="status"><span className="toast-mark"><Check size={14} /></span><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={15} /></button></div>
      )}

      <div className="map-footnote">Map data &copy; OpenStreetMap contributors <span>·</span> Route previews are not verified for safety</div>
    </main>
      )}
    </>
  );
}
