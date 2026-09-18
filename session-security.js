export const SESSION_POLICY = Object.freeze({
    idleTimeoutMs: 30 * 60 * 1000,
    absoluteTimeoutMs: 8 * 60 * 60 * 1000,
    warningBeforeMs: 2 * 60 * 1000,
    activityWriteIntervalMs: 15 * 1000,
    normalCheckIntervalMs: 15 * 1000
});

export const SESSION_STORAGE_KEYS = Object.freeze({
    startedAt: 'beatss_session_started_at_v1',
    lastActivityAt: 'beatss_session_last_activity_v1',
    event: 'beatss_session_event_v1'
});

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

let controller = null;

function validTimestamp(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizePolicy(policy = SESSION_POLICY) {
    const normalized = { ...SESSION_POLICY, ...policy };
    for (const [key, value] of Object.entries(normalized)) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new TypeError(`Política de sesión inválida: ${key}`);
        }
    }
    if (normalized.warningBeforeMs >= normalized.idleTimeoutMs || normalized.warningBeforeMs >= normalized.absoluteTimeoutMs) {
        throw new TypeError('El aviso debe ocurrir antes de los límites de sesión.');
    }
    return normalized;
}

export function evaluateSessionState({ now, startedAt, lastActivityAt, policy = SESSION_POLICY }) {
    const activePolicy = normalizePolicy(policy);
    const currentTime = validTimestamp(now);
    const sessionStart = validTimestamp(startedAt);
    const lastActivity = validTimestamp(lastActivityAt) || sessionStart;

    if (!currentTime || !sessionStart || !lastActivity) {
        return { state: 'invalid', reason: 'missing', remainingMs: 0, canExtend: false };
    }

    const idleRemainingMs = activePolicy.idleTimeoutMs - (currentTime - lastActivity);
    const absoluteRemainingMs = activePolicy.absoluteTimeoutMs - (currentTime - sessionStart);
    const reason = idleRemainingMs <= absoluteRemainingMs ? 'idle' : 'absolute';
    const remainingMs = Math.min(idleRemainingMs, absoluteRemainingMs);

    if (remainingMs <= 0) {
        return { state: 'expired', reason, remainingMs: 0, canExtend: false };
    }
    if (remainingMs <= activePolicy.warningBeforeMs) {
        return { state: 'warning', reason, remainingMs, canExtend: reason === 'idle' };
    }
    return { state: 'active', reason, remainingMs, canExtend: true };
}

function storageAvailable() {
    try {
        const key = '__beatss_session_probe__';
        localStorage.setItem(key, '1');
        localStorage.removeItem(key);
        return true;
    } catch (_) {
        return false;
    }
}

function readStoredTimes() {
    return {
        startedAt: validTimestamp(localStorage.getItem(SESSION_STORAGE_KEYS.startedAt)),
        lastActivityAt: validTimestamp(localStorage.getItem(SESSION_STORAGE_KEYS.lastActivityAt))
    };
}

function writeTimestamp(key, value) {
    localStorage.setItem(key, String(Math.trunc(value)));
}

function clearStoredTimes() {
    localStorage.removeItem(SESSION_STORAGE_KEYS.startedAt);
    localStorage.removeItem(SESSION_STORAGE_KEYS.lastActivityAt);
}

function createEventNonce(now) {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `${now}-${Math.random().toString(36).slice(2)}`;
}

function broadcastSessionEvent(type, reason, now) {
    localStorage.setItem(SESSION_STORAGE_KEYS.event, JSON.stringify({
        type,
        reason,
        at: now,
        nonce: createEventNonce(now)
    }));
}

