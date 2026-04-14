let currentDay = null;
let currentColor = null;
let baseMarker = null;
let clientMarker = null;
let baseCoords = JSON.parse(localStorage.getItem('base_entregas_sp')) || null;

const dayColors = {'Segunda':'#d9534f','Terça':'#5cb85c','Quarta':'#428bca','Quinta':'#f0ad4e','Sexta':'#9b59b6'};
const SP_VIEWBOX = "-47.20,-24.10,-45.70,-23.20";

var map = L.map('map').setView([-23.5505, -46.6333], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

var drawnItems = new L.FeatureGroup().addTo(map);

// Configuração da Barra de Desenho
var drawControl = new L.Control.Draw({
    draw: {
        polyline: false, circle: false, circlemarker: false, marker: false, rectangle: true,
        polygon: { allowIntersection: false, shapeOptions: { color: '#333' } }
    },
    edit: { featureGroup: drawnItems }
});
map.addControl(drawControl);

// Evento de quando você termina de desenhar manualmente
map.on(L.Draw.Event.CREATED, function (event) {
    if(!currentDay) return alert("Selecione um dia antes de desenhar!");
    let layer = event.layer;
    let nome = document.getElementById('bairro-input').value || "Área Manual";
    let tipo = document.getElementById('pricing-type').value;
    let valor = document.getElementById('price-value').value || "0.00";

    renderBairro(layer.toGeoJSON(), nome, currentDay, currentColor, valor, tipo, true);
});

// Funções de Base e Distância
async function setBase() {
    let addr = document.getElementById('base-address').value;
    let data = await fetchGeocode(addr);
    if(data) {
        baseCoords = [data.lat, data.lon];
        localStorage.setItem('base_entregas_sp', JSON.stringify(baseCoords));
        updateBaseMarker();
    }
}

function updateBaseMarker() {
    if(baseMarker) map.removeLayer(baseMarker);
    if(baseCoords) {
        baseMarker = L.marker(baseCoords, { icon: L.divIcon({html: '🏠', className: 'base-icon', iconSize: [30, 30]}) }).addTo(map);
        baseMarker.bindPopup("<b>Sua Base / Loja</b>").openPopup();
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Lógica de Consulta
async function checkAddress() {
    let addr = document.getElementById('check-address').value;
    let data = await fetchGeocode(addr);
    if(!data) return alert("Endereço não encontrado.");

    let lat = data.lat, lon = data.lon;
    if(clientMarker) map.removeLayer(clientMarker);
    clientMarker = L.marker([lat, lon]).addTo(map).bindPopup("Cliente").openPopup();
    map.setView([lat, lon], 14);

    let resultText = "Fora de área mapeada";
    let dist = baseCoords ? calculateDistance(baseCoords[0], baseCoords[1], lat, lon) : 0;

    drawnItems.eachLayer(layer => {
        // Verifica se o ponto está dentro do polígono
        if (isPointInPolygon([lat, lon], layer)) {
            let taxa = layer.pricingType === 'km' ? (dist * layer.preco).toFixed(2) : layer.preco;
            resultText = `Dia: ${layer.day} | Distância: ${dist.toFixed(1)}km | Taxa: R$ ${taxa}`;
        }
    });
    document.getElementById('result-calc').innerText = resultText;
}

// Utilitários
async function fetchGeocode(q) {
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&viewbox=${SP_VIEWBOX}&bounded=1&format=json&limit=1`;
    let resp = await fetch(url);
    let d = await resp.json();
    return d.length > 0 ? d[0] : null;
}

function isPointInPolygon(point, layer) {
    let poly = layer.getLatLngs()[0];
    if(Array.isArray(poly[0])) poly = poly[0]; // Trata multi-polígonos
    let x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        let xi = poly[i].lat, yi = poly[i].lng;
        let xj = poly[j].lat, yj = poly[j].lng;
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function renderBairro(geoData, nome, dia, cor, preco, tipo, shouldSave) {
    let layer = L.geoJSON(geoData, { style: { color: cor, fillColor: cor, fillOpacity: 0.4 } });
    layer.eachLayer(l => {
        l.day = dia; l.bairro = nome; l.preco = preco; l.pricingType = tipo; l.rawGeoJSON = geoData;
        let label = tipo === 'km' ? `R$ ${preco}/km` : `R$ ${preco}`;
        l.bindTooltip(`${nome} (${dia})<br>${label}`, { permanent: true, className: 'bairro-tooltip' });
        drawnItems.addLayer(l);
    });
    if(shouldSave) autoSave();
}

// Funções de sistema (selectDay, autoSave, etc) permanecem similares às anteriores...
// [Adicione aqui as funções autoSave e loadSavedData adaptadas para salvar o 'pricingType']
