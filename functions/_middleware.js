// One address for Google: thevolksvision.shop and www. both 301 to https://thevolksvision.com
// (same path and query). Preview deploys on *.pages.dev are left alone.
const CANONICAL = "thevolksvision.com";

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const host = url.hostname;
  if (host !== CANONICAL && (host === "www." + CANONICAL || host.endsWith("thevolksvision.shop"))) {
    url.hostname = CANONICAL; url.protocol = "https:"; url.port = "";
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
