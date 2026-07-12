import "./styles.css";
import type { FreeSlot, Restaurant, WatchItem } from "@brain/shared";
import {
  ApiError,
  clearSession,
  computeStats,
  deleteItem,
  formatDuration,
  formatSlotTime,
  getCalendarSlots,
  getRestaurants,
  getSession,
  getWatchlist,
  markDone,
  type CalendarEvent,
} from "./api";

const alertEl = document.getElementById("alert")!;
const statsRestaurants = document.getElementById("stat-restaurants")!;
const statsRestaurantsDone = document.getElementById("stat-restaurants-done")!;
const statsWatch = document.getElementById("stat-watch")!;
const statsWatching = document.getElementById("stat-watching")!;
const restaurantsList = document.getElementById("restaurants-list")!;
const watchList = document.getElementById("watch-list")!;
const calendarSlots = document.getElementById("calendar-slots")!;
const tabs = [...document.querySelectorAll<HTMLButtonElement>(".tab")];
const panels = [...document.querySelectorAll<HTMLElement>(".tab-panel")];

let restaurants: Restaurant[] = [];
let watchItems: WatchItem[] = [];
let loadDashboardPromise: Promise<void> | null = null;
let calendarLoaded = false;
let calendarLoading = false;

initThemeToggle();
if (requireAuth()) {
  initTabs();
  void loadDashboard();
}

document.getElementById("logout-btn")!.addEventListener("click", () => {
  clearSession();
  window.location.href = "./";
});

document.getElementById("refresh-calendar")?.addEventListener("click", () => {
  calendarLoaded = false;
  void loadCalendar(true);
});

function initThemeToggle(): void {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  const stored = localStorage.getItem("brain_theme");
  if (stored === "dark" || stored === "light") {
    document.documentElement.dataset.theme = stored;
  }

  toggle.addEventListener("click", () => {
    const isDark =
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const next = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("brain_theme", next);
    toggle.textContent = isDark ? "☀️" : "🌙";
  });

  const isDark =
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  toggle.textContent = isDark ? "☀️" : "🌙";
}

function requireAuth(): boolean {
  if (getSession()) return true;

  document.body.innerHTML = `
    <div class="container" style="padding-top: 4rem; text-align: center;">
      <div class="hero-emoji" aria-hidden="true">🔐</div>
      <h1 style="margin-bottom: 0.75rem;">Verify your phone first</h1>
      <p style="color: var(--text-muted); margin-bottom: 1.5rem;">
        The dashboard needs a quick phone setup before it can load your lists.
      </p>
      <a class="btn btn-primary" href="./">Back to setup</a>
    </div>`;
  return false;
}

function initTabs(): void {
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab!;
      activateTab(name);
      if (name === "calendar") {
        void loadCalendar(false);
      }
    });
  });
}

function activateTab(name: string): void {
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  panels.forEach((panel) => {
    const active = panel.id === `panel-${name}`;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });
}

function showAlert(message: string, type: "error" | "success"): void {
  alertEl.textContent = message;
  alertEl.className = `alert alert-${type}`;
  alertEl.classList.remove("hidden");
}

async function loadDashboard(): Promise<void> {
  if (loadDashboardPromise) return loadDashboardPromise;

  loadDashboardPromise = loadDashboardOnce().finally(() => {
    loadDashboardPromise = null;
  });
  return loadDashboardPromise;
}

async function loadDashboardOnce(): Promise<void> {
  try {
    const [restaurantData, watchData] = await Promise.all([
      getRestaurants(),
      getWatchlist(),
    ]);

    restaurants = restaurantData;
    watchItems = watchData;

    renderStats();
    renderRestaurants();
    renderWatchlist();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      clearSession();
      window.location.href = "./";
      return;
    }
    showAlert(
      err instanceof ApiError ? err.message : "Failed to load dashboard.",
      "error",
    );
  }
}

async function loadCalendar(refresh = false): Promise<void> {
  if (calendarLoading) return;
  if (calendarLoaded && !refresh) return;

  calendarLoading = true;
  calendarSlots.innerHTML = `<p class="loading"><span class="spinner"></span>Loading free slots…</p>`;

  try {
    const calendarData = await getCalendarSlots(refresh).catch(() => ({
      slots: [] as FreeSlot[],
    }));
    renderCalendar(calendarData.slots, calendarData.events ?? []);
    calendarLoaded = true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      clearSession();
      window.location.href = "./";
      return;
    }
    calendarSlots.innerHTML = `
      <div class="empty-state">
        <p>Couldn't load calendar data.</p>
        <button type="button" class="btn btn-secondary btn-sm" id="retry-calendar">Retry</button>
      </div>`;
    document.getElementById("retry-calendar")?.addEventListener("click", () => {
      calendarLoaded = false;
      void loadCalendar(true);
    });
  } finally {
    calendarLoading = false;
  }
}

