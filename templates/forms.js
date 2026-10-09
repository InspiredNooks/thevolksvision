// Menu (phones and tablets): full-screen list; Esc, a link, or the button closes it.
(() => {
  const btn = document.getElementById("openMenu"), menu = document.getElementById("menu"); if (!btn || !menu) return;
  const set = open => { menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); btn.setAttribute("aria-label", open ? "Close menu" : "Menu"); document.documentElement.style.overflow = open ? "hidden" : ""; if (open) menu.querySelector("a")?.focus(); };
  btn.addEventListener("click", () => set(menu.hidden));
  menu.addEventListener("click", e => { if (e.target.closest("a") || e.target === menu) set(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.hidden) { set(false); btn.focus(); } });
})();

// Shrinks a photo in the browser before upload. Falls back to the original if the browser can't decode it.
async function shrink(file, max = 1600) {
  try {
    const img = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(b => r(b || file), "image/jpeg", 0.85));
  } catch { return file; }
}
// Drop-alert signup and Work-with-me forms (any page). Posts to /api/subscribe and /api/inquiry.
document.addEventListener("submit", async e => {
  const f = e.target.closest("[data-form]"); if (!f) return;
  e.preventDefault();
  const msg = f.querySelector(".form-msg"), btn = f.querySelector("[type=submit]");
  const fd = new FormData(f); const data = Object.fromEntries(fd); if (f.dataset.source) data.source = f.dataset.source;
  btn.disabled = true; msg.textContent = "Sending…";
  try {
    // The Crew form carries a photo, so it goes as multipart; the others are JSON.
    // Phone photos are often 3-12 MB, so shrink to 1600px JPEG first (the server takes up to 4.5 MB).
    if (f.dataset.form === "crew") { const file = fd.get("photo"); if (file && file.size > 1.5e6) fd.set("photo", await shrink(file), "car.jpg"); }
    const res = f.dataset.form === "crew" ? await fetch("/api/crew", { method: "POST", body: fd })
      : await fetch("/api/" + f.dataset.form, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || "That didn't go through. Try again.");
    f.reset();
    msg.textContent = { subscribe: "You're in the Pit Crew. Watch your inbox.", crew: "Sent. If RJ features it, you'll see it here and on the socials.", inquiry: "Sent. RJ will get back to you by email." }[f.dataset.form];
  } catch (err) { msg.textContent = err.message; }
  finally { btn.disabled = false; }
});

// "I'm going" buttons (event cards and map pins): refresh live counts, count a tap once per stop per phone.
(async () => {
  const forms = [...document.querySelectorAll("[data-pullup]")], quick = [...document.querySelectorAll("[data-going]")];
  if (!forms.length && !quick.length) return;
  const seen = (() => { try { return JSON.parse(localStorage.getItem("vv-pullups") || "[]"); } catch { return []; } })();
  const remember = id => { if (!seen.includes(id)) seen.push(id); try { localStorage.setItem("vv-pullups", JSON.stringify(seen)); } catch {} };
  const markGoing = id => {
    document.querySelectorAll(`[data-pullup="${id}"] [type=submit], [data-going="${id}"]`).forEach(b => { b.textContent = "Going ✓"; b.disabled = true; });
  };
  const setCount = (id, n) => document.querySelectorAll(`[data-count="${id}"]`).forEach(el => el.textContent = `${n} going`);
  seen.forEach(markGoing);
  const ids = [...new Set([...forms.map(f => f.dataset.pullup), ...quick.map(b => b.dataset.going)])].slice(0, 20);
  try { const counts = await (await fetch("/api/pullup?ids=" + ids.join(","))).json(); Object.entries(counts).forEach(([id, n]) => setCount(id, n)); } catch {}
  const going = async (id, body) => {
    const res = await fetch("/api/pullup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const out = await res.json(); if (!res.ok) throw new Error(out.error || "Didn't go through. Try again.");
    setCount(id, out.count); markGoing(id); remember(id);
  };
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-pullup]"); if (!f) return;
    e.preventDefault();
    const id = +f.dataset.pullup, btn = f.querySelector("[type=submit]"), msg = f.querySelector(".form-msg");
    btn.disabled = true;
    try {
      const fd = new FormData(f);
      await going(id, { email: fd.get("email") || "", join: fd.get("join") === "on", website: fd.get("website") || "" });
      msg.textContent = fd.get("join") === "on" && fd.get("email") ? "See you there. You're in the Pit Crew too." : "See you there.";
    } catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-going]"); if (!b) return;
    b.disabled = true;
    try { await going(+b.dataset.going, {}); } catch (err) { b.disabled = false; b.textContent = "Try again"; }
  });
})();

