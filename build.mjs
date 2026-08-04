import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const source = new URL("./src/", import.meta.url);
const dist = new URL("./dist/", import.meta.url);
const server = new URL("./dist/server/", import.meta.url);
const client = new URL("./dist/client/", import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(server, { recursive: true });
await mkdir(client, { recursive: true });

const [html, css, enhancements, js, workerTemplate] = await Promise.all([
  readFile(new URL("index.html", source), "utf8"),
  readFile(new URL("styles.css", source), "utf8"),
  readFile(new URL("enhancements.css", source), "utf8"),
  readFile(new URL("app.js", source), "utf8"),
  readFile(new URL("server/worker-template.js", import.meta.url), "utf8"),
]);

const worker = workerTemplate
  .replace("__HTML__", JSON.stringify(html))
  .replace("__CSS__", JSON.stringify(css))
  .replace("__ENHANCEMENTS__", JSON.stringify(enhancements))
  .replace("__JAVASCRIPT__", JSON.stringify(js));

const assets = [
  "og.png", "hero-clinic.jpg",
  "service-diagnostics.jpg", "service-treatment.jpg", "service-implant.jpg", "service-aesthetic.jpg",
  "doctor-andreeva.jpg", "doctor-sokolov.jpg", "doctor-kim.jpg",
];

await Promise.all([
  writeFile(new URL("index.js", server), worker),
  writeFile(new URL("index.html", client), html),
  writeFile(new URL("styles.css", client), css),
  writeFile(new URL("enhancements.css", client), enhancements),
  writeFile(new URL("app.js", client), js),
  ...assets.map((asset) => copyFile(new URL(`public/${asset}`, import.meta.url), new URL(asset, client))),
]);

console.log("Aurelia Dental production build created in dist/");
