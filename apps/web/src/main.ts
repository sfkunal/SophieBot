import "./styles.css";
import {
  ApiError,
  confirmPhone,
  getSession,
  getSetupStatus,
  getTelegramLinkCode,
  googleAuthUrl,
  setSession,
  verifyPhone,
  type SetupUser,
} from "./api";

type Step = 1 | 2 | 3;

const alertEl = document.getElementById("alert")!;
const stepPhone = document.getElementById("step-phone")!;
const stepCode = document.getElementById("step-code")!;
const stepSetup = document.getElementById("step-setup")!;
const phoneForm = document.getElementById("phone-form") as HTMLFormElement;
const codeForm = document.getElementById("code-form") as HTMLFormElement;
const phoneInput = document.getElementById("phone") as HTMLInputElement;
const codeInput = document.getElementById("code") as HTMLInputElement;
const phoneDisplay = document.getElementById("phone-display")!;
const googleConnect = document.getElementById("google-connect") as HTMLAnchorElement;
const setupUsersEl = document.getElementById("setup-users")!;
const goDashboard = document.getElementById("go-dashboard")!;
const dashboardLink = document.getElementById("dashboard-link")!;
const telegramLinkSection = document.getElementById("telegram-link")!;
const telegramLinkBtn = document.getElementById("telegram-link-btn") as HTMLButtonElement;
const telegramLinkResult = document.getElementById("telegram-link-result")!;
const stepDots = [...document.querySelectorAll<HTMLElement>(".step-dot")];

let currentPhone = "";
let currentStep: Step = 1;

initThemeToggle();
const handledOAuthReturn = handleOAuthReturn();
checkExistingSession(handledOAuthReturn);

phoneForm.addEventListener("submit", onPhoneSubmit);
codeForm.addEventListener("submit", onCodeSubmit);
document.getElementById("back-to-phone")!.addEventListener("click", () => {
  showStep(1);
  hideAlert();
});
telegramLinkBtn.addEventListener("click", onTelegramLinkClick);

function initThemeToggle(): void {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  const stored = localStorage.getItem("brain_theme");
  if (stored === "dark" || stored === "light") {
    document.documentElement.dataset.theme = stored;
  }
  updateThemeIcon(toggle);

  toggle.addEventListener("click", () => {
    const isDark =
      document.documentElement.dataset.theme === "dark" ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const next = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("brain_theme", next);
    updateThemeIcon(toggle);
  });
}

function updateThemeIcon(toggle: HTMLElement): void {
  const isDark =
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  toggle.textContent = isDark ? "☀️" : "🌙";
}

function checkExistingSession(skipInitialRefresh = false): void {
  const session = getSession();
  if (!session) return;

  dashboardLink.classList.remove("hidden");
  telegramLinkSection.classList.remove("hidden");
  currentPhone = session.phone;
  googleConnect.href = googleAuthUrl(session.phone);
  showStep(3);
  if (!skipInitialRefresh) {
    void refreshSetupStatus();
  }
}

function handleOAuthReturn(): boolean {
  // Recover from OAuth redirect missing trailing slash (/brain-agent? → /brain-agent/brain-agent)
  if (window.location.pathname.includes("/brain-agent/brain-agent")) {
    const fixed = window.location.pathname.replace(
      /\/brain-agent\/brain-agent\/?/,
      "/brain-agent/",
    );
    window.history.replaceState({}, "", fixed + window.location.search);
  }

  const params = new URLSearchParams(window.location.search);
  const calendar = params.get("calendar");
  const error = params.get("error");

  if (error) {
    showAlert(decodeURIComponent(error), "error");
    window.history.replaceState({}, "", window.location.pathname);
    return false;
  }

  if (calendar === "connected") {
    showAlert("Google Calendar connected!", "success");
    window.history.replaceState({}, "", window.location.pathname);
    if (getSession()) {
      showStep(3);
      void refreshSetupStatus();
    }
    return true;
  }

  return false;
}

function showStep(step: Step): void {
  currentStep = step;
  stepPhone.classList.toggle("hidden", step !== 1);
  stepCode.classList.toggle("hidden", step !== 2);
  stepSetup.classList.toggle("hidden", step !== 3);

  stepDots.forEach((dot) => {
    const dotStep = Number(dot.dataset.step);
    dot.classList.toggle("active", dotStep === step);
    dot.classList.toggle("done", dotStep < step);
  });
}

function showAlert(message: string, type: "error" | "success"): void {
  alertEl.textContent = message;
  alertEl.className = `alert alert-${type}`;
  alertEl.classList.remove("hidden");
}

function hideAlert(): void {
  alertEl.classList.add("hidden");
}

