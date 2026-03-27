import { SandboxCaptchaProviderService } from './sandboxCaptchaProvider.service';
import { SandboxChallenge } from './sandboxAutomation.service';

export interface PressHoldMockChallengeOptions {
  title?: string;
  instruction?: string;
  buttonLabel?: string;
  successMessage?: string;
  holdDurationMs?: number;
  autoAdvanceDelayMs?: number;
  successRedirectUrl?: string | null;
  flowName?: string;
  screenshotName?: string;
  accessibleLabel?: string;
}

export interface PressHoldMockChallengePayload {
  kind: 'press_hold';
  title: string;
  instruction: string;
  buttonLabel: string;
  successMessage: string;
  holdDurationMs: number;
  autoAdvanceDelayMs: number;
  successRedirectUrl: string | null;
  flowName: string;
  screenshotName: string;
  accessibleLabel: string;
}

export class SandboxMockChallengeService {
  static normalizePressHoldOptions(options: PressHoldMockChallengeOptions = {}): PressHoldMockChallengePayload {
    return {
      kind: 'press_hold',
      title: String(options.title || 'Camel Sandbox Human Check'),
      instruction: String(options.instruction || 'Keep the button pressed until the mock challenge is marked as solved.'),
      buttonLabel: String(options.buttonLabel || 'Keep Pressed'),
      successMessage: String(options.successMessage || 'Mock challenge solved'),
      holdDurationMs: this.clampNumber(options.holdDurationMs, 600, 15000, 2200),
      autoAdvanceDelayMs: this.clampNumber(options.autoAdvanceDelayMs, 0, 15000, 0),
      successRedirectUrl: options.successRedirectUrl ? String(options.successRedirectUrl) : null,
      flowName: String(options.flowName || 'Camel Sandbox Press Hold'),
      screenshotName: String(options.screenshotName || 'camel-sandbox-press-hold'),
      accessibleLabel: String(options.accessibleLabel || 'Accessible fallback'),
    };
  }

  static async issuePressHoldChallenge(
    tenantId: string,
    origin: string,
    options: PressHoldMockChallengeOptions = {}
  ) {
    const payload = this.normalizePressHoldOptions(options);
    const challenge = await SandboxCaptchaProviderService.createChallenge(
      tenantId,
      payload.instruction,
      payload
    );
    const challengeUrl = this.buildChallengeUrl(origin, challenge.id);

    return {
      challenge,
      challengeUrl,
      flowTemplate: this.buildCamelFlow(challengeUrl, payload),
    };
  }

  static buildChallengeUrl(origin: string, challengeId: string) {
    return `${String(origin || '').replace(/\/$/, '')}/sandbox/mock-challenges/${challengeId}`;
  }

  static buildCamelFlow(challengeUrl: string, payload: PressHoldMockChallengePayload) {
    const holdMs = Math.max(payload.holdDurationMs + 250, payload.holdDurationMs);
    return {
      name: payload.flowName,
      description: 'Local sandbox challenge for Camel to practice press-and-hold interactions.',
      sandboxOnly: true,
      host: this.extractHost(challengeUrl),
      steps: [
        {
          id: 'step_01_navigate_mock_challenge',
          order: 1,
          type: 'navigate',
          config: { url: challengeUrl },
        },
        {
          id: 'step_02_wait_hold_button',
          order: 2,
          type: 'wait_for_selector',
          config: {
            selector: '[data-camel-role="press-hold"]',
            timeout: 20000,
          },
        },
        {
          id: 'step_03_press_and_hold',
          order: 3,
          type: 'press_and_hold',
          config: {
            selector: '[data-camel-role="press-hold"]',
            durationMs: holdMs,
          },
        },
        {
          id: 'step_04_wait_success',
          order: 4,
          type: 'wait_for_selector',
          config: {
            selector: '[data-camel-state="resolved"]',
            timeout: 20000,
          },
        },
        {
          id: 'step_05_checkpoint',
          order: 5,
          type: 'screenshot',
          config: { name: payload.screenshotName },
        },
      ],
    };
  }

