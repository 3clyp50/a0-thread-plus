import { createStore } from "/js/AlpineStore.js";
import { callJsonApi } from "/js/api.js";
import { toastFrontendError } from "/components/notifications/notification-store.js";
import { store as chats } from "/components/sidebar/chats/chats-store.js";
import { hasNewActivity, relativeTime, shortDate, timestamp } from "./thread-plus-format.js";

const DEFAULTS = {
  show_last_activity: true,
  show_new_activity: true,
  show_status: true,
  show_project: false,
  show_agent_profile: false,
  show_created: false,
  time_style: "relative",
};
const ROWS = '#chats-section x-component[path$="sidebar/chats/chat-tree.html"] .chat-list-button';
const SEEN_KEY = "threadPlusSeen";

export const store = createStore("threadPlus", {
  config: { ...DEFAULTS },
  seen: {},
  now: Date.now(),
  observer: null,
  clock: null,

  async init() {
    if (this.observer) return;
    try {
      const saved = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) this.seen = saved;
    } catch {
      this.seen = {};
    }
    this.scan(document);
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) this.scan(node);
        }
      }
    });
    this.observer.observe(document.querySelector("#chats-section") || document.body, { childList: true, subtree: true });
    this.clock = setInterval(() => { this.now = Date.now(); }, 60_000);
    await this.loadConfig();
  },

  cleanup() {
    this.observer?.disconnect();
    this.observer = null;
    clearInterval(this.clock);
    this.clock = null;
    document.querySelectorAll("#chats-section .thread-plus-meta").forEach((node) => node.remove());
    document.querySelectorAll("#chats-section .chat-list-button.thread-plus-row").forEach((node) => node.classList.remove("thread-plus-row"));
  },

  async loadConfig() {
    try {
      const result = await callJsonApi("plugins", { action: "get_config", plugin_name: "thread_plus" });
      if (!result.ok) throw new Error(result.error || "Could not load settings");
      const saved = result.data || {};
      const config = { ...DEFAULTS };
      for (const key of Object.keys(DEFAULTS)) {
        if (typeof saved[key] === "boolean") config[key] = saved[key];
      }
      config.time_style = saved.time_style === "date" ? "date" : "relative";
      this.config = config;
    } catch (error) {
      void toastFrontendError(error?.message || "Could not load Thread+ settings.", "Thread+");
    }
  },

  scan(root) {
    if (root.matches?.(ROWS)) this.decorate(root);
    root.querySelectorAll?.(ROWS).forEach((row) => this.decorate(row));
  },

  decorate(row) {
    row.classList.add("thread-plus-row");
    if (row.querySelector(":scope > .thread-plus-meta")) return;
    const meta = document.createElement("span");
    meta.className = "thread-plus-meta";
    meta.setAttribute("x-cloak", "");
    meta.setAttribute("x-show", "$store.threadPlus.hasDetails(context)");
    meta.setAttribute(":title", "$store.threadPlus.tooltip(context)");
    meta.setAttribute(":aria-label", "$store.threadPlus.tooltip(context)");
    meta.setAttribute("role", "note");

    const leading = document.createElement("span");
    leading.className = "thread-plus-leading";
    leading.setAttribute("x-show", "$store.threadPlus.hasLeading(context)");

    const fresh = document.createElement("span");
    fresh.className = "thread-plus-new";
    fresh.textContent = "New";
    fresh.setAttribute("x-show", "$store.threadPlus.newActivity(context)");
    leading.append(fresh);

    const icon = document.createElement("x-icon");
    icon.className = "thread-plus-leading-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("x-show", "$store.threadPlus.leadingIcon(context)");
    icon.setAttribute(":name", "$store.threadPlus.leadingIcon(context)");
    leading.append(icon);

    const details = document.createElement("span");
    details.className = "thread-plus-leading-text";
    details.setAttribute("x-text", "$store.threadPlus.leadingDetails(context)");
    leading.append(details);
    meta.append(leading);

    const activity = document.createElement("span");
    activity.className = "thread-plus-time";
    activity.setAttribute("x-show", "$store.threadPlus.activityLabel(context)");
    const clock = document.createElement("x-icon");
    clock.setAttribute("name", "schedule");
    clock.setAttribute("aria-hidden", "true");
    activity.append(clock);
    const time = document.createElement("span");
    time.setAttribute("x-text", "$store.threadPlus.activityLabel(context)");
    activity.append(time);
    meta.append(activity);

    row.append(meta);
  },

  trackSeen(contexts, selectedId) {
    if (!Array.isArray(contexts) || !contexts.length) return;
    const next = { ...this.seen };
    let changed = false;
    for (const context of contexts) {
      if (!context?.id) continue;
      const time = timestamp(context.last_message || context.created_at);
      if (!Object.hasOwn(next, context.id) || (context.id === selectedId && time > next[context.id])) {
        next[context.id] = time;
        changed = true;
      }
    }
    if (!changed) return;
    this.seen = next;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* Private browsing. */ }
  },

  newActivity(context) {
    return this.config.show_new_activity && hasNewActivity(context, this.seen[context?.id], chats.selected);
  },

  activityLabel(context) {
    if (!this.config.show_last_activity || !context) return "";
    const activity = context.last_message || context.created_at;
    return this.config.time_style === "date" ? shortDate(activity, this.now) : relativeTime(activity, this.now);
  },

  leadingDetails(context) {
    if (!context) return "";
    const parts = [];
    if (this.config.show_status && context.paused) parts.push("Paused");
    else if (this.config.show_status && context.running) parts.push("Working");
    if (this.config.show_project && context.project?.name) parts.push(context.project.title || context.project.name);
    if (this.config.show_agent_profile && context.agent_profile) {
      parts.push(context.agent_profile_label || context.agent_profile);
    }
    if (this.config.show_created && context.created_at) parts.push(`Created ${shortDate(context.created_at, this.now)}`);
    return parts.filter(Boolean).join(" · ");
  },

  leadingIcon(context) {
    if (!context) return "";
    if (this.config.show_status && context.paused) return "pause_circle";
    if (this.config.show_status && context.running) return "progress_activity";
    if (this.config.show_project && context.project?.name) return "folder";
    if (this.config.show_agent_profile && context.agent_profile) return "person";
    if (this.config.show_created && context.created_at) return "calendar_today";
    return "";
  },

  hasLeading(context) {
    return this.newActivity(context) || Boolean(this.leadingDetails(context));
  },

  hasDetails(context) {
    return this.hasLeading(context) || Boolean(this.activityLabel(context));
  },

  tooltip(context) {
    const activity = timestamp(context?.last_message || context?.created_at);
    const created = timestamp(context?.created_at);
    return [
      this.newActivity(context) ? "New activity since last viewed" : "",
      this.leadingDetails(context),
      activity ? `Last activity: ${new Date(activity).toLocaleString()}` : "",
      created ? `Created: ${new Date(created).toLocaleString()}` : "",
    ].filter(Boolean).join("\n");
  },
});
