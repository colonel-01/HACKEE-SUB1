// -------------------------
// INITIALIZE ON DOM READY
// -------------------------
let map;
let mapInitialized = false;

document.addEventListener("DOMContentLoaded", () => {
  // Set up VR modal close button
  const closeVRBtn = document.getElementById("closeVR");
  if (closeVRBtn) {
    closeVRBtn.addEventListener("click", closeVRModal);
  }
  
  // Close modal when clicking outside
  const vrModal = document.getElementById("vrModal");
  if (vrModal) {
    vrModal.addEventListener("click", (e) => {
      if (e.target.id === "vrModal") {
        closeVRModal();
      }
    });
  }

  // Load places automatically
  loadPlaces();
});

// Make initMap available globally for Google Maps callback
window.initMap = function() {
  if (mapInitialized) return; // Prevent double initialization
  
  const karnataka = { lat: 12.9716, lng: 77.5946 };

  map = new google.maps.Map(document.getElementById("map"), {
    center: karnataka,
    zoom: 7,
    mapTypeControl: true,
    streetViewControl: true,
    fullscreenControl: true,
  });

  mapInitialized = true;
  
  // Update markers after map is initialized
  if (window.placesData) {
    updateMapMarkers(window.placesData);
  }
};

// Close VR modal function
function closeVRModal() {
  const vrModal = document.getElementById("vrModal");
  if (vrModal) {
    vrModal.classList.remove("show");
    vrModal.classList.add("hidden");
    // Restore body scroll
    document.body.style.overflow = "";
  }
}

// Close modal with Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const vrModal = document.getElementById("vrModal");
    if (vrModal && vrModal.classList.contains("show")) {
      closeVRModal();
    }
  }
});

// Load places automatically on page load
function loadPlaces() {
  const itineraryContainer = document.getElementById("itinerary");
  
  const places = [
    {
      name: "Mysore Palace",
      description: "A stunning royal residence with Indo-Saracenic architecture, one of the most magnificent palaces in India.",
      lat: 12.305163,
      lng: 76.655208,
      streetView: "https://www.google.com/maps/embed?pb=!4v1699538888888!6m8!1m7!1sCAoSLEFGMVFpcE1iR1FBZk1qQ1pKTm8zWElqVVpqQmVibVlDZm1VN1RkQkNNcGdu!2m2!1d12.305163!2d76.655208!3f0!4f0!5f0.7820865974627469",
      panoId: "CAoSLEFGMVFpcE1iR1FBZk1qQ1pKTm8zWElqVVpqQmVibVlDZm1VN1RkQkNNcGdu"
    },
    {
      name: "Coorg Hills",
      description: "Lush green hills and coffee plantations — a nature lover's paradise with breathtaking landscapes.",
      lat: 12.4208,
      lng: 75.7397,
      streetView: "https://www.google.com/maps/embed?pb=!4v1699538777777!6m8!1m7!1sCAoSLEFGMVFpcE5MQm90QlB6NmlnUWx4MGVka2VwUDFhQ2lZb2YxSVl5NGVrNUtM!2m2!1d12.4208!2d75.7397!3f0!4f0!5f0.7820865974627469",
      panoId: "CAoSLEFGMVFpcE5MQm90QlB6NmlnUWx4MGVka2VwUDFhQ2lZb2YxSVl5NGVrNUtM"
    },
    {
      name: "Hampi Temples",
      description: "UNESCO World Heritage site showcasing Vijayanagara empire ruins with ancient temples and structures.",
      lat: 15.335,
      lng: 76.46,
      streetView: "https://www.google.com/maps/embed?pb=!4v1699538666666!6m8!1m7!1sCAoSLEFGMVFpcE5hMV8zTVZ4NjZqakgxZ1pHdk9nSmxNTE1pZXp1VjZzc1Z6MmtP!2m2!1d15.335!2d76.46!3f0!4f0!5f0.7820865974627469",
      panoId: "CAoSLEFGMVFpcE5hMV8zTVZ4NjZqakgxZ1pHdk9nSmxNTE1pZXp1VjZzc1Z6MmtP"
    },
    {
      name: "Jog Falls",
      description: "India's second highest plunge waterfall, a spectacular natural wonder surrounded by lush forests.",
      lat: 14.2294,
      lng: 74.8125,
      streetView: "",
      panoId: ""
    },
    {
      name: "Badami Caves",
      description: "Ancient rock-cut cave temples from the 6th century, showcasing Chalukya architecture and sculptures.",
      lat: 15.9175,
      lng: 75.6817,
      streetView: "",
      panoId: ""
    },
    {
      name: "Gokarna Beach",
      description: "A pristine beach town with golden sands and clear blue waters, perfect for relaxation and spirituality.",
      lat: 14.5458,
      lng: 74.3167,
      streetView: "",
      panoId: ""
    }
  ];

  // Store places data globally for map markers
  window.placesData = places;

  // Clear container
  itineraryContainer.innerHTML = "";

  // Create place cards
  places.forEach(place => {
    const card = document.createElement("div");
    card.className = "place-card";
    card.innerHTML = `
      <h3>${place.name}</h3>
      <p>${place.description}</p>
      <button class="viewVRBtn">View in VR</button>
    `;
    
    // Add click event for VR button
    const vrBtn = card.querySelector(".viewVRBtn");
    vrBtn.addEventListener("click", () => openVR(place));
    
    itineraryContainer.appendChild(card);
  });

  // Update map markers after places are loaded
  if (mapInitialized && map) {
    updateMapMarkers(places);
  } else if (typeof google !== 'undefined' && google.maps && !mapInitialized) {
    // Wait for Google Maps to load
    window.initMap = initMap;
  }
}

