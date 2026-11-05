'use strict';
/* GeoMerce — importar puntos desde Excel (xlsx/xls/ods), CSV o texto, y proyectos sin plano base */

/* ---------- Proyecto sin plano ---------- */
function newBlankProject(defaultName, then) {
  sheet('Trabajar sin plano', `
    <p>Registre puntos y tracks sobre el mapa base, sin cargar un plano. Más adelante puede agregarle un plano al proyecto.</p>
    <div class="field"><label for="bpName">Nombre del proyecto</label><input id="bpName" autocomplete="off" value="${esc(defaultName || 'Proyecto ' + new Date().toLocaleDateString('es-CO'))}"></div>
    <div class="row"><button class="btn primary" id="bpGo">Crear proyecto</button><button class="btn" id="bpNo">Cancelar</button></div>`, () => {
    setTimeout(() => { try { $('bpName').select(); } catch (e) { } }, 60);
    $('bpNo').onclick = closeSheet;
    $('bpGo').onclick = async () => {
      const m = { id: uid(), name: $('bpName').value.trim() || 'Proyecto', created: Date.now(), blank: true };
      await DB.put('maps', m); closeSheet(); $('welcome').hidden = true; await openMap(m.id, false);
      if (pos) map.setView([pos.lat, pos.lon], 17);
      toast('Proyecto creado'); if (then) then(m);
    };
  });
}

/* ---------- Lectura de la tabla ---------- */
const PT_NUM = v => {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).trim().replace(/\s/g, '');
  if (!s) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(s) ? Number(s) : NaN;
};
function splitText(txt) {
  txt = txt.replace(/^﻿/, '');
  const lines = txt.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sample = lines.slice(0, 20);
  const score = d => { const c = sample.map(l => splitLine(l, d).length); return c.every(x => x === c[0]) && c[0] > 1 ? c[0] : 0; };
  let best = null, bs = 0;
  for (const d of ['\t', ';', '|', ',']) { const s = score(d); if (s > bs) { bs = s; best = d; } }
  if (!best) best = /\s{1,}/;
  return lines.map(l => splitLine(l, best));
}
function splitLine(line, d) {
  if (d instanceof RegExp) return line.trim().split(d);
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
async function readTable(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf[0] === 0x50 && buf[1] === 0x4B, isOle = buf[0] === 0xD0 && buf[1] === 0xCF;
  if (isZip || isOle || /\.(xlsx|xlsm|xls|ods)$/i.test(file.name)) {
    const wb = XLSX.read(buf, { type: 'array' });
    const sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }).filter(r => r.some(c => String(c).trim() !== '')) })).filter(s => s.rows.length);
    if (!sheets.length) throw new Error('El archivo de Excel no tiene datos.');
    return sheets;
  }
  let txt;
  try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { txt = new TextDecoder('windows-1252').decode(buf); }
  const rows = splitText(txt);
  if (!rows.length) throw new Error('El archivo está vacío.');
  return [{ name: file.name, rows }];
}

/* ---------- Adivinar columnas y sistema ---------- */
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function guessColumns(header) {
  const h = header.map(norm);
  const find = re => { const i = h.findIndex(x => re.test(x)); return i < 0 ? -1 : i; };
  return {
    name: find(/^(nombre|name|id|punto|codigo|cod|no\.?|n°|numero|placa|arbol|label|etiqueta)\b/),
    x: find(/^(x|este|east|easting|e|coord_?x|coordenada_?x|longitud|longitude|lon|lng|long)\b/),
    y: find(/^(y|norte|north|northing|n|coord_?y|coordenada_?y|latitud|latitude|lat)\b/),
    note: find(/^(nota|notas|observacion|observaciones|obs|descripcion|description|comentario)/)
  };
}
function guessCrs(xs, ys) {
  const med = a => { const s = a.filter(v => !isNaN(v)).sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const x = med(xs), y = med(ys);
  if (x == null) return null;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 180) return { crs: '4326', swap: x < -60 && Math.abs(y) < 15 };
  if (x > 4000000 && x < 6000000 && y > 1000000 && y < 3500000) return { crs: '9377' };
  return null;
}

