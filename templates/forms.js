// Drop-alert signup and Work-with-me forms (any page). Posts to /api/subscribe and /api/inquiry.
document.addEventListener("submit", async e => {
  const f = e.target.closest("[data-form]"); if (!f) return;
  e.preventDefault();
  const msg = f.querySelector(".form-msg"), btn = f.querySelector("[type=submit]");
  const fd = new FormData(f); const data = Object.fromEntries(fd); if (f.dataset.source) data.source = f.dataset.source;
  btn.disabled = true; msg.textContent = "Sending…";
  try {
    // The Crew form carries a photo, so it goes as multipart; the others are JSON.
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
      try { localStorage.setItem("vv-pullups", JSON.stringify([...seen, id])); } catch {}
    } catch (err) { msg.textContent = err.message; btn.disabled = false; }
  });
})();
