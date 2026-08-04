import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const source = new URL("./src/", import.meta.url);
const dist = new URL("./dist/", import.meta.url);
const server = new URL("./dist/server/", import.meta.url);
const client = new URL("./dist/client/", import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(server, { recursive: true });
await mkdir(client, { recursive: true });

const [html, css, js] = await Promise.all([
  readFile(new URL("index.html", source), "utf8"),
  readFile(new URL("styles.css", source), "utf8"),
  readFile(new URL("app.js", source), "utf8"),
]);

const worker = `
const html = ${JSON.stringify(html)};
const css = ${JSON.stringify(css)};
const javascript = ${JSON.stringify(js)};

const headers = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

function response(body, type, status = 200) {
  return new Response(body, { status, headers: { ...headers, "content-type": type, "cache-control": status === 200 ? "public, max-age=300" : "no-store" } });
}

async function createLead(request, env) {
  try {
    const data = await request.json();
    const name = String(data.name || "").trim().slice(0, 80);
    const phone = String(data.phone || "").replace(/[^+\\d() -]/g, "").trim().slice(0, 30);
    const service = String(data.service || "Консультация").trim().slice(0, 100);
    const source = String(data.source || "site").trim().slice(0, 30);
    if (name.length < 2 || phone.replace(/\\D/g, "").length < 10 || data.consent !== true) {
      return Response.json({ ok: false, message: "Проверьте имя, телефон и согласие." }, { status: 400, headers });
    }
    if (!env.DB) return Response.json({ ok: true, message: "Заявка принята. Администратор свяжется с вами в течение 10 минут." }, { headers });
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO leads (id, name, phone, service, source, status) VALUES (?, ?, ?, ?, ?, 'new')")
      .bind(id, name, phone, service, source).run();
    return Response.json({ ok: true, id, message: "Заявка принята. Администратор свяжется с вами в течение 10 минут." }, { headers });
  } catch {
    return Response.json({ ok: false, message: "Не удалось отправить заявку. Позвоните нам: +7 (343) 287-22-02." }, { status: 500, headers });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/leads") return createLead(request, env);
    if (request.method !== "GET") return response("Method not allowed", "text/plain; charset=utf-8", 405);
    if (url.pathname === "/" || url.pathname === "/index.html") return response(html.replaceAll("{{ORIGIN}}", url.origin), "text/html; charset=utf-8");
    if (url.pathname === "/styles.css") return response(css, "text/css; charset=utf-8");
    if (url.pathname === "/app.js") return response(javascript, "text/javascript; charset=utf-8");
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return response("Страница не найдена", "text/plain; charset=utf-8", 404);
  }
};
`;

await Promise.all([
  writeFile(new URL("index.js", server), worker),
  writeFile(new URL("index.html", client), html),
  writeFile(new URL("styles.css", client), css),
  writeFile(new URL("app.js", client), js),
  copyFile(new URL("public/og.png", import.meta.url), new URL("og.png", client)),
]);

console.log("Aurelia Dental production build created in dist/");