// The Bay map: hover a pin (mouse) or tap it (phone) to open its card. Esc or tapping elsewhere closes it.
(() => {
  const map = document.getElementById("map"); if (!map) return;
  const wraps = [...map.querySelectorAll(".pin-wrap")];
  const close = except => wraps.forEach(w => { if (w !== except) { w.classList.remove("open"); w.querySelector(".pin").setAttribute("aria-expanded", "false"); } });
  const open = w => { close(w); w.classList.add("open"); w.querySelector(".pin").setAttribute("aria-expanded", "true"); };
  const hover = matchMedia("(hover:hover) and (pointer:fine)").matches;
  wraps.forEach(w => {
    w.querySelector(".pin").addEventListener("click", () => w.classList.contains("open") && !hover ? close() : open(w));
    if (hover) { let t; w.addEventListener("mouseenter", () => { clearTimeout(t); open(w); }); w.addEventListener("mouseleave", () => { t = setTimeout(() => w.classList.remove("open"), 250); }); }
  });
  document.addEventListener("click", e => { if (!e.target.closest(".pin-wrap") || e.target.closest(".pc-close")) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  // "See it on the map" links on event cards
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-show-pin]"); if (!a) return;
    const w = wraps.find(x => x.querySelector(".pin").dataset.pins.split(",").includes(a.dataset.showPin)); if (!w) return;
    e.preventDefault(); map.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => open(w), 350);
  });
})();

// "Get drop alerts on this phone": push notifications for fans. On iPhone this works once the
// site is on the Home Screen, so we explain that instead of failing.
(() => {
  const ctas = document.querySelectorAll(".push-cta"); if (!ctas.length) return;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const can = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!can && !ios) return;                                     // browser can't do it: keep the button hidden
  let on = false; try { on = localStorage.getItem("vv-push") === "1"; } catch {}
  const say = (t) => document.querySelectorAll(".push-msg").forEach(m => { m.textContent = t; });
  const done = () => ctas.forEach(c => { const b = c.querySelector("button"); b.textContent = "🔔 Drop alerts are on"; b.disabled = true; });
  ctas.forEach(c => { c.hidden = false; });
  if (on && can && Notification.permission === "granted") done();
  const key = s => { const p = "=".repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, ch => ch.charCodeAt(0)); };
  document.addEventListener("click", async e => {
    if (!e.target.closest("[data-push-fan]")) return;
    if (ios && !installed) return say("On iPhone: tap Share, then Add to Home Screen. Open VolksVision from your Home Screen and tap this again.");
    if (!can) return say("This browser can't do alerts. Join the Pit Crew by email instead.");
    try {
      if (await Notification.requestPermission() !== "granted") return say("Alerts are blocked in your settings. You can still join by email above.");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" }); await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push")).json();
      const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(publicKey) });
      const r = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), role: "fan" }) });
      if (!r.ok) throw new Error();
      try { localStorage.setItem("vv-push", "1"); } catch {}
      done(); say("You're set. Drops hit this phone first.");
    } catch { say("That didn't go through. Try again in a minute."); }
  });
})();

// Product gallery: thumbnails follow the swipe, and tapping a thumbnail slides to that photo.
document.querySelectorAll("[data-pgal]").forEach(g => {
  const track = g.querySelector(".pgal-track"), thumbs = [...g.querySelectorAll(".pgal-thumb")];
  const mark = i => thumbs.forEach((t, j) => t.setAttribute("aria-current", String(i === j)));
  track.addEventListener("scroll", () => mark(Math.round(track.scrollLeft / track.clientWidth)), { passive: true });
  thumbs.forEach((t, i) => t.addEventListener("click", e => { e.preventDefault(); track.scrollTo({ left: i * track.clientWidth, behavior: "smooth" }); mark(i); }));
});
