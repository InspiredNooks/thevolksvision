// /api/admin/school - School First (see lib/school.js for the rules).
// GET                      everything the School tab needs, with short-lived links to private files
// POST ?upload=1           a plan file or proof screenshot (photo or PDF) into the PRIVATE bucket
// POST {action, ...}       setup | accept | submit-plan | save-week | submit-week   (RJ or Cara)
//                          review | cara                                           (Cara only)
// Grades and school files live in a private bucket and are only ever shown through signed links.
import { json, adminRoute, str, UserError } from "../../../lib/server.js";
import { supa, supaAuth } from "../../../lib/content.js";
import { sendPush } from "../../../lib/push.js";
import { getSchool, saveSchool, getWeeks, getWeek, evaluate, etNow, mondayOf, addDays, deadlineOf, futureLine, gradeRank, FUTURE_LINES } from "../../../lib/school.js";

const BUCKET = "vv-private";
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
const MAX = 4.5 * 1024 * 1024;
const STATUSES = ["todo", "done", "submitted", "late", "missing"];
const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
const cleanFiles = list => (Array.isArray(list) ? list : []).slice(0, 12)
  .map(f => ({ path: str(f?.path, 200), name: str(f?.name, 120) })).filter(f => /^school\/[\w.-]+$/.test(f.path));
const id8 = () => crypto.randomUUID().slice(0, 8);
const fmtDay = iso => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

