# SafeRoute — connected web frontend

A responsive, map-first safety navigation frontend built with React 19, TypeScript,
Vite, Leaflet, React Leaflet, and Lucide icons. It calls the SafeRoute FastAPI backend
for route comparison, incident reports, and SOS alerts.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
# from the repository root, with the backend running on :8000
make web-install
make web-dev
```

Open <http://localhost:5173>. Vite proxies `/api` to `http://localhost:8000`.
On Windows, `START-WINDOWS.bat` also works once dependencies are installed.

To create a production bundle:

```bash
make web-build
npm run preview
```

## Configuration

Copy `.env.example` to `.env.local` to override:

- `VITE_API_BASE_URL` — backend origin; leave empty for the Vite proxy / same origin.
- `VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` — account created/reused automatically for
  protected endpoints.
- `VITE_GEOCODING_ENDPOINT` — Photon-compatible place search endpoint.

These are public client settings; never put private API keys here.

## Connected features

- **Destination search** uses Photon/OpenStreetMap place data and is unchanged.
- **Route planning** calls `POST /api/v1/routes/compare`. Backend safety scores are
  converted into the three route-choice cards shown in the overlay.
- **Reports** are sent to `POST /api/v1/reports` as `pending`, and nearby approved
  reports are loaded from `GET /api/v1/reports/nearby`.
- **SOS** calls `POST /api/v1/sos` and reloads your alerts from `GET /api/v1/sos/mine`.
  The backend records the alert and logs a simulated contact notification; no real
  emergency service or responder is contacted.
- Map tiles remain OpenStreetMap tiles and require internet access.

## Important limitations

- Reports are pending until a moderator approves them; only approved reports affect
  backend safety scores.
- The demo account is shared by this browser. It is not a real identity system; add a
  proper login UI before public deployment.
- No reports does not mean a location or route is safe.
- SOS is recording only. It does not send SMS, email, push, or dispatch responders.
- Voice and photo attachments are shown as names/flags only; the audio/image bytes are
  not uploaded to the backend.
