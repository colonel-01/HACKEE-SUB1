// server.js — Overpass-backed realtime trip planner (no Gemini)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import NodeCache from "node-cache";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_TTL = parseInt(process.env.CACHE_TTL_SEC || "3600", 10); // seconds
const OVERPASS_PRIMARY = "https://overpass-api.de/api/interpreter";
const OVERPASS_MIRROR = "https://overpass.kumi.systems/api/interpreter"; // fallback mirror

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup
const cache = new NodeCache({ stdTTL: CACHE_TTL });

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------- Utility: Haversine distance (km) ---------- */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ---------- Helper: call Overpass with fallback ---------- */
async function callOverpass(query) {
  // try primary first
  try {
    const res = await axios.post(OVERPASS_PRIMARY, query, { 
      headers: { 'Content-Type': 'text/plain' },
      timeout: 30000
    });
    if (res && res.data) {
      // Check for Overpass API errors
      if (res.data.error) {
        console.error("Overpass API error response:", res.data.error);
        throw new Error(`Overpass API error: ${JSON.stringify(res.data.error)}`);
      }
      return res.data;
    }
    throw new Error("Empty response from primary Overpass");
  } catch (errPrimary) {
    console.warn("Primary Overpass failed:", errPrimary.message || errPrimary.toString());
    if (errPrimary.response) {
      console.warn("Response status:", errPrimary.response.status);
      console.warn("Response data:", errPrimary.response.data);
    }
    // fallback mirror
    try {
      const res2 = await axios.post(OVERPASS_MIRROR, query, { 
        headers: { 'Content-Type': 'text/plain' },
        timeout: 30000
      });
      if (res2 && res2.data) {
        // Check for Overpass API errors
        if (res2.data.error) {
          console.error("Overpass mirror API error response:", res2.data.error);
          throw new Error(`Overpass API error: ${JSON.stringify(res2.data.error)}`);
        }
        return res2.data;
      }
      throw new Error("Empty response from mirror Overpass");
    } catch (errMirror) {
      console.error("Both Overpass endpoints failed:", errMirror.message || errMirror.toString());
      if (errMirror.response) {
        console.error("Mirror response status:", errMirror.response.status);
        console.error("Mirror response data:", errMirror.response.data);
      }
      throw errMirror;
    }
  }
}