async function onPhoneSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  hideAlert();

  const phone = phoneInput.value.trim();
  if (!phone) return;

  const submitBtn = document.getElementById("phone-submit") as HTMLButtonElement;
  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  try {
    const result = await verifyPhone(phone);
    currentPhone = phone;
    phoneDisplay.textContent = phone;
    codeInput.value = "";
    showStep(2);
    if (result.dev_code) {
      showAlert(
        `SMS may be blocked (A2P pending). Dev code: ${result.dev_code}`,
        "success",
      );
      codeInput.value = result.dev_code;
    }
    codeInput.focus();
  } catch (err) {
    showAlert(err instanceof ApiError ? err.message : "Could not send code.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Send code";
  }
}

async function onCodeSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  hideAlert();

  const code = codeInput.value.trim();
  if (!code || code.length !== 6) {
    showAlert("Enter the 6-digit code from your text.", "error");
    return;
  }

  const submitBtn = document.getElementById("code-submit") as HTMLButtonElement;
  submitBtn.disabled = true;
  submitBtn.textContent = "Confirming…";

  try {
    const result = await confirmPhone(currentPhone, code);
    setSession({ token: result.token, phone: result.phone ?? currentPhone });
    currentPhone = result.phone ?? currentPhone;
    dashboardLink.classList.remove("hidden");
    telegramLinkSection.classList.remove("hidden");
    googleConnect.href = googleAuthUrl(currentPhone);
    showStep(3);
    await refreshSetupStatus();
  } catch (err) {
    showAlert(err instanceof ApiError ? err.message : "Invalid code.", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm";
  }
}

let refreshSetupPromise: Promise<void> | null = null;

async function refreshSetupStatus(): Promise<void> {
  if (refreshSetupPromise) return refreshSetupPromise;

  refreshSetupPromise = refreshSetupStatusOnce().finally(() => {
    refreshSetupPromise = null;
  });
  return refreshSetupPromise;
}

async function refreshSetupStatusOnce(): Promise<void> {
  setupUsersEl.innerHTML = `<p class="loading"><span class="spinner"></span>Loading…</p>`;

  try {
    const status = await getSetupStatus();
    setupUsersEl.innerHTML = status.users.length
      ? status.users.map(renderSetupUser).join("")
      : `<p class="empty-state">No users registered yet.</p>`;

    if (status.ready) {
      goDashboard.classList.remove("hidden");
    } else {
      goDashboard.classList.add("hidden");
    }
  } catch {
    setupUsersEl.innerHTML = `
      <p class="empty-state">
        Couldn't load setup status.<br />
        <button type="button" class="btn btn-secondary btn-sm" id="retry-setup">Retry</button>
      </p>`;
    document.getElementById("retry-setup")?.addEventListener("click", refreshSetupStatus);
  }
}

function renderSetupUser(user: SetupUser): string {
  const label = user.name?.trim() || user.phone_masked;
  const verifiedBadge = user.verified
    ? `<span class="badge badge-ok">✓ Verified</span>`
    : `<span class="badge badge-pending">Phone pending</span>`;
  const calendarBadge = user.calendar_connected
    ? `<span class="badge badge-ok">✓ Calendar</span>`
    : `<span class="badge badge-pending">Calendar needed</span>`;
  const telegramBadge = user.telegram_linked
    ? `<span class="badge badge-ok">✓ Telegram</span>`
    : `<span class="badge badge-pending">Telegram optional</span>`;

  return `
    <div class="setup-user">
      <div class="setup-user-info">
        <span class="setup-user-phone">${escapeHtml(label)}</span>
        <span style="color: var(--text-muted); font-size: 0.85rem">${escapeHtml(user.phone_masked)}</span>
      </div>
      <div class="setup-user-badges">
        ${verifiedBadge}
        ${calendarBadge}
        ${telegramBadge}
      </div>
    </div>`;
}

async function onTelegramLinkClick(): Promise<void> {
  hideAlert();
  telegramLinkBtn.disabled = true;
  telegramLinkBtn.textContent = "Generating…";
  telegramLinkResult.classList.add("hidden");

  try {
    const result = await getTelegramLinkCode();
    const botLine = result.bot_username
      ? `<p>Open <strong>@${escapeHtml(result.bot_username)}</strong> in Telegram and send:</p>`
      : `<p>Send this to the SophieBot Telegram bot:</p>`;

    telegramLinkResult.innerHTML = `
      ${botLine}
      <p class="telegram-code"><code>/link ${escapeHtml(result.code)}</code></p>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.5rem">
        Expires in ${result.expires_in_minutes} minutes.
      </p>`;
    telegramLinkResult.classList.remove("hidden");
  } catch (err) {
    showAlert(
      err instanceof ApiError ? err.message : "Could not generate link code.",
      "error",
    );
  } finally {
    telegramLinkBtn.disabled = false;
    telegramLinkBtn.textContent = "Get link code";
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Refresh setup status when returning to the tab (debounced)
let visibilityRefreshTimer: ReturnType<typeof setTimeout> | undefined;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || currentStep !== 3 || !getSession()) {
    return;
  }

  clearTimeout(visibilityRefreshTimer);
  visibilityRefreshTimer = setTimeout(() => {
    void refreshSetupStatus();
  }, 500);
});
