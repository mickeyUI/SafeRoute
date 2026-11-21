const DEMO = {
  origin: [-122.4194, 37.7749],
  destination: [-122.4089, 37.7866],
};

const map = L.map("map").setView([37.7805, -122.414], 13);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const toLeaflet = ([lon, lat]) => [lat, lon];
const toApi = (latlng) => [latlng.lng, latlng.lat];

function endpointIcon(letter, kind) {
  return L.divIcon({
    className: `endpoint-icon ${kind}`,
    html: letter,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const originMarker = L.marker(toLeaflet(DEMO.origin), {
  draggable: true,
  icon: endpointIcon("A", "origin"),
  autoPan: true,
})
  .addTo(map)
  .bindPopup("Origin — drag me");

const destinationMarker = L.marker(toLeaflet(DEMO.destination), {
  draggable: true,
  icon: endpointIcon("B", "destination"),
  autoPan: true,
})
  .addTo(map)
  .bindPopup("Destination — drag me");

const routeLayer = L.layerGroup().addTo(map);

const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");
const modeEl = document.getElementById("travelMode");
const alternativesEl = document.getElementById("alternatives");
const compareBtn = document.getElementById("compareBtn");
const demoBtn = document.getElementById("demoBtn");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function activeKey() {
  return document.querySelector('input[name="active"]:checked').value;
}

function setPoint(key, apiPoint) {
  const marker = key === "origin" ? originMarker : destinationMarker;
  marker.setLatLng(toLeaflet(apiPoint));
}

map.on("click", (event) => {
  setPoint(activeKey(), toApi(event.latlng));
});

demoBtn.addEventListener("click", () => {
  setPoint("origin", DEMO.origin);
  setPoint("destination", DEMO.destination);
  map.fitBounds([toLeaflet(DEMO.origin), toLeaflet(DEMO.destination)], {
    padding: [40, 40],
  });
  setStatus("Demo endpoints restored.");
});

function scoreColor(score) {
  if (score >= 80) return "#2e7d32";
  if (score >= 60) return "#f9a825";
  return "#c62828";
}

function formatDistance(metres) {
  return `${(metres / 1000).toFixed(2)} km`;
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function number(value) {
  return typeof value === "number" ? value.toFixed(1) : String(value ?? "—");
}

function popupHtml(alt) {
  const factors = alt.safety_factors || {};
  return [
    `<strong>Route #${alt.rank}</strong>`,
    `<br>Safety: <strong>${number(alt.safety_score)}/100</strong>`,
    `<br>Confidence: ${number(alt.safety_confidence)}`,
    `<br>Distance: ${formatDistance(alt.distance_m)}`,
    `<br>Time: ${formatDuration(alt.duration_s)}`,
    `<br>Report penalty: ${number(factors.report_penalty)}`,
    `<br>Coverage bonus: ${number(factors.coverage_bonus)}`,
    `<br>Length penalty: ${number(factors.length_penalty)}`,
  ].join("");
}

function drawAlternatives(alternatives) {
  routeLayer.clearLayers();
  resultsEl.replaceChildren();

  const allPoints = [];

  alternatives.forEach((alt, index) => {
    const latlngs = alt.geometry.map(toLeaflet);
    if (latlngs.length < 2) return;

    const line = L.polyline(latlngs, {
      color: scoreColor(alt.safety_score),
      weight: Math.max(3, 7 - index),
      opacity: 0.9,
    })
      .addTo(routeLayer)
      .bindPopup(popupHtml(alt));

    allPoints.push(...latlngs);

    const item = document.createElement("li");
    item.innerHTML = [
      `<strong>#${alt.rank} · ${number(alt.safety_score)}/100</strong>`,
      `<span class="meta">${formatDistance(alt.distance_m)} · ${formatDuration(alt.duration_s)} · ${alt.provider}</span>`,
    ].join("");
    item.addEventListener("click", () => {
      map.fitBounds(line.getBounds(), { padding: [40, 40] });
      line.openPopup();
    });
    resultsEl.appendChild(item);
  });

  if (allPoints.length) {
    map.fitBounds(allPoints, { padding: [30, 30] });
  }
}

async function compareRoutes() {
  compareBtn.disabled = true;
  setStatus("Comparing routes…");

  try {
    const alternatives = Math.min(
      5,
      Math.max(1, Number.parseInt(alternativesEl.value, 10) || 3),
    );
    alternativesEl.value = String(alternatives);

    const response = await fetch("/api/v1/routes/compare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        origin: toApi(originMarker.getLatLng()),
        destination: toApi(destinationMarker.getLatLng()),
        travel_mode: modeEl.value,
        alternatives,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Request failed (${response.status})`);
    }

    drawAlternatives(data.alternatives);
    setStatus(`Compared ${data.alternatives.length} alternatives.`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    compareBtn.disabled = false;
  }
}

compareBtn.addEventListener("click", compareRoutes);
compareRoutes();
