/**
 * Coarse startup phase tracking for {@link startGatewayServer}.
 *
 * GH-364: when the gateway fails to bind within the supervisor budget, the only
 * useful diagnostic is "which startup phase was in progress when the bind was
 * missed". The boot path in `server.impl.ts` is a single flat async function, so
 * we record a coarse phase marker as execution crosses each boundary
 * (config-load -> plugin-load -> listener-bind -> ready) together with the
 * elapsed time since startup began.
 *
 * This module is intentionally dependency-free so a startup watchdog (wired
 * separately, outside the boot function) can read the last-entered phase via
 * {@link getGatewayStartupPhase} without importing the heavy gateway server
 * module and risking a circular dependency.
 *
 * No behavior change to the boot path: marking a phase only records state and
 * emits one info log line.
 */

/** Ordered coarse phases of gateway startup. */
export type GatewayStartupPhase = "config-load" | "plugin-load" | "listener-bind" | "ready";

/** Stable ordering of phases, earliest first. Used for elapsed-context logging. */
export const GATEWAY_STARTUP_PHASES: readonly GatewayStartupPhase[] = [
  "config-load",
  "plugin-load",
  "listener-bind",
  "ready",
] as const;

/** Snapshot of the most recently entered startup phase. */
export type GatewayStartupPhaseSnapshot = {
  /** The last phase that was entered. */
  phase: GatewayStartupPhase;
  /** Milliseconds elapsed from tracker start to when this phase was entered. */
  elapsedMs: number;
};

type PhaseLogger = { info: (msg: string) => void };

export type GatewayStartupPhaseTracker = {
  /**
   * Record entry into `phase`. Captures elapsed-since-start, logs a single line,
   * and updates the snapshot returned by {@link GatewayStartupPhaseTracker.snapshot}.
   */
  mark: (phase: GatewayStartupPhase) => void;
  /** The most recently entered phase + its elapsed time, or null before first mark. */
  snapshot: () => GatewayStartupPhaseSnapshot | null;
};

/**
 * Create an isolated phase tracker. `now` is injectable for tests; defaults to
 * `Date.now`. `log`, when provided, receives one info line per phase entry.
 */
export function createGatewayStartupPhaseTracker(opts?: {
  now?: () => number;
  log?: PhaseLogger;
}): GatewayStartupPhaseTracker {
  const now = opts?.now ?? Date.now;
  const log = opts?.log;
  const startedAt = now();
  let current: GatewayStartupPhaseSnapshot | null = null;

  return {
    mark(phase: GatewayStartupPhase) {
      const elapsedMs = Math.max(0, now() - startedAt);
      current = { phase, elapsedMs };
      log?.info(`gateway: startup phase \u2192 ${phase} (+${elapsedMs}ms)`);
    },
    snapshot() {
      return current;
    },
  };
}

/**
 * Process-global tracker for the live gateway boot. The boot function installs a
 * tracker via {@link beginGatewayStartupPhases} and marks phases through
 * {@link markGatewayStartupPhase}; a startup watchdog reads the last phase via
 * {@link getGatewayStartupPhase}.
 */
let globalTracker: GatewayStartupPhaseTracker | null = null;

/**
 * Install (or replace) the process-global startup-phase tracker and return it.
 * Called once at the top of the gateway boot function.
 */
export function beginGatewayStartupPhases(opts?: {
  now?: () => number;
  log?: PhaseLogger;
}): GatewayStartupPhaseTracker {
  globalTracker = createGatewayStartupPhaseTracker(opts);
  return globalTracker;
}

/** Mark a phase on the process-global tracker, if one is installed. */
export function markGatewayStartupPhase(phase: GatewayStartupPhase): void {
  globalTracker?.mark(phase);
}

/**
 * Read the last-entered startup phase from the process-global tracker.
 * Returns null if startup has not begun or no phase has been marked yet.
 * Intended for a bind-timeout watchdog to name the stalled phase.
 */
export function getGatewayStartupPhase(): GatewayStartupPhaseSnapshot | null {
  return globalTracker?.snapshot() ?? null;
}

/** Test-only: clear the process-global tracker. */
export function __resetGatewayStartupPhaseForTest(): void {
  globalTracker = null;
}