function renderStats(): void {
  const stats = computeStats(restaurants, watchItems);
  statsRestaurants.textContent = String(stats.restaurants_queued);
  statsRestaurantsDone.textContent = String(stats.restaurants_done);
  statsWatch.textContent = String(stats.watch_queued);
  statsWatching.textContent = String(stats.watch_watching);
}

function renderRestaurants(): void {
  const queued = restaurants.filter((r) => r.status !== "dropped");
  queued.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));

  if (!queued.length) {
    restaurantsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🍽</div>
        <p>No restaurants yet.<br />Text SophieBot to add one!</p>
      </div>`;
    return;
  }

  restaurantsList.innerHTML = queued.map(renderRestaurantCard).join("");
  restaurantsList.querySelectorAll("[data-mark-done]").forEach((btn) => {
    btn.addEventListener("click", onMarkRestaurantDone);
  });
  restaurantsList.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", onDeleteRestaurant);
  });
}

function renderRestaurantCard(item: Restaurant): string {
  const isDone = item.status === "done";
  const chips = [
    item.cuisine ? `<span class="meta-chip">${escapeHtml(item.cuisine)}</span>` : "",
    item.location ? `<span class="meta-chip">${escapeHtml(item.location)}</span>` : "",
    item.vibe ? `<span class="meta-chip">${escapeHtml(item.vibe.replace(/_/g, " "))}</span>` : "",
    `<span class="meta-chip">${escapeHtml(item.status)}</span>`,
    item.priority > 0
      ? `<span class="meta-chip priority">★ ${item.priority}</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const rationale = item.rationale
    ? `<p class="item-rationale">"${escapeHtml(item.rationale)}"</p>`
    : "";

  const action = `<div class="item-actions">
        ${
          isDone
            ? ""
            : `<button type="button" class="btn btn-secondary btn-sm" data-mark-done="${item.id}">
          Mark done ✓
        </button>`
        }
        <button type="button" class="btn btn-ghost btn-sm btn-danger" data-delete="${item.id}">
          Delete
        </button>
      </div>`;

  return `
    <article class="item-card${isDone ? " done" : ""}" data-id="${item.id}">
      <div class="item-header">
        <h3 class="item-title">${escapeHtml(item.title)}</h3>
      </div>
      <div class="item-meta">${chips}</div>
      ${rationale}
      ${action}
    </article>`;
}

async function onMarkRestaurantDone(event: Event): Promise<void> {
  const btn = event.currentTarget as HTMLButtonElement;
  const id = btn.dataset.markDone;
  if (!id) return;

  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    await markDone("restaurant", id);
    const item = restaurants.find((r) => r.id === id);
    if (item) item.status = "done";
    renderStats();
    renderRestaurants();
    showAlert("Marked as done — nice choice!", "success");
  } catch (err) {
    showAlert(err instanceof ApiError ? err.message : "Could not update.", "error");
    btn.disabled = false;
    btn.textContent = "Mark done ✓";
  }
}

async function onDeleteRestaurant(event: Event): Promise<void> {
  const btn = event.currentTarget as HTMLButtonElement;
  const id = btn.dataset.delete;
  if (!id) return;

  const item = restaurants.find((r) => r.id === id);
  if (!item) return;

  if (!confirm(`Remove "${item.title}" from your restaurant list?`)) return;

  btn.disabled = true;
  btn.textContent = "Deleting…";

  try {
    await deleteItem("restaurant", id);
    restaurants = restaurants.filter((r) => r.id !== id);
    renderStats();
    renderRestaurants();
    showAlert("Removed from your list.", "success");
  } catch (err) {
    showAlert(err instanceof ApiError ? err.message : "Could not delete.", "error");
    btn.disabled = false;
    btn.textContent = "Delete";
  }
}

