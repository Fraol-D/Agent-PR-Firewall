/**
 * Browser notification + completion chime (client-only).
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
      silent: true, // we play our own chime
    });
  } catch {
    /* ignore */
  }
}

/**
 * Clear two-tone “ding-dong” chime (Web Audio).
 * Louder and more recognizable than a single soft sine blip; still short.
 * Call after a user-gesture-started analysis flow (autoplay-safe).
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
    const master = ctx.createGain();
    // Noticeable but not harsh
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    master.connect(ctx.destination);

    // Ding (higher) then dong (lower) — classic notification cadence
    playBellPartial(ctx, master, now, 1046.5, 0.28); // C6
    playBellPartial(ctx, master, now + 0.16, 783.99, 0.36); // G5

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 700);
  } catch {
    /* ignore autoplay / audio errors */
  }
}

/** Soft metallic partials: fundamental + quiet overtones. */
function playBellPartial(
  ctx: AudioContext,
  destination: AudioNode,
  start: number,
  frequency: number,
  duration: number,
): void {
  const partials: Array<{ ratio: number; gain: number; type: OscillatorType }> =
    [
      { ratio: 1, gain: 1, type: "sine" },
      { ratio: 2.0, gain: 0.28, type: "sine" },
      { ratio: 3.01, gain: 0.12, type: "triangle" },
    ];

  for (const p of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = p.type;
    osc.frequency.setValueAtTime(frequency * p.ratio, start);

    const peak = 0.35 * p.gain;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    // Longer decay for a “ring” rather than a click
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
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
