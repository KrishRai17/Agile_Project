/**
 * Browser notification & Web Audio API chime helper.
 * Plays a gentle two-tone chime and dispatches a native OS notification (if permitted)
 * when ride events occur (new request, ride accepted, driver arrived, OTP verified, chat message).
 */

export function playNotificationChime(kind: "info" | "success" | "alert" = "info"): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    if (kind === "success") {
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.11); // A5
    } else if (kind === "alert") {
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.12); // G5
    } else {
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 400);
  } catch {
    // Ignore audio autoplay restrictions
  }
}

export function triggerBrowserNotification(title: string, body: string): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    if (Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
      });
    } else if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    // Ignore notification errors
  }
}

