import "./styles.css";
import {
  ApiError,
  confirmPhone,
  getSession,
  getSetupStatus,
  getTelegramLinkCode,
  startGoogleAuth,
  setSession,
  startTelegramVerify,
  checkTelegramVerifyStatus,
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
const telegramVerifyBtn = document.getElementById("telegram-verify-btn") as HTMLButtonElement;
const telegramVerifyResult = document.getElementById("telegram-verify-result")!;
const stepDots = [...document.querySelectorAll<HTMLElement>(".step-dot")];

let currentPhone = "";
let currentStep: Step = 1;
let telegramVerifyPoll: ReturnType<typeof setInterval> | null = null;
let telegramPollToken = "";
let refreshSetupPromise: Promise<void> | null = null;

initThemeToggle();
const handledOAuthReturn = handleOAuthReturn();
checkExistingSession(handledOAuthReturn);

phoneForm.addEventListener("submit", onPhoneSubmit);
codeForm.addEventListener("submit", onCodeSubmit);
googleConnect.addEventListener("click", onGoogleConnectClick);
document.getElementById("back-to-phone")!.addEventListener("click", () => {
  showStep(1);
  hideAlert();
});
telegramLinkBtn.addEventListener("click", onTelegramLinkClick);
telegramVerifyBtn.addEventListener("click", onTelegramVerifyClick);

function stopTelegramVerifyPoll(): void {
  if (telegramVerifyPoll) {
    clearInterval(telegramVerifyPoll);
    telegramVerifyPoll = null;
  }
  telegramPollToken = "";
}

function verifyFlowErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  return fallback;
}

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
  showStep(3);
  if (!skipInitialRefresh) {
    void refreshSetupStatus();
  }
}

function handleOAuthReturn(): boolean {
  // Recover from OAuth redirect missing trailing slash (/SophieBot? → /SophieBot/SophieBot)
  if (window.location.pathname.includes("/SophieBot/SophieBot")) {
    const fixed = window.location.pathname.replace(
      /\/SophieBot\/SophieBot\/?/,
      "/SophieBot/",
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
  if (step !== 2) {
    stopTelegramVerifyPoll();
  }
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
        result.sms_sent === false
          ? `SMS isn't available in local dev. Your code: ${result.dev_code}`
          : `Dev code: ${result.dev_code}`,
        "success",
      );
      codeInput.value = result.dev_code;
    } else if (result.sms_sent === false) {
      showAlert(
        result.error_hint ??
          "SMS delivery failed — check Twilio configuration or use Telegram verify.",
        "error",
      );
    }
    codeInput.focus();
  } catch (err) {
    showAlert(verifyFlowErrorMessage(err, "Could not send code."), "error");
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
    showStep(3);
    await refreshSetupStatus();
  } catch (err) {
    showAlert(verifyFlowErrorMessage(err, "Invalid code."), "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm";
  }
}

async function onTelegramVerifyClick(): Promise<void> {
  if (!currentPhone) {
    showAlert("Enter your phone number first.", "error");
    showStep(1);
    return;
  }

  hideAlert();
  stopTelegramVerifyPoll();
  telegramVerifyBtn.disabled = true;
  telegramVerifyBtn.textContent = "Generating…";
  telegramVerifyResult.classList.add("hidden");

  try {
    const result = await startTelegramVerify(currentPhone);
    telegramPollToken = result.poll_token;
    const botLine = result.bot_username
      ? `<p>Open <strong>@${escapeHtml(result.bot_username)}</strong> in Telegram and send:</p>`
      : `<p>Send this to the SophieBot Telegram bot:</p>`;

    telegramVerifyResult.innerHTML = `
      ${botLine}
      <p class="telegram-code"><code>/verify ${escapeHtml(result.code)}</code></p>
      <p class="card-subtitle">Only allowlisted numbers work. Waiting for you to send that in Telegram…</p>
    `;
    telegramVerifyResult.classList.remove("hidden");
    showAlert("Send the /verify command in Telegram to finish setup.", "success");

    telegramVerifyPoll = setInterval(() => {
      void pollTelegramVerifyOnce();
    }, 2000);
    void pollTelegramVerifyOnce();
  } catch (err) {
    showAlert(
      verifyFlowErrorMessage(err, "Could not start Telegram verify."),
      "error",
    );
  } finally {
    telegramVerifyBtn.disabled = false;
    telegramVerifyBtn.textContent = "Verify with Telegram instead";
  }
}

async function pollTelegramVerifyOnce(): Promise<void> {
  if (!currentPhone || !telegramPollToken) return;

  try {
    const status = await checkTelegramVerifyStatus(currentPhone, telegramPollToken);
    if (!status.verified || !status.token) return;

    stopTelegramVerifyPoll();
    setSession({ token: status.token, phone: status.phone ?? currentPhone });
    currentPhone = status.phone ?? currentPhone;
    dashboardLink.classList.remove("hidden");
    telegramLinkSection.classList.remove("hidden");
    showAlert("Telegram verified! You're signed in.", "success");
    showStep(3);
    await refreshSetupStatus();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 429)) {
      stopTelegramVerifyPoll();
      showAlert(err.message, "error");
    }
    // Keep polling for transient errors until verified or user leaves the step.
  }
}

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

async function onGoogleConnectClick(event: MouseEvent): Promise<void> {
  event.preventDefault();
  hideAlert();
  googleConnect.classList.add("loading");

  try {
    await startGoogleAuth();
  } catch (err) {
    showAlert(
      err instanceof ApiError ? err.message : "Could not start Google sign-in.",
      "error",
    );
  } finally {
    googleConnect.classList.remove("loading");
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
