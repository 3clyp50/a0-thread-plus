import assert from "node:assert/strict";
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

console.log("Thread+ frontend checks passed");