function formatRemaining(remainingMs) {
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function createWarningDialog() {
    const backdrop = document.createElement('div');
    backdrop.id = 'beatss-session-warning';
    backdrop.className = 'beatss-session-warning';
    backdrop.hidden = true;
    backdrop.innerHTML = `
        <section class="beatss-session-warning-card" role="dialog" aria-modal="true" aria-labelledby="beatss-session-warning-title" aria-describedby="beatss-session-warning-copy">
            <span class="beatss-session-warning-icon" aria-hidden="true">⌛</span>
            <p class="beatss-session-warning-kicker">SEGURIDAD DE LA CUENTA</p>
            <h2 id="beatss-session-warning-title">Tu sesión está por finalizar</h2>
            <p id="beatss-session-warning-copy"></p>
            <strong id="beatss-session-warning-countdown" aria-live="polite"></strong>
            <div class="beatss-session-warning-actions">
                <button type="button" id="beatss-session-continue">Seguir conectado</button>
                <button type="button" id="beatss-session-logout">Cerrar sesión ahora</button>
            </div>
        </section>`;
    document.body.appendChild(backdrop);
    return backdrop;
}

function removeActivityListeners(activeController) {
    for (const eventName of ACTIVITY_EVENTS) {
        document.removeEventListener(eventName, activeController.handleActivity, true);
    }
    document.removeEventListener('visibilitychange', activeController.handleVisibilityChange);
    window.removeEventListener('storage', activeController.handleStorage);
}

function closeWarning(activeController) {
    if (!activeController.warningDialog) return;
    activeController.warningDialog.hidden = true;
    if (activeController.previousFocus?.isConnected) {
        activeController.previousFocus.focus({ preventScroll: true });
    }
    activeController.previousFocus = null;
}

function scheduleCheck(activeController, delayMs) {
    window.clearTimeout(activeController.timerId);
    activeController.timerId = window.setTimeout(activeController.check, Math.max(250, delayMs));
}

function stopController(activeController, { clear = false } = {}) {
    if (!activeController || activeController.stopped) return;
    activeController.stopped = true;
    window.clearTimeout(activeController.timerId);
    removeActivityListeners(activeController);
    closeWarning(activeController);
    activeController.warningDialog?.remove();
    if (clear && activeController.hasStorage) clearStoredTimes();
    if (controller === activeController) controller = null;
}

function requestExpiration(activeController, reason, { broadcast = true } = {}) {
    if (activeController.expiring || activeController.stopped) return;
    activeController.expiring = true;
    const now = activeController.now();
    if (activeController.hasStorage && broadcast) {
        broadcastSessionEvent('expired', reason, now);
    }
    stopController(activeController, { clear: true });
    Promise.resolve(activeController.onExpire(reason)).catch(() => undefined);
}

function showWarning(activeController, status) {
    const dialog = activeController.warningDialog || createWarningDialog();
    activeController.warningDialog = dialog;
    const copy = dialog.querySelector('#beatss-session-warning-copy');
    const countdown = dialog.querySelector('#beatss-session-warning-countdown');
    const continueButton = dialog.querySelector('#beatss-session-continue');

    copy.textContent = status.reason === 'idle'
        ? 'No detectamos actividad. Continúa trabajando para conservar el acceso.'
        : 'Alcanzaste el tiempo máximo de seguridad. Tendrás que iniciar sesión nuevamente.';
    countdown.textContent = `Cierre en ${formatRemaining(status.remainingMs)}`;
    continueButton.hidden = !status.canExtend;

    if (dialog.hidden) {
        activeController.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.hidden = false;
        (status.canExtend ? continueButton : dialog.querySelector('#beatss-session-logout'))?.focus({ preventScroll: true });
    }
}

export function startSessionSecurity({
    onExpire,
    resetStartedAt = false,
    policy = SESSION_POLICY,
    now = () => Date.now()
} = {}) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    if (typeof onExpire !== 'function') throw new TypeError('onExpire es obligatorio.');
    if (controller) stopController(controller);

    const activePolicy = normalizePolicy(policy);
    const hasStorage = storageAvailable();
    const currentTime = now();
    let times = hasStorage ? readStoredTimes() : { startedAt: null, lastActivityAt: null };
    const invalidClock = times.startedAt && times.startedAt > currentTime + MAX_CLOCK_SKEW_MS;

    if (resetStartedAt || !times.startedAt || !times.lastActivityAt || invalidClock) {
        times = { startedAt: currentTime, lastActivityAt: currentTime };
        if (hasStorage) {
            writeTimestamp(SESSION_STORAGE_KEYS.startedAt, currentTime);
            writeTimestamp(SESSION_STORAGE_KEYS.lastActivityAt, currentTime);
        }
    }

    const activeController = {
        policy: activePolicy,
        onExpire,
        now,
        hasStorage,
        memoryTimes: times,
        timerId: null,
        warningDialog: null,
        previousFocus: null,
        lastActivityWrite: times.lastActivityAt,
        expiring: false,
        stopped: false
    };

    activeController.recordActivity = (force = false) => {
        if (activeController.stopped || document.hidden) return;
        const activityTime = activeController.now();
        if (!force && activityTime - activeController.lastActivityWrite < activePolicy.activityWriteIntervalMs) return;
        activeController.lastActivityWrite = activityTime;
        activeController.memoryTimes.lastActivityAt = activityTime;
        if (hasStorage) writeTimestamp(SESSION_STORAGE_KEYS.lastActivityAt, activityTime);
        closeWarning(activeController);
        scheduleCheck(activeController, activePolicy.normalCheckIntervalMs);
    };

    activeController.handleActivity = () => activeController.recordActivity(false);
    activeController.handleVisibilityChange = () => {
        if (!document.hidden) activeController.check();
    };
    activeController.handleStorage = (event) => {
        if (event.key === SESSION_STORAGE_KEYS.event && event.newValue) {
            try {
                const sessionEvent = JSON.parse(event.newValue);
                if (sessionEvent.type === 'expired' || sessionEvent.type === 'logout') {
                    requestExpiration(activeController, sessionEvent.reason || 'remote', { broadcast: false });
                    return;
                }
            } catch (_) {
                return;
            }
        }
        if (event.key === SESSION_STORAGE_KEYS.startedAt || event.key === SESSION_STORAGE_KEYS.lastActivityAt) {
            activeController.check();
        }
    };

    activeController.check = () => {
        if (activeController.stopped) return;
        const storedTimes = hasStorage ? readStoredTimes() : activeController.memoryTimes;
        const status = evaluateSessionState({
            now: activeController.now(),
            startedAt: storedTimes.startedAt,
            lastActivityAt: storedTimes.lastActivityAt,
            policy: activePolicy
        });
        if (status.state === 'expired' || status.state === 'invalid') {
            requestExpiration(activeController, status.reason);
            return;
        }
        if (status.state === 'warning') {
            showWarning(activeController, status);
            scheduleCheck(activeController, Math.min(1000, status.remainingMs));
            return;
        }
        closeWarning(activeController);
        const untilWarning = status.remainingMs - activePolicy.warningBeforeMs;
        scheduleCheck(activeController, Math.min(activePolicy.normalCheckIntervalMs, Math.max(1000, untilWarning)));
    };

    for (const eventName of ACTIVITY_EVENTS) {
        document.addEventListener(eventName, activeController.handleActivity, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', activeController.handleVisibilityChange);
    window.addEventListener('storage', activeController.handleStorage);

    activeController.warningDialog = createWarningDialog();
    activeController.warningDialog.querySelector('#beatss-session-continue').addEventListener('click', () => activeController.recordActivity(true));
    activeController.warningDialog.querySelector('#beatss-session-logout').addEventListener('click', () => requestExpiration(activeController, 'manual'));

    controller = activeController;
    activeController.check();
    return activeController;
}

export function stopSessionSecurity(options = {}) {
    if (controller) stopController(controller, options);
}

export function clearSessionSecurityState({ broadcast = false, reason = 'manual' } = {}) {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    try {
        if (broadcast) broadcastSessionEvent('logout', reason, now);
        clearStoredTimes();
    } catch (_) {
        // Firebase signOut sigue siendo la autoridad aunque el storage esté bloqueado.
    }
    stopSessionSecurity();
}
