"use strict";
var _a, _b;
proj4.defs("EPSG:9377", "+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
const toCTM = (lat, lon) => proj4("EPSG:4326", "EPSG:9377", [lon, lat]);
pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";
const NATIVE = !!((_b = (_a = window.Capacitor) == null ? void 0 : _a.isNativePlatform) == null ? void 0 : _b.call(_a));
function plug(n) {
  if (!NATIVE) return null;
  const C = window.Capacitor;
  try {
    if (typeof C.registerPlugin === "function") return C.registerPlugin(n);
  } catch (e) {
    console.warn(e);
  }
  const h = (C.PluginHeaders || []).find((x) => x.name === n);
  if (!h) return null;
  const o = {};
  for (const m of h.methods || []) {
    if (m.rtype === "callback") o[m.name] = (opts, cb) => Promise.resolve(C.nativeCallback(n, m.name, opts || {}, cb));
    else o[m.name] = (opts) => C.nativePromise(n, m.name, opts || {});
  }
  o.addListener = (ev, cb) => {
    const id = C.addListener(n, ev, cb);
    return Promise.resolve({ remove: () => C.removeListener(n, id, ev, cb) });
  };
  return o;
}
const BG = plug("BackgroundGeolocation"), FS = plug("Filesystem"), SH = plug("Share"), LN = plug("LocalNotifications"), APP = plug("App");
const $ = (id) => document.getElementById(id);
const COLORS = ["#e0392b", "#f39c12", "#f1d200", "#27ae60", "#1d64d8", "#8e44ad", "#ffffff", "#222222"];
const esc = (s) => String(s != null ? s : "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtInt = (n) => Math.round(n).toString();
const fmtDist = (m) => m < 1e3 ? `${Math.round(m)} m` : `${(m / 1e3).toFixed(2)} km`;
const fmtTime = (s) => {
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0");
};
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("pc_" + k);
      return v == null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("pc_" + k, JSON.stringify(v));
    } catch (e) {
    }
  }
};
const DB = /* @__PURE__ */ (() => {
  let dbp;
  function open() {
    if (!dbp) dbp = new Promise((res, rej) => {
      const r = indexedDB.open("plano-campo", 2);
      r.onupgradeneeded = (e) => {
        const d = r.result;
        if (e.oldVersion < 1) {
          d.createObjectStore("maps", { keyPath: "id" });
          const f = d.createObjectStore("features", { keyPath: "id" });
          f.createIndex("mapId", "mapId");
        }
        if (e.oldVersion < 2) {
          d.createObjectStore("templates", { keyPath: "id" });
          d.createObjectStore("photos", { keyPath: "id" });
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error("La base de datos est\xE1 bloqueada; cierre y abra la app"));
      setTimeout(() => rej(new Error("La base de datos no respondi\xF3")), 8e3);
    });
    return dbp;
  }
  async function tx(name, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(name, mode), s = t.objectStore(name);
      const out = fn(s);
      t.oncomplete = () => res(out && "result" in out ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  }
  return {
    put: (n, v) => {
      if (n !== "maps") markDirty();
      return tx(n, "readwrite", (s) => s.put(v));
    },
    del: (n, k) => {
      if (n !== "maps") markDirty();
      return tx(n, "readwrite", (s) => s.delete(k));
    },
    get: (n, k) => tx(n, "readonly", (s) => s.get(k)),
    all: (n) => tx(n, "readonly", (s) => s.getAll()),
    byMap: (id) => tx("features", "readonly", (s) => s.index("mapId").getAll(id))
  };
})();
async function inflate(bytes) {
  const ds = new DecompressionStream("deflate");
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(await out);
}
const latin1 = (u8) => new TextDecoder("latin1").decode(u8);
const nums = (s) => s.trim().split(/[\s,]+/).filter(Boolean).map(Number);
async function pdfText(buf) {
  const u8 = new Uint8Array(buf);
  let txt = latin1(u8);
  if (/\/GPTS/.test(txt)) return txt;
  const re = /\/Type\s*\/ObjStm[\s\S]*?stream\r?\n/g;
  let m, extra = "";
  while (m = re.exec(txt)) {
    const start = m.index + m[0].length, end = txt.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      extra += "\n" + latin1(await inflate(u8.subarray(start, end)));
    } catch (e) {
    }
  }
  return txt + extra;
}
function findGeo(txt) {
  const cands = [];
  const re = /\/GPTS\s*\[([^\]]*)\]/g;
  let m;
  while (m = re.exec(txt)) {
    const gpts = nums(m[1]);
    if (gpts.length < 6) continue;
    const winA = txt.lastIndexOf("obj", m.index), winB = txt.indexOf("endobj", m.index);
    const objTxt = txt.slice(Math.max(0, winA - 20), winB > 0 ? winB : m.index + 2e3);
    const lm = /\/LPTS\s*\[([^\]]*)\]/.exec(objTxt);
    const lpts = lm ? nums(lm[1]) : [0, 1, 0, 0, 1, 0, 1, 1];
    const om = /(\d+)\s+0\s+obj\s*$/.exec(txt.slice(Math.max(0, winA - 20), winA + 3));
    let bbox = null;
    const near = (pos2) => {
      const w = txt.slice(Math.max(0, pos2 - 800), pos2 + 800);
      const all = [...w.matchAll(/\/BBox\s*\[([^\]]*)\]/g)];
      if (!all.length) return null;
      let best = all[0], bd = 1e9;
      for (const a of all) {
        const d = Math.abs(a.index - 800);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      return nums(best[1]);
    };
    if (om) {
      const ref = new RegExp("/Measure\\s+" + om[1] + "\\s+0\\s+R", "g");
      let r;
      if (r = ref.exec(txt)) bbox = near(r.index);
    }
    if (!bbox) {
      const inl = near(m.index);
      if (inl && /\/Viewport|\/VP/.test(txt.slice(Math.max(0, m.index - 1500), m.index))) bbox = inl;
    }
    cands.push({ gpts, lpts, bbox });
  }
  if (!cands.length) return null;
  const area = (c) => c.bbox ? Math.abs((c.bbox[2] - c.bbox[0]) * (c.bbox[3] - c.bbox[1])) : 0;
  cands.sort((a, b) => area(b) - area(a));
  return cands[0];
}
function fitAffine(px, ll) {
  const n = px.length, A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bLat = [0, 0, 0], bLon = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const v = [px[i][0], px[i][1], 1];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) A[r][c] += v[r] * v[c];
      bLat[r] += v[r] * ll[i][0];
      bLon[r] += v[r] * ll[i][1];
    }
  }
  const solve = (M, b) => {
    const a = M.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < 3; i++) {
      let p = i;
      for (let k = i + 1; k < 3; k++) if (Math.abs(a[k][i]) > Math.abs(a[p][i])) p = k;
      [a[i], a[p]] = [a[p], a[i]];
      for (let k = 0; k < 3; k++) if (k !== i) {
        const f = a[k][i] / a[i][i];
        for (let j = i; j < 4; j++) a[k][j] -= f * a[i][j];
      }
    }
    return a.map((r, i) => r[3] / r[i]);
  };
  const la = solve(A, bLat), lo = solve(A, bLon);
  return (x, y) => [la[0] * x + la[1] * y + la[2], lo[0] * x + lo[1] * y + lo[2]];
}
async function importGeoPDF(file) {
  const buf = await file.arrayBuffer();
  if (latin1(new Uint8Array(buf.slice(0, 1024))).indexOf("%PDF") < 0) throw new Error("El archivo elegido no es un PDF. Elija el GeoPDF del plano.");
  const geo = findGeo(await pdfText(buf.slice(0)));
  if (!geo) throw new Error("Este PDF no tiene georreferencia legible (no se encontr\xF3 un GeoPDF ISO 32000). Exp\xF3rtelo desde QGIS o ArcGIS como GeoPDF.");
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const bb = geo.bbox || page.view;
  const bw = Math.abs(bb[2] - bb[0]), bh = Math.abs(bb[3] - bb[1]);
  const MAXD = 4096, MAXPX = 14e6;
  let scale = Math.min(MAXD / Math.max(base.width, base.height), 5);
  if (base.width * base.height * scale * scale > MAXPX) scale = Math.sqrt(MAXPX / (base.width * base.height));
  const vp = page.getViewport({ scale });
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(vp.width);
  cv.height = Math.ceil(vp.height);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const corners = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]].map(([x, y]) => vp.convertToViewportPoint(x, y));
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0])))), y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1]))));
  const x1 = Math.min(cv.width, Math.ceil(Math.max(...corners.map((c) => c[0])))), y1 = Math.min(cv.height, Math.ceil(Math.max(...corners.map((c) => c[1]))));
  const out = document.createElement("canvas");
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext("2d").drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  const px = [], ll = [];
  for (let i = 0; i + 1 < geo.lpts.length && i + 1 < geo.gpts.length; i += 2) {
    const u = geo.lpts[i], v = geo.lpts[i + 1];
    const X = Math.min(bb[0], bb[2]) + u * bw, Y = Math.min(bb[1], bb[3]) + v * bh;
    const p = vp.convertToViewportPoint(X, Y);
    px.push([p[0] - x0, p[1] - y0]);
    ll.push([geo.gpts[i], geo.gpts[i + 1]]);
  }
  if (px.length < 3) throw new Error("El GeoPDF tiene menos de 3 puntos de control.");
  const f = fitAffine(px, ll);
  const W = out.width, H = out.height;
  const blob = await new Promise((r) => out.toBlob(r, "image/jpeg", 0.9));
  cv.width = cv.height = 0;
  return {
    id: uid(),
    name: file.name.replace(/\.pdf$/i, ""),
    created: Date.now(),
    blob,
    w: W,
    h: H,
    tl: f(0, 0),
    tr: f(W, 0),
    bl: f(0, H),
    br: f(W, H)
  };
}
const map = L.map("map", { zoomControl: false, maxZoom: 22, attributionControl: true, tap: true }).setView([6.2, -75.57], 13);
const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 22, maxNativeZoom: 19, attribution: "\xA9 OpenStreetMap" });
if (store.get("osm", true)) osm.addTo(map);
let overlay = null, curMap = null, objUrl = null;
const featLayer = L.layerGroup().addTo(map);
const markers = /* @__PURE__ */ new Map();
let features = [];
function pinIcon(f) {
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 26],
    html: `<div class="pin" style="background:${f.color}"></div><div class="pinlbl">${esc(f.name)}</div>`
  });
}
function drawFeatures() {
  featLayer.clearLayers();
  markers.clear();
  for (const f of features) {
    if (f.type === "point") {
      const m = L.marker([f.lat, f.lon], { icon: pinIcon(f) }).on("click", () => editPoint(f)).addTo(featLayer);
      markers.set(f.id, m);
    } else if (f.coords.length) {
      const pl = L.polyline(f.coords.map((c) => [c[0], c[1]]), { color: f.color, weight: 4, opacity: 0.9 }).on("click", () => editTrack(f)).addTo(featLayer);
      markers.set(f.id, pl);
    }
  }
}
async function openMap(id, fit = true) {
  const m = await DB.get("maps", id);
  if (!m) {
    $("welcome").hidden = false;
    return;
  }
  curMap = m;
  store.set("cur", id);
  if (overlay) map.removeLayer(overlay);
  if (objUrl) URL.revokeObjectURL(objUrl);
  objUrl = URL.createObjectURL(m.blob);
  overlay = L.imageOverlay.rotated(objUrl, L.latLng(m.tl), L.latLng(m.tr), L.latLng(m.bl), { opacity: store.get("opacity", 1) }).addTo(map);
  overlay.bringToBack();
  if (fit) map.fitBounds(L.latLngBounds([m.tl, m.tr, m.bl, m.br]), { padding: [10, 10] });
  $("mapName").textContent = m.name;
  features = (await DB.byMap(id)).sort((a, b) => a.created - b.created);
  const np = features.filter((f) => f.type === "point").length, nt = features.length - np;
  $("mapSub").textContent = `${np} puntos \xB7 ${nt} tracks`;
  $("welcome").hidden = true;
  drawFeatures();
}
function refreshSub() {
  const np = features.filter((f) => f.type === "point").length, nt = features.length - np;
  $("mapSub").textContent = `${np} puntos \xB7 ${nt} tracks`;
}
let pos = null, follow = false, meMarker = null, accCircle = null, firstFix = true;
const meIcon = L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
function onPos(p) {
  const { latitude: lat, longitude: lon, accuracy: acc, altitude: alt } = p.coords;
  pos = { lat, lon, acc, alt, t: p.timestamp };
  if (!meMarker) {
    meMarker = L.marker([lat, lon], { icon: meIcon, interactive: false, zIndexOffset: 1e3 }).addTo(map);
    accCircle = L.circle([lat, lon], { radius: acc, color: "#1d64d8", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
  } else {
    meMarker.setLatLng([lat, lon]);
    accCircle.setLatLng([lat, lon]).setRadius(acc);
  }
  if (follow) map.panTo([lat, lon], { animate: true });
  if (firstFix && !curMap) map.setView([lat, lon], 17);
  firstFix = false;
  if (rec && !NATIVE) recAdd(pos);
  updCoords();
}
const nativeLoc = (l) => ({ coords: { latitude: l.latitude, longitude: l.longitude, accuracy: l.accuracy, altitude: l.altitude }, timestamp: l.time || Date.now() });
function nativeErr(err) {
  if ((err == null ? void 0 : err.code) === "NOT_AUTHORIZED") {
    sheet("Permiso de ubicaci\xF3n", `<p>La app necesita su ubicaci\xF3n para mostrarla sobre el plano y grabar tracks.</p><button class="btn primary" id="okSet">Abrir ajustes del tel\xE9fono</button>`, () => $("okSet").onclick = () => {
      BG.openSettings();
      closeSheet();
    });
  }
  onPosErr({ code: (err == null ? void 0 : err.code) === "NOT_AUTHORIZED" ? 1 : 2 });
}
function onPosErr(e) {
  $("cAcc").textContent = e.code === 1 ? "Permiso de ubicaci\xF3n negado" : "Sin se\xF1al GPS";
  $("cAcc").classList.add("bad");
}
function startGps() {
  if (NATIVE) {
    BG.addWatcher({ requestPermissions: true, stale: false, distanceFilter: 0 }, (l, err) => err ? nativeErr(err) : l && onPos(nativeLoc(l))).catch(nativeErr);
    return;
  }
  if (!("geolocation" in navigator)) {
    onPosErr({ code: 2 });
    return;
  }
  navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 3e4 });
}
const pointMode = () => store.get("pmode", "gps");
function updCoords() {
  const mira = pointMode() === "mira";
  let lat, lon;
  if (mira) {
    const c = map.getCenter();
    lat = c.lat;
    lon = c.lng;
    $("cLbl").textContent = "Mira \xB7 CTM12";
  } else if (pos) {
    lat = pos.lat;
    lon = pos.lon;
    $("cLbl").textContent = "GPS \xB7 CTM12";
  }
  if (lat != null) {
    const [E, N] = toCTM(lat, lon);
    $("cE").textContent = "E " + fmtInt(E);
    $("cN").textContent = "N " + fmtInt(N);
  }
  if (pos) {
    $("cAcc").textContent = `\xB1${Math.round(pos.acc)} m` + (pos.alt != null ? ` \xB7 ${Math.round(pos.alt)} msnm` : "");
    $("cAcc").classList.toggle("bad", pos.acc > 15);
  }
}
map.on("move", () => {
  if (pointMode() === "mira") updCoords();
});
map.on("dragstart", () => {
  follow = false;
  $("btnGps").classList.remove("on");
});
$("btnGps").onclick = () => {
  if (!pos) {
    toast("Esperando se\xF1al GPS\u2026");
    return;
  }
  follow = !follow;
  $("btnGps").classList.toggle("on", follow);
  if (follow) map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 18));
};
function nextName(prefix) {
  const n = features.filter((f) => f.name && f.name.startsWith(prefix)).map((f) => parseInt(f.name.slice(prefix.length))).filter((x) => !isNaN(x));
  return prefix + ((n.length ? Math.max(...n) : 0) + 1);
}
async function addPoint(lat, lon, source) {
  if (!curMap) {
    toast("Primero cargue un plano");
    return;
  }
  const f = {
    id: uid(),
    mapId: curMap.id,
    type: "point",
    name: nextName(store.get("prefix", "P")),
    note: "",
    color: store.get("pcolor", COLORS[0]),
    tpl: defaultTplId(),
    data: {},
    lat,
    lon,
    alt: source === "gps" ? pos.alt : null,
    acc: source === "gps" ? pos.acc : null,
    source,
    created: Date.now()
  };
  features.push(f);
  await DB.put("features", f);
  drawFeatures();
  refreshSub();
  editPoint(f, true);
}
$("btnPoint").onclick = () => {
  if (pointMode() === "mira") {
    const c = map.getCenter();
    addPoint(c.lat, c.lng, "mira");
  } else if (!pos) toast("Esperando se\xF1al GPS\u2026");
  else addPoint(pos.lat, pos.lon, "gps");
};
map.on("contextmenu", (e) => addPoint(e.latlng.lat, e.latlng.lng, "mapa"));
let rec = null, wake = null, recTimer = null;
async function keepAwake() {
  var _a2;
  try {
    wake = await ((_a2 = navigator.wakeLock) == null ? void 0 : _a2.request("screen"));
  } catch (e) {
  }
}
document.addEventListener("visibilitychange", () => {
  if (rec && document.visibilityState === "visible") keepAwake();
});
function trackLen(c) {
  let d = 0;
  for (let i = 1; i < c.length; i++) d += map.distance([c[i - 1][0], c[i - 1][1]], [c[i][0], c[i][1]]);
  return d;
}
async function recAdd(p) {
  if (p.acc > store.get("maxacc", 25)) return;
  const c = rec.coords, last = c[c.length - 1];
  if (last && map.distance([last[0], last[1]], [p.lat, p.lon]) < 2) return;
  c.push([p.lat, p.lon, p.alt, p.t]);
  rec.len = trackLen(c);
  if (rec.line) rec.line.addLatLng([p.lat, p.lon]);
  else rec.line = L.polyline([[p.lat, p.lon]], { color: rec.color, weight: 4 }).addTo(map);
  const { line, watcher, ...save } = rec;
  DB.put("features", save);
}
$("btnTrack").onclick = async () => {
  if (!curMap) {
    toast("Primero cargue un plano");
    return;
  }
  if (!rec) {
    rec = { id: uid(), mapId: curMap.id, type: "track", name: nextName("Track "), note: "", color: "#e0392b", tpl: defaultTplId("track"), data: {}, coords: [], created: Date.now(), len: 0 };
    if (NATIVE) {
      try {
        await LN.requestPermissions();
      } catch (e) {
      }
      try {
        rec.watcher = await BG.addWatcher(
          { backgroundTitle: "Grabando track", backgroundMessage: "GeoMerce sigue registrando su recorrido", requestPermissions: true, stale: false, distanceFilter: 2 },
          (l, err) => {
            if (err) return nativeErr(err);
            if (l && rec) {
              const p = nativeLoc(l);
              recAdd({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, alt: p.coords.altitude, t: p.timestamp });
            }
          }
        );
      } catch (e) {
        nativeErr(e);
      }
    } else keepAwake();
    $("btnTrack").classList.add("rec");
    $("trkLbl").textContent = "Detener";
    $("recinfo").hidden = false;
    recTimer = setInterval(() => {
      $("recTxt").textContent = `${fmtDist(rec.len)} \xB7 ${fmtTime((Date.now() - rec.created) / 1e3)}`;
    }, 1e3);
    if (pos) recAdd(pos);
    toast(NATIVE ? "Grabando track. Puede apagar la pantalla." : "Grabando track. Mantenga la pantalla encendida.");
  } else {
    clearInterval(recTimer);
    try {
      wake == null ? void 0 : wake.release();
    } catch (e) {
    }
    wake = null;
    const r = rec;
    rec = null;
    if (r.line) map.removeLayer(r.line);
    delete r.line;
    if (r.watcher) {
      try {
        await BG.removeWatcher({ id: r.watcher });
      } catch (e) {
      }
      delete r.watcher;
    }
    $("btnTrack").classList.remove("rec");
    $("trkLbl").textContent = "Track";
    $("recinfo").hidden = true;
    if (r.coords.length < 2) {
      await DB.del("features", r.id);
      toast("Track descartado: muy pocos puntos");
      return;
    }
    features.push(r);
    await DB.put("features", r);
    drawFeatures();
    refreshSub();
    editTrack(r, true);
  }
};
const X_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>';
function sheet(title, html, onMount) {
  closeSheet();
  const wrap = $("sheets");
  wrap.innerHTML = `<div class="scrim" id="scrim"></div><section class="sheet" role="dialog" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button class="x" id="shClose" aria-label="Cerrar">${X_ICON}</button></header><div class="body">${html}</div></section>`;
  $("scrim").onclick = closeSheet;
  $("shClose").onclick = closeSheet;
  onMount == null ? void 0 : onMount(wrap);
}
function closeSheet() {
  $("sheets").innerHTML = "";
}
let toastT;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  clearTimeout(toastT);
  toastT = setTimeout(() => t.remove(), 2800);
}
function swatchHtml(sel) {
  return `<div class="swatches" id="sw">${COLORS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" aria-label="Color ${c}" aria-pressed="${c === sel}"></button>`).join("")}</div>`;
}
function bindSwatches(cb) {
  $("sw").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $("sw").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    cb(b.dataset.c);
  };
}
function confirmBtn(btn, label, action) {
  btn.onclick = () => {
    if (btn.dataset.armed) {
      action();
      return;
    }
    btn.dataset.armed = 1;
    btn.textContent = label;
    setTimeout(() => {
      if (btn.isConnected) {
        delete btn.dataset.armed;
        btn.textContent = btn.dataset.orig;
      }
    }, 4e3);
  };
  btn.dataset.orig = btn.textContent;
}
function editPoint(f, isNew, draft) {
  const [E, N] = toCTM(f.lat, f.lon);
  const src = { gps: "GPS", mira: "mira del mapa", mapa: "toque en el mapa" }[f.source] || f.source;
  const d = draft || { name: f.name, note: f.note, color: f.color, tpl: tplById(f.tpl) ? f.tpl : defaultTplId(), data: JSON.parse(JSON.stringify(f.data || {})) };
  const t = tplById(d.tpl);
  sheet(isNew ? "Punto nuevo" : "Punto", `
    ${TPL.length > 1 ? `<div class="field"><label for="pTpl">Plantilla</label><select id="pTpl">${TPL.map((x) => `<option value="${x.id}" ${x.id === d.tpl ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>` : ""}
    <div class="field"><label for="pName">Nombre</label><input id="pName" value="${esc(d.name)}" autocomplete="off"></div>
    ${formHtml(t, d.data)}
    <div class="field"><label for="pNote">Nota</label><textarea id="pNote" placeholder="Observaciones generales">${esc(d.note)}</textarea></div>
    <div class="field"><label>Color</label>${swatchHtml(d.color)}</div>
    <div class="kv">E ${fmtInt(E)} \xB7 N ${fmtInt(N)} (CTM12)<br>${f.lat.toFixed(6)}, ${f.lon.toFixed(6)}<br>${f.acc != null ? `\xB1${Math.round(f.acc)} m \xB7 ` : ""}${f.alt != null ? `${Math.round(f.alt)} msnm \xB7 ` : ""}${src}<br>${new Date(f.created).toLocaleString("es-CO")}</div>
    <p class="formerr" id="pErr" hidden></p>
    <div class="row"><button class="btn primary" id="pSave">Guardar</button><button class="btn" id="pGo">Centrar</button></div>
    <button class="btn danger" id="pDel">Eliminar punto</button>`, () => {
    bindSwatches((c) => d.color = c);
    bindForm(t, d.data, f.id);
    if (isNew && !draft) $("pName").select();
    const grab = () => {
      d.name = $("pName").value;
      d.note = $("pNote").value;
      d.data = readForm(t, d.data).data;
    };
    if ($("pTpl")) $("pTpl").onchange = (e) => {
      grab();
      d.tpl = e.target.value;
      editPoint(f, isNew, d);
    };
    $("pSave").onclick = async () => {
      const r = readForm(t, d.data);
      if (r.bad.length || r.missing.length) {
        $("pErr").textContent = (r.bad.length ? `Revise el n\xFAmero en: ${r.bad.join(", ")}. ` : "") + (r.missing.length ? `Faltan campos obligatorios: ${r.missing.join(", ")}.` : "");
        $("pErr").hidden = false;
        $("pErr").scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      f.name = $("pName").value.trim() || f.name;
      f.note = $("pNote").value;
      f.color = d.color;
      f.tpl = d.tpl;
      f.data = r.data;
      store.set("pcolor", d.color);
      await DB.put("features", f);
      drawFeatures();
      closeSheet();
    };
    $("pGo").onclick = () => {
      follow = false;
      $("btnGps").classList.remove("on");
      map.setView([f.lat, f.lon], Math.max(map.getZoom(), 19));
      closeSheet();
    };
    confirmBtn($("pDel"), "Toque otra vez para eliminar", async () => {
      await deletePhotosOf({ ...f, data: { ...f.data, ...d.data } });
      await DB.del("features", f.id);
      features = features.filter((x) => x.id !== f.id);
      drawFeatures();
      refreshSub();
      closeSheet();
    });
  });
}
const trackDur = (f) => f.coords.length > 1 ? (f.coords[f.coords.length - 1][3] - f.coords[0][3]) / 1e3 : 0;
function editTrack(f, isNew, draft) {
  const d = draft || { name: f.name, note: f.note, color: f.color, tpl: tplById(f.tpl) ? f.tpl : defaultTplId("track"), data: JSON.parse(JSON.stringify(f.data || {})) };
  const t = tplById(d.tpl);
  const [E0, N0] = toCTM(f.coords[0][0], f.coords[0][1]), last = f.coords[f.coords.length - 1], [E1, N1] = toCTM(last[0], last[1]);
  sheet(isNew ? "Track nuevo" : "Track", `
    ${TPL.length > 1 ? `<div class="field"><label for="tTpl">Plantilla</label><select id="tTpl">${TPL.map((x) => `<option value="${x.id}" ${x.id === d.tpl ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>` : ""}
    <div class="field"><label for="tName">Nombre</label><input id="tName" value="${esc(d.name)}" autocomplete="off"></div>
    ${formHtml(t, d.data)}
    <div class="field"><label for="tNote">Nota</label><textarea id="tNote" placeholder="Observaciones generales">${esc(d.note)}</textarea></div>
    <div class="field"><label>Color</label>${swatchHtml(d.color)}</div>
    <div class="kv">${fmtDist(trackLen(f.coords))} \xB7 ${fmtTime(trackDur(f))} \xB7 ${f.coords.length} v\xE9rtices<br>Inicio E ${fmtInt(E0)} \xB7 N ${fmtInt(N0)}<br>Fin E ${fmtInt(E1)} \xB7 N ${fmtInt(N1)}<br>${new Date(f.created).toLocaleString("es-CO")}</div>
    <p class="formerr" id="tErr" hidden></p>
    <div class="row"><button class="btn primary" id="tSave">Guardar</button><button class="btn" id="tGo">Ver en el mapa</button></div>
    <button class="btn danger" id="tDel">Eliminar track</button>`, () => {
    bindSwatches((c) => d.color = c);
    bindForm(t, d.data, f.id);
    const grab = () => {
      d.name = $("tName").value;
      d.note = $("tNote").value;
      d.data = readForm(t, d.data).data;
    };
    if ($("tTpl")) $("tTpl").onchange = (e) => {
      grab();
      d.tpl = e.target.value;
      editTrack(f, isNew, d);
    };
    $("tSave").onclick = async () => {
      const r = readForm(t, d.data);
      if (r.bad.length || r.missing.length) {
        $("tErr").textContent = (r.bad.length ? `Revise el n\xFAmero en: ${r.bad.join(", ")}. ` : "") + (r.missing.length ? `Faltan campos obligatorios: ${r.missing.join(", ")}.` : "");
        $("tErr").hidden = false;
        $("tErr").scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      f.name = $("tName").value.trim() || f.name;
      f.note = $("tNote").value;
      f.color = d.color;
      f.tpl = d.tpl;
      f.data = r.data;
      await DB.put("features", f);
      drawFeatures();
      closeSheet();
    };
    $("tGo").onclick = () => {
      follow = false;
      $("btnGps").classList.remove("on");
      map.fitBounds(L.latLngBounds(f.coords.map((c) => [c[0], c[1]])), { padding: [40, 40] });
      closeSheet();
    };
    confirmBtn($("tDel"), "Toque otra vez para eliminar", async () => {
      await deletePhotosOf({ ...f, data: { ...f.data, ...d.data } });
      await DB.del("features", f.id);
      features = features.filter((x) => x.id !== f.id);
      drawFeatures();
      refreshSub();
      closeSheet();
    });
  });
}
async function showMaps() {
  const maps = (await DB.all("maps")).sort((a, b) => b.created - a.created);
  sheet("Planos", `
    <button class="btn primary" id="mAdd">Cargar GeoPDF</button>
    ${maps.length ? `<div class="list">${maps.map((m) => `<button class="item ${curMap && m.id === curMap.id ? "cur" : ""}" data-id="${m.id}"><span class="t"><b>${esc(m.name)}</b><small>Cargado ${new Date(m.created).toLocaleDateString("es-CO")}</small></span></button>`).join("")}</div>` : '<p class="empty">A\xFAn no hay planos. Cargue un GeoPDF desde el tel\xE9fono, por ejemplo uno descargado de WhatsApp, Drive o el correo.</p>'}
    ${curMap ? `<button class="btn danger" id="mDel">Eliminar el plano actual y sus datos</button>` : ""}`, () => {
    $("mAdd").onclick = () => $("file").click();
    document.querySelectorAll(".list .item").forEach((b) => b.onclick = () => {
      closeSheet();
      openMap(b.dataset.id);
    });
    if (curMap) confirmBtn($("mDel"), `Toque otra vez: se borran ${features.length} puntos/tracks`, async () => {
      for (const f of features) {
        await deletePhotosOf(f);
        await DB.del("features", f.id);
      }
      await DB.del("maps", curMap.id);
      if (overlay) map.removeLayer(overlay);
      overlay = null;
      curMap = null;
      features = [];
      drawFeatures();
      store.set("cur", null);
      $("mapName").textContent = "Sin plano";
      $("mapSub").textContent = "Toque para cargar un GeoPDF";
      closeSheet();
      const rest = await DB.all("maps");
      if (rest.length) openMap(rest[0].id);
      else $("welcome").hidden = false;
    });
  });
}
$("btnMaps").onclick = showMaps;
$("btnFirst").onclick = () => $("file").click();
$("btnFirstRestore").onclick = () => $("fileBk").click();
async function loadPlanFile(file) {
  const busy = document.createElement("div");
  busy.className = "busy";
  busy.textContent = "Leyendo el GeoPDF\u2026";
  document.body.appendChild(busy);
  try {
    const m = await importGeoPDF(file);
    await DB.put("maps", m);
    closeSheet();
    $("welcome").hidden = true;
    await openMap(m.id);
    toast("Plano cargado");
  } catch (err) {
    console.error(err);
    sheet("No se pudo cargar", `<p>${esc(err.message || err)}</p><button class="btn" id="okE">Entendido</button>`, () => $("okE").onclick = closeSheet);
  } finally {
    busy.remove();
  }
}
$("file").onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) loadPlanFile(file);
};
async function openFromUri(url) {
  if (!url || !/^(content|file):/i.test(url)) return;
  try {
    const r = await FS.readFile({ path: url });
    const bin = atob(r.data), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    let name = decodeURIComponent(url.split("/").pop() || "Plano").replace(/^.*[:%]/, "") || "Plano";
    if (!/\.pdf$/i.test(name)) name = "Plano " + (/* @__PURE__ */ new Date()).toLocaleDateString("es-CO") + ".pdf";
    loadPlanFile(new File([u8], name, { type: "application/pdf" }));
  } catch (e) {
    showErr("Abrir archivo", e);
  }
}
function showList() {
  if (!curMap) {
    toast("Primero cargue un plano");
    return;
  }
  const pts = features.filter((f) => f.type === "point"), trk = features.filter((f) => f.type === "track");
  sheet(curMap.name, `
    <div class="sec">Exportar</div>
    <div class="row"><button class="btn primary" data-x="zip">Todo con fotos (ZIP)</button></div>
    <div class="row"><button class="btn" data-x="kml">KML</button><button class="btn" data-x="gpx">GPX</button><button class="btn" data-x="csv">CSV CTM12</button></div>
    <p class="note">El ZIP trae el CSV (con todos los campos y Este/Norte CTM12), el KML y la carpeta de fotos nombradas por punto. KML abre en Google Earth y QGIS; GPX en cualquier GPS.</p>
    ${needsBackup() ? `<button class="btn" id="bQuick" style="border-color:var(--warn);color:var(--warn)">Hay datos sin respaldar \xB7 Crear respaldo</button>` : ""}
    <div class="sec">Puntos (${pts.length})</div>
    ${pts.length ? `<div class="list">${pts.map((f) => {
    const [E, N] = toCTM(f.lat, f.lon);
    const t = tplById(f.tpl);
    const first = t == null ? void 0 : t.fields.find((x) => x.type !== "photo");
    const extra = first ? fieldText(f, first) : "";
    return `<button class="item" data-id="${f.id}"><span class="sw" style="background:${f.color}"></span><span class="t"><b>${esc(f.name)}${extra ? ` \xB7 ${esc(extra)}` : ""}</b><small>E ${fmtInt(E)} \xB7 N ${fmtInt(N)}${t && TPL.length > 1 ? ` \xB7 ${esc(t.name)}` : ""}</small></span></button>`;
  }).join("")}</div>` : '<p class="empty">Sin puntos. Use el bot\xF3n Punto o mantenga presionado el mapa.</p>'}
    <div class="sec">Tracks (${trk.length})</div>
    ${trk.length ? `<div class="list">${trk.map((f) => `<button class="item" data-id="${f.id}"><span class="sw trk" style="background:${f.color}"></span><span class="t"><b>${esc(f.name)}</b><small>${fmtDist(trackLen(f.coords))} \xB7 ${new Date(f.created).toLocaleDateString("es-CO")}</small></span></button>`).join("")}</div>` : '<p class="empty">Sin tracks. Toque Track para empezar a grabar.</p>'}`, (w) => {
    w.querySelectorAll("[data-x]").forEach((b) => b.onclick = () => exportAs(b.dataset.x));
    if ($("bQuick")) $("bQuick").onclick = async () => {
      await makeBackup();
      showList();
    };
    w.querySelectorAll(".list .item").forEach((b) => b.onclick = () => {
      const f = features.find((x) => x.id === b.dataset.id);
      f.type === "point" ? editPoint(f) : editTrack(f);
    });
  });
}
$("btnList").onclick = showList;
const xml = (s) => esc(s);
const iso = (t) => new Date(t).toISOString();
function buildKML(withPhotos) {
  const hex = (c) => {
    const h = c.replace("#", "");
    return "ff" + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
  };
  const pm = features.map((f) => {
    if (f.type === "point") {
      const [E, N] = toCTM(f.lat, f.lon);
      const t2 = tplById(f.tpl), fx2 = fieldsByName(f);
      const rows2 = Object.entries(fx2).filter(([, v]) => v !== "").map(([k, v]) => `<tr><td><b>${xml(k)}</b></td><td>${xml(v)}</td></tr>`).join("");
      const imgs2 = withPhotos ? ((t2 == null ? void 0 : t2.fields) || []).filter((x) => x.type === "photo").flatMap((fd) => photoFileNames(f, fd)).map((n) => `<img src="fotos/${n}" width="320"><br>`).join("") : "";
      const desc2 = `${rows2 ? `<table>${rows2}</table>` : ""}${f.note ? `<p>${xml(f.note)}</p>` : ""}${imgs2}`;
      return `<Placemark><name>${xml(f.name)}</name><description><![CDATA[${desc2}]]></description><TimeStamp><when>${iso(f.created)}</when></TimeStamp>
<Style><IconStyle><color>${hex(f.color)}</color></IconStyle></Style>
<ExtendedData><Data name="Plantilla"><value>${xml((t2 == null ? void 0 : t2.name) || "")}</value></Data>${Object.entries(fx2).map(([k, v]) => `<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`).join("")}<Data name="Nota"><value>${xml(f.note)}</value></Data><Data name="Este_CTM12"><value>${fmtInt(E)}</value></Data><Data name="Norte_CTM12"><value>${fmtInt(N)}</value></Data><Data name="Precision_m"><value>${f.acc != null ? Math.round(f.acc) : ""}</value></Data></ExtendedData>
<Point><coordinates>${f.lon},${f.lat}${f.alt != null ? "," + f.alt : ""}</coordinates></Point></Placemark>`;
    }
    const t = tplById(f.tpl), fx = fieldsByName(f);
    const rows = Object.entries(fx).filter(([, v]) => v !== "").map(([k, v]) => `<tr><td><b>${xml(k)}</b></td><td>${xml(v)}</td></tr>`).join("");
    const imgs = withPhotos ? ((t == null ? void 0 : t.fields) || []).filter((x) => x.type === "photo").flatMap((fd) => photoFileNames(f, fd)).map((n) => `<img src="fotos/${n}" width="320"><br>`).join("") : "";
    const desc = `<table><tr><td><b>Longitud</b></td><td>${fmtDist(trackLen(f.coords))}</td></tr><tr><td><b>Duraci\xF3n</b></td><td>${fmtTime(trackDur(f))}</td></tr>${rows}</table>${f.note ? `<p>${xml(f.note)}</p>` : ""}${imgs}`;
    return `<Placemark><name>${xml(f.name)}</name><description><![CDATA[${desc}]]></description><Style><LineStyle><color>${hex(f.color)}</color><width>3</width></LineStyle></Style>
<ExtendedData><Data name="Plantilla"><value>${xml((t == null ? void 0 : t.name) || "")}</value></Data>${Object.entries(fx).map(([k, v]) => `<Data name="${xml(k)}"><value>${xml(v)}</value></Data>`).join("")}<Data name="Nota"><value>${xml(f.note)}</value></Data><Data name="Longitud_m"><value>${Math.round(trackLen(f.coords))}</value></Data></ExtendedData>
<LineString><tessellate>1</tessellate><coordinates>${f.coords.map((c) => `${c[1]},${c[0]}${c[2] != null ? "," + c[2] : ""}`).join(" ")}</coordinates></LineString></Placemark>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(curMap.name)}</name>
${pm}
</Document></kml>`;
}
function buildGPX() {
  const gdesc = (f) => [...Object.entries(fieldsByName(f)).filter(([, v]) => v !== "").map(([k, v]) => `${k}: ${v}`), f.note].filter(Boolean).join("; ");
  const wpt = features.filter((f) => f.type === "point").map((f) => `<wpt lat="${f.lat}" lon="${f.lon}">${f.alt != null ? `<ele>${f.alt}</ele>` : ""}<time>${iso(f.created)}</time><name>${xml(f.name)}</name><desc>${xml(gdesc(f))}</desc></wpt>`).join("\n");
  const trk = features.filter((f) => f.type === "track").map((f) => `<trk><name>${xml(f.name)}</name><desc>${xml(gdesc(f))}</desc><trkseg>${f.coords.map((c) => `<trkpt lat="${c[0]}" lon="${c[1]}">${c[2] != null ? `<ele>${c[2]}</ele>` : ""}<time>${iso(c[3])}</time></trkpt>`).join("")}</trkseg></trk>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoMerce" xmlns="http://www.topografix.com/GPX/1/1">
${wpt}
${trk}
</gpx>`;
}
function buildCSV() {
  var _a2, _b2;
  const q = (s) => `"${String(s != null ? s : "").replace(/"/g, '""')}"`;
  const cols = exportColumns(features);
  const rows = [["Tipo", "Nombre", "Vertice", "Este_CTM12", "Norte_CTM12", "Latitud", "Longitud", "Altitud_m", "Precision_m", "Fecha", "Plantilla", ...cols, "Nota"]];
  const blank = cols.map(() => "");
  for (const f of features) {
    if (f.type === "point") {
      const [E, N] = toCTM(f.lat, f.lon);
      const fx = fieldsByName(f);
      rows.push(["Punto", f.name, "", fmtInt(E), fmtInt(N), f.lat.toFixed(7), f.lon.toFixed(7), f.alt != null ? Math.round(f.alt) : "", f.acc != null ? Math.round(f.acc) : "", new Date(f.created).toLocaleString("es-CO"), ((_a2 = tplById(f.tpl)) == null ? void 0 : _a2.name) || "", ...cols.map((c) => {
        var _a3;
        return (_a3 = fx[c]) != null ? _a3 : "";
      }), f.note]);
    } else {
      const fx = fieldsByName(f), tn = ((_b2 = tplById(f.tpl)) == null ? void 0 : _b2.name) || "";
      f.coords.forEach((c, i) => {
        const [E, N] = toCTM(c[0], c[1]);
        rows.push(["Track", f.name, i + 1, fmtInt(E), fmtInt(N), c[0].toFixed(7), c[1].toFixed(7), c[2] != null ? Math.round(c[2]) : "", "", new Date(c[3]).toLocaleString("es-CO"), tn, ...cols.map((k) => {
          var _a3;
          return (_a3 = fx[k]) != null ? _a3 : "";
        }), f.note]);
      });
    }
  }
  return "\uFEFF" + rows.map((r) => r.map((v, i) => i >= 3 && i <= 8 ? v : q(v)).join(";")).join("\r\n");
}
async function buildZIP() {
  var _a2;
  const zip = new JSZip();
  zip.file("puntos_y_tracks.csv", buildCSV());
  zip.file("mapa.kml", buildKML(true));
  zip.file("tracks.gpx", buildGPX());
  const dir = zip.folder("fotos");
  for (const f of features) {
    const t = tplById(f.tpl);
    for (const fd of ((t == null ? void 0 : t.fields) || []).filter((x) => x.type === "photo")) {
      const names = photoFileNames(f, fd), ids = ((_a2 = f.data) == null ? void 0 : _a2[fd.id]) || [];
      for (let i = 0; i < ids.length; i++) {
        const p = await DB.get("photos", ids[i]);
        if (p) dir.file(names[i], p.blob);
      }
    }
  }
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}
async function exportAs(kind) {
  if (!features.length) {
    toast("No hay puntos ni tracks para exportar");
    return;
  }
  let txt;
  if (kind === "zip") {
    const busy = document.createElement("div");
    busy.className = "busy";
    busy.textContent = "Preparando el ZIP\u2026";
    document.body.appendChild(busy);
    try {
      txt = await buildZIP();
    } finally {
      busy.remove();
    }
  } else txt = kind === "kml" ? buildKML() : kind === "gpx" ? buildGPX() : buildCSV();
  const mime = { kml: "application/vnd.google-earth.kml+xml", gpx: "application/gpx+xml", csv: "text/csv", zip: "application/zip" }[kind];
  const d = /* @__PURE__ */ new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const name = `${curMap.name.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, "_")}_${stamp}.${kind}`;
  await saveFile(name, txt, mime);
}
async function saveFile(name, txt, mime) {
  var _a2;
  if (NATIVE) {
    try {
      const opts = typeof txt === "string" ? { data: txt, encoding: "utf8" } : { data: (await blobToDataURL(txt)).split(",")[1] };
      const { uri } = await FS.writeFile({ path: name, directory: "CACHE", ...opts });
      await SH.share({ title: name, files: [uri], dialogTitle: "Enviar o guardar " + name });
    } catch (e) {
      if (!/cancel/i.test((e == null ? void 0 : e.message) || "")) toast("No se pudo compartir: " + ((e == null ? void 0 : e.message) || e));
    }
    return;
  }
  const file = new File([txt], name, { type: mime });
  try {
    if ((_a2 = navigator.canShare) == null ? void 0 : _a2.call(navigator, { files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e.name === "AbortError") return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2e3);
  toast("Archivo guardado en Descargas");
}
function markDirty() {
  store.set("dirty", Date.now());
}
const blobToDataURL = (b) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(b);
});
function lastBackupText() {
  const t = store.get("lastBackup", 0);
  if (!t) return "Nunca se ha hecho un respaldo.";
  const h = (Date.now() - t) / 36e5;
  return "\xDAltimo respaldo: " + (h < 1 ? "hace menos de una hora" : h < 48 ? `hace ${Math.round(h)} h` : `hace ${Math.round(h / 24)} d\xEDas`) + ".";
}
const needsBackup = () => store.get("dirty", 0) > store.get("lastBackup", 0);
async function makeBackup() {
  const busy = document.createElement("div");
  busy.className = "busy";
  busy.textContent = "Preparando respaldo\u2026";
  document.body.appendChild(busy);
  try {
    const maps = await DB.all("maps"), feats = await DB.all("features");
    const outMaps = [];
    for (const m of maps) {
      const { blob, ...rest } = m;
      outMaps.push({ ...rest, image: await blobToDataURL(blob) });
    }
    const outPh = [];
    for (const p of await DB.all("photos")) {
      const { blob, ...rest } = p;
      outPh.push({ ...rest, image: await blobToDataURL(blob) });
    }
    const data = JSON.stringify({ app: "plano-de-campo", version: 2, created: (/* @__PURE__ */ new Date()).toISOString(), maps: outMaps, features: feats, templates: await DB.all("templates"), photos: outPh, tplDefault: store.get("tplDefault", null), tplDefaultTrack: store.get("tplDefaultTrack", null) });
    const d = /* @__PURE__ */ new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
    busy.remove();
    await saveFile(`Respaldo_GeoMerce_${stamp}.json`, data, "application/json");
    store.set("lastBackup", Date.now());
  } finally {
    busy.remove();
  }
}
async function restoreBackup(file) {
  var _a2, _b2, _c;
  const busy = document.createElement("div");
  busy.className = "busy";
  busy.textContent = "Restaurando\u2026";
  document.body.appendChild(busy);
  try {
    const j = JSON.parse(await file.text());
    if (j.app !== "plano-de-campo") throw new Error("Este archivo no es un respaldo de GeoMerce.");
    for (const m of j.maps || []) {
      const { image, ...rest } = m;
      await DB.put("maps", { ...rest, blob: await (await fetch(image)).blob() });
    }
    for (const f of j.features || []) await DB.put("features", f);
    for (const t of j.templates || []) await DB.put("templates", t);
    for (const p of j.photos || []) {
      const { image, ...rest } = p;
      await DB.put("photos", { ...rest, blob: await (await fetch(image)).blob() });
    }
    if (j.tplDefault) store.set("tplDefault", j.tplDefault);
    if (j.tplDefaultTrack) store.set("tplDefaultTrack", j.tplDefaultTrack);
    if ((_a2 = j.templates) == null ? void 0 : _a2.length) store.set("tplSeeded", true);
    await loadTemplates();
    store.set("lastBackup", Date.now());
    closeSheet();
    const id = (curMap == null ? void 0 : curMap.id) || ((_c = (_b2 = j.maps) == null ? void 0 : _b2[0]) == null ? void 0 : _c.id);
    if (id) await openMap(id);
    toast(`Restaurados ${(j.maps || []).length} planos y ${(j.features || []).length} puntos/tracks`);
  } catch (e) {
    sheet("No se pudo restaurar", `<p>${esc(e.message || e)}</p><button class="btn" id="okE">Entendido</button>`, () => $("okE").onclick = closeSheet);
  } finally {
    busy.remove();
  }
}
function backupHtml() {
  return `<div class="sec">Respaldo</div>
    <p class="note" style="${needsBackup() ? "color:var(--warn);font-weight:600" : ""}">${lastBackupText()}${needsBackup() ? " Hay datos nuevos sin respaldar." : ""}</p>
    <div class="row"><button class="btn primary" id="bMake">Crear respaldo</button><button class="btn" id="bRest">Restaurar</button></div>
    <p class="note">El respaldo guarda planos, puntos, tracks, plantillas y fotos en un solo archivo. Env\xEDelo a su Drive o correo; con Restaurar lo recupera en este u otro tel\xE9fono.</p>`;
}
function bindBackup() {
  $("bMake").onclick = async () => {
    await makeBackup();
    closeSheet();
  };
  $("bRest").onclick = () => $("fileBk").click();
}
$("btnSettings").onclick = () => {
  var _a2, _b2;
  sheet("Ajustes", `
    <div class="sec">Plantillas de campos</div>
    <p class="note">Puntos nuevos: <b>${esc(((_a2 = tplById(defaultTplId("point"))) == null ? void 0 : _a2.name) || "\u2014")}</b> \xB7 Tracks nuevos: <b>${esc(((_b2 = tplById(defaultTplId("track"))) == null ? void 0 : _b2.name) || "\u2014")}</b></p>
    <button class="btn primary" id="sTpl">Administrar plantillas</button>
    <div class="sec">Registro</div>
    <div class="field"><label for="sMode">Bot\xF3n Punto marca en</label>
      <select id="sMode"><option value="gps">Mi posici\xF3n GPS</option><option value="mira">La mira del centro del mapa</option></select></div>
    <p class="note">Tambi\xE9n puede mantener presionado el mapa para poner un punto donde toque.</p>
    <div class="field"><label for="sPrefix">Prefijo de nombres de puntos</label><input id="sPrefix" value="${esc(store.get("prefix", "P"))}" autocomplete="off"></div>
    <div class="field"><label for="sAcc">Precisi\xF3n m\xEDnima para grabar track (m)</label><input id="sAcc" type="number" inputmode="numeric" min="5" max="100" value="${store.get("maxacc", 25)}"></div>
    <div class="field"><label for="sOp">Transparencia del plano</label><input id="sOp" type="range" min="0.2" max="1" step="0.05" value="${store.get("opacity", 1)}"></div>
    <label class="toggle" for="sOsm"><span>Mapa base de OpenStreetMap<br><small class="note">Solo con internet</small></span><input type="checkbox" id="sOsm" ${store.get("osm", true) ? "checked" : ""}></label>
    ${backupHtml()}
    <p class="note">Coordenadas en MAGNA-SIRGAS Origen Nacional (CTM12, EPSG:9377).</p>
    <p class="note">GeoMerce versi\xF3n ${esc(window.APP_VERSION || "local")}</p>`, () => {
    bindBackup();
    $("sTpl").onclick = showTemplates;
    $("sMode").value = pointMode();
    $("sMode").onchange = (e) => {
      store.set("pmode", e.target.value);
      $("cross").hidden = e.target.value !== "mira";
      updCoords();
    };
    $("sPrefix").onchange = (e) => store.set("prefix", e.target.value.trim() || "P");
    $("sAcc").onchange = (e) => store.set("maxacc", Math.max(5, +e.target.value || 25));
    $("sOp").oninput = (e) => {
      store.set("opacity", +e.target.value);
      overlay == null ? void 0 : overlay.setOpacity(+e.target.value);
    };
    $("sOsm").onchange = (e) => {
      store.set("osm", e.target.checked);
      e.target.checked ? osm.addTo(map) : map.removeLayer(osm);
      overlay == null ? void 0 : overlay.bringToBack();
    };
  });
};
function showErr(where, e) {
  const msg = `${where}: ${(e == null ? void 0 : e.message) || e}`;
  console.error(msg, e);
  let b = $("errbar");
  if (!b) {
    b = document.createElement("div");
    b.id = "errbar";
    b.className = "errbar";
    b.onclick = () => b.remove();
    document.body.appendChild(b);
  }
  b.textContent = "Error \u2014 " + msg + " (toque para cerrar)";
}
window.addEventListener("error", (e) => showErr("Script", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showErr("Proceso", e.reason));
window.__appStarted = true;
(async () => {
  var _a2, _b2, _c;
  $("cross").hidden = pointMode() !== "mira";
  try {
    startGps();
  } catch (e) {
    showErr("GPS", e);
  }
  try {
    APP == null ? void 0 : APP.addListener("appUrlOpen", (d) => openFromUri(d == null ? void 0 : d.url));
    (_a2 = APP == null ? void 0 : APP.getLaunchUrl) == null ? void 0 : _a2.call(APP).then((d) => (d == null ? void 0 : d.url) && setTimeout(() => openFromUri(d.url), 600)).catch(() => {
    });
  } catch (e) {
  }
  try {
    APP == null ? void 0 : APP.addListener("backButton", () => {
      if ($("sheets").innerHTML) closeSheet();
      else if (!rec) APP.minimizeApp();
      else toast("Grabando track: use Detener antes de salir");
    });
  } catch (e) {
  }
  try {
    (_c = (_b2 = navigator.storage) == null ? void 0 : _b2.persist) == null ? void 0 : _c.call(_b2).catch(() => {
    });
  } catch (e) {
  }
  try {
    await loadTemplates();
  } catch (e) {
    showErr("Plantillas", e);
  }
  let maps = [];
  try {
    maps = await DB.all("maps");
  } catch (e) {
    showErr("Base de datos", e);
  }
  try {
    const cur = store.get("cur", null);
    if (cur && maps.find((m) => m.id === cur)) await openMap(cur);
    else if (maps.length) await openMap(maps[0].id);
    else $("welcome").hidden = false;
  } catch (e) {
    showErr("Abrir plano", e);
    $("welcome").hidden = false;
  }
  if (!NATIVE && "serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {
  });
  if (needsBackup() && Date.now() - store.get("lastBackup", 0) > 24 * 36e5) setTimeout(() => toast("Tiene datos sin respaldar. Vaya a Ajustes \u203A Crear respaldo."), 1500);
})();
$("fileBk").onchange = (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) restoreBackup(f);
};
window.__test = { importGeoPDF, findGeo, pdfText, buildKML, buildGPX, buildCSV, get features() {
  return features;
} };
try {
  $("verTxt").textContent = "Versi\xF3n " + (window.APP_VERSION || "local");
} catch (e) {
}
