'use strict';
/* GeoMerceditas — activación: cada celular necesita un código firmado por Corporación Merceditas */
const Gate = (() => {
  const ADMIN = 'thinestroza@corporacionmerceditas.org';
  const PUB = { kty: 'EC', crv: 'P-256', x: 'Pw9AMLgSIBnxW2mfTy8IfPtdcCMzjKGCN8dcSw88pQg', y: 'a_CsoCxgcjgZeXBcGIFLNvgpgzUUso7Esr6eVIiCJgM' };
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const ls = { get(k) { try { return localStorage.getItem('gm_' + k); } catch { return null; } }, set(k, v) { try { localStorage.setItem('gm_' + k, v); } catch { } } };
  const b32enc = u8 => { let bits = 0, val = 0, out = ''; for (const b of u8) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(val << (5 - bits)) & 31]; return out; };
  const b32dec = s => { const out = []; let bits = 0, val = 0; for (const ch of s) { const i = B32.indexOf(ch); if (i < 0) throw new Error('bad'); val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); };

  async function rawDeviceId() {
    try { const D = window.Capacitor?.isNativePlatform?.() && window.Capacitor.registerPlugin('Device'); if (D) { const r = await D.getId(); if (r?.identifier) return 'and:' + r.identifier; } } catch { }
    let id = ls.get('dev'); if (!id) { id = 'web:' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now()); ls.set('dev', id); }
    return id;
  }
  async function deviceCode() {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('geomerceditas|' + await rawDeviceId())));
    return b32enc(h).slice(0, 12).replace(/(.{4})(?=.)/g, '$1-');
  }
  async function verify(code, dev) {
    const clean = String(code).toUpperCase().replace(/[\s]/g, '');
    const i = clean.indexOf('-'); if (i < 1) return { ok: false };
    const exp = clean.slice(0, i), sigTxt = clean.slice(i + 1).replace(/-/g, '');
    if (!/^(0|\d{8})$/.test(exp)) return { ok: false };
    let sig; try { sig = b32dec(sigTxt); } catch { return { ok: false }; }
    if (sig.length < 64) return { ok: false };
    const key = await crypto.subtle.importKey('jwk', PUB, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig.slice(0, 64), new TextEncoder().encode(`GEOMERCEDITAS|${dev}|${exp}`));
    if (!ok) return { ok: false };
    if (exp !== '0') {
      const end = new Date(+exp.slice(0, 4), +exp.slice(4, 6) - 1, +exp.slice(6, 8), 23, 59, 59);
      if (Date.now() > end) return { ok: false, expired: true, exp };
      return { ok: true, exp };
    }
    return { ok: true, exp: null };
  }
  const fmtExp = e => e ? `${e.slice(6, 8)}/${e.slice(4, 6)}/${e.slice(0, 4)}` : null;

  function screen(dev, msg) {
    const g = document.createElement('div'); g.className = 'gate'; g.id = 'gate';
    const saved = (() => { try { return JSON.parse(ls.get('req') || '{}'); } catch { return {}; } })();
    g.innerHTML = `<div class="gate-card">
      <img class="gate-logo" src="logo-merceditas.png" alt="Corporación Merceditas">
      <h1>GeoMerceditas</h1>
      <p>Esta aplicación es de uso autorizado por la Corporación Merceditas. Para usarla en este celular, solicite un código de activación.</p>
      ${msg ? `<p class="gate-msg">${msg}</p>` : ''}
      <div class="gate-dev"><span>Código de este celular</span><b id="gDev">${dev}</b></div>
      <div class="field"><label for="gName">Su nombre completo</label><input id="gName" autocomplete="name" value="${(saved.name || '').replace(/"/g, '&quot;')}"></div>
      <div class="field"><label for="gOrg">Empresa o cargo</label><input id="gOrg" autocomplete="organization" value="${(saved.org || '').replace(/"/g, '&quot;')}"></div>
      <button class="btn primary" id="gReq">Solicitar autorización por correo</button>
      <p class="note">Se abre su correo con la solicitud dirigida a <b class="sel">${ADMIN}</b>. Si no se abre, use Copiar solicitud y envíela usted.</p>
      <button class="btn" id="gCopy">Copiar solicitud</button>
      <div class="gate-sep"></div>
      <div class="field"><label for="gCode">Código de activación recibido</label><textarea id="gCode" rows="3" placeholder="Pegue aquí el código que le enviaron" autocapitalize="characters" spellcheck="false"></textarea></div>
      <p class="formerr" id="gErr" hidden></p>
      <button class="btn primary" id="gAct">Activar</button>
    </div>`;
    document.body.appendChild(g);
    const body = () => {
      const name = $('gName').value.trim(), org = $('gOrg').value.trim();
      ls.set('req', JSON.stringify({ name, org }));
      return `Solicito autorización para usar GeoMerceditas en mi celular.\n\nNombre: ${name || '(sin nombre)'}\nEmpresa o cargo: ${org || '(sin dato)'}\nCódigo del celular: ${dev}\n`;
    };
    $('gReq').onclick = () => {
      if (!$('gName').value.trim()) { $('gErr').textContent = 'Escriba su nombre antes de solicitar.'; $('gErr').hidden = false; $('gName').focus(); return; }
      $('gErr').hidden = true;
      const subj = `Solicitud de activación GeoMerceditas - ${$('gName').value.trim()}`;
      location.href = `mailto:${ADMIN}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body())}`;
    };
    $('gCopy').onclick = async () => {
      const t = `Para: ${ADMIN}\nAsunto: Solicitud de activación GeoMerceditas\n\n${body()}`;
      try { await navigator.clipboard.writeText(t); toast('Solicitud copiada'); }
      catch { $('gCode').value = t; $('gCode').select(); toast('Seleccione y copie el texto'); }
    };
    return g;
  }

  async function ready() {
    const dev = await deviceCode();
    const saved = ls.get('act');
    if (saved) {
      const r = await verify(saved, dev);
      if (r.ok) { Gate.info = { dev, exp: r.exp }; return; }
      var msg = r.expired ? `Su autorización venció el ${fmtExp(r.exp)}. Solicite una nueva.` : '';
    }
    const g = screen(dev, msg);
    await new Promise(res => {
      $('gAct').onclick = async () => {
        const code = $('gCode').value;
        const r = await verify(code, dev);
        if (r.ok) { ls.set('act', code.trim()); Gate.info = { dev, exp: r.exp }; g.remove(); toast(r.exp ? `Activada hasta el ${fmtExp(r.exp)}` : 'GeoMerceditas activada'); res(); }
        else { $('gErr').textContent = r.expired ? `Ese código venció el ${fmtExp(r.exp)}.` : 'El código no es válido para este celular. Revise que lo haya pegado completo.'; $('gErr').hidden = false; }
      };
    });
  }
  return { ready, deviceCode, info: null, fmtExp, ADMIN };
})();
