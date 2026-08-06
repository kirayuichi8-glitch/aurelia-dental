import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

test("landing page contains the complete conversion flow", async () => {
  const html = await read("index.html");
  assert.match(html, /Aurelia/);
  assert.match(html, /id="lead-form"/);
  assert.match(html, /chat-panel/);
  assert.match(html, /name="consent"/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview/);
});

test("assistant and durable lead endpoint are wired", async () => {
  const [app, worker] = await Promise.all([read("app.js"), readFile(new URL("../server/worker-template.js", import.meta.url), "utf8")]);
  assert.match(app, /assistantKnowledge/);
  assert.match(app, /\/api\/leads/);
  assert.ok((app.match(/keys:/g) || []).length >= 40);
  assert.match(worker, /env\.DB\.prepare/);
  assert.match(worker, /INSERT INTO leads/);
  assert.match(worker, /runReminders/);
  assert.match(worker, /handleTelegramWebhook/);
  assert.match(worker, /\?start=a_\$\{reminderToken\}/);
});

test("booking, Telegram opt-in and reminder storage are present", async () => {
  const [html, migration, settingsMigration] = await Promise.all([
    read("index.html"),
    readFile(new URL("../drizzle/0001_appointments_and_reminders.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_bot_settings.sql", import.meta.url), "utf8"),
  ]);
  assert.match(html, /name="preferred_date"/);
  assert.match(html, /name="preferred_time"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS appointments/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS conversation_events/);
  assert.match(migration, /idx_appointments_status_starts_at/);
  assert.match(settingsMigration, /CREATE TABLE IF NOT EXISTS bot_settings/);
});

test("the first Telegram start safely claims the administrator chat", async () => {
  const worker = await readFile(new URL("../server/worker-template.js", import.meta.url), "utf8");
  assert.match(worker, /message\?\.text === "\/start"/);
  assert.match(worker, /INSERT OR IGNORE INTO bot_settings/);
  assert.match(worker, /getAdminChatId/);
});

test("visual assets preserve proportions and the native cursor stays available", async () => {
  const [html, css] = await Promise.all([read("index.html"), read("enhancements.css")]);
  const assets = [
    "service-diagnostics.jpg", "service-treatment.jpg", "service-implant.jpg", "service-aesthetic.jpg",
    "doctor-andreeva.jpg", "doctor-sokolov.jpg", "doctor-kim.jpg",
  ];
  assert.match(html, /enhancements\.css\?v=3\.0\.0/);
  assert.match(css, /html, body \{ cursor: auto !important; \}/);
  assert.match(css, /background-size: cover !important;/);
  for (const asset of assets) {
    await assert.doesNotReject(readFile(new URL(`../public/${asset}`, import.meta.url)));
    assert.match(css, new RegExp(asset.replace(".", "\\.")));
  }
});
