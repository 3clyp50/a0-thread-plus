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
  document: { createElement: (tag) => ({
    tag, attributes: {}, children: [],
    setAttribute(name, value) { this.attributes[name] = value; },
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } },
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.removed = true; },
    replaceWith(...children) { this.replacements = children; },
  }), querySelectorAll(selector) {
    if (selector.includes(".thread-plus-new")) return [fresh, row.meta];
    if (selector.includes(".thread-plus-title")) return [row.title];
    return [row];
  } },
  clearInterval,
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
assert.equal(store.leadingDetails(context), "demo");
assert.equal(store.statusIcon(context), "", "Working uses the native chat bubble, not a duplicate plugin icon");
assert.ok(store.tooltip(context).split("\n").includes("Working"));
assert.equal(store.leadingIcon(context), "folder", "Status must not replace the context icon");
context.paused = true;
assert.equal(store.statusIcon(context), "pause_circle", "Paused takes priority over running");
assert.ok(store.tooltip(context).split("\n").includes("Paused"));
store.config.show_status = false;
assert.equal(store.statusIcon(context), "");
assert.ok(!store.tooltip(context).split("\n").includes("Paused"));
store.config.show_status = true;
store.config.show_project = false;
store.config.show_last_activity = false;
assert.equal(store.leadingDetails(context), "");
assert.equal(store.hasDetails(context), true, "An icon-only state must keep its row visible");
context.paused = false;
context.running = true;
assert.equal(store.statusIcon(context), "");
assert.equal(store.hasDetails(context), false, "Working alone must not create an empty detail line");
context.running = false;
store.seen.other = timestamp(context.last_message) - 1;
const unread = { ...context, id: "other" };
assert.equal(store.newActivity(unread), true);
assert.equal(store.hasDetails(unread), false, "An unread title marker must not create an empty detail line");
store.config.show_created = true;
assert.equal(store.leadingIcon(context), "calendar_today");
assert.equal(store.leadingDetails(context), shortDate(context.created_at, now));

const pin = { tag: "x-icon", attributes: {}, children: [], classList: { contains: (value) => value === "pin-to-top-indicator" } };
const name = { tag: "span", attributes: {}, children: [], nextElementSibling: pin, before(title) { row.title = title; } };
const row = { classList: { add() {}, remove() {} }, querySelector(selector) { return selector.includes(".chat-name") ? name : this.meta || null; }, append(meta) { this.meta = meta; } };
store.decorate(row);
const fresh = row.title.children[2];
const status = row.meta.children[0].children[0];
assert.equal(row.title.children[0], name, "Keep the native name element and its reactive binding");
assert.equal(row.title.children[1], pin, "Preserve the pin beside the native name to avoid duplicate pin indicators");
assert.equal(fresh.tag, "span", "New activity uses a dot, not an icon");
assert.equal(fresh.attributes.name, undefined);
assert.equal(fresh.attributes["x-show"], "$store.threadPlus.newActivity(context)");
assert.equal(fresh.attributes.role, "img");
assert.equal(fresh.attributes["aria-label"], "New activity since last viewed");
assert.equal(status.attributes["aria-hidden"], "true");
assert.equal(row.meta.attributes[":aria-label"], "$store.threadPlus.tooltip(context)");
const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const tooltipOwners = [...descendants(row.title), ...descendants(row.meta)].filter((node) =>
  Object.keys(node.attributes).some((name) => ["title", ":title", "data-bs-original-title"].includes(name)));
assert.equal(tooltipOwners.length, 1, "Nested icon tooltips must not overlap the detail line tooltip");
assert.equal(tooltipOwners[0], row.meta);
const extension = readFileSync(new URL("../extensions/webui/sidebar-chats-list-end/details.html", import.meta.url), "utf8");
assert.match(extension, /\.thread-plus-new\s*\{[^}]*background:\s*radial-gradient\(circle, color-mix\(in srgb, var\(--color-highlight\) 35%, transparent\), transparent 70%\);/,
  "The unread halo fades the theme highlight to transparent");
assert.doesNotMatch(extension.match(/\.thread-plus-new\s*\{([^}]*)\}/)[1], /\bborder:/,
  "The unread halo must not have a hard outline");
assert.match(extension, /\.thread-plus-new::after\s*\{[^}]*background:\s*var\(--color-highlight\);/,
  "The tiny unread centre uses the solid theme highlight");
const title = row.title;
store.decorate(row);
assert.equal(row.title, title, "Repeated decoration must not duplicate the title or unread marker");
store.cleanup();
assert.equal(fresh.removed, true);
assert.deepEqual([...title.replacements], [name, pin], "Cleanup restores the native name and pin without an unread marker");

console.log("Thread+ frontend checks passed");