/* ---------- Flujo de importación ---------- */
async function importPointsFile(file) {
  let sheets;
  try { sheets = await readTable(file); }
  catch (e) { sheet('No se pudo leer', `<p>${esc(e.message || e)}</p><button class="btn" id="okE">Entendido</button>`, () => $('okE').onclick = closeSheet); return; }
  const base = file.name.replace(/\.(xlsx|xlsm|xls|ods|csv|txt|tsv)$/i, '');
  if (!curMap) {
    const m = { id: uid(), name: base, created: Date.now(), blank: true };
    await DB.put('maps', m); $('welcome').hidden = true; await openMap(m.id, false);
  }
  importStep(sheets, 0, base);
}
function importStep(sheets, si, base) {
  const rows = sheets[si].rows;
  const first = rows[0].map(c => String(c));
  const numericFirst = first.filter(c => !isNaN(PT_NUM(c))).length;
  let hasHeader = numericFirst < Math.max(2, first.length - 1);
  const header = hasHeader ? first.map((c, i) => c.trim() || `Columna ${i + 1}`) : first.map((c, i) => `Columna ${i + 1}`);
  const data = hasHeader ? rows.slice(1) : rows;
  const nc = Math.max(...rows.map(r => r.length));
  while (header.length < nc) header.push(`Columna ${header.length + 1}`);
  const g = guessColumns(header);
  // si no hay encabezado reconocible: buscar dos columnas numéricas consecutivas
  if (g.x < 0 || g.y < 0) {
    for (let i = 0; i < nc - 1; i++) {
      const okx = data.slice(0, 20).every(r => !isNaN(PT_NUM(r[i]))), oky = data.slice(0, 20).every(r => !isNaN(PT_NUM(r[i + 1])));
      if (okx && oky) { g.x = i; g.y = i + 1; break; }
    }
    if (g.name < 0 && g.x > 0) g.name = 0;
  }
  let crsGuess = g.x >= 0 && g.y >= 0 ? guessCrs(data.map(r => PT_NUM(r[g.x])), data.map(r => PT_NUM(r[g.y]))) : null;
  let crsId = crsGuess ? crsGuess.crs : store.get('lastCrs', '9377');
  if (crsGuess && crsGuess.swap) { const t = g.x; g.x = g.y; g.y = t; }
  const isGeo = id => !!CRS.byId(id).geo;
  const colSel = (id, sel, allowNone) => `<select id="${id}">${allowNone ? `<option value="-1" ${sel < 0 ? 'selected' : ''}>— Ninguna —</option>` : ''}${header.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select>`;
  sheet('Importar puntos', `
    ${sheets.length > 1 ? `<div class="field"><label for="ipSheet">Hoja de Excel</label><select id="ipSheet">${sheets.map((s, i) => `<option value="${i}" ${i === si ? 'selected' : ''}>${esc(s.name)} (${s.rows.length} filas)</option>`).join('')}</select></div>` : ''}
    <p class="note">${data.length} filas en <b>${esc(sheets[si].name)}</b>. Revise qué columna corresponde a cada dato.</p>
    <div class="field"><label for="ipCrs">Sistema de coordenadas</label><select id="ipCrs">${crsSelectHtml(crsId)}</select></div>
    <div class="field"><label for="ipName">Columna del nombre</label>${colSel('ipName', g.name, true)}</div>
    <div class="field"><label for="ipX" id="ipXl">${isGeo(crsId) ? 'Columna de la latitud' : 'Columna del Este (X)'}</label>${colSel('ipX', g.x >= 0 ? g.x : 0, false)}</div>
    <div class="field"><label for="ipY" id="ipYl">${isGeo(crsId) ? 'Columna de la longitud' : 'Columna del Norte (Y)'}</label>${colSel('ipY', g.y >= 0 ? g.y : Math.min(1, nc - 1), false)}</div>
    <div class="field"><label for="ipNote">Columna de la nota</label>${colSel('ipNote', g.note, true)}</div>
    <label class="toggle" for="ipHead"><span>La primera fila es el encabezado</span><input type="checkbox" id="ipHead" ${hasHeader ? 'checked' : ''}></label>
    <label class="toggle" for="ipExtra"><span>Guardar las demás columnas como campos<br><small class="note">Crea la plantilla «${esc(base)}» para verlas y exportarlas</small></span><input type="checkbox" id="ipExtra" checked></label>
    <div class="field"><label>Color</label>${swatchHtml('#1d64d8')}</div>
    <div class="kv" id="ipPrev">—</div>
    <p class="formerr" id="ipErr" hidden></p>
    <div class="row"><button class="btn primary" id="ipGo">Importar puntos</button><button class="btn" id="ipNo">Cancelar</button></div>`, () => {
    let color = '#1d64d8'; bindSwatches(c => color = c);
    const read = () => ({ crs: $('ipCrs').value, n: +$('ipName').value, x: +$('ipX').value, y: +$('ipY').value, note: +$('ipNote').value, head: $('ipHead').checked, extra: $('ipExtra').checked });
    const convert = o => {
      const rowsData = o.head === hasHeader ? data : (o.head ? rows.slice(1) : rows);
      const ok = [], bad = [];
      rowsData.forEach((r, i) => {
        const a = PT_NUM(r[o.x]), b = PT_NUM(r[o.y]);
        if (isNaN(a) || isNaN(b)) { bad.push(i); return; }
        try {
          const [lat, lon] = CRS.toWGS(o.crs, a, b);
          if (!(lat > -5 && lat < 14 && lon > -82 && lon < -66)) { bad.push(i); return; }
          ok.push({ r, lat, lon, a, b });
        } catch (e) { bad.push(i); }
      });
      return { ok, bad };
    };
    const preview = () => {
      const o = read();
      $('ipXl').textContent = isGeo(o.crs) ? 'Columna de la latitud' : 'Columna del Este (X)';
      $('ipYl').textContent = isGeo(o.crs) ? 'Columna de la longitud' : 'Columna del Norte (Y)';
      const { ok, bad } = convert(o);
      const ex = ok.slice(0, 3).map(p => { const [E, N] = toCTM(p.lat, p.lon); return `${esc(o.n >= 0 ? String(p.r[o.n]) : 'Punto')} → E ${fmtInt(E)} · N ${fmtInt(N)}`; }).join('<br>');
      $('ipPrev').innerHTML = `<b>${ok.length}</b> puntos válidos${bad.length ? ` · <span style="color:var(--warn)">${bad.length} filas sin coordenadas válidas</span>` : ''}${ex ? '<br>' + ex + (ok.length > 3 ? '<br>…' : '') : ''}`;
      return { o, ok, bad };
    };
    ['ipCrs', 'ipName', 'ipX', 'ipY', 'ipNote', 'ipHead'].forEach(id => $(id).onchange = preview);
    if ($('ipSheet')) $('ipSheet').onchange = e => importStep(sheets, +e.target.value, base);
    preview();
    $('ipNo').onclick = closeSheet;
    $('ipGo').onclick = async () => {
      const { o, ok } = preview();
      if (!ok.length) { $('ipErr').textContent = 'No hay filas con coordenadas válidas. Revise las columnas y el sistema de coordenadas: las coordenadas deben quedar dentro de Colombia.'; $('ipErr').hidden = false; return; }
      store.set('lastCrs', o.crs);
      const hdr = o.head ? header : header.map((h, i) => `Columna ${i + 1}`);
      // plantilla con las columnas adicionales
      let tpl = null, colField = {};
      const used = new Set([o.n, o.x, o.y, o.note]);
      const extraCols = o.extra ? hdr.map((h, i) => i).filter(i => !used.has(i)) : [];
      if (extraCols.length) {
        const fields = extraCols.map(i => {
          const vals = ok.map(p => p.r[i]).filter(v => String(v).trim() !== '');
          const allNum = vals.length && vals.every(v => !isNaN(PT_NUM(v)));
          const allInt = allNum && vals.every(v => Number.isInteger(PT_NUM(v)));
          const fd = { id: uid(), name: String(hdr[i]).trim() || `Columna ${i + 1}`, type: allInt ? 'int' : allNum ? 'num' : 'text' };
          colField[i] = fd; return fd;
        });
        const names = new Set();
        fields.forEach(f => { let n = f.name, k = 2; while (names.has(n.toLowerCase())) n = `${f.name} ${k++}`; f.name = n; names.add(n.toLowerCase()); });
        tpl = { id: uid(), name: base, created: Date.now(), fields };
        await DB.put('templates', tpl); TPL.push(tpl);
      }
      const now = Date.now(), prefix = store.get('prefix', 'P');
      let k = 0;
      for (const p of ok) {
        const data = {};
        for (const i in colField) { const fd = colField[i], v = p.r[i]; data[fd.id] = String(v).trim() === '' ? null : fd.type === 'text' ? String(v).trim() : PT_NUM(v); }
        const nm = o.n >= 0 && String(p.r[o.n]).trim() ? String(p.r[o.n]).trim() : nextName(prefix);
        const f = { id: uid(), mapId: curMap.id, type: 'point', name: nm, note: o.note >= 0 ? String(p.r[o.note] || '') : '', color, tpl: tpl ? tpl.id : '', data,
          lat: p.lat, lon: p.lon, alt: null, acc: null, source: 'importado', created: now + (k++) };
        features.push(f); await DB.put('features', f);
      }
      drawFeatures(); refreshSub(); closeSheet();
      follow = false; $('btnGps').classList.remove('on');
      map.fitBounds(L.latLngBounds(ok.map(p => [p.lat, p.lon])), { padding: [40, 40], maxZoom: 18 });
      toast(`${ok.length} puntos importados`);
    };
  });
}
