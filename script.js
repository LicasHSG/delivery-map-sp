let currentDay = null;
let currentColor = null;
let addressMarker = null; 
const dayColors = {'Segunda':'#d9534f','Terça':'#5cb85c','Quarta':'#428bca','Quinta':'#f0ad4e','Sexta':'#9b59b6'};
const SP_VIEWBOX = "-47.20,-24.10,-45.70,-23.20";

// Inicialização do Mapa
var map = L.map('map').setView([-23.5505, -46.6333], 11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
var drawnItems = new L.FeatureGroup().addTo(map);

function autoSave() {
    let out = {};
    drawnItems.eachLayer(l => {
        if(!out[l.day]) out[l.day] = [];
        out[l.day].push({ nome: l.bairro, preco: l.preco, geojson: l.rawGeoJSON });
    });
    localStorage.setItem('mapa_entregas_sp_v4', JSON.stringify(out));
    const status = document.getElementById('save-status');
    status.style.display = 'block';
    setTimeout(() => { status.style.display = 'none'; }, 2000);
}

function loadSavedData() {
    let data = JSON.parse(localStorage.getItem('mapa_entregas_sp_v4'));
    if(data) {
        for(let d in data) {
            data[d].forEach(i => renderBairro(i.geojson, i.nome, d, dayColors[d], i.preco, false));
        }
    }
}

function exportData() {
    const data = localStorage.getItem('mapa_entregas_sp_v4');
    if(!data || data === "{}") return alert("Não há dados.");
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_entregas.json`;
    a.click();
}

function importData(event) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            drawnItems.clearLayers();
            for(let d in imported) {
                imported[d].forEach(i => renderBairro(i.geojson, i.nome, d, dayColors[d], i.preco, false));
            }
            autoSave();
        } catch(err) { alert("Erro no arquivo."); }
    };
    reader.readAsText(event.target.files[0]);
}

function selectDay(day, color, btn) {
    currentDay = day; currentColor = color;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('display-day').innerText = day;
    document.getElementById('display-day').style.color = color;
    document.getElementById('config-container').style.display = 'block';
}

async function searchBairro() {
    let q = document.getElementById('bairro-input').value;
    let p = document.getElementById('preco-input').value || "0.00";
    if(!q) return;
    try {
        let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&viewbox=${SP_VIEWBOX}&bounded=1&countrycodes=br&format=json&polygon_geojson=1&limit=1`;
        let resp = await fetch(url);
        let data = await resp.json();
        if(data.length > 0) {
            renderBairro(data[0].geojson, data[0].display_name.split(',')[0], currentDay, currentColor, parseFloat(p).toFixed(2), true);
            document.getElementById('bairro-input').value = "";
            document.getElementById('preco-input').value = "";
        }
    } catch (e) { console.error(e); }
}

function renderBairro(geoData, nome, dia, cor, preco, shouldSave) {
    let layer = L.geoJSON(geoData, { style: { color: cor, fillColor: cor, fillOpacity: 0.5, weight: 2 } });
    layer.eachLayer(l => {
        l.day = dia; l.bairro = nome; l.preco = preco; l.rawGeoJSON = geoData;
        l.bindTooltip(`${nome} (${dia})<br><span class="preco-tag">Taxa: R$ ${preco.replace('.',',')}</span>`, { permanent: true, direction: "center", className: 'bairro-tooltip' });
        l.on('click', () => { if(confirm(`Remover?`)) { drawnItems.removeLayer(l); autoSave(); } });
        drawnItems.addLayer(l);
    });
    if(shouldSave) { map.fitBounds(layer.getBounds()); autoSave(); }
}

async function checkAddress() {
    let addr = document.getElementById('check-address').value;
    if(!addr) return;
    try {
        let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&viewbox=${SP_VIEWBOX}&bounded=1&countrycodes=br&format=json&limit=1`;
        let resp = await fetch(url);
        let data = await resp.json();
        if(data.length > 0) {
            if(addressMarker) map.removeLayer(addressMarker);
            addressMarker = L.marker([data[0].lat, data[0].lon]).addTo(map).bindPopup(data[0].display_name).openPopup();
            map.setView([data[0].lat, data[0].lon], 15);
        }
    } catch (e) { alert("Erro."); }
}

function clearAll() {
    if(confirm("Apagar tudo?")) { drawnItems.clearLayers(); localStorage.removeItem('mapa_entregas_sp_v4'); }
}

// Carregar dados ao iniciar
loadSavedData();