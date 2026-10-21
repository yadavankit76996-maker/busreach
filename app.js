const cfg = window.LSF_CONFIG || {};

const configured = Boolean(
    window.supabase &&
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("PASTE_") &&
    !cfg.SUPABASE_ANON_KEY.includes("PASTE_")
);

const db = configured
    ? window.supabase.createClient(
        cfg.SUPABASE_URL,
        cfg.SUPABASE_ANON_KEY
    )
    : null;

const $ = id => document.getElementById(id);

const stopsEl = $("stops");
const countEl = $("count");
const statusEl = $("status");

let stops = [];
let timings = [];
let userLocation = null;
let markers = [];
let userMarker = null;

const DEFAULT_CENTER = [19.42, 72.82];
const STUDY_AREA_PATTERN = /\b(nallasopara|nalasopara|vasai|virar)\b/i;

const map = window.L && $("map")
    ? L.map("map").setView(DEFAULT_CENTER, 13)
    : null;

if (map) {
    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors"
        }
    ).addTo(map);
}

function safe(value = "") {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function valid(stop) {
    if (
        stop.latitude == null ||
        stop.longitude == null ||
        stop.latitude === "" ||
        stop.longitude === ""
    ) return false;

    const lat = Number(stop.latitude);
    const lng = Number(stop.longitude);

    return Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180;
}

function distance(a, b) {
    const rad = value => value * Math.PI / 180;
    const dLat = rad(Number(b.latitude) - Number(a.latitude));
    const dLng = rad(Number(b.longitude) - Number(a.longitude));

    const value =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(rad(Number(a.latitude))) *
        Math.cos(rad(Number(b.latitude))) *
        Math.sin(dLng / 2) ** 2;

    return 6371 * 2 * Math.atan2(
        Math.sqrt(value),
        Math.sqrt(Math.max(0, 1 - value))
    );
}

function formatTime(value) {
    if (!value) return "Time unavailable";

    const parts = String(value).slice(0, 5).split(":").map(Number);

    if (
        parts.length !== 2 ||
        !Number.isFinite(parts[0]) ||
        !Number.isFinite(parts[1])
    ) return safe(value);

    const date = new Date();
    date.setHours(parts[0], parts[1], 0, 0);

    return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}

function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
}

function getStopTimings(stop) {
    return timings
        .filter(timing => timing.stop_id === stop.id)
        .sort((a, b) =>
            String(a.scheduled_time || "").localeCompare(
                String(b.scheduled_time || "")
            )
        );
}

// Restrict the public directory to the project's study area.
function isInStudyArea(stop) {
    const locationText = [
        stop.area,
        stop.address,
        stop.landmark
    ].filter(Boolean).join(" ");

    return STUDY_AREA_PATTERN.test(locationText);
}

function stopSearchText(stop) {
    const stopTimings = getStopTimings(stop);

    return [
        stop.name,
        stop.address,
        stop.area,
        stop.landmark,
        ...stopTimings.map(t => t.route_number),
        ...stopTimings.map(t => t.destination)
    ].filter(Boolean).join(" ").toLowerCase();
}

async function load() {
    if (!db) {
        if (stopsEl) {
            stopsEl.innerHTML =
                '<p class="empty">The database is not configured. ' +
                'Check config.js and SETUP.md.</p>';
        }

        if (countEl) countEl.textContent = "Not connected";
        setStatus("Database setup required.");
        return;
    }

    setStatus("Loading published bus stops and timings…");

    try {
        const [stopResult, timingResult] = await Promise.all([
            db.from("bus_stops")
                .select("*")
                .eq("published", true)
                .order("name"),

            db.from("bus_timings")
                .select("*")
                .eq("published", true)
                .order("scheduled_time")
        ]);

        if (stopResult.error) throw stopResult.error;
        if (timingResult.error) throw timingResult.error;

        stops = stopResult.data || [];
        timings = timingResult.data || [];

        if ($("stopCount")) {
            $("stopCount").textContent = stops.filter(isInStudyArea).length;
        }

        if ($("timingCount")) {
            const localStopIds = new Set(
                stops.filter(isInStudyArea).map(stop => stop.id)
            );

            $("timingCount").textContent = timings.filter(
                timing => localStopIds.has(timing.stop_id)
            ).length;
        }

        setStatus(
            stops.some(isInStudyArea)
                ? "Showing published stops in Nalasopara, Vasai and Virar."
                : "No published stops found in the study area yet."
        );

        render();
    } catch (error) {
        console.error("BusReach loading error:", error);

        if (stopsEl) {
            stopsEl.innerHTML =
                '<p class="empty">Could not load bus stops. ' +
                'Check your Supabase connection and database permissions.</p>';
        }

        if (countEl) countEl.textContent = "Unavailable";
        setStatus("Unable to load the directory.");
    }
}

