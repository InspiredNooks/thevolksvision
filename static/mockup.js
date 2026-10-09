// VolksVision Mockup maker: put logos, decals, merch, text and cutouts over VW photos.
// Loaded on demand by the Studio (admin.html) with: (await import("/mockup.js")).openMockup(ctx)
// ctx = { api, toast, fail, esc, state, uploadBlob(blob) -> url, saveSettings(patch), useAsProductPhoto(blob, productId) }

const FORMATS = [["Post 4:5", 1080, 1350], ["Story 9:16", 1080, 1920], ["Square", 1080, 1080], ["Wide 16:9", 1920, 1080]];
const BLENDS = [["Normal", "source-over"], ["Print on paint", "multiply"], ["Glow", "screen"], ["Blend in", "overlay"]];
const COLORS = ["#ffffff", "#0b0d0c", "#f2a93b", "#79a99a", "#d6452c"];
const VW = [["Mk2 Jetta", "/img/vw/mk2-jetta.jpg"], ["Mk2 Golf", "/img/vw/mk2-golf.jpg"], ["Beetle", "/img/vw/beetle.jpg"], ["Bus", "/img/vw/bus.jpg"]];
const LOGOS = [["Wheel, white", "/img/brand/wheel-white.png"], ["Wheel, black", "/img/brand/wheel-black.png"], ["Wheel, amber", "/img/brand/wheel-amber.png"],
  ["Logo + name, white", "/img/brand/lockup-white.png"], ["Logo + name, black", "/img/brand/lockup-black.png"]];

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("That image couldn't load.")); i.src = src; });
let uid = 0;

