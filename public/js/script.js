const socketio = io();

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

const markers = {}; // Changed from 'marker' to 'markers'

socketio.on("receive-location", (data) => {
    const { id, latitude, longitude } = data;
    map.setView([latitude, longitude]);
    
    if(markers[id]){ // Changed from 'marker' to 'markers'
        markers[id].setLatLng([latitude, longitude]);
    }
    else{
        markers[id] = L.marker([latitude, longitude]).addTo(map); // Changed from 'marker' to 'markers'
    }
});

socketio.on("user-disconnected", (id) => {
    if(markers[id]){ // Changed from 'marker' to 'markers'
        map.removeLayer(markers[id]); // Changed from 'marker' to 'markers'
        delete markers[id]; // Changed from 'marker' to 'markers'
    }
});