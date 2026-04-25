let currentDay = null;
let currentColor = null;
let baseMarker = null;
let clientMarker = null;
let baseCoords = JSON.parse(localStorage.getItem('base_entregas_sp')) || null;

const dayColors = { 'Segunda': '#d9534f', 'Terça': '#5cb85c', 'Quarta': '#428bca', 'Quinta': '#f0ad4e', 'Sexta': '#9b59b6' };
const SP_VIEWBOX = "-47.20,-24.10,-45.70,-23.20";

// Inicializa o Mapa
var map = L.map('map').setView([-23.5505, -46.6333], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);

// Grupos de Camadas
var drawnItems = new L.FeatureGroup().addTo(map);
let rangeRingsGroup = L.layerGroup().addTo(map);

// Ferramentas de Desenho
var drawControl = new L.Control.Draw({
    draw: {
        polyline: false, circle: false, circlemarker: false, marker: false,
        rectangle: true,
        polygon: { allowIntersection: false, shapeOptions: { color: '#333' } }
    },
    edit: { featureGroup: drawnItems }
});
map.addControl(drawControl);

// --- 1. FUNÇÕES DE INTERFACE ---
function selectDay(day, color, btn) {
    currentDay = day;
    currentColor = color;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('display-day').innerText = day;
    document.getElementById('display-day').style.color = color;
    document.getElementById('config-container').style.display = 'block';
}

function toggleLabels() {
    map.getContainer().classList.toggle('hide-tooltips');
}

// --- 2. FUNÇÕES DOS RAIOS INDIVIDUAIS ---
function addOneRing() {
    if (!baseCoords) {
        return alert("⚠️ Primeiro defina o endereço da Base (Ponto de Partida)!");
    }

    const input = document.getElementById('single-ring-value');
    const distKm = parseFloat(input.value);

    if (!distKm || distKm <= 0) {
        return alert("Digite um valor válido em quilômetros.");
    }

    // Desenha o Círculo
    L.circle(baseCoords, {
        radius: distKm * 1000, // Converte km para metros
        color: '#4a90e2',
        weight: 2,
        fillOpacity: 0.02,
        dashArray: '5, 10',
        interactive: false
    }).addTo(rangeRingsGroup);

    // Adiciona a Etiqueta de texto (Label) ao Norte
    const offsetLat = distKm / 111.32; 
    const labelPos = [baseCoords[0] + offsetLat, baseCoords[1]];

    L.marker(labelPos, {
        icon: L.divIcon({
            className: 'ring-label',
            html: `${distKm} km`,
            iconSize: [45, 20],
            iconAnchor: [22, 10]
        })
    }).addTo(rangeRingsGroup);

    // Limpa o input
    input.value = "";
    input.focus();
}

function clearRings() {
    if (confirm("Deseja remover todos os raios circulares?")) {
        rangeRingsGroup.clearLayers();
    }
}

// --- 3. MECÂNICA DE MAPA E SALVAMENTO DE BAIRROS ---
map.on(L.Draw.Event.CREATED, function (e) {
    if (!currentDay) return alert("⚠️ Selecione um dia antes!");
    const layer = e.layer;
    const nome = document.getElementById('bairro-input').value || "Área Manual";
    renderBairro(layer.toGeoJSON(), nome, currentDay, currentColor,
        document.getElementById('price-near').value,
        document.getElementById('price-far').value, true);
});

