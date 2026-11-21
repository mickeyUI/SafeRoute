import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Crosshair,
  Filter,
  ImagePlus,
  LocateFixed,
  MapPin,
  MapPinned,
  Mic,
  Minus,
  Plus,
  Palette,
  Phone,
  Route as RouteIcon,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import {
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
  checkBackendHealth,
  compareRoutesWithBackend,
  fetchBackendReports,
  fetchBackendSafeLocations,
  formatDistance,
  formatDuration,
  getDrivingRoutes,
  scoreRoutesWithLocalReports,
  searchPlaces,
  submitBackendReport,
  triggerBackendSos,
  type RouteCandidate,
  type RouteChoice,
  type RouteChoiceKind,
} from './services';
import { loadReports, loadSosRequests, saveReports, saveSosRequests } from './storage';
import {
  REPORT_CATEGORIES,
  type LatLng,
  type MapMode,
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

type Panel = 'report' | 'sos' | null;
type ThemeId = 'rose' | 'midnight' | 'ocean' | 'forest' | 'lavender';

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

export default function App() {
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
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [lastSosShareUrl, setLastSosShareUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function syncWithBackend() {
      const health = await checkBackendHealth();
      if (!active) return;
      setBackendOnline(health.online);

      if (health.online) {
        try {
          const [backendHavens, backendReps] = await Promise.all([
            fetchBackendSafeLocations(DEFAULT_CENTER, 25000),
            fetchBackendReports(DEFAULT_CENTER, 25000),
          ]);
          if (!active) return;
          if (backendHavens.length) setSafeLocations(backendHavens);
          if (backendReps.length) {
            setReports((prev) => {
              const map = new Map<string, SafetyReport>();
              backendReps.forEach((r) => map.set(r.id, r));
              prev.forEach((r) => map.set(r.id, r));
              return Array.from(map.values());
            });
          }
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
  }, []);

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

  const filteredCount = Object.values(enabledCategories).filter(Boolean).length;
  const destinationReports = useMemo(() => {
    if (!selectedPlace) return [];
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const distanceMeters = (a: LatLng, b: LatLng) => {
      const dLat = toRadians(b[0] - a[0]);
      const dLng = toRadians(b[1] - a[1]);
      const lat1 = toRadians(a[0]);
      const lat2 = toRadians(b[0]);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    };
    return reports.filter((report) => distanceMeters(selectedPlace.position, report.position) <= 1000);
  }, [selectedPlace, reports]);

  const destinationSafeHavens = useMemo(() => {
    if (!selectedPlace) return [];
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const distanceMeters = (a: LatLng, b: LatLng) => {
      const dLat = toRadians(b[0] - a[0]);
      const dLng = toRadians(b[1] - a[1]);
      const lat1 = toRadians(a[0]);
      const lat2 = toRadians(b[0]);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
      return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    };
    return safeLocations.filter((haven) => distanceMeters(selectedPlace.position, haven.position) <= 2500);
  }, [selectedPlace, safeLocations]);

  function getCurrentLocation(onSuccess?: (point: LatLng) => void) {
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
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 },
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
        choices = await compareRoutesWithBackend(start, end, 'safety');
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
    const localId = createId();
    let backendSuccess = false;
    let reportStatus: 'Pending review' | 'Approved' = 'Pending review';

    try {
      const res = await submitBackendReport({
        category: reportCategory,
        description: reportDescription.trim(),
        position: reportPoint,
      });
      backendSuccess = true;
      if (res.status === 'approved') reportStatus = 'Approved';
    } catch (err) {
      console.warn('Backend submission error, saved locally:', err);
    }

    const report: SafetyReport = {
      id: localId,
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

    let shareInfo: { journeyId?: string; shareUrl?: string } = {};
    try {
      shareInfo = await triggerBackendSos(sosPoint, sosReason);
    } catch (err) {
      console.warn('Backend SOS broadcast failed:', err);
    }

    const request: SosRequest = {
      id: createId(),
      position: sosPoint,
      createdAt: new Date().toISOString(),
      reason: sosReason.trim() || undefined,
      voiceAttached: voiceAttached || voiceRecording,
      pictureName: sosPhoto?.name,
      status: shareInfo.journeyId ? 'Emergency Active' : 'Saved locally — demo only',
      journeyId: shareInfo.journeyId,
      shareUrl: shareInfo.shareUrl,
    };
    setSosRequests((current) => [request, ...current]);
    setPanel(null);
    if (shareInfo.shareUrl) {
      setLastSosShareUrl(shareInfo.shareUrl);
      setNotice('Emergency SOS broadcast to SafeRoute backend! Active tracking link created.');
    } else {
      setNotice('SOS saved in this browser demo (offline mode).');
    }
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
    <main className={`app-shell ${mapMode !== 'idle' ? 'map-picking' : ''}`} data-theme={theme}>
      <MapContainer
        className="map-canvas"
        center={DEFAULT_CENTER}
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
            pathOptions={{ color: '#ffffff', weight: 2.5, fillColor: '#10b981', fillOpacity: 0.95 }}
          >
            <Popup>
              <div className="map-popup">
                <div className="popup-kicker popup-safe">Verified Safe Haven · 24/7</div>
                <strong>{loc.name}</strong>
                <p>{loc.description || 'Verified safe haven with 24/7 access.'}</p>
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

        {visibleReports.map((report) => (
          <CircleMarker
            key={report.id}
            center={report.position}
            radius={8}
            pathOptions={{ color: '#ffffff', weight: 2.5, fillColor: REPORT_COLORS[report.category], fillOpacity: 0.96 }}
          >
            <Popup>
              <div className="map-popup">
                <div className="popup-kicker">
                  {report.status === 'Approved' ? 'Verified Community Report' : 'Community report · Pending review'}
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
                <div className="popup-kicker popup-danger">Local SOS demo marker</div>
                <strong>Emergency request</strong>
                <p>{request.reason || 'No reason was added.'}</p>
                <small>{formatDate(request.createdAt)}</small>
                <small className="popup-coordinate">No responder was notified.</small>
              </div>
            </Popup>
          </CircleMarker>
        ))}

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
        {routePreview && (
          <Polyline positions={routePreview.coordinates} pathOptions={{ color: THEMES.find((item) => item.id === theme)?.color ?? '#d94f91', weight: 6, opacity: 0.92, lineCap: 'round', lineJoin: 'round' }} />
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

        <div className="top-status">
          <span className={`status-dot ${backendOnline === true ? 'online' : backendOnline === false ? 'offline' : ''}`} />
          <span>{backendOnline === true ? 'SafeRoute Engine Connected' : backendOnline === false ? 'Local Mode (Backend Offline)' : 'Connecting…'}</span>
        </div>
      </header>

      <div className="map-side-tools">
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

      {modeMessage && (
        <div className="map-mode-banner">
          <Crosshair size={17} />
          <span>{modeMessage}</span>
          <button type="button" onClick={() => setMapMode('idle')}>Cancel</button>
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
          ) : <p className="destination-no-reports">No saved reports were found in this browser around this destination.</p>}
          <p className="destination-caveat">Reports are local to this browser and unverified. No reports does not mean a place is safe.</p>
          <button className="destination-route-button" type="button" onClick={routeToSelectedPlace}><RouteIcon size={15} /> Plan a route here</button>
        </section>
      )}

      {routeChoices.length > 0 && (
        <section className="route-summary route-options-panel" aria-label="Route options and directions">
          <div className="route-summary-top"><span className="route-summary-icon"><RouteIcon size={17} /></span><div><strong>Compare route options</strong><small>{routeChoices.filter((choice) => choice.route).length} alternative route(s) returned</small></div><button type="button" aria-label="Close routes" onClick={clearRoute}><X size={17} /></button></div>
          <div className="route-choice-list">
            {routeChoices.map((choice) => (
              <button key={choice.kind} type="button" disabled={!choice.route} className={`route-choice ${selectedRouteKind === choice.kind && routePreview ? 'route-choice-active' : ''}`} onClick={() => selectRouteChoice(choice)}>
                <span className="route-choice-copy"><strong>{choice.title}</strong><small>{choice.route ? choice.subtitle : choice.kind === 'shortest-higher-risk' ? 'No route with higher reported exposure was identified.' : 'The routing service did not return another distinct low-exposure path.'}</small></span>
                {choice.route ? <span className="route-choice-metric"><strong>{formatDistance(choice.route.distanceMeters)}</strong><small>{formatDuration(choice.route.durationSeconds)}</small><small>{choice.route.nearbyReportCount} local reports</small></span> : <span className="route-unavailable">Unavailable</span>}
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
              <div className="route-risk-note">
                <AlertTriangle size={14} />
                <span>
                  {routePreview.isBackendRanked
                    ? `Scored by SafeRoute engine against verified community reports, safe havens, and day/night lighting models.`
                    : `${routePreview.nearbyReportCount} saved report(s) within roughly 220 m of this route.`}
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
          <button className="dock-action dock-sos" type="button" onClick={openSos}>
            <span className="dock-icon"><ShieldAlert size={19} /></span>
            <span>SOS</span>
          </button>
        </nav>
      </div>

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
              <div className="sos-demo-warning"><AlertTriangle size={15} /><span>{backendOnline ? 'Emergency SOS creates an active tracked journey and alerts SafeRoute dispatch.' : 'Offline mode: SOS request will be stored locally.'}</span></div>
              <button className="sos-submit-button" type="submit" disabled={!sosPoint}><ShieldAlert size={17} /> Send SOS emergency alert</button>
              {lastSosShareUrl && (
                <div className="share-link-banner">
                  <strong>Active Emergency Tracking Link:</strong>
                  <a href={lastSosShareUrl} target="_blank" rel="noreferrer">
                    {window.location.origin}{lastSosShareUrl}
                  </a>
                  <small>Share this link with trusted contacts to follow your journey live.</small>
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
  );
}
