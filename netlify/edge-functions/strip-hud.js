// Strip the Netlify HUD/collab script injected into served HTML.
// Netlify auto-injects
//   <script async src="/.netlify/scripts/hud?variant=public" ...></script>
// on production HTML. We don't use it, so remove it before it reaches the browser.

export default async (request, context) => {
  const response = await context.next();
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;

  const html = await response.text();
  const stripped = html.replace(
    /<script[^>]*\/\.netlify\/scripts\/hud[^>]*>\s*<\/script>\s*/gi,
    ""
  );

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(stripped, { status: response.status, headers });
};

export const config = { path: "/*" };
