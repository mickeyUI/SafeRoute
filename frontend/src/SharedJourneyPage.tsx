import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  MapPin,
  Navigation,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import {
  ApiError,
  buildTrackUrl,
  fetchSharedJourney,
  type SharedJourney,
} from './services';
import type { LatLng } from './types';

const REFRESH_MS = 15_000;

type Coordinate = [number, number] | { latitude: number; longitude: number };

function toLatLng(value: Coordinate | null | undefined): LatLng | null {
  if (!value) return null;
  const latitude = Array.isArray(value) ? value[0] : value.latitude;
  const longitude = Array.isArray(value) ? value[1] : value.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return [latitude, longitude];
}

function formatTime(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function FitMap({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    map.fitBounds(points, { padding: [55, 55], maxZoom: 16 });
  }, [map, points]);
  return null;
}

export default function SharedJourneyPage({ token }: { token: string }) {
  const [journey, setJourney] = useState<SharedJourney | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchSharedJourney(token);
      setJourney(data);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) {
        setError('This live tracking link has expired.');
      } else if (err instanceof ApiError && err.status === 404) {
        setError('This tracking link is invalid or sharing has been stopped.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not load this tracking link.');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load]);

  const origin = useMemo(() => toLatLng(journey?.origin), [journey]);
  const destination = useMemo(() => toLatLng(journey?.destination), [journey]);
  const lastCheckin = useMemo(() => toLatLng(journey?.last_checkin), [journey]);

  const routePoints = useMemo(
    () => (journey?.route_coordinates ?? [])
      .map((coordinate) => toLatLng(coordinate))
      .filter((point): point is LatLng => point !== null),
    [journey],
  );

  const mapPoints = useMemo(() => {
    const points = [...routePoints];
    if (lastCheckin) points.push(lastCheckin);
    if (!points.length) {
      if (origin) points.push(origin);
      if (destination) points.push(destination);
    }
    return points;
  }, [routePoints, lastCheckin, origin, destination]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(buildTrackUrl(token));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const status = journey?.status?.toLowerCase() ?? '';
  const statusLabel = status === 'active'
    ? 'Live · sharing location'
    : status === 'arrived'
      ? 'Arrived at destination'
      : status === 'cancelled'
        ? 'Sharing stopped'
        : status || 'Unknown';

  return (
    <div className="track-page">
      <header className="track-header">
        <a className="track-brand" href="/">
          <span className="brand-icon"><Shield size={20} /></span>
          <span className="brand-copy"><strong>SafeRoute</strong><small>Live location sharing</small></span>
        </a>
        <span className={`track-live-pill ${status === 'active' ? 'is-live' : ''}`}>
          <span className="status-dot" /> {statusLabel}
        </span>
      </header>

      {loading && !journey && (
        <section className="track-message">
          <span className="spinner" />
          <h2>Loading live location…</h2>
          <p>Fetching the latest check-in for this shared journey.</p>
        </section>
      )}

      {error && !journey && !loading && (
        <section className="track-message track-message-error">
          <AlertTriangle size={30} />
          <h2>Tracking link unavailable</h2>
          <p>{error}</p>
          <div className="track-actions">
            <button type="button" className="track-button primary" onClick={() => void load()}>
              <RefreshCw size={15} /> Try again
            </button>
            <a className="track-button" href="/">Open SafeRoute</a>
          </div>
        </section>
      )}

      {journey && (
        <main className="track-layout">
          <aside className="track-card">
            <div className="track-card-heading">
              <div>
                <span className="track-kicker">Emergency SOS · live journey</span>
                <h1>Someone is sharing their location</h1>
              </div>
              {status === 'active' && <span className="track-live-dot" title="Live" />}
            </div>

            {error && (
              <p className="track-warning"><AlertTriangle size={14} /> {error} Showing last known information.</p>
            )}

            <div className="track-metrics">
              <div><Clock size={15} /><span>Link expires in</span><strong>{journey.remaining_minutes} min</strong></div>
              <div><Navigation size={15} /><span>Estimated arrival</span><strong>{formatTime(journey.estimated_arrival_at)}</strong></div>
              <div><MapPin size={15} /><span>Last check-in</span><strong>{formatTime(journey.last_checkin?.created_at)}</strong></div>
            </div>

            {journey.last_checkin?.note && (
              <p className="track-note">{journey.last_checkin.note}</p>
            )}

            <div className="track-places">
              <div><span className="track-place-dot origin" /><div><small>Started at</small><strong>{origin ? `${origin[0].toFixed(5)}, ${origin[1].toFixed(5)}` : 'Not available'}</strong></div></div>
              <div><span className="track-place-dot destination" /><div><small>Destination</small><strong>{destination ? `${destination[0].toFixed(5)}, ${destination[1].toFixed(5)}` : 'Not available'}</strong></div></div>
              {lastCheckin && (
                <div><span className="track-place-dot checkin" /><div><small>Latest position</small><strong>{lastCheckin[0].toFixed(5)}, {lastCheckin[1].toFixed(5)}</strong></div></div>
              )}
            </div>

            <div className="track-actions">
              <button type="button" className="track-button primary" onClick={() => void load()}>
                <RefreshCw size={15} /> Refresh
              </button>
              <button type="button" className="track-button" onClick={() => void copyLink()}>
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy link'}
              </button>
              <a className="track-button" href="/">Open SafeRoute</a>
            </div>

            <p className="track-footnote">
              Updates automatically every 15 seconds. Location is shared only while
              the SOS is active. If someone is in danger, contact local emergency services.
            </p>
            <p className="track-updated">
              {updatedAt ? `Last updated ${updatedAt.toLocaleTimeString()}` : 'Updating…'} · journey {journey.journey_id}
            </p>
          </aside>

          <div className="track-map">
            <MapContainer
              center={lastCheckin ?? origin ?? destination ?? [9.03, 38.74]}
              zoom={13}
              minZoom={3}
              maxZoom={19}
              zoomControl
              scrollWheelZoom
              className="track-map-canvas"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {mapPoints.length > 0 && <FitMap points={mapPoints} />}
              {routePoints.length > 1 && (
                <Polyline positions={routePoints} pathOptions={{ color: '#d94f91', weight: 4, opacity: 0.85 }} />
              )}
              {origin && (
                <CircleMarker center={origin} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#398b69', fillOpacity: 1 }}>
                  <Popup>Start of journey</Popup>
                </CircleMarker>
              )}
              {destination && (
                <CircleMarker center={destination} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: '#278fbe', fillOpacity: 1 }}>
                  <Popup>Intended destination</Popup>
                </CircleMarker>
              )}
              {lastCheckin && (
                <CircleMarker center={lastCheckin} radius={11} pathOptions={{ color: '#fff', weight: 3, fillColor: '#e13e60', fillOpacity: 0.95, className: 'sos-alert-marker' }}>
                  <Popup>
                    <div className="map-popup">
                      <div className="popup-kicker popup-danger">Latest check-in</div>
                      <strong>{formatTime(journey.last_checkin?.created_at)}</strong>
                      <small>{lastCheckin[0].toFixed(5)}, {lastCheckin[1].toFixed(5)}</small>
                    </div>
                  </Popup>
                </CircleMarker>
              )}
            </MapContainer>
          </div>
        </main>
      )}
    </div>
  );
}
