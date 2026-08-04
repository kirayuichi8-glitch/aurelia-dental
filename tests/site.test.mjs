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
  const [app, build] = await Promise.all([read("app.js"), readFile(new URL("../build.mjs", import.meta.url), "utf8")]);
  assert.match(app, /assistantKnowledge/);
  assert.match(app, /\/api\/leads/);
  assert.match(build, /env\.DB\.prepare/);
  assert.match(build, /INSERT INTO leads/);
});
