let API_BASE_URL = prompt("Enter the API base URL:", "http://localhost:8000") || "http://localhost:8000";
let API_KEY = prompt("Enter the API key:", "your-secret-phrase-here") || "your-secret-phrase-here";

// Wait for DOM (doc obj model) to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // real-world location for the map background
	// this will be the center of the nfz e.g hive campus 
    const realWorldCenter = [60.1808, 24.9582];
    
    // Initialize the map with standard geographical
    const map = L.map('map', {
        center: realWorldCenter,
        zoom: 14, // Good zoom level for details
        minZoom: 10,
        maxZoom: 18,
        attributionControl: true,
        zoomControl: true,
        doubleClickZoom: true,
        scrollWheelZoom: true,
        boxZoom: true,
        keyboard: true,
        dragging: true,
        touchZoom: true,
        zoomAnimation: true,
        fadeAnimation: true
    });

    // Dark mode toggle
    const darkModeButton = document.getElementById('dark-mode-toggle');
    
    darkModeButton.addEventListener('click', function() {
        document.body.classList.toggle('dark-mode');
    
        // save preference
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('darkMode', 'enabled');
            darkModeButton.textContent = '☀️ Light Mode';
        } else {
            localStorage.setItem('darkMode', 'disabled');
            darkModeButton.textContent = '🌙 Dark Mode';
        }
    });

    // On page load, set dark mode if previously enabled
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
        darkModeButton.textContent = '☀️ Light Mode';
    }

    // Add OpenStreetMap tile layer as the background
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);

    // sattelite imagery layer (because its cool)
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri'
    });
    
    // Layer control to switch between map types
    const baseMaps = {
        "Street Map": osmLayer,
        "Satellite": satelliteLayer
    };
    L.control.layers(baseMaps).addTo(map);

    // Define the NFZ center in real-world coordinates
    const nfzCenter = [realWorldCenter[0], realWorldCenter[1]];

    // Conversion factor: 1 simulation unit = X meters in real world
    const simulationScale = 1; // 1 simulation unit = 1 meter
    const nfzRadiusMeters = 1000 * simulationScale; // 1000 simulation units = 1000 meters right
    
    // Set initial view , 14 because this is a good zoom level for details
    map.setView(realWorldCenter, 14);
    
    // map globally accessible for background script
    window.droneMap = map;
    window.realWorldCenter = realWorldCenter;
    window.nfzCenter = nfzCenter;
    window.simulationScale = simulationScale;
    
	// background image 
    // const mapOverlay = L.imageOverlay('background-image.jpg', simulationBounds).addTo(map);

	// Draw the No-Fly Zone (a 1000-meter radius circle) on the real map
	const nfz = L.circle(nfzCenter, {
		radius: nfzRadiusMeters,
		color: 'black',
		weight: 2,
		fillColor: '#f03',
		fillOpacity: 0.25,
		dashArray: '5, 10'
	}).addTo(map);
	
	// Make the circle spin by animating the dashOffset
	// the function access an SVG path element stored in nfz.path (nfz is on obj containing svg elements) 
	// and updates the strokedashOffset
	let dashOffset = 0;
	function animateCircle() {
		dashOffset -= 0.5;
		// Access the SVG path element and update its dashOffset
		const circlePath = nfz._path;
		if (circlePath) {
			circlePath.style.strokeDashoffset = dashOffset;
		}
		requestAnimationFrame(animateCircle);
	}
	
	// Start the animation
	animateCircle();
    
	// // Add a text-only label for the NFZ
	// L.marker(nfzCenter, {
	// 	icon: L.divIcon({
	// 		html: '',
	// 		className: 'nfz-text-label',
	// 		iconSize: [40, 20],
	// 		iconAnchor: [20, 10]
	// 	})
	// }).addTo(map);

    let droneMarkers = {}; // To keep track of drone markers on the map

    
    // Function to fetch and display drones using the FastAPI endpoint /drones . . 
    async function updateDrones() {
        try {
            document.getElementById('drone-status').textContent = 'Refreshing drone data...';

            const response = await fetch(`${API_BASE_URL}/drones`);
            // const response = await fetch('http://192.168.1.69:8000/drones');
            if (!response.ok) 
				throw new Error(`HTTP error ${response.status}`);
             
			const drones = await response.json();

            // Update last fetch time
            document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
            document.getElementById('drone-count').textContent = drones.length;
            document.getElementById('drone-status').textContent = 'Drone data loaded successfully';
            
            // Track which drones are still active
            const activeDrones = new Set();
            
			// Loop through drones and update their markers
			drones.forEach(drone => {
				// Convert simulation coordinates to real-world coordinates
				// Simulation uses meters, so we convert to lat/lng offset
				// accounting got the longitute being different at the diffrent lat, formula: 
				// 1 degree of latitude = 111,320 units 
				// 1 degree of longitude = 111,320 * cos(latitude) units
				const metersToLatDeg = 1 / 111320; // Approximate conversion
				const metersToLngDeg = 1 / (111320 * Math.cos(realWorldCenter[0] * Math.PI / 180));
				
				// Convert drone position from simulation coordinates to real-world coordinates
				const lat = realWorldCenter[0] + (drone.y * simulationScale * metersToLatDeg);
				const lng = realWorldCenter[1] + (drone.x * simulationScale * metersToLngDeg);
				const position = [lat, lng];
				
				// Calculate distance from NFZ center (0, 0) in simulation coordinates
				const distance = Math.sqrt(
					Math.pow(drone.x - 0, 2) + 
					Math.pow(drone.y - 0, 2)
				);
				
				const color = distance <= 1000 ? 'red' : 'green';
				activeDrones.add(drone.id);

				// a marker is a drone icon with a short ID 
				// we check if the marker is already there
				if (droneMarkers[drone.id]) {
					// If marker exists, update its position
					droneMarkers[drone.id].setLatLng(position);
					
					// Update the icon color and ID
					// const shortId = drone.id.toString().slice(-3);
					const ownerIdDisplay = String(drone.owner_id).padStart(2, '0');
					const updatedIcon = L.divIcon({
						html: `<div class="drone-icon" style="background-color: ${color};">${ownerIdDisplay}</div>`,
						className: 'drone-marker',
						iconSize: [15, 15]
					});
					droneMarkers[drone.id].setIcon(updatedIcon);
					
					// Update popup content
					droneMarkers[drone.id].setPopupContent(`
						<div class="drone-popup">
							<div class="drone-id">Drone ID: ${drone.id}</div>
							<div class="drone-position">Position: [${drone.x.toFixed(0)}, ${drone.y.toFixed(0)}]</div>
							<div class="drone-altitude">Altitude: ${drone.z || 0} units</div>
							<div class="drone-status">Status: ${color === 'red' ? 'IN VIOLATION' : 'OK'}</div>
						</div>
					`);
                } else {
                    // Otherwise, create a new marker with drone icon - Use shorter ID for cleaner display
                    // const shortId = drone.id.toString().slice(-2);
					const ownerIdDisplay = String(drone.owner_id).padStart(2, '0');
                    const droneIcon = L.divIcon({
                        html: `<div class="drone-icon" style="background-color: ${color};">${ownerIdDisplay}</div>`,
                        className: 'drone-marker',
                        iconSize: [15, 15]
                    });
                    
					// Create a new marker and add it to the map
                    droneMarkers[drone.id] = L.marker(position, { 
                        icon: droneIcon,
                        zIndexOffset: 1000 // Ensure drones are on top of the NFZ circle
                    })
					.bindPopup(`
						<div class="drone-popup">
							<div class="drone-id">Drone ID: ${drone.id}</div>
							<div class="drone-owner">Owner: ${drone.first_name || 'Unknown'}</div>
							<div class="drone-position">Position: [${drone.x.toFixed(0)}, ${drone.y.toFixed(0)}]</div>
							<div class="drone-altitude">Altitude: ${drone.z || 0} units</div>
							<div class="drone-status">Status: ${color === 'red' ? 'IN VIOLATION' : 'OK'}</div>
						</div>
					`)
                    .addTo(map);
                }
            });
            
            // Remove markers for drones that are no longer present
            Object.keys(droneMarkers).forEach(id => {
                if (!activeDrones.has(id)) {
                    map.removeLayer(droneMarkers[id]);
                    delete droneMarkers[id];
                }
            });
            
            // Real map - can zoom and pan to see drones better
        } catch (error) {
            console.error("Failed to fetch drones:", error);
            document.getElementById('drone-status').textContent = `Error: ${error.message}`;
        }
    }

    // Update the drone positions every 5 seconds
    updateDrones(); // Initial call
	const droneUpdateInterval = setInterval(updateDrones, 5000); 


    // Function to fetch and display violations
    async function updateViolations() {
        try {
            document.getElementById('violation-status').textContent = 'Fetching violations...';
            const violationsList = document.getElementById('violations-list');
            
            // IMPORTANT: Fixed header format for X-Secret
			const headers = {
				'X-Secret': API_KEY,
			};

            const response = await fetch(`${API_BASE_URL}/nfz`, { headers });

			console.log('Sending request to:', `${API_BASE_URL}/nfz`);
			console.log('With headers:', headers);
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }

            const violations = await response.json();
            
            // Update status
            document.getElementById('violation-status').textContent = 'Violations loaded successfully';
            document.getElementById('violation-count').textContent = violations.length;
            
            // Clear the list before adding new items, drone violations are avaible only 24 hours
            violationsList.innerHTML = ''; 

            if (violations.length === 0) {
                const listItem = document.createElement('li');
                listItem.textContent = 'No violations detected';
                listItem.className = 'no-violations';
                violationsList.appendChild(listItem);
                return;
            }

            // show newest first
            const sortedViolations = violations.reverse();

            sortedViolations.forEach(v => {
                const listItem = document.createElement('li');
                const timestamp = new Date(v.timestamp).toLocaleString();
                
                // Create structured violation item
                const html = `
                    <div class="violation-item">
                        <div class="violation-time">${timestamp}</div>
                        <div class="violation-owner">${v.id} ${v.owner_first_name} ${v.owner_last_name}</div>
                        <div class="violation-contact">
                            <span class="label">Phone:</span> ${v.owner_phone} <br>
							<span class="label">ssn:</span> ${v.owner_ssn}
                        </div>
                        <div class="violation-details">
                            <span class="label">Drone ID:</span> ${v.drone_id}
                            <span class="label">Position:</span> [${v.position_x.toFixed(2)}, ${v.position_y.toFixed(2)}] <br>
							<span class="label">Altitude:</span> ${v.position_z || 0} units
                        </div>
                    </div>
                `;
                
                listItem.innerHTML = html;
                violationsList.appendChild(listItem);
            });
        } catch (error) {
            console.error("Failed to fetch violations:", error);
            document.getElementById('violation-status').textContent = `Error: ${error.message}`;
            const violationsList = document.getElementById('violations-list');
            violationsList.innerHTML = '<li class="error">Could not fetch violations. Is the secret key correct?</li>';
        }
    }

    // Update the violations every 5 seconds
    const violationUpdateInterval = setInterval(updateViolations, 5000);
    updateViolations(); // Initial call

    // Add event listeners for manual refresh buttons
    document.getElementById('refresh-drones').addEventListener('click', function() {
        updateDrones();
    });
    document.getElementById('refresh-violations').addEventListener('click', updateViolations);
});


// Health check functionality
async function checkAPIHealth() {
    const statusElement = document.getElementById('api-status');
    const button = document.getElementById('health-check');
    
    try {
        // Disable button during check
        button.disabled = true;
        button.innerHTML = '<span class="icon">⏳</span> Checking...';
        
        const response = await fetch(`${API_BASE_URL}/health`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            // Add timeout
            signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        if (response.ok) {
            const healthData = await response.json();
            statusElement.textContent = '🟢 API Online';
            statusElement.className = 'api-status online';
            console.log('API Health:', healthData);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        statusElement.textContent = '🔴 API Offline';
        statusElement.className = 'api-status offline';
        console.error('API Health Check Failed:', error.message);
    } finally {
        // Re-enable button
        button.disabled = false;
        button.innerHTML = '<span class="icon">🏥</span> API Health';
    }
}

// Add event listener for health check button
document.getElementById('health-check').addEventListener('click', checkAPIHealth);

// Automatic health check on page load
document.addEventListener('DOMContentLoaded', function() {
    // ...existing code...
    
    // Check API health on startup
    setTimeout(checkAPIHealth, 1000);
    
    // Check health every 30 seconds automatically
    setInterval(checkAPIHealth, 30000);
});