async function signAll(env, paths) {
  if (!paths.length) return {};
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${BUCKET}`, {
    method: "POST", headers: { ...supaAuth(env), "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3600, paths }) });
  if (!res.ok) { console.error(await res.text()); return {}; }
  const out = {};
  for (const r of await res.json()) if (r.signedURL) out[r.path] = `${env.SUPABASE_URL}/storage/v1${r.signedURL}`;
  return out;
}
const withUrls = (files, urls) => files.map(f => ({ ...f, url: urls[f.path] || "" }));

export const onRequestGet = adminRoute(async ({ env, who }) => {
  const [school, weeks] = await Promise.all([getSchool(env), getWeeks(env, 16)]);
  const now = etNow(), gate = evaluate(school, weeks, now);
  const urls = await signAll(env, [...school.plan.files, ...weeks.flatMap(w => w.proof || [])].map(f => f.path));
  return json({
    who, school: { ...school, plan: { ...school.plan, files: withUrls(school.plan.files, urls) } },
    weeks: weeks.map(w => ({ ...w, proof: withUrls(w.proof || [], urls) })),
    gate, today: now.date, line: futureLine(school), lines: FUTURE_LINES
  });
});

export const onRequestPost = adminRoute(async ({ request, env, who }) => {
  if (new URL(request.url).searchParams.get("upload")) return upload(request, env);
  const b = await request.json().catch(() => { throw new UserError("Invalid request."); });
  const school = await getSchool(env), now = etNow(), cara = who === "cara";
  const onlyCara = () => { if (!cara) throw new UserError("Only Cara can do that."); };

  switch (b.action) {
    case "setup": {
      const classes = (Array.isArray(b.classes) ? b.classes : []).slice(0, 12).map(c => ({
        id: str(c?.id, 12) || id8(), name: str(c?.name, 80), teacher: str(c?.teacher, 80), portal: /^https:\/\//.test(c?.portal || "") ? str(c.portal, 300) : "",
        grade: str(c?.grade, 12), target: str(c?.target, 12) || "B" })).filter(c => c.name);
      const text = str(b.planText, 6000), files = cleanFiles(b.planFiles);
      const changed = text !== school.plan.text || JSON.stringify(files.map(f => f.path)) !== JSON.stringify(school.plan.files.map(f => f.path));
      const next = { ...school, term: str(b.term, 60), termEnd: isDate(b.termEnd) ? b.termEnd : "", classes,
        gpaNow: Number.isFinite(+b.gpaNow) && +b.gpaNow >= 0 && +b.gpaNow <= 4.5 ? +b.gpaNow : school.gpaNow,
        startedOn: school.startedOn || now.date,
        plan: { ...school.plan, text, files, changedSinceApproval: school.plan.changedSinceApproval || (Boolean(school.plan.approvedAt) && changed && !cara) } };
      await saveSchool(env, next);
      return json({ ok: true });
    }
    case "accept": {
      if (cara) throw new UserError("RJ accepts the agreement himself, from his own sign-in.");
      await saveSchool(env, { ...school, agreement: { acceptedAt: new Date().toISOString() }, startedOn: school.startedOn || now.date });
      await sendPush(env, "admin", { title: "RJ accepted School First ✍️", body: "He signed the agreement in the Studio.", url: "/admin#school", tag: "school-accept" }, "cara").catch(() => {});
      return json({ ok: true });
    }
    case "submit-plan": {
      if (!school.classes.length) throw new UserError("Add your classes first.");
      if (school.plan.text.length < 80 && !school.plan.files.length) throw new UserError("Write your plan (how you'll stay on top of each class) or upload it first.");
      await saveSchool(env, { ...school, plan: { ...school.plan, status: "submitted", submittedAt: new Date().toISOString(), note: "" } });
      if (!cara) await sendPush(env, "admin", { title: "RJ's semester plan is ready for you", body: "Open School to approve it or send it back.", url: "/admin#school", tag: "school-plan" }, "cara").catch(() => {});
      return json({ ok: true });
    }
    case "save-week":
    case "submit-week": {
      const weekOf = isDate(b.weekOf) ? mondayOf(b.weekOf) : mondayOf(now.date);
      const cur = mondayOf(now.date);
      if (weekOf > addDays(cur, 7)) throw new UserError("You can only plan up to next week.");
      if (school.startedOn && weekOf < mondayOf(school.startedOn)) throw new UserError("That week is before School First started.");
      const existing = await getWeek(env, weekOf);
      if (!cara && existing && ["submitted", "approved"].includes(existing.status)) throw new UserError(existing.status === "approved" ? "Cara already approved this week." : "This week is submitted. Cara will approve it or send it back.");
      const classIds = new Set(school.classes.map(c => c.id));
      const assignments = (Array.isArray(b.assignments) ? b.assignments : []).slice(0, 60).map(a => ({
        id: str(a?.id, 12) || id8(), cls: classIds.has(a?.cls) ? a.cls : "", title: str(a?.title, 160), due: isDate(a?.due) ? a.due : "",
        status: STATUSES.includes(a?.status) ? a.status : "todo", grade: str(a?.grade, 12) })).filter(a => a.title);
      const grades = {}; for (const c of school.classes) { const g = str(b.grades?.[c.id], 12); if (g) grades[c.id] = g; }
      const row = { week_of: weekOf, assignments, grades, proof: cleanFiles(b.proof), reflection: str(b.reflection, 4000), updated_at: new Date().toISOString() };

      if (b.action === "submit-week") {
        const missing = school.classes.filter(c => !grades[c.id]);
        if (missing.length) throw new UserError(`Add your current grade for ${missing.map(c => c.name).join(", ")}.`);
        if (!row.proof.length) throw new UserError("Upload at least one screenshot of your grades portal as proof.");
        if (row.reflection.length < 40) throw new UserError("Write a few sentences: what got done, what's at risk, what you need.");
        const open = assignments.filter(a => a.due && a.due <= deadlineOf(weekOf) && a.status === "todo");
        if (open.length) throw new UserError(`Update the status on: ${open.map(a => a.title).slice(0, 3).join(", ")}${open.length > 3 ? "…" : ""}`);
        Object.assign(row, { status: "submitted", submitted_at: new Date().toISOString(), review_note: "" });
      } else if (!existing) row.status = "draft";

      await supa(env, "vv_school_weeks?on_conflict=week_of", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
      // The latest grades on the check-in become the class's current grade.
      if (Object.keys(grades).length) await saveSchool(env, { ...school, classes: school.classes.map(c => grades[c.id] ? { ...c, grade: grades[c.id] } : c) });
      if (b.action === "submit-week" && !cara) {
        const low = school.classes.filter(c => gradeRank(grades[c.id]) !== null && gradeRank(grades[c.id]) < gradeRank(c.target || "B"));
        await sendPush(env, "admin", { title: `RJ's check-in for ${fmtDay(weekOf)} is in`, body: low.length ? `Below target: ${low.map(c => `${c.name} ${grades[c.id]}`).join(", ")}.` : "Open School to approve it or send it back.", url: "/admin#school", tag: "school-week" }, "cara").catch(() => {});
      }
      return json({ ok: true });
    }
    case "review": {
      onlyCara();
      const ok = b.decision === "approve", note = str(b.note, 600);
      if (!ok && note.length < 3) throw new UserError("Tell RJ what to fix.");
      if (b.target === "plan") {
        await saveSchool(env, { ...school, plan: { ...school.plan, status: ok ? "approved" : "returned", note, approvedAt: ok ? new Date().toISOString() : school.plan.approvedAt, changedSinceApproval: false } });
      } else {
        if (!isDate(b.weekOf)) throw new UserError("Pick a week.");
        await supa(env, `vv_school_weeks?week_of=eq.${b.weekOf}`, { method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: ok ? "approved" : "returned", review_note: note, reviewed_at: new Date().toISOString() }) });
      }
      await sendPush(env, "admin", ok
        ? { title: b.target === "plan" ? "Your semester plan is approved ✅" : "Check-in approved ✅", body: note || "Keep the streak going.", url: "/admin#school", tag: "school-review" }
        : { title: b.target === "plan" ? "Cara sent your plan back" : "Cara sent your check-in back", body: note, url: "/admin#school", tag: "school-review" }, "rj").catch(() => {});
      return json({ ok: true });
    }
    case "cara": {
      onlyCara();
      const floor = String(b.gradeFloor || "").toUpperCase();
      const goal = +b.gpaGoal, start = +b.gpaStart;
      await saveSchool(env, { ...school, message: str(b.message, 400), hold: { on: b.holdOn === true, note: str(b.holdNote, 200) },
        gradeFloor: ["A", "B", "C", "D"].includes(floor) ? floor : school.gradeFloor, lockBelowFloor: b.lockBelowFloor === true,
        gpaGoal: goal > 0 && goal <= 4.5 ? goal : school.gpaGoal, gpaStart: start > 0 && start <= 4.5 ? start : school.gpaStart });
      if (b.holdOn === true && !school.hold.on) await sendPush(env, "admin", { title: "Studio on hold", body: str(b.holdNote, 200) || "Cara put the Studio on hold. Open School.", url: "/admin#school", tag: "school-hold" }, "rj").catch(() => {});
      return json({ ok: true });
    }
    default: throw new UserError("Unknown action.");
  }
});

async function upload(request, env) {
  const type = (request.headers.get("Content-Type") || "").split(";")[0];
  if (!TYPES[type]) throw new UserError("Use a photo (JPEG, PNG, WebP) or a PDF.");
  const body = await request.arrayBuffer();
  if (!body.byteLength) throw new UserError("The file didn't come through. Try again.");
  if (body.byteLength > MAX) throw new UserError("That file is too large (4.5 MB max). Try a screenshot or a smaller PDF.");
  const path = `school/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 12)}.${TYPES[type]}`;
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, { method: "POST", headers: { ...supaAuth(env), "Content-Type": type }, body });
  if (!res.ok) { console.error(await res.text()); throw new Error("upload failed"); }
  const name = str(new URL(request.url).searchParams.get("name"), 120) || (type === "application/pdf" ? "Document.pdf" : "Screenshot");
  const urls = await signAll(env, [path]);
  return json({ path, name, url: urls[path] || "" });
}
