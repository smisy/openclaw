import type { OpenClawConfig } from "../config/config.js";

export type DiagnosticSessionState = "idle" | "processing" | "waiting";

type DiagnosticBaseEvent = {
  ts: number;
  seq: number;
};

export type DiagnosticUsageEvent = DiagnosticBaseEvent & {
  type: "model.usage";
  sessionKey?: string;
  sessionId?: string;
  channel?: string;
  provider?: string;
  model?: string;
  usage: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    promptTokens?: number;
    total?: number;
  };
  lastCallUsage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  context?: {
    limit?: number;
    used?: number;
  };
  costUsd?: number;
  durationMs?: number;
};

export type DiagnosticWebhookReceivedEvent = DiagnosticBaseEvent & {
  type: "webhook.received";
  channel: string;
  updateType?: string;
  chatId?: number | string;
};

export type DiagnosticWebhookProcessedEvent = DiagnosticBaseEvent & {
  type: "webhook.processed";
  channel: string;
  updateType?: string;
  chatId?: number | string;
  durationMs?: number;
};

export type DiagnosticWebhookErrorEvent = DiagnosticBaseEvent & {
  type: "webhook.error";
  channel: string;
  updateType?: string;
  chatId?: number | string;
  error: string;
};

export type DiagnosticMessageQueuedEvent = DiagnosticBaseEvent & {
  type: "message.queued";
  sessionKey?: string;
  sessionId?: string;
  channel?: string;
  source: string;
  queueDepth?: number;
};

export type DiagnosticMessageProcessedEvent = DiagnosticBaseEvent & {
  type: "message.processed";
  channel: string;
  messageId?: number | string;
  chatId?: number | string;
  sessionKey?: string;
  sessionId?: string;
  durationMs?: number;
  outcome: "completed" | "skipped" | "error";
  reason?: string;
  error?: string;
};

export type DiagnosticSessionStateEvent = DiagnosticBaseEvent & {
  type: "session.state";
  sessionKey?: string;
  sessionId?: string;
  prevState?: DiagnosticSessionState;
  state: DiagnosticSessionState;
  reason?: string;
  queueDepth?: number;
};

export type DiagnosticSessionStuckEvent = DiagnosticBaseEvent & {
  type: "session.stuck";
  sessionKey?: string;
  sessionId?: string;
  state: DiagnosticSessionState;
  ageMs: number;
  queueDepth?: number;
};

export type DiagnosticLaneEnqueueEvent = DiagnosticBaseEvent & {
  type: "queue.lane.enqueue";
  lane: string;
  queueSize: number;
};

export type DiagnosticLaneDequeueEvent = DiagnosticBaseEvent & {
  type: "queue.lane.dequeue";
  lane: string;
  queueSize: number;
  waitMs: number;
};

export type DiagnosticRunAttemptEvent = DiagnosticBaseEvent & {
  type: "run.attempt";
  sessionKey?: string;
  sessionId?: string;
  runId: string;
  attempt: number;
};

export type DiagnosticHeartbeatEvent = DiagnosticBaseEvent & {
  type: "diagnostic.heartbeat";
  webhooks: {
    received: number;
    processed: number;
    errors: number;
  };
  active: number;
  waiting: number;
  queued: number;
};

export type DiagnosticToolLoopEvent = DiagnosticBaseEvent & {
  type: "tool.loop";
  sessionKey?: string;
  sessionId?: string;
  toolName: string;
  level: "warning" | "critical";
  action: "warn" | "block";
  detector: "generic_repeat" | "known_poll_no_progress" | "global_circuit_breaker" | "ping_pong";
  count: number;
  message: string;
  pairedToolName?: string;
};

/**
 * Emitted by the model fallback runner when the entire candidate chain is
 * exhausted without producing a successful response (i.e. just before
 * `FallbackSummaryError` is thrown). Surfaces the requested
 * provider/model the caller asked for, the terminal failure reason from the
 * last attempted candidate, and total attempt count. Consumed by
 * `extensions/diagnostics-otel` to emit the
 * `openclaw.model.fallback.exhausted` counter that powers the ai-central
 * `AICentralFallbackExhausted{Auth,}` alerts (GH-5632).
 */
