'use strict';
/* GeoMerce — georreferenciación manual de planos sin GeoPDF (PDF o imagen) por puntos de control */

/* Dibuja la página 1 del PDF o la imagen en un canvas de tamaño manejable */
async function renderPlanToCanvas(file) {
  const buf = await file.arrayBuffer();
  const head = new Uint8Array(buf.slice(0, 1024));
  const isPdf = new TextDecoder('latin1').decode(head).indexOf('%PDF') >= 0;
  const MAXD = 4096, MAXPX = 14e6;
  if (isPdf) {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    let scale = Math.min(MAXD / Math.max(base.width, base.height), 5);
    if (base.width * base.height * scale * scale > MAXPX) scale = Math.sqrt(MAXPX / (base.width * base.height));
    const vp = page.getViewport({ scale });
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return cv;
  }
  const type = (file.type || '').toLowerCase();
  if (type && !type.startsWith('image/')) throw new Error('Elija un PDF o una imagen (JPG o PNG) del plano.');
  let img;
  try { img = await createImageBitmap(new Blob([buf], { type: type || 'image/jpeg' }), { imageOrientation: 'from-image' }); }
  catch (e) { throw new Error('No se pudo leer el archivo. Elija un PDF o una imagen JPG o PNG.'); }
  let k = Math.min(1, MAXD / Math.max(img.width, img.height));
  if (img.width * img.height * k * k > MAXPX) k = Math.sqrt(MAXPX / (img.width * img.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return cv;
}

/* Ajuste píxel -> coordenadas métricas. 2 puntos: similaridad; 3 o más: afín por mínimos cuadrados */
function fitGeoref(gcps) {
  const n = gcps.length;
  if (n < 2) return null;
  let fn;
  if (n === 2) {
    const [p, q] = gcps;
    const w1 = [p.px, -p.py], w2 = [q.px, -q.py], z1 = [p.mx, p.my], z2 = [q.mx, q.my];
    const dw = [w2[0] - w1[0], w2[1] - w1[1]], dz = [z2[0] - z1[0], z2[1] - z1[1]];
    const den = dw[0] * dw[0] + dw[1] * dw[1]; if (!den) return null;
    const a = [(dz[0] * dw[0] + dz[1] * dw[1]) / den, (dz[1] * dw[0] - dz[0] * dw[1]) / den];
    const b = [z1[0] - (a[0] * w1[0] - a[1] * w1[1]), z1[1] - (a[0] * w1[1] + a[1] * w1[0])];
    fn = (x, y) => { const w = [x, -y]; return [a[0] * w[0] - a[1] * w[1] + b[0], a[0] * w[1] + a[1] * w[0] + b[1]]; };
  } else {
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
    for (const g of gcps) {
      const v = [g.px, g.py, 1];
      for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) M[r][c] += v[r] * v[c]; bx[r] += v[r] * g.mx; by[r] += v[r] * g.my; }
    }
    const solve = (A, b) => {
      const a = A.map((r, i) => [...r, b[i]]);
      for (let i = 0; i < 3; i++) {
        let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(a[k][i]) > Math.abs(a[p][i])) p = k;
        [a[i], a[p]] = [a[p], a[i]];
        if (Math.abs(a[i][i]) < 1e-12) return null;
        for (let k = 0; k < 3; k++) if (k !== i) { const f = a[k][i] / a[i][i]; for (let j = i; j < 4; j++) a[k][j] -= f * a[i][j]; }
      }
      return a.map((r, i) => r[3] / r[i]);
    };
    const cx = solve(M, bx), cy = solve(M, by);
    if (!cx || !cy) return null;
    fn = (x, y) => [cx[0] * x + cx[1] * y + cx[2], cy[0] * x + cy[1] * y + cy[2]];
  }
  const res = gcps.map(g => { const [x, y] = fn(g.px, g.py); return Math.hypot(x - g.mx, y - g.my); });
  const rms = n > 2 ? Math.sqrt(res.reduce((s, r) => s + r * r, 0) / n) : null;
  return { fn, res, rms };
}

