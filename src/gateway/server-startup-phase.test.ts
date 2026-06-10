import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetGatewayStartupPhaseForTest,
  beginGatewayStartupPhases,
  createGatewayStartupPhaseTracker,
  GATEWAY_STARTUP_PHASES,
  getGatewayStartupPhase,
  markGatewayStartupPhase,
} from "./server-startup-phase.js";

describe("gateway startup phase tracker", () => {
  afterEach(() => {
    __resetGatewayStartupPhaseForTest();
  });

  it("records elapsed-since-start for each phase using the injected clock", () => {
    let nowMs = 1_000;
    const now = () => nowMs;
    const info = vi.fn();
    const tracker = createGatewayStartupPhaseTracker({ now, log: { info } });

    expect(tracker.snapshot()).toBeNull();

    tracker.mark("config-load"); // +0ms
    nowMs = 1_050;
    tracker.mark("plugin-load"); // +50ms
    nowMs = 1_900;
    tracker.mark("listener-bind"); // +900ms
    nowMs = 2_000;
    tracker.mark("ready"); // +1000ms

    expect(tracker.snapshot()).toEqual({ phase: "ready", elapsedMs: 1_000 });
  });

  it("logs a single line per phase with phase name and elapsed ms", () => {
    let nowMs = 0;
    const info = vi.fn();
    const tracker = createGatewayStartupPhaseTracker({ now: () => nowMs, log: { info } });

    tracker.mark("config-load");
    nowMs = 250;
    tracker.mark("plugin-load");

    expect(info).toHaveBeenCalledTimes(2);
    expect(info).toHaveBeenNthCalledWith(1, "gateway: startup phase \u2192 config-load (+0ms)");
    expect(info).toHaveBeenNthCalledWith(2, "gateway: startup phase \u2192 plugin-load (+250ms)");
  });

  it("snapshot reflects the most recently entered phase", () => {
    const tracker = createGatewayStartupPhaseTracker({ now: () => 0 });
    for (const phase of GATEWAY_STARTUP_PHASES) {
      tracker.mark(phase);
      expect(tracker.snapshot()?.phase).toBe(phase);
    }
    expect(tracker.snapshot()?.phase).toBe("ready");
  });

  it("clamps negative elapsed (clock skew) to zero", () => {
    let nowMs = 5_000;
    const tracker = createGatewayStartupPhaseTracker({ now: () => nowMs });
    tracker.mark("config-load");
    nowMs = 4_000; // clock went backwards
    tracker.mark("plugin-load");
    expect(tracker.snapshot()).toEqual({ phase: "plugin-load", elapsedMs: 0 });
  });

  it("does not throw when no logger is provided", () => {
    const tracker = createGatewayStartupPhaseTracker({ now: () => 0 });
    expect(() => tracker.mark("ready")).not.toThrow();
    expect(tracker.snapshot()).toEqual({ phase: "ready", elapsedMs: 0 });
  });

  describe("process-global tracker", () => {
    it("returns null before startup begins", () => {
      expect(getGatewayStartupPhase()).toBeNull();
    });

    it("marks and reads the last phase via the global singleton", () => {
      let nowMs = 100;
      beginGatewayStartupPhases({ now: () => nowMs });

      expect(getGatewayStartupPhase()).toBeNull();

      markGatewayStartupPhase("config-load");
      nowMs = 700;
      markGatewayStartupPhase("listener-bind");

      expect(getGatewayStartupPhase()).toEqual({ phase: "listener-bind", elapsedMs: 600 });
    });

    it("marking before begin is a no-op (no throw, stays null)", () => {
      expect(() => markGatewayStartupPhase("config-load")).not.toThrow();
      expect(getGatewayStartupPhase()).toBeNull();
    });

    it("begin replaces any prior tracker and resets elapsed origin", () => {
      let nowMs = 0;
      beginGatewayStartupPhases({ now: () => nowMs });
      markGatewayStartupPhase("ready");
      expect(getGatewayStartupPhase()?.phase).toBe("ready");

      nowMs = 10_000;
      beginGatewayStartupPhases({ now: () => nowMs });
      expect(getGatewayStartupPhase()).toBeNull();
      nowMs = 10_120;
      markGatewayStartupPhase("config-load");
      expect(getGatewayStartupPhase()).toEqual({ phase: "config-load", elapsedMs: 120 });
    });
  });
});