function render() {
    if (!stopsEl) return;

    const query = ($("search")?.value || "").trim().toLowerCase();
    const area = ($("area")?.value || "").trim().toLowerCase();
    const type = $("timingType")?.value || "";

    // Start with stops in the study area only.
    const localStops = stops.filter(isInStudyArea);

    // If the search term matches a stop's locality, prefer that locality.
    // For example, "Nalasopara" won't also return Bhiwandi stops.
    const localityMatches = query
        ? localStops.filter(stop =>
            String(stop.area || "").toLowerCase().includes(query)
        )
        : [];

    const useLocalityMatch = localityMatches.length > 0;

    let list = localStops.filter(stop => {
        const stopTimings = getStopTimings(stop);
        const text = stopSearchText(stop);

        const matchesQuery = !query || (
            useLocalityMatch
                ? localityMatches.some(match => match.id === stop.id)
                : text.includes(query)
        );

        return (
            matchesQuery &&
            (!area || String(stop.area || "").toLowerCase().includes(area)) &&
            (!type || stopTimings.some(t => t.timing_type === type))
        );
    });

    if (userLocation) {
        list.sort((a, b) => {
            const da = valid(a) ? distance(userLocation, a) : Infinity;
            const db = valid(b) ? distance(userLocation, b) : Infinity;
            return da - db;
        });
    } else if (query) {
        // Keep matching area results first when not sorting by distance.
        list.sort((a, b) => {
            const aArea = String(a.area || "").toLowerCase();
            const bArea = String(b.area || "").toLowerCase();

            const aMatch = aArea.includes(query) ? 0 : 1;
            const bMatch = bArea.includes(query) ? 0 : 1;

            return aMatch - bMatch ||
                String(a.name || "").localeCompare(String(b.name || ""));
        });
    }

    if (countEl) {
        countEl.textContent =
            `${list.length} stop${list.length === 1 ? "" : "s"}`;
    }

    stopsEl.innerHTML = list.length
        ? list.map(stop => {
            const stopTimings = getStopTimings(stop);
            const km = userLocation && valid(stop)
                ? distance(userLocation, stop)
                : null;

            const photo = stop.photo_url
                ? `<img class="stop-photo"
                     src="${safe(stop.photo_url)}"
                     alt="Bus stop: ${safe(stop.name)}"
                     loading="lazy"
                     onerror="this.hidden=true">`
                : "";

            const distanceText = km !== null
                ? `<p><strong>Distance:</strong> ${km < 1
                    ? `${Math.round(km * 1000)} metres`
                    : `${km.toFixed(2)} km`
                } (approximate)</p>`
                : "";

            const timingHTML = stopTimings.length
                ? `<div class="timing-list">${stopTimings.map(timing => `
                    <div class="timing-row">
                        <div>
                            <strong>${safe(formatTime(timing.scheduled_time))}</strong>
                            <div class="small">
                                Route ${safe(timing.route_number || "Not recorded")}
                                · ${safe(timing.destination || "Destination not recorded")}
                            </div>
                            <div class="muted small">
                                ${safe(timing.service_days || "Days not recorded")}
                            </div>
                        </div>
                        <span class="tag">
                            ${safe(timing.timing_type || "Scheduled")}
                        </span>
                    </div>
                    <p class="muted small">
                        Source: ${safe(timing.source || "Not recorded")}
                        ${timing.last_verified
                        ? " · Last checked: " + safe(timing.last_verified)
                        : ""}
                    </p>
                `).join("")}</div>`
                : '<p class="muted small">No published timings are available for this stop.</p>';

            const directions = valid(stop)
                ? `<div class="actions">
                    <a target="_blank" rel="noopener noreferrer"
                       href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    `${stop.latitude},${stop.longitude}`
                )}">Get directions</a>
                    <button class="secondary" type="button"
                        data-show="${safe(stop.id)}">Show on map</button>
                   </div>`
                : '<p class="muted small">Location coordinates are unavailable.</p>';

            return `
                <article class="place-card">
                    ${photo}
                    <h3>${safe(stop.name)}</h3>
                    <span class="tag">${safe(stop.area || "Area not recorded")}</span>
                    <p>${safe(stop.address || "Address not recorded")}</p>
                    ${stop.landmark
                    ? `<p><strong>Landmark:</strong> ${safe(stop.landmark)}</p>`
                    : ""}
                    ${distanceText}
                    ${stop.accessibility_notes
                    ? `<p><strong>Accessibility:</strong> ${safe(stop.accessibility_notes)}</p>`
                    : ""}
                    <details class="timings-details">
                        <summary>
                            Bus timings (${stopTimings.length})
                        </summary>
                        ${timingHTML}
                    </details>
                    ${directions}
                </article>`;
        }).join("")
        : '<p class="empty">No matching stops found in Nalasopara, Vasai or Virar. Try another search or suggest a missing stop.</p>';

    updateMap(list);
}

