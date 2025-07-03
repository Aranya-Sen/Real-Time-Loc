const socketio = io();

// Get API key from server
let apiKey = null;
fetch('/api/config')
    .then(response => response.json())
    .then(config => {
        apiKey = config.openRouteApiKey;
    })
    .catch(error => {
        console.error('Failed to load API key:', error);
    });

if(navigator.geolocation){
    navigator.geolocation.watchPosition((position) => {
        const { latitude, longitude } = position.coords;
        socketio.emit("send-location", {
            latitude,
            longitude
        });
    },
    (error) => {
        console.error("Error sending location:", error);
    },
    {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
    }
);
};

const map = L.map("map").setView([0,0], 16);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "OpenStreetMap"
}).addTo(map);

const markers = {};
const userLocations = {};
let routeLines = [];

// Function to get route between two points using OpenRouteService
async function getRoute(start, end) {
    if (!apiKey) {
        console.log('API key not loaded, using straight line route');
        return [[start.longitude, start.latitude], [end.longitude, end.latitude]];
    }
    
    try {
        const response = await fetch(`https://api.openrouteservice.org/v2/directions/driving-car?start=${start.longitude},${start.latitude}&end=${end.longitude},${end.latitude}`, {
            headers: {
                'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
                'Authorization': apiKey
            }
        });
        
        if (!response.ok) throw new Error('Route service unavailable');
        
        const data = await response.json();
        return data.features[0].geometry.coordinates;
    } catch (error) {
        console.log('Using straight line route:', error.message);
        // Fallback to straight line if routing service fails
        return [[start.longitude, start.latitude], [end.longitude, end.latitude]];
    }
}

// Function to update routes between all markers
async function updateRoutes() {
    const locations = Object.values(userLocations);
    const locationIds = Object.keys(userLocations);
    
    // Clear existing routes
    routeLines.forEach(line => map.removeLayer(line));
    routeLines = [];
    
    if (locations.length > 1) {
        // Create routes between all pairs of markers
        for (let i = 0; i < locations.length; i++) {
            for (let j = i + 1; j < locations.length; j++) {
                const start = locations[i];
                const end = locations[j];
                
                try {
                    // Get route coordinates
                    const routeCoords = await getRoute(start, end);
                    
                    // Convert coordinates to Leaflet format [lat, lng]
                    const latLngCoords = routeCoords.map(coord => [coord[1], coord[0]]);
                    
                    // Create route line
                    const routeLine = L.polyline(latLngCoords, {
                        color: '#3388ff',
                        weight: 4,
                        opacity: 0.8
                    }).addTo(map);
                    
                    routeLines.push(routeLine);
                    
                    // Calculate distance
                    const distance = calculateDistance(
                        start.latitude, start.longitude,
                        end.latitude, end.longitude
                    );
                    
                    // Add distance label
                    const midLat = (start.latitude + end.latitude) / 2;
                    const midLng = (start.longitude + end.longitude) / 2;
                    
                    const distanceMarker = L.marker([midLat, midLng], {
                        icon: L.divIcon({
                            html: `<div style="background: rgba(51, 136, 255, 0.9); color: white; padding: 3px 8px; border-radius: 15px; font-size: 11px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${distance.toFixed(1)} km</div>`,
                            className: 'distance-marker',
                            iconSize: [60, 20],
                            iconAnchor: [30, 10]
                        })
                    }).addTo(map);
                    
                    routeLines.push(distanceMarker);
                } catch (error) {
                    console.error('Error creating route:', error);
                }
            }
        }
        
        // Fit map to show all markers and routes
        if (locations.length > 1) {
            const group = new L.featureGroup([...Object.values(markers), ...routeLines]);
            map.fitBounds(group.getBounds().pad(0.1));
        }
    }
}

// Function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

socketio.on("receive-location", (data) => {
    const { id, latitude, longitude } = data;
    
    // Store user location
    userLocations[id] = { latitude, longitude };
    
    // Update or create marker
    if(markers[id]){
        markers[id].setLatLng([latitude, longitude]);
    } else {
        const userNumber = Object.keys(markers).length + 1;
        markers[id] = L.marker([latitude, longitude], {
            icon: L.divIcon({
                html: `<div style="background: #ff4444; color: white; padding: 6px; border-radius: 50%; font-size: 14px; font-weight: bold; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${userNumber}</div>`,
                className: 'user-marker',
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        }).addTo(map);
        
        markers[id].bindPopup(`
            <div style="text-align: center;">
                <strong>User ${userNumber}</strong><br>
                <small>ID: ${id.substring(0, 8)}...</small>
            </div>
        `);
    }
    
    // Update routes with slight delay to avoid too frequent updates
    clearTimeout(window.routeUpdateTimeout);
    window.routeUpdateTimeout = setTimeout(updateRoutes, 1000);
    
    // Center map on first location
    if (Object.keys(userLocations).length === 1) {
        map.setView([latitude, longitude], 16);
    }
});

socketio.on("user-disconnected", (id) => {
    if(markers[id]){
        map.removeLayer(markers[id]);
        delete markers[id];
        delete userLocations[id];
        
        // Update routes after user disconnects
        updateRoutes();
    }
});
