import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { hasNewActivity, relativeTime, shortDate, timestamp } from "../webui/thread-plus-format.js";

const now = Date.parse("2026-09-24T12:00:00Z");
const last = "2026-09-24T11:45:00Z";

assert.equal(timestamp("bad date"), 0);
assert.equal(relativeTime(last, now), "15m ago");
assert.equal(relativeTime("2026-09-24T12:10:00Z", now), "now");
assert.ok(shortDate(last, now).includes("24"));
assert.equal(hasNewActivity({ id: "a", last_message: last }, timestamp(last) - 1, "b"), true);
assert.equal(hasNewActivity({ id: "a", last_message: last }, timestamp(last), "b"), false);
assert.equal(hasNewActivity({ id: "a", last_message: last }, timestamp(last) - 1, "a"), false);

// Exercise the browser store with its API and Alpine imports supplied locally.
const source = readFileSync(new URL("../webui/thread-plus-store.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replace("export const store =", "const store =");
const saved = { show_last_activity: false, show_status: false, show_project: true, time_style: "date" };
const store = runInNewContext(`${source}\nstore;`, {
  createStore: (_name, model) => model,
  callJsonApi: async (path, input) => {
    assert.equal(path, "plugins");
    assert.equal(input.action, "get_config");
    assert.equal(input.plugin_name, "thread_plus");
    return { ok: true, data: JSON.parse(JSON.stringify(saved)) };
  },
  toastFrontendError: (message) => { throw new Error(message); },
  chats: { selected: "a" },
  hasNewActivity, relativeTime, shortDate, timestamp,
});
await store.loadConfig();
for (const [key, value] of Object.entries(saved)) assert.equal(store.config[key], value);
assert.equal(store.config.show_new_activity, true);
const context = { id: "a", last_message: last, created_at: "2026-09-23T12:00:00Z", running: true, project: { name: "demo" } };
store.now = now;
assert.equal(store.activityLabel(context), "");
assert.equal(store.leadingDetails(context), "demo");
store.config.show_last_activity = true;
store.config.show_status = true;
store.config.show_project = false;
await store.loadConfig();
for (const [key, value] of Object.entries(saved)) assert.equal(store.config[key], value);

store.config.show_last_activity = true;
store.config.time_style = "relative";
assert.equal(store.activityLabel(context), "15m ago");
const tooltip = store.tooltip(context).split("\n");
assert.equal(tooltip.filter((line) => line.startsWith("Last activity:")).length, 1);
assert.equal(tooltip.filter((line) => line.startsWith("Created:")).length, 1);
assert.ok(!tooltip.includes("15m ago"), "The tooltip must not repeat the relative activity label");
context.last_message = "2026-09-24T11:59:00Z";
assert.equal(store.activityLabel(context), "1m ago");
assert.notEqual(store.tooltip(context), tooltip.join("\n"));
store.config.show_status = true;
assert.equal(store.leadingDetails(context), "Working · demo");
context.running = false;
assert.equal(store.leadingDetails(context), "demo");

console.log("Thread+ frontend checks passed");
