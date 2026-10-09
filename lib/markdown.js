// Tiny Markdown renderer shared by the site build and the phone editor's preview.
// Supports: ## / ### headings, paragraphs, - and 1. lists, > quotes, **bold**, *italic*, [links](url).
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function inline(s, site) {
  return esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
      if (!/^(https?:\/\/|\/|#|mailto:)/.test(u)) return t;      // drop javascript: and other schemes
      const external = /^https?:/.test(u) && !(site && u.startsWith(site));
      return `<a href="${u}"${external ? ' rel="noopener" target="_blank"' : ""}>${t}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

export function markdown(src, site = "") {
  const out = []; let list = null; let para = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "), site)}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i, site)}</li>`).join("")}</${list.tag}>`); list = null; } };
  for (const raw of String(src || "").replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = line.match(/^(#{2,3})\s+(.*)$/))) { flushPara(); flushList(); out.push(`<h${m[1].length}>${inline(m[2], site)}</h${m[1].length}>`); continue; }
    if ((m = line.match(/^#\s+(.*)$/))) { flushPara(); flushList(); out.push(`<h2>${inline(m[1], site)}</h2>`); continue; }  // one H1 per page: the title
    if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1], site)}</blockquote>`); continue; }
    if ((m = line.match(/^[-*]\s+(.*)$/)) || (m = line.match(/^\d+\.\s+(.*)$/))) {
      flushPara();
      const tag = /^\d/.test(line) ? "ol" : "ul";
      if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
      list.items.push(m[1]); continue;
    }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList();
  return out.join("\n");
}

export const plainText = src => String(src || "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[#>*_`-]/g, " ").replace(/\s+/g, " ").trim();
export const wordCount = src => plainText(src).split(" ").filter(Boolean).length;
export const slugify = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