/* Coordenadas métricas para el ajuste: si el sistema es geográfico, se trabaja en CTM12 */
const metricOf = (crsId, x, y) => CRS.byId(crsId).geo ? CRS.fromWGS('9377', x, y) : [x, y];
const wgsOfMetric = (crsId, mx, my) => CRS.byId(crsId).geo ? CRS.toWGS('9377', mx, my) : CRS.toWGS(crsId, mx, my);

function crsSelectHtml(sel) {
  const groups = [];
  for (const c of CRS.LIST) { let g = groups.find(x => x.name === c.group); if (!g) groups.push(g = { name: c.group, items: [] }); g.items.push(c); }
  return groups.map(g => `<optgroup label="${esc(g.name)}">${g.items.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
}

/* Pantalla de georreferenciación. opts: {file} para un plano nuevo, o {map} para ajustar uno existente */
async function startManualGeoref(opts) {
  let blob, W, H, name, gcps = [], crsId = store.get('lastCrs', '9377'), target = opts.map || opts.target || null;
  if (opts.map) {
    blob = opts.map.blob; W = opts.map.w; H = opts.map.h; name = opts.map.name;
    if (opts.map.georef) { crsId = opts.map.georef.crs; gcps = opts.map.georef.gcps.map(g => Object.assign({}, g)); }
  } else {
    const busy = document.createElement('div'); busy.className = 'busy'; busy.textContent = 'Preparando el plano…'; document.body.appendChild(busy);
    try {
      const cv = await renderPlanToCanvas(opts.file);
      W = cv.width; H = cv.height;
      blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.9)); cv.width = cv.height = 0;
    } finally { busy.remove(); }
    name = (target && target.name) || opts.file.name.replace(/\.(pdf|jpe?g|png|webp)$/i, '');
  }

  const ov = document.createElement('div'); ov.className = 'gr'; ov.id = 'gr';
  ov.innerHTML = `
    <div class="gr-top">
      <div class="gr-steps"><b id="grTitle">Georreferenciar plano</b><small id="grHelp">Ubique la mira sobre un punto de coordenadas conocidas y toque Agregar punto.</small></div>
      <button class="x" id="grClose" aria-label="Cancelar">${X_ICON}</button>
    </div>
    <div class="gr-mapwrap"><div class="gr-map" id="grMap"></div><div class="crosshair gr-cross"></div></div>
    <div class="gr-bottom">
      <div class="gr-info"><span id="grCount">0 puntos</span><span id="grRms"></span><button class="linkbtn" id="grList">Ver puntos</button></div>
      <div class="row"><button class="btn primary" id="grAdd">Agregar punto aquí</button><button class="btn" id="grDone" disabled>Terminar</button></div>
    </div>`;
  document.body.appendChild(ov);
  const url = URL.createObjectURL(blob);
  const gm = L.map('grMap', { crs: L.CRS.Simple, minZoom: -6, maxZoom: 5, zoomSnap: 0.25, attributionControl: false, zoomControl: false });
  const bounds = [[-H, 0], [0, W]];
  L.imageOverlay(url, bounds).addTo(gm);
  gm.fitBounds(bounds);
  const layer = L.layerGroup().addTo(gm);
  window.__grMap = gm;
  setTimeout(() => gm.invalidateSize(), 50);
  const crsName = () => CRS.byId(crsId).name;

  const close = () => { gm.remove(); URL.revokeObjectURL(url); ov.remove(); closeSheet(); };
  $('grClose').onclick = () => {
    if (!gcps.length) { close(); return; }
    sheet('¿Salir sin guardar?', `<p>Perderá los ${gcps.length} puntos de control marcados.</p><div class="row"><button class="btn danger" id="grQuit">Salir sin guardar</button><button class="btn" id="grStay">Seguir</button></div>`, () => { $('grQuit').onclick = close; $('grStay').onclick = closeSheet; });
  };

  function refresh() {
    layer.clearLayers();
    const fit = fitGeoref(gcps);
    gcps.forEach((g, i) => {
      const bad = fit && fit.rms != null && fit.res[i] > Math.max(3 * fit.rms, 2);
      L.marker([-g.py, g.px], { icon: L.divIcon({ className: '', iconSize: [26, 26], iconAnchor: [13, 13], html: `<div class="gcp${bad ? ' bad' : ''}">${i + 1}</div>` }) })
        .on('click', () => editGcp(i)).addTo(layer);
    });
    $('grCount').textContent = gcps.length === 1 ? '1 punto' : `${gcps.length} puntos`;
    $('grRms').textContent = fit && fit.rms != null ? `Error medio ±${fit.rms < 10 ? fit.rms.toFixed(1) : Math.round(fit.rms)} m` : gcps.length === 2 ? 'Mínimo alcanzado; 3 o más dan más exactitud' : '';
    $('grRms').className = fit && fit.rms != null && fit.rms > 10 ? 'warn' : '';
    $('grDone').disabled = gcps.length < 2;
    $('grHelp').textContent = gcps.length < 3
      ? `Sistema: ${crsName()}. Marque al menos ${gcps.length < 2 ? 2 - gcps.length + ' punto' + (gcps.length ? '' : 's') : '1 punto más (recomendado)'}: cruces de la cuadrícula, mojones o esquinas con coordenadas conocidas.`
      : `Sistema: ${crsName()}. Puede agregar más puntos o tocar Terminar.`;
  }

  function editGcp(i, pos) {
    const g = i == null ? { px: pos[0], py: pos[1] } : gcps[i];
    const geo = !!CRS.byId(crsId).geo;
    const l1 = geo ? 'Latitud (grados decimales)' : 'Este (X)', l2 = geo ? 'Longitud (grados decimales)' : 'Norte (Y)';
    const v1 = g.x != null ? String(g.x) : '', v2 = g.y != null ? String(g.y) : '';
    sheet(i == null ? `Punto de control ${gcps.length + 1}` : `Punto de control ${i + 1}`, `
      <p class="note">Escriba las coordenadas de este punto según el plano. Sistema: <b>${esc(crsName())}</b>.</p>
      <div class="field"><label for="gX">${l1}</label><input id="gX" inputmode="decimal" autocomplete="off" value="${esc(v1)}" placeholder="${geo ? '6.07430' : 'Ej. 4739439'}"></div>
      <div class="field"><label for="gY">${l2}</label><input id="gY" inputmode="decimal" autocomplete="off" value="${esc(v2)}" placeholder="${geo ? '-75.35502' : 'Ej. 2229766'}"></div>
      <p class="formerr" id="gErr" hidden></p>
      <div class="row"><button class="btn primary" id="gSave">Guardar punto</button><button class="btn" id="gCancel">Cancelar</button></div>
      ${i != null ? '<button class="btn danger" id="gDel">Quitar este punto</button>' : ''}`, () => {
      setTimeout(() => $('gX') && $('gX').focus(), 80);
      $('gCancel').onclick = closeSheet;
      $('gSave').onclick = () => {
        const num = s => { s = String(s).trim().replace(/\s/g, ''); if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(',', '.'); return s === '' ? NaN : Number(s); };
        const x = num($('gX').value), y = num($('gY').value);
        let err = '';
        if (isNaN(x) || isNaN(y)) err = 'Escriba las dos coordenadas con números.';
        else if (geo && (Math.abs(x) > 15 || x < -5 || y > -60 || y < -82)) err = 'Esa latitud o longitud no está en Colombia. La longitud debe ser negativa (ej. -75.35).';
        else {
          try { const [la, lo] = CRS.toWGS(crsId, x, y); if (!(la > -5 && la < 14 && lo > -82 && lo < -66)) err = 'Esas coordenadas quedan fuera de Colombia en el sistema elegido. Revise los números o el sistema de coordenadas.'; }
          catch (e) { err = 'No se pudieron convertir esas coordenadas.'; }
        }
        if (err) { $('gErr').textContent = err; $('gErr').hidden = false; return; }
        const [mx, my] = metricOf(crsId, x, y);
        const ng = { px: g.px, py: g.py, x, y, mx, my };
        if (i == null) gcps.push(ng); else gcps[i] = ng;
        closeSheet(); refresh();
      };
      if ($('gDel')) $('gDel').onclick = () => { gcps.splice(i, 1); closeSheet(); refresh(); };
    });
  }
  $('grAdd').onclick = () => { const c = gm.getCenter(); const px = c.lng, py = -c.lat; if (px < 0 || py < 0 || px > W || py > H) { toast('Ubique la mira dentro del plano'); return; } editGcp(null, [px, py]); };
  $('grList').onclick = () => {
    const fit = fitGeoref(gcps);
    sheet('Puntos de control', gcps.length ? `<div class="list">${gcps.map((g, i) => `<button class="item" data-i="${i}"><span class="t"><b>Punto ${i + 1}</b><small>${CRS.byId(crsId).geo ? `${g.x}, ${g.y}` : `X ${g.x} · Y ${g.y}`}${fit && fit.rms != null ? ` · error ${fit.res[i].toFixed(1)} m` : ''}</small></span></button>`).join('')}</div>
      <p class="note">Si un punto tiene un error mucho mayor que los demás, revise sus coordenadas o vuelva a marcarlo.</p>` : '<p class="empty">Aún no hay puntos de control.</p>', w => {
      w.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const i = +b.dataset.i; gm.setView([-gcps[i].py, gcps[i].px], Math.max(gm.getZoom(), 0)); editGcp(i); });
    });
  };
  $('grDone').onclick = async () => {
    const fit = fitGeoref(gcps);
    if (!fit) { toast('Los puntos no permiten calcular la ubicación; revise que no estén repetidos'); return; }
    const corner = (x, y) => { const [mx, my] = fit.fn(x, y); return wgsOfMetric(crsId, mx, my); };
    const m = {
      id: target ? target.id : uid(), name, created: target ? target.created : Date.now(), blob, w: W, h: H,
      tl: corner(0, 0), tr: corner(W, 0), bl: corner(0, H), br: corner(W, H),
      georef: { crs: crsId, gcps: gcps.map(g => ({ px: g.px, py: g.py, x: g.x, y: g.y, mx: g.mx, my: g.my })), rms: fit.rms }
    };
    await DB.put('maps', m);
    close();
    $('welcome').hidden = true;
    await openMap(m.id);
    toast(fit.rms != null ? `Plano georreferenciado (error medio ±${fit.rms.toFixed(1)} m)` : 'Plano georreferenciado con 2 puntos');
  };

  // Paso 1: sistema de coordenadas y nombre
  if (opts.map && opts.map.georef) { refresh(); return; }
  refresh();
  sheet('Plano sin georreferencia', `
    <p>Este archivo no trae georreferencia. Puede ubicarlo usted marcando puntos con coordenadas conocidas, como cruces de la cuadrícula, mojones o esquinas.</p>
    <div class="field"><label for="grName">Nombre del plano</label><input id="grName" value="${esc(name)}" autocomplete="off"></div>
    <div class="field"><label for="grCrs">Sistema de coordenadas del plano</label><select id="grCrs">${crsSelectHtml(crsId)}</select></div>
    <p class="note">Búsquelo en el rótulo del plano. Como guía: en CTM12 el Este tiene 7 cifras (cerca de 4 700 000) y el Norte está cerca de 2 200 000; en MAGNA Origen Bogotá, Oeste y Medellín ambos valores están cerca de 1 000 000 y solo el rótulo los distingue.</p>
    <div class="row"><button class="btn primary" id="grGo">Continuar</button><button class="btn" id="grNo">Cancelar</button></div>`, () => {
    $('grNo').onclick = close;
    $('grGo').onclick = () => { crsId = $('grCrs').value; store.set('lastCrs', crsId); name = $('grName').value.trim() || name; closeSheet(); refresh(); };
  });
}