/* ---------- Shared handler function for trip planning ---------- */
async function handleTripPlan(req, res) {
  console.log("=== /api/plan-trip HIT ===", new Date().toISOString());
  console.log("Body:", req.body);

  try {
    let { startPlace, lat: latIn, lon: lonIn, days = 3 } = req.body || {};
    days = parseInt(days, 10) || 3;

    // Validate / Geocode if needed
    let lat = latIn !== undefined && latIn !== null && latIn !== "" ? parseFloat(latIn) : NaN;
    let lon = lonIn !== undefined && lonIn !== null && lonIn !== "" ? parseFloat(lonIn) : NaN;

    if ((isNaN(lat) || isNaN(lon)) && startPlace) {
      // use Nominatim to geocode
      console.log("Geocoding startPlace:", startPlace);
      try {
        const geo = await axios.get("https://nominatim.openstreetmap.org/search", {
          params: { q: startPlace, format: "json", limit: 1, addressdetails: 0 },
          timeout: 15000,
          headers: { 'User-Agent': 'TripPlanner/1.0' } // Required by Nominatim
        });
        if (!geo.data || !geo.data.length) {
          console.warn("Geocode returned no results");
          return res.json({ success: false, message: "Start place not found" });
        }
        lat = parseFloat(geo.data[0].lat);
        lon = parseFloat(geo.data[0].lon);
        console.log("Geocoded to:", lat, lon);
      } catch (geoErr) {
        console.error("Geocoding error:", geoErr.message);
        return res.json({ success: false, message: "Geocoding failed: " + geoErr.message });
      }
    }

    if (isNaN(lat) || isNaN(lon)) {
      return res.json({ success: false, message: "Provide startPlace or lat & lon" });
    }

    console.log(`Processing request for lat: ${lat}, lon: ${lon}, days: ${days}`);

    // Caching key (rounded coords)
    const cacheKey = `op_${lat.toFixed(4)}_${lon.toFixed(4)}`;
    let elements = cache.get(cacheKey);
    if (!elements) {
      // Build a conservative Overpass query (tourism/historic/viewpoint) within 300km
      const radius = 300000; // in meters (300km to cover level 3)
      const query = `[out:json][timeout:25];
(
  node["tourism"](around:${radius},${lat},${lon});
  way["tourism"](around:${radius},${lat},${lon});
  relation["tourism"](around:${radius},${lat},${lon});
  node["historic"](around:${radius},${lat},${lon});
  node["leisure"="park"](around:${radius},${lat},${lon});
  node["amenity"="viewpoint"](around:${radius},${lat},${lon});
);
out center;`;
      console.log("Calling Overpass (may take a few seconds)...");
      try {
        const data = await callOverpass(query);
        elements = (data && data.elements) || [];
        console.log(`Overpass returned ${elements.length} elements`);
        if (elements.length === 0) {
          console.warn("Overpass returned empty result");
        }
        cache.set(cacheKey, elements);
      } catch (overpassErr) {
        console.error("Overpass error:", overpassErr.message);
        return res.json({ 
          success: false, 
          message: "Failed to fetch places from Overpass API: " + overpassErr.message 
        });
      }
    } else {
      console.log("Using cached Overpass data, count =", elements.length);
    }

    if (!elements || !elements.length) {
      console.warn("No elements found after Overpass query");
      return res.json({ success: false, message: "No places found nearby" });
    }

    // Normalize elements into places with lat/lon and name
    const places = elements
        .filter((e) => e.tags && e.tags.name)
        .map((e) => {
            const plat = e.lat || (e.center && e.center.lat);
            const plon = e.lon || (e.center && e.center.lon);

            const kinds =
                e.tags &&
                (e.tags.tourism ||
                     e.tags.historic ||
                    e.tags.leisure ||
                    e.tags.amenity ||
                    "");

            return {
                name: e.tags.name,
                kinds,
                lat: plat,
                lon: plon,
                wikidata: e.tags.wikidata || null,
                wikipedia: e.tags.wikipedia || null,
                distanceKm: haversineKm(lat, lon, plat, plon),
            };
        })
        .filter((p) => p.lat && p.lon && !isNaN(p.lat) && !isNaN(p.lon))
        .sort((a, b) => a.distanceKm - b.distanceKm);

    console.log(`After filtering, ${places.length} places with valid coordinates`);

    if (places.length === 0) {
      console.warn("No places with valid coordinates after filtering");
      return res.json({ success: false, message: "No valid places found nearby" });
    }

    // Distance-based Levels with 4 Famous Places
    function isFamous(p) {
        return (
            p.wikidata ||
            p.wikipedia ||
            (p.kinds && p.kinds.toLowerCase().includes("museum")) ||
            (p.kinds && p.kinds.toLowerCase().includes("temple")) ||
            (p.kinds && p.kinds.toLowerCase().includes("monument")) ||
            (p.kinds && p.kinds.toLowerCase().includes("heritage")) ||
            (p.kinds && p.kinds.toLowerCase().includes("tourism"))
        );
    }

    // Split places into levels with max distance
    const level1Raw = places.filter((p) => p.distanceKm <= 10);
    const level2Raw = places.filter((p) => p.distanceKm > 10 && p.distanceKm <= 100);
    const level3Raw = places.filter((p) => p.distanceKm > 100 && p.distanceKm <= 300);

    console.log(`Level 1 raw: ${level1Raw.length}, Level 2 raw: ${level2Raw.length}, Level 3 raw: ${level3Raw.length}`);

    // Sort all by fame first, then distance
    function rank(arr) {
        return arr
            .sort((a, b) => {
                // famous first
                const fameA = isFamous(a) ? 1 : 0;
                const fameB = isFamous(b) ? 1 : 0;
                if (fameA !== fameB) return fameB - fameA;

                // then nearer place first
                return a.distanceKm - b.distanceKm;
            })
            .slice(0, 4); // ONLY 4 PLACES
    }

    const level1 = rank(level1Raw);
    const level2 = rank(level2Raw);
    const level3 = rank(level3Raw);

    console.log(`After ranking - Level 1: ${level1.length}, Level 2: ${level2.length}, Level 3: ${level3.length}`);

    // Build itinerary: simple selection across levels proportional to days
    const itinerary = [];
    let i = 0;
    let dayCounter = 1;
    const used = new Set();
    const levels = [level1, level2, level3];
    
    // If all levels are empty, use all places
    const allLevelsEmpty = level1.length === 0 && level2.length === 0 && level3.length === 0;
    
    if (allLevelsEmpty) {
      console.log("All levels empty, using fallback to all places");
      const fallback = places.slice(0, Math.min(days, places.length));
      fallback.forEach((p, idx) => {
        itinerary.push({
          day: idx + 1,
          level: `Level ${Math.floor(idx / 3) + 1}`,
          place: p.name,
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          kinds: p.kinds,
          info: `${p.distanceKm.toFixed(2)} km away`,
          distanceKm: Number(p.distanceKm.toFixed(2)),
          travelMode: "Land",
          weather: "N/A",
          cost: 300 + Math.round(p.distanceKm * 10),
        });
      });
    } else {
      while (itinerary.length < days && itinerary.length < 50) {
        const levelIndex = i % 3;
        const levelArr = levels[levelIndex];
        if (levelArr && levelArr.length) {
          // choose first not used
          const choice = levelArr.find((p) => !used.has(p.name));
          if (choice) {
            used.add(choice.name);
            itinerary.push({
              day: dayCounter,
              level: `Level ${levelIndex + 1}`,
              place: choice.name,
              name: choice.name,
              lat: choice.lat,
              lon: choice.lon,
              kinds: choice.kinds,
              info: `${choice.distanceKm.toFixed(2)} km away`,
              distanceKm: Number(choice.distanceKm.toFixed(2)),
              travelMode: "Land",
              weather: "N/A",
              cost: 300 + Math.round(choice.distanceKm * 10),
            });
            dayCounter++;
          }
        }
        i++;
        // safety guard
        if (i > 500) break;
      }
    }

    // If still empty (possible), pick first few places
    if (!itinerary.length) {
      console.log("Itinerary still empty, using final fallback");
      const fallback = places.slice(0, Math.min(days, places.length));
      fallback.forEach((p, idx) => {
        itinerary.push({
          day: idx + 1,
          level: `Level ${Math.floor(idx / 3) + 1}`,
          place: p.name,
          name: p.name,
          lat: p.lat,
          lon: p.lon,
          kinds: p.kinds,
          info: `${p.distanceKm.toFixed(2)} km away`,
          distanceKm: Number(p.distanceKm.toFixed(2)),
          travelMode: "Land",
          weather: "N/A",
          cost: 300 + Math.round(p.distanceKm * 10),
        });
      });
    }

    console.log(`Final itinerary length: ${itinerary.length}`);

    // Build response
    const totalCost = itinerary.reduce((s, it) => s + (it.cost || 0), 0);
    const startDateStr = new Date().toDateString();
    const endDateStr = new Date(Date.now() + itinerary.length * 86400000).toDateString();

    const levelsOut = {
      level1: level1.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, dist: Number(p.distanceKm.toFixed(2)) })),
      level2: level2.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, dist: Number(p.distanceKm.toFixed(2)) })),
      level3: level3.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, dist: Number(p.distanceKm.toFixed(2)) })),
    };

    // respond
    return res.json({
      success: true,
      startPlace: startPlace || "Current Location",
      startCoords: { lat, lon },
      totalDays: itinerary.length,
      days: itinerary.length,
      totalCost,
      startDate: startDateStr,
      endDate: endDateStr,
      fastestRoute: "Land/ Road travel",
      levels: levelsOut,
      itinerary,
    });
  } catch (err) {
    console.error("Realtime Planner Error:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({
      success: false,
      message: "Realtime trip planner failed",
      error: err.message || String(err),
    });
  }
}

/* ---------- Endpoint: realtime planner (replaces Gemini) ---------- */
app.post("/api/plan-trip", handleTripPlan);

/* ---------- Keep old endpoint for backward compatibility ---------- */
app.post("/api/plan", handleTripPlan);

/* ---------- Fallback: simple ping route ---------- */
app.get("/ping", (req, res) => res.json({ ok: true }));

/* ---------- Start Server ---------- */
app.listen(PORT, () => {
  console.log(`✅ SmartKarnataka server running at http://localhost:${PORT}`);
  console.log(`Cache TTL (sec): ${CACHE_TTL}`);
});
