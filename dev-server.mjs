import http from "node:http";
import { readFile } from "node:fs/promises";

const root = new URL("./src/", import.meta.url);
const files = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/enhancements.css": ["enhancements.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
};

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/leads") {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, message: "Заявка принята. Администратор свяжется с вами в течение 10 минут." }));
    });
    return;
  }
  const assetName = (req.url || "").replace(/^\//, "");
  if (["hero-clinic.jpg", "service-diagnostics.jpg", "service-treatment.jpg", "service-implant.jpg", "service-aesthetic.jpg", "doctor-andreeva.jpg", "doctor-sokolov.jpg", "doctor-kim.jpg", "og.png"].includes(assetName)) {
    const body = await readFile(new URL(`./public/${assetName}`, import.meta.url));
    res.writeHead(200, { "content-type": assetName.endsWith('.jpg') ? "image/jpeg" : "image/png", "cache-control": "no-store" });
    res.end(body);
    return;
  }
  const entry = files[req.url || "/"];
  if (!entry) { res.writeHead(404); res.end("Not found"); return; }
  const body = await readFile(new URL(entry[0], root));
  res.writeHead(200, { "content-type": entry[1], "cache-control": "no-store" });
  res.end(body);
});

server.listen(5173, "127.0.0.1", () => console.log("Local: http://127.0.0.1:5173/"));