export type DiagnosticModelFallbackExhaustedEvent = DiagnosticBaseEvent & {
  type: "model.fallback.exhausted";
  /** Provider the caller asked for (the primary, before fallback substitution). */
  requestedProvider: string;
  /** Model the caller asked for (the primary, before fallback substitution). */
  requestedModel: string;
  /**
   * Terminal reason classification from the last attempted candidate. Mirrors
   * `FailoverReason` from `agents/pi-embedded-helpers/types.ts`. Defaults to
   * `"unknown"` when no candidate produced a classified reason.
   */
  reason:
    | "auth"
    | "auth_permanent"
    | "format"
    | "rate_limit"
    | "overloaded"
    | "billing"
    | "timeout"
    | "model_not_found"
    | "session_expired"
    | "unknown";
  /**
   * Fallback chain kind. `"text"` for `runWithModelFallback`, `"image"` for
   * `runWithImageModelFallback`. Lets dashboards/alerts scope to text-only
   * traffic without picking up image-generation fallbacks.
   */
  kind: "text" | "image";
  /** Number of candidate attempts the chain actually executed. */
  totalAttempts: number;
  /** Optional run identifier propagated from `runWithModelFallback`. */
  runId?: string;
};

export type DiagnosticEventPayload =
  | DiagnosticUsageEvent
  | DiagnosticWebhookReceivedEvent
  | DiagnosticWebhookProcessedEvent
  | DiagnosticWebhookErrorEvent
  | DiagnosticMessageQueuedEvent
  | DiagnosticMessageProcessedEvent
  | DiagnosticSessionStateEvent
  | DiagnosticSessionStuckEvent
  | DiagnosticLaneEnqueueEvent
  | DiagnosticLaneDequeueEvent
  | DiagnosticRunAttemptEvent
  | DiagnosticHeartbeatEvent
  | DiagnosticToolLoopEvent
  | DiagnosticModelFallbackExhaustedEvent;

export type DiagnosticEventInput = DiagnosticEventPayload extends infer Event
  ? Event extends DiagnosticEventPayload
    ? Omit<Event, "seq" | "ts">
    : never
  : never;

type DiagnosticEventsGlobalState = {
  seq: number;
  listeners: Set<(evt: DiagnosticEventPayload) => void>;
  dispatchDepth: number;
};

function getDiagnosticEventsState(): DiagnosticEventsGlobalState {
  const globalStore = globalThis as typeof globalThis & {
    __openclawDiagnosticEventsState?: DiagnosticEventsGlobalState;
  };
  if (!globalStore.__openclawDiagnosticEventsState) {
    globalStore.__openclawDiagnosticEventsState = {
      seq: 0,
      listeners: new Set<(evt: DiagnosticEventPayload) => void>(),
      dispatchDepth: 0,
    };
  }
  return globalStore.__openclawDiagnosticEventsState;
}

export function isDiagnosticsEnabled(config?: OpenClawConfig): boolean {
  return config?.diagnostics?.enabled === true;
}

export function emitDiagnosticEvent(event: DiagnosticEventInput) {
  const state = getDiagnosticEventsState();
  if (state.dispatchDepth > 100) {
    console.error(
      `[diagnostic-events] recursion guard tripped at depth=${state.dispatchDepth}, dropping type=${event.type}`,
    );
    return;
  }

  const enriched = {
    ...event,
    seq: (state.seq += 1),
    ts: Date.now(),
  } satisfies DiagnosticEventPayload;
  state.dispatchDepth += 1;
  for (const listener of state.listeners) {
    try {
      listener(enriched);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? (err.stack ?? err.message)
          : typeof err === "string"
            ? err
            : String(err);
      console.error(
        `[diagnostic-events] listener error type=${enriched.type} seq=${enriched.seq}: ${errorMessage}`,
      );
      // Ignore listener failures.
    }
  }
  state.dispatchDepth -= 1;
}

export function onDiagnosticEvent(listener: (evt: DiagnosticEventPayload) => void): () => void {
  const state = getDiagnosticEventsState();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function resetDiagnosticEventsForTest(): void {
  const state = getDiagnosticEventsState();
  state.seq = 0;
  state.listeners.clear();
  state.dispatchDepth = 0;
}
