let currentDay = null;
let currentColor = null;
let baseMarker = null;
let clientMarker = null;
let baseCoords = JSON.parse(localStorage.getItem('base_entregas_sp')) || null;

const dayColors = {'Segunda':'#d9534f','Terça':'#5cb85c','Quarta':'#428bca','Quinta':'#f0ad4e','Sexta':'#9b59b6'};
const SP_VIEWBOX = "-47.20,-24.10,-45.70,-23.20";

// Inicializa o Mapa
var map = L.map('map').setView([-23.5505, -46.6333], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);

var drawnItems = new L.FeatureGroup().addTo(map);

// Configuração do Desenho
var drawControl = new L.Control.Draw({
    draw: {
        polyline: false, circle: false, circlemarker: false, marker: false,
        rectangle: true,
        polygon: { allowIntersection: false, shapeOptions: { color: '#333' } }
    },
    edit: { featureGroup: drawnItems }
});
map.addControl(drawControl);

// 1. MECÂNICA DE SELEÇÃO DE DIA
function selectDay(day, color, btn) {
    currentDay = day;
    currentColor = color;
    
    // Atualiza visual dos botões
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Mostra painel de configuração
    document.getElementById('display-day').innerText = day;
    document.getElementById('display-day').style.color = color;
    document.getElementById('config-container').style.display = 'block';
}

// 2. MECÂNICA DE DESENHO LIVRE
map.on(L.Draw.Event.CREATED, function (event) {
    if (!currentDay) {
        alert("⚠️ Selecione um dia da semana na barra lateral antes de desenhar!");
        return;
    }
    
    const layer = event.layer;
    const nome = document.getElementById('bairro-input').value || "Área Manual";
    const tipo = document.getElementById('pricing-type').value;
    const valor = document.getElementById('price-value').value || "0.00";

    renderBairro(layer.toGeoJSON(), nome, currentDay, currentColor, valor, tipo, true);
});

// 3. MECÂNICA DE BUSCA E SALVAMENTO OFICIAL
async function searchBairro() {
    if (!currentDay) return alert("Selecione um dia primeiro.");
    
    let q = document.getElementById('bairro-input').value;
    let p = document.getElementById('price-value').value || "0.00";
    let tipo = document.getElementById('pricing-type').value;
    
    if (!q) return alert("Digite o nome do bairro.");

    try {
        let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&viewbox=${SP_VIEWBOX}&bounded=1&countrycodes=br&format=json&polygon_geojson=1&limit=1`;
        let resp = await fetch(url);
        let data = await resp.json();

        if (data.length > 0 && data[0].geojson) {
            renderBairro(data[0].geojson, data[0].display_name.split(',')[0], currentDay, currentColor, p, tipo, true);
            document.getElementById('bairro-input').value = "";
        } else {
            alert("Bairro não localizado nos limites de SP.");
        }
    } catch (e) {
        alert("Erro na conexão com o servidor de mapas.");
    }
}

// 4. RENDERIZAÇÃO E PERSISTÊNCIA
function renderBairro(geoJSON, nome, dia, cor, preco, tipo, shouldSave) {
    let layer = L.geoJSON(geoJSON, {
        style: { color: cor, fillColor: cor, fillOpacity: 0.4, weight: 2 }
    });

    layer.eachLayer(l => {
        l.day = dia;
        l.bairro = nome;
        l.preco = preco;
        l.pricingType = tipo;
        l.rawGeoJSON = geoJSON;

        let label = tipo === 'km' ? `R$ ${preco}/km` : `R$ ${preco}`;
        l.bindTooltip(`<b>${nome}</b><br>${dia}<br>${label}`, { permanent: true, direction: "center" });
        
        l.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (confirm(`Remover região ${nome}?`)) {
                drawnItems.removeLayer(l);
                autoSave();
            }
        });
        drawnItems.addLayer(l);
    });

    if (shouldSave) {
        map.fitBounds(layer.getBounds());
        autoSave();
    }
}

function autoSave() {
    let out = [];
    drawnItems.eachLayer(l => {
        if (l.day) {
            out.push({
                day: l.day,
                nome: l.bairro,
                preco: l.preco,
                pricingType: l.pricingType,
                geojson: l.rawGeoJSON
            });
        }
    });
    localStorage.setItem('mapa_entregas_v5', JSON.stringify(out));
    showStatus();
}

function loadSavedData() {
    let data = JSON.parse(localStorage.getItem('mapa_entregas_v5'));
    if (data) {
        data.forEach(item => {
            renderBairro(item.geojson, item.nome, item.day, dayColors[item.day], item.preco, item.pricingType, false);
        });
    }
    updateBaseMarker();
}

// 5. BASE E CÁLCULO
async function setBase() {
    let addr = document.getElementById('base-address').value;
    if(!addr) return;
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1`;
    let resp = await fetch(url);
    let data = await resp.json();
    if(data.length > 0) {
        baseCoords = [data[0].lat, data[0].lon];
        localStorage.setItem('base_entregas_sp', JSON.stringify(baseCoords));
        updateBaseMarker();
        map.setView(baseCoords, 14);
    }
}

function updateBaseMarker() {
    if(baseMarker) map.removeLayer(baseMarker);
    if(baseCoords) {
        baseMarker = L.marker(baseCoords, { 
            icon: L.divIcon({ html: '🏠', className: 'base-icon', iconSize: [30, 30] }) 
        }).addTo(map).bindPopup("Sua Base");
    }
}

async function checkAddress() {
    let addr = document.getElementById('check-address').value;
    if(!addr) return;
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&viewbox=${SP_VIEWBOX}&bounded=1&format=json&limit=1`;
    let resp = await fetch(url);
    let data = await resp.json();
    
    if(data.length > 0) {
        let lat = data[0].lat, lon = data[0].lon;
        if(clientMarker) map.removeLayer(clientMarker);
        clientMarker = L.marker([lat, lon]).addTo(map).openPopup();
        map.setView([lat, lon], 15);

        let result = "Fora de área";
        drawnItems.eachLayer(layer => {
            if (isPointInPoly([lat, lon], layer)) {
                let dist = baseCoords ? calculateDist(baseCoords[0], baseCoords[1], lat, lon) : 0;
                let valor = layer.pricingType === 'km' ? (dist * layer.preco).toFixed(2) : layer.preco;
                result = `📍 ${layer.bairro} (${layer.day})<br>Taxa: R$ ${valor}`;
            }
        });
        document.getElementById('result-calc').innerHTML = result;
    }
}

function calculateDist(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2-lat1) * Math.PI/180;
    const dLon = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function isPointInPoly(pt, layer) {
    let poly = layer.getLatLngs()[0];
    if(Array.isArray(poly[0])) poly = poly[0];
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
    s.style.display = 'block';
    setTimeout(() => s.style.display = 'none', 2000);
}

loadSavedData();
