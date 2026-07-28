/**
 * Browser notification + short sound for analysis completion (client-only).
 * Never blocks completion UI; failures are silent.
 */

const PERMISSION_ASKED_KEY = "apf_analysis_notify_asked_v1";

export async function ensureNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";

  // Request at most once per browser profile for this app key.
  try {
    if (localStorage.getItem(PERMISSION_ASKED_KEY) === "1") {
      return Notification.permission;
    }
    localStorage.setItem(PERMISSION_ASKED_KEY, "1");
  } catch {
    /* ignore storage errors */
  }

  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showAnalysisCompleteNotification(opts?: {
  title?: string;
  body?: string;
}): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification(opts?.title ?? "Analysis Complete", {
      body: opts?.body ?? "Pull request analysis has finished.",
      silent: true, // we play our own short sound
    });
  } catch {
    /* ignore */
  }
}

/**
 * Short, soft confirmation tone (Web Audio). Autoplay-safe when called from
 * a user-gesture-started analysis flow after await.
 */
export function playAnalysisCompleteSound(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 400);
  } catch {
    /* ignore autoplay / audio errors */
  }
}

/** Fire-and-forget completion feedback after a user-triggered analysis. */
export function notifyAnalysisComplete(): void {
  try {
    showAnalysisCompleteNotification();
    playAnalysisCompleteSound();
  } catch {
    /* never delay UI */
  }
}