// Open VR modal
function openVR(place) {
  const vrModal = document.getElementById("vrModal");
  const vrContainer = document.getElementById("vrContainer");
  const vrTitle = document.getElementById("vrTitle");
  
  vrTitle.textContent = `${place.name} — 360° Preview`;
  vrContainer.innerHTML = "";

  // Remove hidden class and add show class
  vrModal.classList.remove("hidden");
  vrModal.classList.add("show");

  // Prevent body scroll when modal is open
  document.body.style.overflow = "hidden";

  // Get coordinates for the place
  const coordinates = place.lat && place.lng ? { lat: place.lat, lng: place.lng, panoId: place.panoId } : null;
  
  if (coordinates && place.streetView && place.streetView.includes('google.com/maps')) {
    // Use provided Street View URL
    const iframe = document.createElement("iframe");
    iframe.src = place.streetView;
    iframe.style.border = "none";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.display = "block";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.setAttribute("allow", "fullscreen");
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("scrolling", "no");
    
    // Add error handling
    iframe.onerror = () => {
      showVRFallback(place, coordinates);
    };
    
    vrContainer.appendChild(iframe);
  } else if (coordinates && coordinates.lat && coordinates.lng) {
    // Try to load Street View with coordinates
    showVRFallback(place, coordinates);
  } else {
    // No VR available
    vrContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 2rem; text-align: center;">
        <p style="color: #64748b; font-size: 1.1rem; margin-bottom: 1rem;">No VR view available for this location.</p>
        <p style="color: #94a3b8; font-size: 0.9rem;">Try searching for "${place.name}" in Google Street View</p>
      </div>
    `;
  }
}

// Show VR fallback with link to Google Street View
function showVRFallback(place, coordinates) {
  const vrContainer = document.getElementById("vrContainer");
  const streetViewUrl = `https://www.google.com/maps/@${coordinates.lat},${coordinates.lng},3a,75y,0h,90t/data=!3m6!1e1!3m4!1s${coordinates.panoId || 'auto'}!2e0!7i16384!8i8192`;
  
  vrContainer.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 2rem; text-align: center;">
      <p style="color: #64748b; font-size: 1.1rem; margin-bottom: 1rem;">Loading Street View...</p>
      <iframe 
        src="https://www.google.com/maps/embed?pb=!1m0!3m2!1sen!2sus!4v${Date.now()}!5m2!1sen!2sus!6m8!1m7!1s${coordinates.panoId || 'auto'}!2m2!1d${coordinates.lat}!2d${coordinates.lng}!3f0!4f0!5f0.7820865974627469" 
        width="100%" 
        height="100%" 
        style="border:0; border-radius: 8px;" 
        allowfullscreen="" 
        loading="lazy" 
        referrerpolicy="no-referrer-when-downgrade">
      </iframe>
      <a href="${streetViewUrl}" 
         target="_blank" 
         style="color: #2563eb; text-decoration: none; font-weight: 600; margin-top: 1rem; display: block;">
        Open in Google Street View →
      </a>
    </div>
  `;
}

// -------------------------
// GOOGLE MAPS INITIALIZATION
// -------------------------
// initMap is defined above in the DOMContentLoaded section

function updateMapMarkers(places) {
  // Clear existing markers if any
  if (window.markers) {
    window.markers.forEach(marker => marker.setMap(null));
  }
  
  window.markers = [];
  
  places.forEach(place => {
    if (place.lat && place.lng) {
      const marker = new google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map: map,
        title: place.name,
        animation: google.maps.Animation.DROP,
      });
      
      // Add info window
      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="padding: 10px;"><h3 style="margin: 0 0 5px 0; color: #2563eb;">${place.name}</h3><p style="margin: 0; color: #64748b;">${place.description}</p></div>`
      });
      
      marker.addListener("click", () => {
        infoWindow.open(map, marker);
      });
      
      window.markers.push(marker);
    }
  });
}