function renderWatchlist(): void {
  const items = watchItems.filter((w) => w.status !== "dropped");
  items.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));

  if (!items.length) {
    watchList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎬</div>
        <p>Watchlist is empty.<br />Text SophieBot to add a show or movie!</p>
      </div>`;
    return;
  }

  watchList.innerHTML = items.map(renderWatchCard).join("");
  watchList.querySelectorAll("[data-mark-done]").forEach((btn) => {
    btn.addEventListener("click", onMarkWatchDone);
  });
  watchList.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", onDeleteWatch);
  });
}

function renderWatchCard(item: WatchItem): string {
  const isDone = item.status === "done";
  const mood = item.mood_tags?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];

  const chips = [
    item.type ? `<span class="meta-chip">${escapeHtml(item.type.toUpperCase())}</span>` : "",
    item.genre ? `<span class="meta-chip">${escapeHtml(item.genre)}</span>` : "",
    item.platform ? `<span class="meta-chip">${escapeHtml(item.platform)}</span>` : "",
    ...mood.map((m) => `<span class="meta-chip">${escapeHtml(m)}</span>`),
    `<span class="meta-chip">${escapeHtml(item.status)}</span>`,
    item.priority > 0
      ? `<span class="meta-chip priority">★ ${item.priority}</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  const rationale = item.rationale
    ? `<p class="item-rationale">"${escapeHtml(item.rationale)}"</p>`
    : "";

  const action = `<div class="item-actions">
        ${
          isDone
            ? ""
            : `<button type="button" class="btn btn-secondary btn-sm" data-mark-done="${item.id}">
          Mark done ✓
        </button>`
        }
        <button type="button" class="btn btn-ghost btn-sm btn-danger" data-delete="${item.id}">
          Delete
        </button>
      </div>`;

  return `
    <article class="item-card${isDone ? " done" : ""}" data-id="${item.id}">
      <div class="item-header">
        <h3 class="item-title">${escapeHtml(item.title)}</h3>
      </div>
      <div class="item-meta">${chips}</div>
      ${rationale}
      ${action}
    </article>`;
}

async function onMarkWatchDone(event: Event): Promise<void> {
  const btn = event.currentTarget as HTMLButtonElement;
  const id = btn.dataset.markDone;
  if (!id) return;

  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    await markDone("watch", id);
    const item = watchItems.find((w) => w.id === id);
    if (item) item.status = "done";
    renderStats();
    renderWatchlist();
    showAlert("Finished! What's next?", "success");
  } catch (err) {
    showAlert(err instanceof ApiError ? err.message : "Could not update.", "error");
    btn.disabled = false;
    btn.textContent = "Mark done ✓";
  }
}

async function onDeleteWatch(event: Event): Promise<void> {
  const btn = event.currentTarget as HTMLButtonElement;
  const id = btn.dataset.delete;
  if (!id) return;

  const item = watchItems.find((w) => w.id === id);
  if (!item) return;

  if (!confirm(`Remove "${item.title}" from your watchlist?`)) return;

  btn.disabled = true;
  btn.textContent = "Deleting…";

  try {
    await deleteItem("watch", id);
    watchItems = watchItems.filter((w) => w.id !== id);
    renderStats();
    renderWatchlist();
    showAlert("Removed from your watchlist.", "success");
  } catch (err) {
    showAlert(err instanceof ApiError ? err.message : "Could not delete.", "error");
    btn.disabled = false;
    btn.textContent = "Delete";
  }
}

function renderCalendar(slots: FreeSlot[], events: CalendarEvent[]): void {
  const eventsHtml =
    events.length > 0
      ? `
      <h3 class="calendar-section-title">This week's events</h3>
      <div class="item-list calendar-events">
        ${events
          .sort((a, b) => a.start.localeCompare(b.start))
          .map(
            (event) => `
          <div class="slot-card">
            <div>
              <div class="slot-time">${escapeHtml(event.summary)}</div>
              <div class="slot-duration">
                ${escapeHtml(formatSlotTime(event.start))} – ${escapeHtml(formatSlotTime(event.end))}
                · ${escapeHtml(event.user_name)}
              </div>
            </div>
          </div>`,
          )
          .join("")}
      </div>`
      : `<p class="empty-state" style="margin-bottom: 1.5rem">No events this week — or calendar still syncing.</p>`;

  const slotsHtml =
    slots.length > 0
      ? `
      <h3 class="calendar-section-title">Mutual free time</h3>
      <div class="slot-list">
        ${slots
          .map(
            (slot) => `
        <div class="slot-card">
          <div>
            <div class="slot-time">${escapeHtml(formatSlotTime(slot.start))}</div>
            <div class="slot-duration">until ${escapeHtml(formatSlotTime(slot.end))}</div>
          </div>
          <span class="meta-chip priority">${escapeHtml(formatDuration(slot.duration_minutes))}</span>
        </div>`,
          )
          .join("")}
      </div>`
      : `<p class="empty-state">No mutual free slots this week.<br />Connect both calendars to compare availability.</p>`;

  if (!events.length && !slots.length) {
    calendarSlots.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <p>No calendar data yet.<br />Make sure Google Calendar is connected for both of you.</p>
      </div>`;
    return;
  }

  calendarSlots.innerHTML = eventsHtml + slotsHtml;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
