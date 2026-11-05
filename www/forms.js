"use strict";
const FIELD_TYPES = {
  text: "Texto corto",
  textarea: "Texto largo",
  int: "N\xFAmero entero",
  num: "N\xFAmero decimal",
  select: "Lista (una opci\xF3n)",
  multi: "Lista (varias opciones)",
  bool: "S\xED / No",
  date: "Fecha",
  time: "Hora",
  photo: "Fotograf\xEDas"
};
let TPL = [];
const tplById = (id) => TPL.find((t) => t.id === id) || null;
const KIND_TXT = { point: { one: "punto", many: "puntos" }, track: { one: "track", many: "tracks" } };
const choiceKey = (kind) => `tplChoice_${curMap ? curMap.id : "x"}_${kind}`;
function getChoice(kind) {
  const v = store.get(choiceKey(kind), null);
  if (v === "none") return "";
  return tplById(v) ? v : void 0;
}
function setChoice(kind, id) {
  store.set(choiceKey(kind), id === void 0 ? null : id || "none");
}
const defaultTplId = (kind) => getChoice(kind) || "";
const choiceName = (kind) => {
  const c = getChoice(kind);
  return c === void 0 ? "Preguntar al registrar" : c === "" ? "Sin plantilla" : tplById(c).name;
};
function chooseTemplate(kind, onPick) {
  const k = KIND_TXT[kind];
  sheet(`\xBFC\xF3mo quiere registrar los ${k.many}?`, `
    <p class="note">Elija una plantilla de campos para este ${k.one}, cree una nueva o registre sin plantilla (solo nombre, nota y coordenadas).</p>
    <div class="list">
      <button class="item" data-pick=""><span class="t"><b>Sin plantilla</b><small>Solo nombre, nota y coordenadas CTM12</small></span></button>
      ${TPL.map((t) => `<div class="item tplpick"><button class="t pickbtn" data-pick="${t.id}"><b>${esc(t.name)}</b><small>${t.fields.length ? t.fields.map((x) => esc(x.name)).join(" \xB7 ") : "Solo nombre y nota"}</small></button><button class="btn sm" data-edit="${t.id}">Modificar</button></div>`).join("")}
    </div>
    <button class="btn" id="chNew">Crear plantilla nueva</button>
    <label class="toggle" for="chKeep"><span>Usar esta elecci\xF3n para todos los ${k.many} de este plano<br><small class="note">Puede cambiarla en Ajustes \u203A Plantillas</small></span><input type="checkbox" id="chKeep" checked></label>`, (w) => {
    const pick = (id) => {
      var _a;
      if ((_a = $("chKeep")) == null ? void 0 : _a.checked) setChoice(kind, id);
      closeSheet();
      onPick(id);
    };
    w.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => pick(b.dataset.pick));
    w.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => editTemplate(tplById(b.dataset.edit), () => chooseTemplate(kind, onPick)));
    $("chNew").onclick = () => {
      const keep = $("chKeep").checked;
      editTemplate(null, (t) => t ? (keep && setChoice(kind, t.id), onPick(t.id)) : chooseTemplate(kind, onPick));
    };
  });
}
function withTemplate(kind, cb) {
  const c = getChoice(kind);
  if (c === void 0) chooseTemplate(kind, cb);
  else cb(c);
}
function tplOptions(sel) {
  return `<option value="" ${!sel ? "selected" : ""}>Sin plantilla</option>` + TPL.map((x) => `<option value="${x.id}" ${x.id === sel ? "selected" : ""}>${esc(x.name)}</option>`).join("");
}
async function loadTemplates() {
  TPL = (await DB.all("templates")).sort((a, b) => a.created - b.created);
  if (!TPL.length && !store.get("tplSeeded", false)) {
    const now = Date.now();
    const t2 = { id: uid(), name: "Inventario forestal (ejemplo)", created: now + 1, fields: [
      { id: uid(), name: "Nombre com\xFAn", type: "text", required: true },
      { id: uid(), name: "Nombre cient\xEDfico", type: "text" },
      { id: uid(), name: "DAP (cm)", type: "num", required: true },
      { id: uid(), name: "Altura total (m)", type: "num" },
      { id: uid(), name: "Estado fitosanitario", type: "select", options: ["Bueno", "Regular", "Malo"] },
      { id: uid(), name: "Tratamiento", type: "select", options: ["Conservar", "Talar", "Trasplantar", "Poda"] },
      { id: uid(), name: "Afectaciones", type: "multi", options: ["Plagas", "Hongos", "Descortezado", "Inclinaci\xF3n", "Ra\xEDces expuestas"] },
      { id: uid(), name: "Fotos", type: "photo" }
    ] };
    const t3 = { id: uid(), name: "Recorrido (ejemplo)", created: now + 2, fields: [
      { id: uid(), name: "Objetivo", type: "select", options: ["Reconocimiento", "Inventario", "Linderos", "Arqueolog\xEDa", "Seguimiento"], required: true },
      { id: uid(), name: "Responsable", type: "text" },
      { id: uid(), name: "Condici\xF3n del clima", type: "select", options: ["Soleado", "Nublado", "Lluvia"] },
      { id: uid(), name: "Fotos", type: "photo" }
    ] };
    for (const t of [t2, t3]) await DB.put("templates", t);
    store.set("tplSeeded", true);
    store.set("dirty", 0);
    TPL = [t2, t3];
  }
}
async function compressPhoto(file) {
  const MAX = 1600;
  let bmp;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (e) {
    bmp = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = URL.createObjectURL(file);
    });
  }
  const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((r) => cv.toBlob(r, "image/jpeg", 0.82));
}
const photoUrls = /* @__PURE__ */ new Map();
async function photoUrl(id) {
  if (photoUrls.has(id)) return photoUrls.get(id);
  const p = await DB.get("photos", id);
  if (!p) return "";
  const u = URL.createObjectURL(p.blob);
  photoUrls.set(id, u);
  return u;
}
async function deletePhotosOf(f) {
  var _a, _b;
  const t = tplById(f.tpl);
  const ids = [];
  for (const [k, v] of Object.entries(f.data || {})) if (Array.isArray(v) && (((_a = t == null ? void 0 : t.fields.find((x) => x.id === k)) == null ? void 0 : _a.type) === "photo" || typeof v[0] === "string" && ((_b = v[0]) == null ? void 0 : _b.startsWith("ph_")))) ids.push(...v);
  for (const id of ids) await DB.del("photos", id);
}
function formHtml(t, data) {
  if (!t || !t.fields.length) return "";
  return t.fields.map((fd) => {
    const id = "fx_" + fd.id, v = data == null ? void 0 : data[fd.id], req = fd.required ? ' <span class="req">*</span>' : "";
    const lab = `<label for="${id}">${esc(fd.name)}${req}</label>`;
    switch (fd.type) {
      case "textarea":
        return `<div class="field">${lab}<textarea id="${id}">${esc(v != null ? v : "")}</textarea></div>`;
      case "int":
        return `<div class="field">${lab}<input id="${id}" type="text" inputmode="numeric" value="${esc(v != null ? v : "")}" autocomplete="off"></div>`;
      case "num":
        return `<div class="field">${lab}<input id="${id}" type="text" inputmode="decimal" value="${esc(v != null ? v : "")}" autocomplete="off"></div>`;
      case "date":
        return `<div class="field">${lab}<input id="${id}" type="date" value="${esc(v != null ? v : "")}"></div>`;
      case "time":
        return `<div class="field">${lab}<input id="${id}" type="time" value="${esc(v != null ? v : "")}"></div>`;
      case "select":
        return `<div class="field">${lab}<select id="${id}"><option value="">\u2014</option>${(fd.options || []).map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
      case "multi":
        return `<div class="field"><label>${esc(fd.name)}${req}</label><div class="chips" id="${id}">${(fd.options || []).map((o) => `<label class="chip"><input type="checkbox" value="${esc(o)}" ${(v || []).includes(o) ? "checked" : ""}><span>${esc(o)}</span></label>`).join("")}</div></div>`;
      case "bool":
        return `<div class="field"><label>${esc(fd.name)}${req}</label><div class="seg" id="${id}">${["S\xED", "No"].map((o) => `<label><input type="radio" name="${id}" value="${o}" ${v === (o === "S\xED") ? "checked" : ""}><span>${o}</span></label>`).join("")}</div></div>`;
      case "photo":
        return `<div class="field"><label>${esc(fd.name)}${req}</label><div class="photos" id="${id}"></div>
        <div class="row"><button type="button" class="btn" data-cam="${fd.id}">Tomar foto</button><button type="button" class="btn" data-gal="${fd.id}">Galer\xEDa</button></div></div>`;
      default:
        return `<div class="field">${lab}<input id="${id}" value="${esc(v != null ? v : "")}" autocomplete="off"></div>`;
    }
  }).join("");
}
const parseNum = (s) => {
  s = String(s != null ? s : "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};
function readForm(t, data) {
  const out = { ...data || {} }, missing = [], bad = [];
  for (const fd of (t == null ? void 0 : t.fields) || []) {
    const el = $("fx_" + fd.id);
    if (!el) continue;
    let v;
    if (fd.type === "multi") v = [...el.querySelectorAll("input:checked")].map((i) => i.value);
    else if (fd.type === "bool") {
      const c = el.querySelector("input:checked");
      v = c ? c.value === "S\xED" : null;
    } else if (fd.type === "photo") v = out[fd.id] || [];
    else if (fd.type === "int" || fd.type === "num") {
      const n = parseNum(el.value);
      if (n != null && (isNaN(n) || fd.type === "int" && !Number.isInteger(n))) bad.push(fd.name);
      v = n;
    } else v = el.value.trim();
    out[fd.id] = v;
    const empty = v == null || v === "" || Array.isArray(v) && !v.length;
    if (fd.required && empty) missing.push(fd.name);
  }
  return { data: out, missing, bad };
}
function bindForm(t, data, pointId) {
  for (const fd of ((t == null ? void 0 : t.fields) || []).filter((x) => x.type === "photo")) {
    const box = $("fx_" + fd.id);
    const render = async () => {
      const ids = data[fd.id] || [];
      box.innerHTML = ids.length ? "" : '<p class="note">Sin fotos.</p>';
      for (const pid of ids) {
        const w = document.createElement("div");
        w.className = "ph";
        w.innerHTML = `<img alt="Foto" src="${await photoUrl(pid)}"><button type="button" aria-label="Quitar foto">${X_ICON}</button>`;
        const b = w.querySelector("button");
        b.onclick = async () => {
          if (!b.dataset.armed) {
            b.dataset.armed = 1;
            w.classList.add("armed");
            setTimeout(() => {
              delete b.dataset.armed;
              w.classList.remove("armed");
            }, 3e3);
            return;
          }
          data[fd.id] = (data[fd.id] || []).filter((x) => x !== pid);
          await DB.del("photos", pid);
          render();
        };
        w.querySelector("img").onclick = async () => viewPhoto(await photoUrl(pid));
        box.appendChild(w);
      }
    };
    const pick = (capture) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      if (capture) inp.setAttribute("capture", "environment");
      else inp.multiple = true;
      inp.onchange = async () => {
        for (const file of inp.files) {
          try {
            const blob = await compressPhoto(file);
            const id = "ph_" + uid();
            await DB.put("photos", { id, pointId, blob, created: Date.now() });
            (data[fd.id] = data[fd.id] || []).push(id);
          } catch (e) {
            toast("No se pudo leer la foto");
          }
        }
        render();
      };
      inp.click();
    };
    document.querySelector(`[data-cam="${fd.id}"]`).onclick = () => pick(true);
    document.querySelector(`[data-gal="${fd.id}"]`).onclick = () => pick(false);
    render();
  }
}
function viewPhoto(src) {
  const v = document.createElement("div");
  v.className = "photoview";
  v.innerHTML = `<img alt="Foto" src="${src}">`;
  v.onclick = () => v.remove();
  document.body.appendChild(v);
}
const safeName = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
function photoFileNames(f, fd) {
  var _a;
  return (((_a = f.data) == null ? void 0 : _a[fd.id]) || []).map((pid, i) => `${safeName(f.name)}_${safeName(fd.name)}_${i + 1}.jpg`);
}
function fieldText(f, fd) {
  var _a;
  const v = (_a = f.data) == null ? void 0 : _a[fd.id];
  if (v == null || v === "") return "";
  if (fd.type === "multi") return (v || []).join(", ");
  if (fd.type === "bool") return v ? "S\xED" : "No";
  if (fd.type === "photo") return photoFileNames(f, fd).join(" | ");
  if (fd.type === "num") return String(v).replace(".", ",");
  return String(v);
}
function exportColumns(pts) {
  const cols = [];
  for (const t of TPL) if (pts.some((p) => p.tpl === t.id)) {
    for (const fd of t.fields) if (!cols.includes(fd.name)) cols.push(fd.name);
  }
  return cols;
}
function fieldsByName(f) {
  const t = tplById(f.tpl), o = {};
  for (const fd of (t == null ? void 0 : t.fields) || []) o[fd.name] = fieldText(f, fd);
  return o;
}
function showTemplates() {
  const opt = (kind) => {
    const c = getChoice(kind);
    return `<option value="__ask" ${c === void 0 ? "selected" : ""}>Preguntar al registrar</option><option value="none" ${c === "" ? "selected" : ""}>Sin plantilla</option>` + TPL.map((t) => `<option value="${t.id}" ${t.id === c ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  };
  const setSel = (kind, v) => v === "__ask" ? setChoice(kind, void 0) : setChoice(kind, v === "none" ? "" : v);
  sheet("Plantillas de campos", `
    <p class="note">Una plantilla define los campos que se llenan al registrar un punto o un track. Si no elige ninguna, solo se guardan nombre, nota y coordenadas.</p>
    ${curMap ? `<div class="field"><label for="dPt">Puntos de este plano</label><select id="dPt">${opt("point")}</select></div>
    <div class="field"><label for="dTr">Tracks de este plano</label><select id="dTr">${opt("track")}</select></div>` : ""}
    <div class="sec">Plantillas</div>
    ${TPL.length ? `<div class="list">${TPL.map((t) => `<button class="item" data-edit="${t.id}">
      <span class="t"><b>${esc(t.name)}</b><small>${t.fields.length ? t.fields.map((f) => esc(f.name)).join(" \xB7 ") : "Solo nombre y nota"}</small></span>
      <span class="chev" aria-hidden="true">Modificar</span></button>`).join("")}</div>` : '<p class="empty">No hay plantillas.</p>'}
    <button class="btn primary" id="tplNew">Crear plantilla nueva</button>`, (w) => {
    if ($("dPt")) {
      $("dPt").onchange = (e) => setSel("point", e.target.value);
      $("dTr").onchange = (e) => setSel("track", e.target.value);
    }
    w.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => editTemplate(tplById(b.dataset.edit)));
    $("tplNew").onclick = () => editTemplate(null);
  });
}
function editTemplate(orig, after) {
  const back = (saved) => after ? after(saved) : showTemplates();
  const t = orig ? JSON.parse(JSON.stringify(orig)) : { id: uid(), name: "", created: Date.now(), fields: [{ id: uid(), name: "", type: "text" }] };
  const capture = () => {
    t.name = $("tName2").value;
    t.fields.forEach((fd) => {
      fd.name = $("fn_" + fd.id).value;
      fd.type = $("ft_" + fd.id).value;
      fd.required = $("fr_" + fd.id).checked;
      const o = $("fo_" + fd.id);
      if (o) fd.options = o.value.split("\n").map((s) => s.trim()).filter(Boolean);
    });
  };
  const fieldRow = (fd, i) => `<div class="fdef">
    <div class="fdef-top"><input id="fn_${fd.id}" value="${esc(fd.name)}" placeholder="Nombre del campo" aria-label="Nombre del campo" autocomplete="off">
      <button type="button" class="x" data-up="${i}" aria-label="Subir" ${i ? "" : "disabled"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 15 6-6 6 6"/></svg></button>
      <button type="button" class="x" data-down="${i}" aria-label="Bajar" ${i < t.fields.length - 1 ? "" : "disabled"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
      <button type="button" class="x" data-rm="${i}" aria-label="Quitar campo">${X_ICON}</button></div>
    <div class="fdef-mid"><select id="ft_${fd.id}" aria-label="Tipo de campo">${Object.entries(FIELD_TYPES).map(([k, n]) => `<option value="${k}" ${k === fd.type ? "selected" : ""}>${n}</option>`).join("")}</select>
      <label class="req-tg"><input type="checkbox" id="fr_${fd.id}" ${fd.required ? "checked" : ""}> Obligatorio</label></div>
    ${fd.type === "select" || fd.type === "multi" ? `<textarea id="fo_${fd.id}" placeholder="Una opci\xF3n por l\xEDnea" aria-label="Opciones">${esc((fd.options || []).join("\n"))}</textarea>` : ""}
  </div>`;
  const render = () => {
    sheet(orig ? "Editar plantilla" : "Nueva plantilla", `
      <div class="field"><label for="tName2">Nombre de la plantilla</label><input id="tName2" value="${esc(t.name)}" placeholder="Ej. Inventario forestal" autocomplete="off"></div>
      <div class="sec">Campos</div>
      <p class="note">Adem\xE1s de estos campos, cada registro siempre tiene nombre, nota, fecha y coordenadas CTM12 (en tracks, tambi\xE9n longitud y duraci\xF3n).</p>
      <div class="fdefs">${t.fields.map(fieldRow).join("") || '<p class="empty">Sin campos.</p>'}</div>
      <button class="btn" id="fAdd">Agregar campo</button>
      <p class="note" id="tErr" hidden></p>
      <div class="row"><button class="btn primary" id="tplSave">Guardar plantilla</button><button class="btn" id="tplBack">Cancelar</button></div>
      ${orig ? '<button class="btn danger" id="tplDel">Eliminar plantilla</button>' : ""}`, (w) => {
      w.querySelectorAll(".fdef select").forEach((s) => s.onchange = () => {
        capture();
        render();
      });
      w.querySelectorAll("[data-up]").forEach((b) => b.onclick = () => {
        capture();
        const i = +b.dataset.up;
        [t.fields[i - 1], t.fields[i]] = [t.fields[i], t.fields[i - 1]];
        render();
      });
      w.querySelectorAll("[data-down]").forEach((b) => b.onclick = () => {
        capture();
        const i = +b.dataset.down;
        [t.fields[i + 1], t.fields[i]] = [t.fields[i], t.fields[i + 1]];
        render();
      });
      w.querySelectorAll("[data-rm]").forEach((b) => b.onclick = () => {
        capture();
        t.fields.splice(+b.dataset.rm, 1);
        render();
      });
      $("fAdd").onclick = () => {
        capture();
        const fd = { id: uid(), name: "", type: "text" };
        t.fields.push(fd);
        render();
        setTimeout(() => {
          var _a;
          return (_a = $("fn_" + fd.id)) == null ? void 0 : _a.focus();
        }, 50);
      };
      $("tplBack").onclick = () => back(null);
      $("tplSave").onclick = async () => {
        capture();
        t.fields = t.fields.filter((fd) => fd.name.trim());
        t.fields.forEach((fd) => {
          fd.name = fd.name.trim();
          if (fd.type !== "select" && fd.type !== "multi") delete fd.options;
          if (!fd.required) delete fd.required;
        });
        const names = t.fields.map((f) => f.name.toLowerCase());
        const err = !t.name.trim() ? "Escriba un nombre para la plantilla." : names.some((n, i2) => names.indexOf(n) !== i2) ? "Hay dos campos con el mismo nombre." : t.fields.some((f) => (f.type === "select" || f.type === "multi") && !(f.options || []).length) ? "Las listas necesitan al menos una opci\xF3n." : "";
        if (err) {
          $("tErr").textContent = err;
          $("tErr").hidden = false;
          $("tErr").style.color = "var(--rec)";
          return;
        }
        t.name = t.name.trim();
        await DB.put("templates", t);
        const i = TPL.findIndex((x) => x.id === t.id);
        if (i >= 0) TPL[i] = t;
        else TPL.push(t);
        toast("Plantilla guardada");
        back(t);
      };
      if ($("tplDel")) {
        const used = features.filter((f) => f.tpl === t.id).length;
        confirmBtn($("tplDel"), used ? `Toque otra vez: ${used} registros quedar\xE1n sin plantilla` : "Toque otra vez para eliminar", async () => {
          await DB.del("templates", t.id);
          TPL = TPL.filter((x) => x.id !== t.id);
          for (const f of (await DB.all("features")).filter((f2) => f2.tpl === t.id)) {
            f.tpl = "";
            await DB.put("features", f);
          }
          features.forEach((f) => {
            if (f.tpl === t.id) f.tpl = "";
          });
          back(null);
        });
      }
    });
  };
  render();
}
