# SafeRoute — single-map frontend

A responsive, map-first safety navigation frontend built with React 19, TypeScript, Vite, Leaflet, React Leaflet, and Lucide icons. The main map remains the application surface; search results, destination safety details, route choices, reporting, SOS, filters, and themes appear as overlays on that map.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. On Windows, you can also double-click `START-WINDOWS.bat`. To create a production bundle:

```bash
npm run build
npm run preview
```

## Main map interactions

- **Destination search:** Expand the search field and search for a mapped venue, hotel, restaurant, public place, or address. Choose a result to center the map and review locally saved incident reports within 1 km. Photon searches OpenStreetMap place data; it is not an events calendar, so an event title is findable only when the venue/place is present in map data.
- **GPS:** The location control asks the browser for permission and centers the map on the device's current location.
- **Route planning:** Use GPS or choose a starting point on the map, then choose a destination by search or map tap. The app requests route alternatives and displays up to three requested choices: shortest among low-reported-exposure routes, longest distinct low-reported-exposure route, and shortest distinct route with higher reported exposure. The selected path is drawn on the map and its available turn list appears in the same route overlay. There is intentionally no medium route option.
- **Route availability:** The public routing service may return fewer than three distinct paths. Unavailable choices are shown as unavailable rather than inventing duplicate routes. If no route has greater saved-report exposure than the others, the higher-risk option stays unavailable.
- **Route exposure estimate:** Routes are compared against reports saved in this browser, using category, distance from the path, and report age as rough weights. This is not a crime map or a validated safety model. Reports can be inaccurate, incomplete, duplicated, or unverified. The words “safest” and “higher reported risk” describe only relative local report signals, not actual safety.
- **Report:** Press Report, tap the map to pin the location, choose a category, and optionally add a description or image. New reports appear as map markers and remain marked **Pending review**.
- **SOS:** One tap opens a confirmation prompt and starts GPS. Confirming immediately broadcasts the location to nearby SafeRoute users, creates a 3-hour live tracking link, and opens a prefilled SMS to the saved emergency contact (the user presses Send in their SMS app). The user can stop sharing with **I'm safe**. For a text reason, voice recording, or picture, choose **Add a reason, voice note or picture instead** before confirming. This demo does not contact emergency services.
- **Filters:** Toggle report categories and SOS markers without leaving the map.
- **Themes:** Switch between five interface themes: Rose, Midnight, Ocean, Forest, and Lavender. The selected theme is saved in this browser. The underlying OpenStreetMap tile style remains the same.

## Backend Integration & API Services

The frontend is now fully integrated with the SafeRoute FastAPI backend:

- **Safety Scoring & Route Comparison:** Route comparison calls `POST /api/v1/routes/compare`. The backend Safety Engine ranks routes using pedestrian corridors, verified safe havens, and community incident reports with day/night lighting models. If the backend is unreachable, the frontend gracefully falls back to OSRM + local scoring.
- **Verified Safe Havens:** Verified safe havens (police stations, 24/7 hospitals, verified shelters) are fetched dynamically via `GET /api/v1/locations/safe` and rendered on the map with custom green markers, popup details, contact numbers, and filter toggles.
- **Incident Reports:** Community incident reports synchronize with `GET /api/v1/reports/nearby` and new reports are submitted to `POST /api/v1/reports`.
- **SOS Emergency Alerting:** SOS alerts submit `POST /api/v1/reports`, initiate tracked journeys via `POST /api/v1/journeys`, generate a live shareable tracking token, and publish `POST /api/v1/sos/alerts`. Other clients poll `GET /api/v1/sos/alerts/nearby` and see active alerts as map markers. The app opens the device SMS app with the tracking link; browsers cannot send SMS without user confirmation unless an SMS gateway is added.
- **Backend Health & Offline Mode:** The header indicates live backend connection status (`SafeRoute Engine Connected`). When offline, the app operates in offline local storage mode.


## External map services

- Map tiles and map data: OpenStreetMap contributors. Attribution is visible on the map.
- Place search: Photon public demo API. Search is triggered only when the user submits the search form. For a larger or commercial deployment, configure an appropriately managed geocoding service or host your own instance.
- Route alternatives and directions: public OSRM demo service. It is best-effort and may return fewer alternatives than requested. Replace it with a supported routing provider for deployment.

Copy `.env.example` to `.env.local` to change the public geocoding or routing endpoint. These are client-side endpoint settings, not places for private API keys.

Public map, geocoding, and routing services can change availability or usage limits. A production deployment should use providers whose service terms and capacity fit the app's expected traffic.

## Browser permissions and phone testing

- Geolocation and microphone capture require a secure browser context. `localhost` is generally treated as secure, but a phone opening the Vite LAN address over plain `http://` may block GPS or microphone access. Use an HTTPS deployment or an HTTPS development setup for those permissions.
- Map tiles, place search, and route previews require an internet connection.