function updateMap(list) {
    if (!map) return;

    // Each entry stores { id, marker }; remove the actual Leaflet marker.
    markers.forEach(entry => entry.marker.remove());
    markers = [];

    const bounds = [];

    list.forEach(stop => {
        if (!valid(stop)) return;

        const marker = L.marker([
            Number(stop.latitude),
            Number(stop.longitude)
        ])
            .addTo(map)
            .bindPopup(
                `<strong>${safe(stop.name)}</strong><br>` +
                `${safe(stop.area || "")}<br>${safe(stop.address || "")}`
            );

        markers.push({ id: stop.id, marker });
        bounds.push([
            Number(stop.latitude),
            Number(stop.longitude)
        ]);
    });

    if (userLocation && userMarker) {
        bounds.push([
            userLocation.latitude,
            userLocation.longitude
        ]);
    }

    if (bounds.length === 1) {
        map.setView(bounds[0], 16);
    } else if (bounds.length > 1) {
        map.fitBounds(bounds, {
            padding: [18, 18],
            maxZoom: 15
        });
    } else {
        map.setView(DEFAULT_CENTER, 12);
    }

    stopsEl.querySelectorAll("[data-show]").forEach(button => {
        button.addEventListener("click", () => {
            const entry = markers.find(
                item => String(item.id) === button.dataset.show
            );

            if (!entry) return;

            const position = entry.marker.getLatLng();

            map.setView(position, 17);
            entry.marker.openPopup();

            $("map")?.scrollIntoView({
                behavior: "smooth",
                block: "nearest"
            });
        });
    });

    // Leaflet sometimes needs a refresh after a responsive layout change.
    requestAnimationFrame(() => map.invalidateSize());
}

["search", "area", "timingType"].forEach(id => {
    $(id)?.addEventListener("input", render);
    $(id)?.addEventListener("change", render);
});

$("clear")?.addEventListener("click", () => {
    ["search", "area", "timingType"].forEach(id => {
        if ($(id)) $(id).value = "";
    });

    userLocation = null;

    if (userMarker) {
        userMarker.remove();
        userMarker = null;
    }

    if (map) map.setView(DEFAULT_CENTER, 12);

    setStatus("Search filters cleared. Showing the study area.");
    render();
});

$("nearby")?.addEventListener("click", () => {
    if (!navigator.geolocation) {
        setStatus("Your browser does not support location access.");
        return;
    }

    setStatus("Requesting permission to access your location…");

    navigator.geolocation.getCurrentPosition(
        position => {
            userLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            if (map) {
                if (userMarker) userMarker.remove();

                userMarker = L.circleMarker(
                    [userLocation.latitude, userLocation.longitude],
                    {
                        radius: 8,
                        color: "#0756a3",
                        fillColor: "#3b9cf0",
                        fillOpacity: 0.9
                    }
                ).addTo(map).bindPopup("Your current location");
            }

            setStatus("Showing study-area stops nearest to your location first.");
            render();
        },
        error => {
            console.warn("Location error:", error);

            const messages = {
                1: "Location permission denied. Allow access in browser settings.",
                2: "Your location is unavailable. Try again or search manually.",
                3: "Location request timed out. Please try again."
            };

            setStatus(
                messages[error.code] ||
                "Could not get your location. Please search manually."
            );
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 60000
        }
    );
});

load();