  static renderChallengePage(challenge: SandboxChallenge, origin: string) {
    const payload = this.normalizePressHoldOptions(challenge.payload || {});
    const resolved = challenge.status === 'resolved';
    const stateLabel = resolved ? 'resolved' : challenge.status;
    const successRedirectUrl = payload.successRedirectUrl ? JSON.stringify(payload.successRedirectUrl) : 'null';
    const holdDurationMs = Number(payload.holdDurationMs || 0);
    const autoAdvanceDelayMs = Number(payload.autoAdvanceDelayMs || 0);
    const resolveUrl = `${this.buildChallengeUrl(origin, challenge.id)}/resolve`;
    const stateUrl = `${this.buildChallengeUrl(origin, challenge.id)}/state`;

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${this.escapeHtml(payload.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f2efe8;
        --panel: #fffdf8;
        --ink: #1f2937;
        --muted: #6b7280;
        --accent: #0f766e;
        --accent-2: #14b8a6;
        --border: rgba(15, 118, 110, 0.14);
        --success: #166534;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, rgba(20, 184, 166, 0.16), transparent 34%),
          radial-gradient(circle at bottom right, rgba(234, 88, 12, 0.16), transparent 30%),
          var(--bg);
        color: var(--ink);
        font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      }
      .shell {
        width: min(92vw, 560px);
        background: var(--panel);
        border-radius: 24px;
        border: 1px solid var(--border);
        box-shadow: 0 20px 70px rgba(15, 23, 42, 0.14);
        padding: 32px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: rgba(15, 118, 110, 0.08);
        color: var(--accent);
      }
      h1 {
        margin: 18px 0 12px;
        font-size: clamp(30px, 5vw, 42px);
        line-height: 1.05;
      }
      p {
        margin: 0;
        font-size: 16px;
        line-height: 1.6;
        color: var(--muted);
      }
      .arena {
        margin-top: 28px;
        padding: 24px;
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(20, 184, 166, 0.08), rgba(255, 255, 255, 0.9));
        border: 1px solid rgba(15, 118, 110, 0.1);
      }
      .hold-button {
        position: relative;
        width: 100%;
        min-height: 78px;
        border: 0;
        border-radius: 999px;
        cursor: pointer;
        overflow: hidden;
        background: linear-gradient(90deg, #111827, #0f766e);
        color: #ffffff;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      .hold-button[disabled] {
        cursor: default;
        opacity: 0.76;
      }
      .hold-fill {
        position: absolute;
        inset: 0;
        width: 0%;
        background: linear-gradient(90deg, rgba(45, 212, 191, 0.96), rgba(16, 185, 129, 0.96));
        transition: width 90ms linear;
      }
      .hold-label {
        position: relative;
        z-index: 1;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-top: 16px;
        font-size: 13px;
        color: var(--muted);
      }
      .accessible {
        margin-top: 14px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid rgba(15, 118, 110, 0.16);
        background: #ffffff;
        color: var(--accent);
        font-weight: 600;
      }
      .status {
        margin-top: 20px;
        min-height: 26px;
        font-size: 15px;
        font-weight: 600;
      }
      .status[data-state="resolved"] {
        color: var(--success);
      }
      .status[data-state="pending"] {
        color: var(--accent);
      }
      .debug {
        margin-top: 18px;
        padding-top: 16px;
        border-top: 1px dashed rgba(15, 118, 110, 0.16);
        font-size: 12px;
        color: var(--muted);
      }
      .resolved-badge {
        display: ${resolved ? 'inline-flex' : 'none'};
        margin-top: 18px;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(22, 101, 52, 0.1);
        color: var(--success);
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main class="shell" data-camel-kind="mock-challenge" data-camel-challenge-id="${this.escapeHtml(challenge.id)}">
      <span class="eyebrow">Camel Sandbox Challenge</span>
      <h1>${this.escapeHtml(payload.title)}</h1>
      <p>${this.escapeHtml(payload.instruction)}</p>

      <section class="arena">
        <button
          class="hold-button"
          type="button"
          data-camel-role="press-hold"
          data-camel-hold-ms="${holdDurationMs}"
          data-camel-state="${this.escapeHtml(stateLabel)}"
          ${resolved ? 'disabled' : ''}
          aria-label="${this.escapeHtml(payload.buttonLabel)}">
          <span class="hold-fill" data-camel-role="hold-fill"></span>
          <span class="hold-label">${this.escapeHtml(payload.buttonLabel)}</span>
        </button>

        <div class="meta">
          <span>Hold target: <strong data-camel-role="hold-ms">${holdDurationMs}</strong> ms</span>
          <span>Status: <strong data-camel-role="state-text">${this.escapeHtml(stateLabel)}</strong></span>
        </div>

        <button class="accessible" type="button" data-camel-role="accessible-trigger">
          ${this.escapeHtml(payload.accessibleLabel)}
        </button>

        <div class="status" data-camel-role="status" data-state="${resolved ? 'resolved' : 'pending'}">
          ${resolved ? this.escapeHtml(payload.successMessage) : 'Waiting for a press-and-hold interaction.'}
        </div>
        <div class="resolved-badge" data-camel-state="resolved">Resolved</div>
      </section>

      <section class="debug">
        <div>Challenge id: <code>${this.escapeHtml(challenge.id)}</code></div>
        <div>Provider: <code>${this.escapeHtml(challenge.provider)}</code></div>
        <div>Public state: <code>${this.escapeHtml(stateUrl)}</code></div>
      </section>
    </main>

    <script>
      (() => {
        const resolvedInitially = ${resolved ? 'true' : 'false'};
        const holdDurationMs = ${holdDurationMs};
        const autoAdvanceDelayMs = ${autoAdvanceDelayMs};
        const successRedirectUrl = ${successRedirectUrl};
        const resolveUrl = ${JSON.stringify(resolveUrl)};
        const button = document.querySelector('[data-camel-role="press-hold"]');
        const fill = document.querySelector('[data-camel-role="hold-fill"]');
        const status = document.querySelector('[data-camel-role="status"]');
        const stateText = document.querySelector('[data-camel-role="state-text"]');
        const resolvedBadge = document.querySelector('[data-camel-state="resolved"]');
        const accessibleTrigger = document.querySelector('[data-camel-role="accessible-trigger"]');
        let startedAt = 0;
        let rafId = 0;
        let submitted = resolvedInitially;

        const setResolvedUi = (heldMs) => {
          if (fill) fill.style.width = '100%';
          if (status) {
            status.dataset.state = 'resolved';
            status.textContent = ${JSON.stringify(payload.successMessage)} + (heldMs ? ' (' + heldMs + ' ms)' : '');
          }
          if (stateText) stateText.textContent = 'resolved';
          if (button) {
            button.dataset.camelState = 'resolved';
            button.disabled = true;
          }
          if (resolvedBadge) resolvedBadge.style.display = 'inline-flex';
          if (successRedirectUrl) {
            window.setTimeout(() => {
              window.location.href = successRedirectUrl;
            }, autoAdvanceDelayMs);
          }
        };

        const submitResolution = async (mode, heldMs) => {
          if (submitted) return;
          submitted = true;
          try {
            await fetch(resolveUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                resolution: {
                  mode,
                  heldMs,
                  value: mode === 'accessible' ? 'accessible-ok' : 'press-hold-ok',
                },
              }),
            });
          } catch (_error) {
            submitted = false;
            if (status) {
              status.dataset.state = 'pending';
              status.textContent = 'Resolution request failed. Try again.';
            }
            return;
          }
          setResolvedUi(heldMs);
        };

        const tick = () => {
          const elapsed = Date.now() - startedAt;
          const progress = Math.max(0, Math.min(1, elapsed / holdDurationMs));
          if (fill) fill.style.width = (progress * 100).toFixed(1) + '%';
          if (status && !submitted) {
            status.dataset.state = 'pending';
            status.textContent = 'Holding... ' + Math.round(progress * 100) + '%';
          }
          if (elapsed >= holdDurationMs) {
            cancelAnimationFrame(rafId);
            submitResolution('press_hold', elapsed);
            return;
          }
          rafId = requestAnimationFrame(tick);
        };

        const resetHold = () => {
          cancelAnimationFrame(rafId);
          if (!submitted) {
            if (fill) fill.style.width = '0%';
            if (status) {
              status.dataset.state = 'pending';
              status.textContent = 'Waiting for a press-and-hold interaction.';
            }
          }
        };

        if (button && !resolvedInitially) {
          const startHold = (event) => {
            event.preventDefault();
            if (submitted) return;
            startedAt = Date.now();
            tick();
          };
          const stopHold = () => resetHold();
          button.addEventListener('pointerdown', startHold);
          button.addEventListener('pointerup', stopHold);
          button.addEventListener('pointerleave', stopHold);
          button.addEventListener('pointercancel', stopHold);
          button.addEventListener('mouseup', stopHold);
          button.addEventListener('touchend', stopHold);
        }

        if (accessibleTrigger && !resolvedInitially) {
          accessibleTrigger.addEventListener('click', () => submitResolution('accessible', 0));
        }

        if (resolvedInitially) {
          setResolvedUi(0);
        }
      })();
    </script>
  </body>
</html>`;
  }

  private static escapeHtml(value: string) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private static clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
  }

  private static extractHost(url: string) {
    try {
      return new URL(url).host;
    } catch {
      return '';
    }
  }
}
