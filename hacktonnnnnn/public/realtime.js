// realtime.js (complete)

let map = L.map('map').setView([12.9716,77.5946], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const useLocationBtn = document.getElementById('useLocation');
const latIn = document.getElementById('lat');
const lonIn = document.getElementById('lon');
const startDateIn = document.getElementById('startDate');
const daysIn = document.getElementById('days');
const budgetIn = document.getElementById('budget');
const kindsIn = document.getElementById('kinds');
const goBtn = document.getElementById('go');
const summary = document.getElementById('summary');

useLocationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) return alert('Geolocation not supported');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    latIn.value = latitude.toFixed(6);
    lonIn.value = longitude.toFixed(6);
    map.setView([latitude, longitude], 11);
  }, err => alert('Failed to get location: ' + (err.message || err)));
});

let currentLayerGroup = L.layerGroup().addTo(map);
let routePolyline = null;
let travelerMarker = null;
let animationHandle = null;

goBtn.addEventListener('click', async () => {
  const lat = parseFloat(latIn.value) || 12.9716;
  const lon = parseFloat(lonIn.value) || 77.5946;
  const startDate = startDateIn.value || new Date().toISOString().slice(0,10);
  const days = parseInt(daysIn.value) || 3;
  const budget = parseInt(budgetIn.value) || 10000;
  const kinds = kindsIn.value || '';

  summary.innerHTML = 'Fetching nearby places...';
  currentLayerGroup.clearLayers();
  if (routePolyline) { map.removeLayer(routePolyline); routePolyline = null; }
  if (travelerMarker) { map.removeLayer(travelerMarker); travelerMarker = null; }
  if (animationHandle) { clearInterval(animationHandle); animationHandle = null; }

  try {
    const resp = await fetch('/api/plan-trip-realtime', {

      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon, startDate, days, budget, preferredKinds: kinds })
    });
    const data = await resp.json();

    if (!data || !data.success) {
      summary.innerHTML = '<span style="color:crimson">Failed to create plan. Try again.</span>';
      return;
    }

    // Show summary
    summary.innerHTML = `
      <strong>Start:</strong> ${lat.toFixed(4)}, ${lon.toFixed(4)} &nbsp; • &nbsp;
      <strong>Dates:</strong> ${data.startDate} → ${data.endDate} &nbsp; • &nbsp;
      <strong>Days:</strong> ${data.days} &nbsp; • &nbsp;
      <strong>Estimated Cost:</strong> ₹${data.totalCost}
    `;

    // Add start marker
    const startMarker = L.marker([data.startCoords.lat, data.startCoords.lon], { title: 'You are here' })
      .bindPopup('<b>Your location</b>').addTo(currentLayerGroup);

    // helper to create colored markers
    function mkMarker(lat, lon, title, color) {
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;"></div>`
      });
      return L.marker([lat, lon], { icon }).bindPopup(title).addTo(currentLayerGroup);
    }

    // plot levels
    const levelLists = [
      { arr: data.levels.level1 || [], color: '#2ecc71', name: 'Near (Level 1)' },
      { arr: data.levels.level2 || [], color: '#f1c40f', name: 'Mid (Level 2)' },
      { arr: data.levels.level3 || [], color: '#e74c3c', name: 'Far (Level 3)' },
    ];

    levelLists.forEach((lvl, i) => {
      const container = document.createElement('div');
      container.className = `level${i+1}`;
      const html = [
        `<strong>${lvl.name} — ${lvl.arr.length} places</strong>`,
        '<ul style="margin:6px 0 0 10px;padding:0;">',
        ...lvl.arr.slice(0,10).map(p => `<li style="font-size:13px;margin:4px 0">${p.name} — ${p.dist} km</li>`),
        '</ul>'
      ].join('');
      container.innerHTML = html;
      summary.appendChild(container);

      lvl.arr.slice(0,50).forEach(p => {
        if (p.lat && p.lon) {
          mkMarker(p.lat, p.lon, `<b>${p.name}</b><br/>${p.dist} km`, lvl.color);
        }
      });
    });

    // Draw itinerary markers (ordered)
    const itinerary = data.itinerary || [];
    const routeLatLngs = itinerary.map(it => [it.lat, it.lon]);
    itinerary.forEach((it, idx) => {
      const marker = L.marker([it.lat, it.lon], {
        title: it.name
      }).addTo(currentLayerGroup);
      marker.bindPopup(`<b>${it.day}: ${it.name}</b><br/>Distance: ${it.distanceKm} km<br/>Cost: ₹${it.cost}`);
    });

    // Draw route polyline
    if (routeLatLngs.length >= 2) {
      routePolyline = L.polyline(routeLatLngs, { color: '#2b6cb0', weight: 4, opacity: 0.9 }).addTo(map);
      map.fitBounds(routePolyline.getBounds().pad(0.2));
    } else if (routeLatLngs.length === 1) {
      map.setView(routeLatLngs[0], 11);
    }

    // Create traveler marker and animate along the polyline (simulate)
    if (routeLatLngs.length >= 1) {
      const startPos = routeLatLngs[0];
      travelerMarker = L.marker(startPos, {
        icon: L.divIcon({
          className: 'traveler-icon',
          html: `<div style="background:#0066ff;border-radius:50%;width:16px;height:16px;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
          iconSize: [20,20]
        })
      }).addTo(map).bindPopup('Traveler (simulated)');

      // Build a smooth path by interpolating between points
      function buildSteps(latlngs, stepsPerSegment = 80) {
        const steps = [];
        for (let i = 0; i < latlngs.length - 1; i++) {
          const [aLat, aLon] = latlngs[i];
          const [bLat, bLon] = latlngs[i+1];
          for (let s = 0; s < stepsPerSegment; s++) {
            const t = s / stepsPerSegment;
            const lat = aLat + (bLat - aLat) * t;
            const lon = aLon + (bLon - aLon) * t;
            steps.push([lat, lon]);
          }
        }
        // include final point
        steps.push(latlngs[latlngs.length - 1]);
        return steps;
      }

      const steps = buildSteps(routeLatLngs, 80);
      let stepIndex = 0;
      const msPerStep = 80; // speed of simulation (lower = faster)

      // Show ETA / progress in summary
      const etaDiv = document.createElement('div');
      etaDiv.style.marginTop = '8px';
      summary.appendChild(etaDiv);

      if (animationHandle) { clearInterval(animationHandle); animationHandle = null; }
      animationHandle = setInterval(() => {
        if (stepIndex >= steps.length) {
          clearInterval(animationHandle);
          animationHandle = null;
          etaDiv.innerHTML = `<b>Simulation complete.</b>`;
          travelerMarker.bindPopup('Arrived').openPopup();
          return;
        }
        const [latC, lonC] = steps[stepIndex];
        travelerMarker.setLatLng([latC, lonC]);
        // compute progress and ETA approx
        const percent = Math.round((stepIndex / steps.length) * 100);
        const remainingSteps = steps.length - stepIndex;
        const estimatedSec = Math.round((remainingSteps * msPerStep) / 1000);
        etaDiv.innerHTML = `Simulating route — ${percent}% • ETA ~ ${estimatedSec}s`;
        stepIndex++;
      }, msPerStep);
    }

  } catch (err) {
    console.error('Realtime error', err);
    summary.innerHTML = `<span style="color:crimson">Error generating plan. Try again later.</span>`;
  }
});