export function openMockup(ctx, start = {}) {
  const { api, toast, fail, esc, state } = ctx;
  const M = { fmt: 0, layers: [], sel: null, credits: [] };
  const W = () => FORMATS[M.fmt][1], H = () => FORMATS[M.fmt][2];

  const host = document.createElement("div"); host.className = "mk"; host.setAttribute("role", "dialog"); host.setAttribute("aria-modal", "true"); host.setAttribute("aria-label", "Mockup maker");
  host.innerHTML = `<div class="pe-bar"><button class="link" type="button" data-mk="close">Close</button><h2>Mockup maker</h2><button class="btn sea" type="button" data-mk="export">Export</button></div>
    <div class="mk-stage"><canvas class="mk-canvas"></canvas></div>
    <div class="mk-tools">
      <div class="chips" role="group" aria-label="Size">${FORMATS.map(([l], i) => `<button type="button" class="chip" data-fmt="${i}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>
      <div class="mk-add">${[["bg", "🚗 Car photo"], ["logo", "◎ Logo"], ["img", "🖼 Image / decal / merch"], ["cut", "✂ Cutout"], ["text", "T Text"], ["frame", "▭ Frame"], ["tpl", "✨ Templates"]].map(([k, l]) => `<button type="button" class="btn" data-addk="${k}">${l}</button>`).join("")}</div>
      <div class="mk-panel" id="mkPanel"></div>
    </div>
    <div class="mk-pick" hidden><div class="mk-pick-in"><div class="pe-bar"><button class="link" type="button" data-mk="pick-close">Back</button><h2 id="mkPickTitle"></h2><span style="width:48px"></span></div><div class="mk-pick-body" id="mkPick"></div></div></div>
    <input type="file" accept="image/*" hidden data-mkfile>`;
  document.body.appendChild(host);
  const cv = host.querySelector(".mk-canvas"), stage = host.querySelector(".mk-stage"), g = cv.getContext("2d"), fileIn = host.querySelector("[data-mkfile]");
  const $h = s => host.querySelector(s);

  // ---------- drawing ----------
  function fit() {
    const r = stage.getBoundingClientRect(), k = Math.min((r.width - 24) / W(), (r.height - 24) / H());
    cv.width = W(); cv.height = H(); cv.style.width = W() * k + "px"; cv.style.height = H() * k + "px"; draw();
  }
  const scaleOf = () => cv.getBoundingClientRect().width / W();
  function drawLayer(c, L) {
    c.save(); c.globalAlpha = L.o; c.globalCompositeOperation = L.blend || "source-over";
    c.translate(L.x, L.y); c.rotate(L.r * Math.PI / 180); if (L.skew) c.transform(1, 0, Math.tan(L.skew * Math.PI / 180), 1, 0, 0); c.scale(L.s * (L.flip ? -1 : 1), L.s);
    if (L.kind === "text") {
      c.font = `800 ${L.size}px "Archivo", "Helvetica Neue", Arial, sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      const lines = L.text.split("\n"), lh = L.size * 1.02, w = Math.max(...lines.map(t => c.measureText(t).width));
      if (L.plate) { c.fillStyle = L.color === "#0b0d0c" ? "#f2a93b" : "#0b0d0c"; c.fillRect(-w / 2 - L.size * .35, -lines.length * lh / 2 - L.size * .2, w + L.size * .7, lines.length * lh + L.size * .4); }
      c.fillStyle = L.color; lines.forEach((t, i) => c.fillText(t, 0, (i - (lines.length - 1) / 2) * lh));
      L.w = w + (L.plate ? L.size * .7 : 0); L.h = lines.length * lh + (L.plate ? L.size * .4 : 0);
    } else if (L.kind === "frame") {
      c.restore(); c.save(); drawFrame(c); c.restore(); return;
    } else c.drawImage(L.img, -L.w / 2, -L.h / 2, L.w, L.h);
    c.restore();
  }
  function drawFrame(c) {
    const w = W(), h = H(), m = Math.round(w * .035), bar = Math.round(h * .085);
    c.strokeStyle = "#ffffff"; c.lineWidth = Math.max(4, w * .006); c.strokeRect(m, m, w - m * 2, h - m * 2);
    c.fillStyle = "rgba(11,13,12,.86)"; c.fillRect(m, h - m - bar, w - m * 2, bar);
    c.fillStyle = "#ffffff"; c.font = `800 ${bar * .42}px "Archivo", Arial, sans-serif`; c.textBaseline = "middle"; c.textAlign = "left";
    c.fillText("VOLKSVISION", m + bar * .4, h - m - bar / 2);
    c.fillStyle = "#f2a93b"; c.font = `500 ${bar * .26}px "IBM Plex Mono", monospace`; c.textAlign = "right";
    c.fillText("@THEVOLKSVISION", w - m - bar * .4, h - m - bar / 2);
  }
  function draw(exporting = false) {
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W(), H()); g.fillStyle = "#0b0d0c"; g.fillRect(0, 0, W(), H());
    for (const L of M.layers) drawLayer(g, L);
    if (!exporting && M.sel) {
      const L = M.sel; if (L.kind === "frame") return;
      g.save(); g.translate(L.x, L.y); g.rotate(L.r * Math.PI / 180);
      g.strokeStyle = "#f2a93b"; g.lineWidth = 4 / scaleOf(); g.setLineDash([14, 10]);
      g.strokeRect(-L.w * L.s / 2, -L.h * L.s / 2, L.w * L.s, L.h * L.s); g.restore();
    }
  }

  // ---------- layers ----------
  const coverScale = (w, h) => Math.max(W() / w, H() / h);
  // A wide car photo on a tall post: show the whole car (full width) instead of cropping it; pinch to zoom in.
  const bgScale = (w, h) => (w / h > 1.2 && W() / H() < 1) ? W() / w : coverScale(w, h);
  function addImage(img, kind, extra = {}) {
    const L = { id: ++uid, kind, img, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, x: W() / 2, y: H() / 2, r: 0, o: 1, blend: "source-over", skew: 0, flip: false, ...extra };
    if (kind === "bg") { L.s = bgScale(L.w, L.h); M.layers = M.layers.filter(x => x.kind !== "bg"); M.layers.unshift(L); }
    else { L.s = extra.s || Math.min(W() * .5 / L.w, H() * .4 / L.h); M.layers.splice(frameIndex(), 0, L); }
    select(L); return L;
  }
  const frameIndex = () => { const i = M.layers.findIndex(x => x.kind === "frame"); return i < 0 ? M.layers.length : i; };
  function addText(text = "DROP 02", extra = {}) {
    const L = { id: ++uid, kind: "text", text, size: 120, color: "#ffffff", plate: false, x: W() / 2, y: H() * .2, s: 1, r: 0, o: 1, blend: "source-over", skew: 0, flip: false, w: 400, h: 120, ...extra };
    M.layers.splice(frameIndex(), 0, L); select(L); return L;
  }
  function toggleFrame() {
    const f = M.layers.find(x => x.kind === "frame");
    if (f) M.layers = M.layers.filter(x => x !== f); else M.layers.push({ id: ++uid, kind: "frame", o: 1, x: 0, y: 0, s: 1, r: 0, w: 0, h: 0 });
    select(null);
  }
  function select(L) { M.sel = L; panel(); draw(); }

  // ---------- touch: tap to pick a layer, drag to move, pinch to size + rotate ----------
  const pts = new Map(); let drag = null, pinch = null;
  const toCanvas = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W(), (e.clientY - r.top) / r.height * H()]; };
  function hit(px, py) {
    for (let i = M.layers.length - 1; i >= 0; i--) {
      const L = M.layers[i]; if (L.kind === "frame") continue;
      const a = -L.r * Math.PI / 180, dx = px - L.x, dy = py - L.y, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= L.w * L.s / 2 && Math.abs(ly) <= L.h * L.s / 2) return L;
    }
    return null;
  }
  stage.addEventListener("pointerdown", e => {
    if (e.target !== cv) return; cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, toCanvas(e));
    if (pts.size === 1) { const [x, y] = toCanvas(e); const L = hit(x, y); if (L !== M.sel) select(L); drag = L ? { L, x, y, ox: L.x, oy: L.y } : null; }
    if (pts.size === 2 && M.sel) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), ang: Math.atan2(b[1] - a[1], b[0] - a[0]), s: M.sel.s, r: M.sel.r, size: M.sel.size }; drag = null; }
  });
  stage.addEventListener("pointermove", e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, toCanvas(e));
    if (pinch && pts.size === 2 && M.sel) {
      const [a, b] = [...pts.values()], k = Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d;
      M.sel.s = Math.max(.05, Math.min(20, pinch.s * k)); M.sel.r = pinch.r + (Math.atan2(b[1] - a[1], b[0] - a[0]) - pinch.ang) * 180 / Math.PI; draw(); syncPanel();
    } else if (drag) { const [x, y] = toCanvas(e); drag.L.x = drag.ox + x - drag.x; drag.L.y = drag.oy + y - drag.y; draw(); }
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) drag = null; };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", e => { if (!M.sel) return; e.preventDefault(); M.sel.s = Math.max(.05, Math.min(20, M.sel.s * (e.deltaY < 0 ? 1.06 : .94))); draw(); syncPanel(); }, { passive: false });

  // ---------- selected-layer controls ----------
  const range = (k, label, min, max, step, val) => `<label class="range-pair">${label}<input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-lk="${k}"><span>${Math.round(val * (k === "o" ? 100 : 1))}${k === "o" ? "%" : k === "r" || k === "skew" ? "°" : ""}</span></label>`;
  function panel() {
    const p = $h("#mkPanel"), L = M.sel;
    if (!L) { p.innerHTML = `<p class="r-sub" style="white-space:normal;margin:0">${M.layers.length ? "Tap anything on the picture to move, size or turn it. Two fingers pinch and rotate." : "Start with ✨ Templates, or pick a 🚗 Car photo."}</p>`; return; }
    const sizeMax = L.kind === "bg" ? 6 : 4;
    p.innerHTML = `<div class="mk-row"><strong>${L.kind === "bg" ? "Car photo" : L.kind === "text" ? "Text" : L.kind === "cut" ? "Cutout" : "Image"}</strong>
        <span class="mk-btns"><button type="button" class="act-btn" data-lact="back" aria-label="Send back">⤓</button><button type="button" class="act-btn" data-lact="front" aria-label="Bring forward">⤒</button><button type="button" class="act-btn" data-lact="flip" aria-label="Flip">⇋</button><button type="button" class="act-btn" data-lact="dup" aria-label="Duplicate">⧉</button><button type="button" class="act-btn del" data-lact="del" aria-label="Delete">✕</button></span></div>
      ${L.kind === "text" ? `<textarea data-lk="text" rows="2" style="width:100%;padding:10px;border-radius:8px;border:1px solid var(--rule);background:var(--paper);font-weight:700">${esc(L.text)}</textarea>
        <div class="mk-row"><span class="mk-colors">${COLORS.map(c => `<button type="button" class="mk-color" data-color="${c}" style="background:${c}" aria-label="Color ${c}" aria-pressed="${c === L.color}"></button>`).join("")}</span><label class="mk-plate"><input type="checkbox" data-lk="plate"${L.plate ? " checked" : ""}> Plate</label></div>
        ${range("size", "Size", 30, 400, 1, L.size)}` : range("s", "Size", .05, sizeMax, .01, L.s)}
      ${range("r", "Turn", -180, 180, 1, L.r)}
      ${L.kind !== "bg" ? range("skew", "Angle", -40, 40, 1, L.skew) + range("o", "See-through", .1, 1, .01, L.o)
        + `<div class="chips" role="group" aria-label="Look">${BLENDS.map(([l, v]) => `<button type="button" class="chip" data-blend="${v}" aria-pressed="${(L.blend || "source-over") === v}">${l}</button>`).join("")}</div>
           <small class="r-sub" style="white-space:normal">Decal on paint: try "Print on paint" and a little Angle to match the car's side.</small>` : ""}`;
  }
  function syncPanel() { if (!M.sel) return; host.querySelectorAll("[data-lk]").forEach(i => { if (i.type === "range") { i.value = M.sel[i.dataset.lk]; i.nextElementSibling.textContent = Math.round(M.sel[i.dataset.lk] * (i.dataset.lk === "o" ? 100 : 1)) + (i.dataset.lk === "o" ? "%" : i.dataset.lk === "r" || i.dataset.lk === "skew" ? "°" : ""); } }); }
  host.addEventListener("input", e => {
    const k = e.target.dataset.lk; if (!k || !M.sel) return;
    M.sel[k] = e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" ? +e.target.value : e.target.value;
    if (e.target.type === "range") e.target.nextElementSibling.textContent = Math.round(+e.target.value * (k === "o" ? 100 : 1)) + (k === "o" ? "%" : k === "r" || k === "skew" ? "°" : "");
    draw();
  });

  // ---------- pickers ----------
  function picker(title, html) { $h("#mkPickTitle").textContent = title; $h("#mkPick").innerHTML = html; $h(".mk-pick").hidden = false; }
  const closePick = () => { $h(".mk-pick").hidden = true; };
  const tiles = (items, attr) => `<div class="mk-grid">${items.map((x, i) => `<button type="button" class="mk-tile" ${attr}="${i}" aria-label="${esc(x.label || "")}"><img src="${esc(x.thumb || x.url)}" alt="" loading="lazy" crossorigin="anonymous"><span>${esc(x.label || "")}</span></button>`).join("")}</div>`;
  let pickList = [], pickKind = "bg";
  function showCarPicker() {
    const s = state.settings || {};
    const lists = [
      ["Your photos", (s.library || []).map(x => ({ url: x.url, label: x.label || "" }))],
      ["Your Mk2", ((s.build || {}).gallery || []).map(x => ({ url: x.url, label: x.alt || "Mk2" }))],
      ["Crew cars (fans said yes to ads and merch promo)", (state.crew || []).filter(c => c.status === "approved" && c.photo).map(c => ({ url: c.photo, label: `${c.car}${c.handle ? " · " + c.handle : ""}`, credit: c.handle || c.name }))],
      ["VolksVision illustrations", VW.map(([label, url]) => ({ url, label }))]
    ];
    pickList = []; pickKind = "bg";
    picker("Car photo", `<div class="mk-row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn sea" data-mk="upload-bg">Upload a photo</button><button type="button" class="btn" data-mk="stock">Search free photos</button></div>
      ${lists.map(([t, items]) => { const start = pickList.length; pickList.push(...items); return items.length ? `<h3 class="mono" style="margin:16px 0 8px">${esc(t)}</h3>${tiles(items.map((x, i) => ({ ...x, i: start + i })), "data-pick-x")}`.replace(/data-pick-x="(\d+)"/g, (m, n) => `data-pick="${start + +n}"`) : ""; }).join("")}`);
  }
  function showImagePicker(kind) {
    const prods = (state.products || []).flatMap(p => [p.image && { url: p.image, label: p.name }, ...(p.images || []).map(x => ({ url: x.url, label: p.name }))]).filter(Boolean);
    pickList = [...LOGOS.map(([label, url]) => ({ url, label })), ...prods]; pickKind = kind;
    picker(kind === "cut" ? "Cutout" : "Image, decal or merch", (kind === "cut"
      ? `<div class="card" style="margin-bottom:12px"><strong>Make a cutout on iPhone</strong><span class="r-sub" style="white-space:normal">In Photos, press and hold on RJ, a part or a shirt until it lifts off. Tap Copy, then come back and tap Paste cutout. Or Share → Save Image and upload it here.</span></div>
         <div class="mk-row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn sea" data-mk="paste">Paste cutout</button><button type="button" class="btn" data-mk="upload-img">Upload PNG</button></div>`
      : `<div class="mk-row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn sea" data-mk="upload-img">Upload image or decal</button><button type="button" class="btn" data-mk="paste">Paste</button></div><small class="r-sub" style="white-space:normal;display:block;margin-top:6px">PNGs with see-through backgrounds look best for decals and logos.</small>`)
      + `<h3 class="mono" style="margin:16px 0 8px">VolksVision logos</h3>${tiles(pickList.slice(0, LOGOS.length).map(x => ({ ...x })), "data-pick").replace(/data-pick="(\d+)"/g, (m, n) => `data-pick="${n}"`)}`
      + (prods.length ? `<h3 class="mono" style="margin:16px 0 8px">Your merch photos</h3>${tiles(prods, "data-pickp").replace(/data-pickp="(\d+)"/g, (m, n) => `data-pick="${LOGOS.length + +n}"`)}` : ""));
  }
  async function showStock(q = "volkswagen") {
    picker("Free photos", `<form class="ask-row" data-stockform><input name="q" value="${esc(q)}" placeholder="mk2 jetta, vw bus, gti…" style="padding:11px 12px;border:1px solid var(--rule);border-radius:8px;background:var(--paper)"><button class="btn sea" type="submit">Search</button></form>
      <small class="r-sub" style="white-space:normal;display:block;margin:6px 0 10px">Free for ads, posters and mockups. Don't sell the photo by itself on merch. Photographer credit is added to your export notes.</small><div id="mkStock"><p class="r-sub">Searching…</p></div>`);
    try {
      const r = await api(`photos?q=${encodeURIComponent(q)}`);
      if (r.off) { $h("#mkStock").innerHTML = `<div class="card"><strong>Free photo search is almost ready</strong><span class="r-sub" style="white-space:normal">Cara adds a free Unsplash key (UNSPLASH_ACCESS_KEY) in Netlify once. Until then, upload photos or use the illustrations.</span></div>`; return; }
      pickList = r.photos.map(p => ({ url: p.full, thumb: p.thumb, label: `${p.by} · ${p.source}`, stock: p })); pickKind = "bg";
      $h("#mkStock").innerHTML = pickList.length ? tiles(pickList, "data-pick") : `<p class="r-sub">Nothing found. Try other words.</p>`;
    } catch (err) { $h("#mkStock").innerHTML = `<p class="r-sub">${esc(err.message)}</p>`; }
  }
  async function usePicked(i) {
    const x = pickList[i]; if (!x) return; closePick(); toast("Loading…");
    try {
      const img = await loadImg(x.url);
      if (x.stock) { M.credits.push(`${x.stock.source} photo by ${x.stock.by} (${x.stock.byUrl})`); if (x.stock.download) api("photos", { method: "POST", body: { download_location: x.stock.download } }).catch(() => {}); }
      if (x.credit) M.credits.push(`Car: ${x.credit}`);
      addImage(img, pickKind === "bg" ? "bg" : pickKind === "cut" ? "cut" : "img");
    } catch (err) { fail(err); }
  }
  let fileMode = "bg";
  fileIn.addEventListener("change", async () => {
    const f = fileIn.files[0]; fileIn.value = ""; if (!f) return; closePick();
    const url = URL.createObjectURL(f);
    try {
      const img = await loadImg(url);
      addImage(img, fileMode);
      if (fileMode === "bg" && ctx.uploadBlob) {                 // keep his own car photos in his library for next time
        ctx.uploadBlob(f).then(u => ctx.saveSettings({ library: [{ url: u, label: f.name.replace(/\.\w+$/, "").slice(0, 40) }, ...((state.settings || {}).library || [])].slice(0, 60) })).catch(() => {});
      }
    } catch (err) { fail(err); }
  });
  async function pasteImage(kind) {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) { const t = it.types.find(x => x.startsWith("image/")); if (t) { const b = await it.getType(t); closePick(); addImage(await loadImg(URL.createObjectURL(b)), kind); return; } }
      toast("Nothing to paste. Copy a cutout in Photos first.", true);
    } catch { toast("Pasting isn't allowed here. Use Upload instead.", true); }
  }

  // ---------- templates ----------
  async function template(k) {
    closePick(); M.layers = []; M.credits = []; M.sel = null;
    const bg = await loadImg(VW[0][1]); addImage(bg, "bg");
    const logo = async (n, extra) => addImage(await loadImg(LOGOS[n][1]), "img", extra);
    if (k === "decal") { await logo(1, { x: W() * .48, y: H() * .55, s: .22, blend: "multiply", skew: -6 }); addText("DECALS · $8", { y: H() * .16, size: 96, plate: true, color: "#f2a93b" }); }
    if (k === "drop") { const p = (state.products || []).find(x => x.image); if (p) await addImage(await loadImg(p.image), "img", { x: W() / 2, y: H() * .42, s: Math.min(W() * .55 / 900, 1) }); else await logo(0, { y: H() * .4, s: .5 });
      addText("DROP 02", { y: H() * .12, size: 150 }); addText("THEVOLKSVISION.COM", { y: H() * .9, size: 54, color: "#f2a93b" }); }
    if (k === "post") { toggleFrame(); addText("MK2 BUILD · EP. 1", { y: H() * .12, size: 90, plate: true }); }
    if (k === "cut") { addText("THE CREW", { y: H() * .12, size: 130 }); toast("Now tap ✂ Cutout to drop RJ or a part on top."); }
    select(null);
  }
  const showTemplates = () => picker("Templates", `<div class="mk-tpl">${[["decal", "Decal mockup", "Logo on the car's side, printed on the paint."], ["drop", "Merch drop poster", "Your shirt + the car + DROP text."], ["post", "Branded post", "VolksVision frame and headline over any car photo."], ["cut", "Cutout scene", "Put RJ or a part over a VW backdrop."]]
    .map(([k, t, d]) => `<button type="button" class="card mk-tplb" data-tpl="${k}"><strong>${t}</strong><span class="r-sub" style="white-space:normal">${d}</span></button>`).join("")}</div><small class="r-sub" style="white-space:normal;display:block;margin-top:8px">Every template is a starting point: swap the car photo, move anything, change the words.</small>`);

  // ---------- export ----------
  async function exportIt() {
    select(null); draw(true);
    const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", .92)).catch(() => null);
    draw();
    if (!blob) return toast("Couldn't export. A photo from another site may block saving; try uploading it instead.", true);
    const file = new File([blob], `volksvision-mockup-${Date.now()}.jpg`, { type: "image/jpeg" });
    const prods = (state.products || []).filter(p => !p.archived);
    picker("Export", `<img src="${URL.createObjectURL(blob)}" alt="" style="width:100%;max-width:420px;border-radius:10px;display:block;margin:0 auto 12px">
      <div style="display:flex;flex-direction:column;gap:8px">
        <button type="button" class="btn sea" data-exp="share">Share / Save to Photos</button>
        <button type="button" class="btn" data-exp="download">Download</button>
        ${prods.length ? `<label class="field"><span>Add it to a product's photos</span><select data-exp-prod>${prods.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label><button type="button" class="btn" data-exp="product">Add to product photos</button>` : ""}
      </div>
      ${M.credits.length ? `<div class="card" style="margin-top:12px"><strong>Credits for your caption</strong><span class="r-sub copyable" style="white-space:pre-wrap">${esc([...new Set(M.credits)].join("\n"))}</span></div>` : ""}`);
    M.lastFile = file;
  }

  // ---------- clicks ----------
  host.addEventListener("click", async e => {
    const t = e.target;
    const f = t.closest("[data-fmt]"); if (f) { M.fmt = +f.dataset.fmt; host.querySelectorAll("[data-fmt]").forEach(b => b.setAttribute("aria-pressed", b === f)); const bg = M.layers.find(x => x.kind === "bg"); if (bg) { bg.x = W() / 2; bg.y = H() / 2; bg.s = bgScale(bg.w, bg.h); } M.layers.forEach(L => { if (L.kind !== "bg") { L.x = Math.min(L.x, W()); L.y = Math.min(L.y, H()); } }); return fit(); }
    const a = t.closest("[data-addk]")?.dataset.addk;
    if (a === "bg") return showCarPicker();
    if (a === "logo" || a === "img") return showImagePicker("img");
    if (a === "cut") return showImagePicker("cut");
    if (a === "text") return addText();
    if (a === "frame") return toggleFrame();
    if (a === "tpl") return showTemplates();
    const pk = t.closest("[data-pick]"); if (pk) return usePicked(+pk.dataset.pick);
    const tp = t.closest("[data-tpl]"); if (tp) return template(tp.dataset.tpl).catch(fail);
    const c = t.closest("[data-color]"); if (c && M.sel) { M.sel.color = c.dataset.color; panel(); return draw(); }
    const bl = t.closest("[data-blend]"); if (bl && M.sel) { M.sel.blend = bl.dataset.blend; panel(); return draw(); }
    const la = t.closest("[data-lact]")?.dataset.lact;
    if (la && M.sel) {
      const i = M.layers.indexOf(M.sel);
      if (la === "del") { M.layers.splice(i, 1); return select(null); }
      if (la === "flip") M.sel.flip = !M.sel.flip;
      if (la === "dup") { const d = { ...M.sel, id: ++uid, x: M.sel.x + 40, y: M.sel.y + 40 }; M.layers.splice(i + 1, 0, d); return select(d); }
      if (la === "front" && i < frameIndex() - 1) [M.layers[i], M.layers[i + 1]] = [M.layers[i + 1], M.layers[i]];
      if (la === "back" && i > (M.layers[0].kind === "bg" ? 1 : 0)) [M.layers[i], M.layers[i - 1]] = [M.layers[i - 1], M.layers[i]];
      return draw();
    }
    const mk = t.closest("[data-mk]")?.dataset.mk;
    if (mk === "close") { if (M.layers.length && !confirm("Close the mockup? Anything not exported is lost.")) return; removeEventListener("resize", fit); host.remove(); return; }
    if (mk === "pick-close") return closePick();
    if (mk === "upload-bg") { fileMode = "bg"; return fileIn.click(); }
    if (mk === "upload-img") { fileMode = pickKind === "cut" ? "cut" : "img"; return fileIn.click(); }
    if (mk === "paste") return pasteImage(pickKind === "cut" ? "cut" : "img");
    if (mk === "stock") return showStock();
    if (mk === "export") return exportIt().catch(fail);
    const ex = t.closest("[data-exp]")?.dataset.exp;
    if (ex === "share") { if (navigator.canShare?.({ files: [M.lastFile] })) navigator.share({ files: [M.lastFile], text: [...new Set(M.credits)].join("\n") || undefined }).catch(() => {}); else ex2download(); }
    if (ex === "download") ex2download();
    if (ex === "product") { const id = $h("[data-exp-prod]").value; t.disabled = true; try { await ctx.useAsProductPhoto(M.lastFile, id); toast("Added to that product's photos."); } catch (err) { fail(err); } finally { t.disabled = false; } }
  });
  function ex2download() { const a = document.createElement("a"); a.href = URL.createObjectURL(M.lastFile); a.download = M.lastFile.name; a.click(); }
  host.addEventListener("submit", e => { if (e.target.matches("[data-stockform]")) { e.preventDefault(); showStock(new FormData(e.target).get("q") || "volkswagen"); } });

  addEventListener("resize", fit);
  requestAnimationFrame(async () => {
    fit(); panel();
    if (start.productImage) { try { await template("drop"); } catch (err) { fail(err); } }
  });
}
