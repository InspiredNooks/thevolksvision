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

// "I'll pull up" buttons: refresh live counts, then count a pull-up when tapped (once per stop per phone).
(async () => {
  const forms = [...document.querySelectorAll("[data-pullup]")]; if (!forms.length) return;
  const seen = (() => { try { return JSON.parse(localStorage.getItem("vv-pullups") || "[]"); } catch { return []; } })();
  forms.forEach(f => { if (seen.includes(+f.dataset.pullup)) { const b = f.querySelector("[type=submit]"); b.textContent = "You're pulling up ✓"; b.disabled = true; } });
  try {
    const r = await fetch("/api/pullup?ids=" + forms.map(f => f.dataset.pullup).join(","));
    const counts = await r.json(); Object.entries(counts).forEach(([id, n]) => document.querySelectorAll(`[data-count="${id}"]`).forEach(el => el.textContent = `${n} pulling up`));
  } catch {}
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-pullup]"); if (!f) return;
    e.preventDefault();
    const id = +f.dataset.pullup, btn = f.querySelector("[type=submit]"), msg = f.querySelector(".form-msg");
    btn.disabled = true;
    try {
      const fd = new FormData(f);
      const res = await fetch("/api/pullup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, email: fd.get("email") || "", join: fd.get("join") === "on", website: fd.get("website") || "" }) });
      const out = await res.json(); if (!res.ok) throw new Error(out.error || "Didn't go through. Try again.");
      document.querySelectorAll(`[data-count="${id}"]`).forEach(el => el.textContent = `${out.count} pulling up`);
      btn.textContent = "You're pulling up ✓"; msg.textContent = fd.get("email") ? "See you there. Reminder's coming." : "See you there.";
      if (!seen.includes(id)) seen.push(id);
      try { localStorage.setItem("vv-pullups", JSON.stringify(seen)); } catch {}
    } catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
})();
