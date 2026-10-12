/* Maps (Leaflet + OpenStreetMap tiles; Leaflet is loaded from a CDN in index.html as the global L). */
import { html } from '../lib/html.js';

export const DEFAULT_CENTER = [30.2672, -97.7431]; // Austin, TX
export const RADII = [5, 10, 25, 50];
const maps = {}; // element id -> { map, layer }

export const mapBox = (id, cls) => html`<div class="map ${cls || ''}" id="${id}" role="region" aria-label="Map"></div>`;
const pinIcon = kind => window.L.divIcon({ className: 'pin ' + (kind || ''), html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 24], popupAnchor: [0, -22] });

export function createMap(id, center, zoom) {
  const el = document.getElementById(id); if (!el) return null;
  if (!window.L) { el.innerHTML = '<p class="map-off">The map could not load. Check your internet connection.</p>'; return null; }
  if (maps[id]) maps[id].map.remove();
  const map = window.L.map(el, { scrollWheelZoom: false }).setView(center || DEFAULT_CENTER, zoom || 10);
  window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
  maps[id] = { map, layer: window.L.layerGroup().addTo(map) };
  return maps[id];
}

/* Replaces a map's markers. markers: [{ at: [lat, lon], popup: html`...`, kind }]; circle: { at, miles } or null.
   Zooms to fit the radius circle, or else all markers. */
export function setMarkers(id, markers, circle) {
  const m = maps[id]; if (!m) return;
  m.layer.clearLayers();
  const points = [];
  if (circle && circle.at) {
    const c = window.L.circle(circle.at, { radius: circle.miles * 1609.34, className: 'radius', weight: 1.5, fillOpacity: 0.06 }).addTo(m.layer);
    window.L.marker(circle.at, { icon: pinIcon('me'), title: 'You', keyboard: false }).addTo(m.layer);
    m.map.fitBounds(c.getBounds(), { padding: [10, 10] });
  }
  for (const mk of markers) if (mk.at) { window.L.marker(mk.at, { icon: pinIcon(mk.kind) }).bindPopup(String(mk.popup)).addTo(m.layer); points.push(mk.at); }
  if (!(circle && circle.at) && points.length) m.map.fitBounds(points, { padding: [30, 30], maxZoom: 13 });
}