async function searchBairro() {
    let q = document.getElementById('bairro-input').value;
    if (!q || !currentDay) return alert("Preencha o bairro e selecione o dia.");

    try {
        let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&viewbox=${SP_VIEWBOX}&bounded=1&format=json&polygon_geojson=1&limit=1`;
        let resp = await fetch(url);
        let data = await resp.json();
        if (data.length > 0) {
            renderBairro(data[0].geojson, data[0].display_name.split(',')[0], currentDay, currentColor,
                document.getElementById('price-near').value,
                document.getElementById('price-far').value, true);
        }
    } catch (e) { alert("Erro na busca."); }
}

function renderBairro(geoJSON, nome, dia, cor, pPerto, pLonge, shouldSave) {
    let layer = L.geoJSON(geoJSON, {
        style: { color: cor, fillColor: cor, fillOpacity: 0.4, weight: 2 }
    });

    layer.eachLayer(l => {
        l.day = dia; l.bairro = nome; l.precoPerto = pPerto; l.precoLonge = pLonge; l.rawGeoJSON = geoJSON;
        l.bindTooltip(`<b>${nome}</b><br>${dia}<br>R$ ${pPerto} / ${pLonge}`, { permanent: true, direction: "center" });
        l.on('click', () => { if (confirm("Remover?")) { drawnItems.removeLayer(l); autoSave(); } });
        drawnItems.addLayer(l);
    });
    if (shouldSave) autoSave();
}

function autoSave() {
    let out = [];
    drawnItems.eachLayer(l => {
        if (l.day) out.push({ day: l.day, nome: l.bairro, precoPerto: l.precoPerto, precoLonge: l.precoLonge, geojson: l.rawGeoJSON });
    });
    localStorage.setItem('mapa_entregas_v6', JSON.stringify(out));
    showStatus();
}

function loadSavedData() {
    let data = JSON.parse(localStorage.getItem('mapa_entregas_v6'));
    if (data) data.forEach(item => renderBairro(item.geojson, item.nome, item.day, dayColors[item.day], item.precoPerto, item.precoLonge, false));
    updateBaseMarker();
}

// --- 4. BASE E CÁLCULO DE CLIENTE ---
async function setBase() {
    let addr = document.getElementById('base-address').value;
    if(!addr) return;
    let resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`);
    let data = await resp.json();
    if (data.length > 0) {
        baseCoords = [data[0].lat, data[0].lon];
        localStorage.setItem('base_entregas_sp', JSON.stringify(baseCoords));
        updateBaseMarker();
        map.setView(baseCoords, 14);
    }
}

function updateBaseMarker() {
    if (baseMarker) map.removeLayer(baseMarker);
    if (baseCoords) baseMarker = L.marker(baseCoords, { icon: L.divIcon({ html: '🏠', className: 'base-icon' }) }).addTo(map);
}

async function checkAddress() {
    let addr = document.getElementById('check-address').value;
    if(!addr) return;
    let resp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&viewbox=${SP_VIEWBOX}&bounded=1&format=json&limit=1`);
    let data = await resp.json();
    if (data.length > 0) {
        let lat = data[0].lat, lon = data[0].lon;
        if (clientMarker) map.removeLayer(clientMarker);
        clientMarker = L.marker([lat, lon]).addTo(map).openPopup();

        let result = "⚠️ Fora de área.";
        drawnItems.eachLayer(layer => {
            if (isPointInPoly([lat, lon], layer)) {
                let dist = baseCoords ? calculateDist(baseCoords[0], baseCoords[1], lat, lon) : 0;
                result = `📍 <b>${layer.bairro}</b><br>Distância da Base: ${dist.toFixed(1)}km<br>Perto: R$ ${layer.precoPerto}<br>Longe: R$ ${layer.precoLonge}`;
            }
        });
        document.getElementById('result-calc').innerHTML = result;
    }
}

// --- 5. FUNÇÕES AUXILIARES ---
function calculateDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isPointInPoly(pt, layer) {
    let poly = layer.getLatLngs()[0];
    if (Array.isArray(poly[0])) poly = poly[0];
    let x = pt[0], y = pt[1], inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        let xi = poly[i].lat, yi = poly[i].lng;
        let xj = poly[j].lat, yj = poly[j].lng;
        if (((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

function showStatus() {
    const s = document.getElementById('save-status');
    s.style.display = 'block'; setTimeout(() => s.style.display = 'none', 2000);
}

function exportData() {
    let data = localStorage.getItem('mapa_entregas_v6');
    if(!data) return alert("Nada salvo ainda.");
    let blob = new Blob([data], { type: "application/json" });
    let a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "backup_entregas.json"; a.click();
}

function clearAll() {
    if (confirm("🚨 ATENÇÃO: Isso apagará todas as regiões e a base. Continuar?")) { 
        localStorage.clear(); 
        location.reload(); 
    }
}

// Inicializa o sistema ao carregar a página
loadSavedData();
