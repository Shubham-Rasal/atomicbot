import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "../store";
import { stripMetadata } from "@ui/chat/hooks/messageParser";

export type UiMessageAttachment = {
  type: string;
  mimeType?: string;
  dataUrl?: string;
};

/** A tool invocation extracted from assistant message content. */
export type UiToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

/** A tool result extracted from toolResult messages in the history. */
export type UiToolResult = {
  toolCallId: string;
  toolName: string;
  text: string;
  status?: string;
  /** Attachments (images/files) from the tool result content. */
  attachments?: UiMessageAttachment[];
};

export type UiMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "unknown";
  text: string;
  ts?: number;
  runId?: string;
  pending?: boolean;
  /** Attachments (images/files) from history; shown before message text. */
  attachments?: UiMessageAttachment[];
  /** Tool calls extracted from assistant message content. */
  toolCalls?: UiToolCall[];
  /** Tool results matched to the preceding assistant's tool calls. */
  toolResults?: UiToolResult[];
};

/** A tool call currently in-flight, streamed via agent events in real time. */
export type LiveToolCall = {
  toolCallId: string;
  runId: string;
  name: string;
  arguments: Record<string, unknown>;
  phase: "start" | "update" | "result";
  resultText?: string;
  isError?: boolean;
};

export type ChatSliceState = {
  messages: UiMessage[];
  streamByRun: Record<string, UiMessage>;
  sending: boolean;
  error: string | null;
  /** Monotonically increasing epoch; bumped on every sessionCleared so stale
   *  loadChatHistory results can be detected and discarded. */
  epoch: number;
  /** The session key that messages/streamByRun belong to.  Used by the UI to
   *  avoid rendering stale messages from a previous session during the single
   *  render that occurs between a navigation (which changes sessionKey
   *  immediately) and the sessionCleared effect (which runs after the render). */
  activeSessionKey: string;
  /** Tool calls currently in-flight, streamed via agent "tool" events. Keyed by toolCallId. */
  liveToolCalls: Record<string, LiveToolCall>;
  /** True while waiting for the agent to respond after an exec approval auto-continue. */
  awaitingContinuation: boolean;
};

const initialState: ChatSliceState = {
  messages: [],
  streamByRun: {},
  sending: false,
  error: null,
  epoch: 0,
  activeSessionKey: "",
  liveToolCalls: {},
  awaitingContinuation: false,
};

export type GatewayRequest = <T = unknown>(method: string, params?: unknown) => Promise<T>;

export type ChatAttachmentInput = {
  id: string;
  dataUrl: string;
  mimeType: string;
  /** Optional display name (e.g. from File.name). */
  fileName?: string;
};

export function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

type ChatHistoryResult = {
  sessionKey: string;
  sessionId: string;
  messages: unknown[];
  thinkingLevel?: string;
};

export function extractText(msg: unknown): string {
  try {
    if (!msg || typeof msg !== "object") {
      return typeof msg === "string" ? msg : "";
    }
    const m = msg as { content?: unknown; text?: unknown };
    if (typeof m.text === "string" && m.text.trim()) {
      return m.text;
    }
    const content = m.content;
    if (typeof content === "string") {
      return content.trim() ? content : "";
    }
    if (!Array.isArray(content)) {
      return "";
    }
    const parts = content
      .map((p) => {
        if (!p || typeof p !== "object") {
          return "";
        }
        const part = p as { type?: unknown; text?: unknown };
        if (part.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean);
    return parts.join("\n");
  } catch {
    return "";
  }
}

/** Extract attachment blocks from a history message for display (images as dataUrl, others as icon). */
export function extractAttachmentsFromMessage(msg: unknown): UiMessageAttachment[] {
  const out: UiMessageAttachment[] = [];
  try {
    if (!msg || typeof msg !== "object") {
      return out;
    }
    const m = msg as { content?: unknown };
    const content = m.content;
    if (!Array.isArray(content)) {
      return out;
    }
    for (const p of content) {
      if (!p || typeof p !== "object") {
        continue;
      }
      const part = p as {
        type?: unknown;
        text?: unknown;
        data?: unknown;
        mimeType?: unknown;
        source?: { type?: unknown; data?: unknown; media_type?: unknown };
      };
      const type = typeof part.type === "string" ? part.type : "";
      if (type === "text") {
        continue;
      }
      let dataUrl: string | undefined;
      let mimeType: string | undefined;
      if (type === "image" && (typeof part.data === "string" || part.source)) {
        const data =
          typeof part.data === "string"
            ? part.data
            : typeof part.source?.data === "string"
              ? part.source.data
              : undefined;
        const mediaType =
          typeof part.mimeType === "string"
            ? part.mimeType
            : typeof part.source?.media_type === "string"
              ? part.source.media_type
              : "image/png";
        if (data) {
          dataUrl = `data:${mediaType};base64,${data}`;
          mimeType = mediaType;
        }
      }
      out.push({
        type: type || "file",
        mimeType: mimeType || (typeof part.mimeType === "string" ? part.mimeType : undefined),
        dataUrl,
      });
    }
  } catch {
    // ignore
  }
  return out;
}

// Default heartbeat prompt sent by the gateway as a user message.
const HEARTBEAT_PROMPT_PREFIX = "Read HEARTBEAT.md if it exists (workspace context).";
const HEARTBEAT_OK_TOKEN = "HEARTBEAT_OK";

/** Messages auto-sent after exec approval that should be hidden from the UI. */
const APPROVAL_CONTINUE_TOKENS = new Set(["continue", "denied"]);

/** Detect auto-continue messages sent after exec approval (single-word message). */
export function isApprovalContinueMessage(role: string, text: string): boolean {
  if (role !== "user") {
    return false;
  }
  const trimmed = text.trim().toLowerCase();
  return !trimmed.includes(" ") && APPROVAL_CONTINUE_TOKENS.has(trimmed);
}

/** Detect heartbeat-related messages that should be hidden from the chat UI. */
export function isHeartbeatMessage(role: string, text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {return false;}
<<<<<<< HEAD
  // User-side: the heartbeat prompt injected by the gateway.
  // Use includes() because gateway may prepend metadata (date headers, etc.).
  if (role === "user" && trimmed.includes(HEARTBEAT_PROMPT_PREFIX)) {
=======
  // User-side: the heartbeat prompt injected by the gateway
  if (role === "user" && trimmed.startsWith(HEARTBEAT_PROMPT_PREFIX)) {
>>>>>>> 7207ec5 (Implement state directory management in Electron app, allowing user overrides and selection of custom directories. Enhance chat functionality to support message attachments and update UI for generated images. Add Nano Banana skill integration with appropriate modals and status handling.)
    return true;
  }
  // Assistant-side: HEARTBEAT_OK acknowledgment (possibly with light markup or surrounding text)
  if (role === "assistant") {
    const stripped = trimmed
      .replace(/<[^>]*>/g, " ")
      .replace(/[*`~_]+/g, "")
      .trim();
    if (stripped === HEARTBEAT_OK_TOKEN || stripped.includes(HEARTBEAT_OK_TOKEN)) {
      return true;
    }
  }
  return false;
}

function parseRole(value: unknown): UiMessage["role"] {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "user" || raw === "assistant" || raw === "system") {
    return raw;
  }
  return "unknown";
}

/** Extract tool calls from an assistant message's content array. */
export function extractToolCalls(msg: unknown): UiToolCall[] {
  const out: UiToolCall[] = [];
  if (!msg || typeof msg !== "object") {
    return out;
  }
  const m = msg as { content?: unknown };
  if (!Array.isArray(m.content)) {
    return out;
  }
  for (const part of m.content) {
    if (!part || typeof part !== "object") {
      continue;
    }
    const p = part as { type?: string; id?: string; name?: string; arguments?: unknown };
    const t = typeof p.type === "string" ? p.type.toLowerCase() : "";
    if (
      (t === "toolcall" || t === "tool_call" || t === "tooluse" || t === "tool_use") &&
      typeof p.name === "string"
    ) {
      out.push({
        id: typeof p.id === "string" ? p.id : `tc-${out.length}`,
        name: p.name,
        arguments:
          p.arguments && typeof p.arguments === "object"
            ? (p.arguments as Record<string, unknown>)
            : {},
      });
    }
  }
  return out;
}

/** Extract tool result info from a toolResult-role message. */
function extractToolResult(msg: unknown): UiToolResult | null {
  if (!msg || typeof msg !== "object") {
    return null;
  }
  const m = msg as {
    role?: string;
    toolCallId?: string;
    toolName?: string;
    content?: unknown;
    details?: { status?: string };
  };
  const role = typeof m.role === "string" ? m.role : "";
  if (role !== "toolResult" && role !== "tool_result") {
    return null;
  }
  const text = extractText(msg);
  const attachments = extractAttachmentsFromMessage(msg);
  return {
    toolCallId: typeof m.toolCallId === "string" ? m.toolCallId : "",
    toolName: typeof m.toolName === "string" ? m.toolName : "unknown",
    text,
    status: typeof m.details?.status === "string" ? m.details.status : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

export function parseHistoryMessages(raw: unknown[]): UiMessage[] {
  const out: UiMessage[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item || typeof item !== "object") {
      continue;
    }
    const msg = item as { role?: unknown; timestamp?: unknown };
    const rawRole = typeof msg.role === "string" ? msg.role : "";

    // Handle toolResult messages: attach results to the preceding assistant message.
    if (rawRole === "toolResult" || rawRole === "tool_result") {
      const result = extractToolResult(item);
      if (result && out.length > 0) {
        const prev = out[out.length - 1];
        if (prev.role === "assistant") {
          prev.toolResults = [...(prev.toolResults ?? []), result];
        }
      }
      continue;
    }

    const role = parseRole(msg.role);
    const text = extractText(item);
    const toolCalls = role === "assistant" ? extractToolCalls(item) : [];
    const attachments = extractAttachmentsFromMessage(item);
    const hasAttachments = attachments.length > 0;
    const hasToolCalls = toolCalls.length > 0;
    if (!text && !hasAttachments && !hasToolCalls) {
      continue;
    }
    // Hide heartbeat prompts and ack responses from chat history
    if (text && isHeartbeatMessage(role, text)) {
      continue;
    }
    // Strip gateway-injected metadata (untrusted context blocks, date headers,
    // attachment markers, etc.) so the UI shows only the actual message content.
    const displayText = text ? stripMetadata(text).trim() : "";
    const ts =
      typeof msg.timestamp === "number" && Number.isFinite(msg.timestamp)
        ? Math.floor(msg.timestamp)
        : undefined;
    out.push({
      id: `h-${ts ?? 0}-${i}`,
      role,
      text: displayText,
      ts,
      attachments: hasAttachments ? attachments : undefined,
      toolCalls: hasToolCalls ? toolCalls : undefined,
    });
  }
  return out;
}

export const loadChatHistory = createAsyncThunk(
  "chat/loadChatHistory",
  async (
    {
      request,
      sessionKey,
      limit = 200,
    }: { request: GatewayRequest; sessionKey: string; limit?: number },
    thunkApi
  ) => {
    thunkApi.dispatch(chatActions.setError(null));
    // Capture epoch before the async fetch so we can discard stale results
    // (e.g. when the user navigated away and back, triggering sessionCleared).
    const epochBefore = (thunkApi.getState() as RootState).chat.epoch;
    const res = await request<ChatHistoryResult>("chat.history", { sessionKey, limit });
    const epochAfter = (thunkApi.getState() as RootState).chat.epoch;
    if (epochAfter !== epochBefore) {
      // Session was cleared while we were fetching — discard stale history.
      return;
    }
    thunkApi.dispatch(chatActions.historyLoaded(parseHistoryMessages(res.messages)));
  }
);

export const sendChatMessage = createAsyncThunk(
  "chat/sendChatMessage",
  async (
    {
      request,
      sessionKey,
      message,
      attachments,
    }: {
      request: GatewayRequest;
      sessionKey: string;
      message: string;
      attachments?: ChatAttachmentInput[];
    },
    thunkApi
  ) => {
    const trimmed = message.trim();
    const hasAttachments = Boolean(attachments?.length);
    if (!trimmed && !hasAttachments) {
      return;
    }

    thunkApi.dispatch(chatActions.setError(null));
    thunkApi.dispatch(chatActions.setSending(true));

    const localId = `u-${crypto.randomUUID()}`;
    const runId = crypto.randomUUID();
    const displayMessage = trimmed || (hasAttachments ? `[${attachments!.length} file(s)]` : "");

    // Convert input attachments to UiMessageAttachment[] for optimistic display
    const uiAttachments: UiMessageAttachment[] | undefined = attachments?.length
      ? attachments.map((att) => ({
          type: att.mimeType.startsWith("image/") ? "image" : "file",
          mimeType: att.mimeType,
          dataUrl: att.dataUrl,
        }))
      : undefined;

    thunkApi.dispatch(
      chatActions.userMessageQueued({
        localId,
        message: displayMessage,
        attachments: uiAttachments,
      })
    );
    thunkApi.dispatch(chatActions.ensureStreamRun({ runId }));

    const apiAttachments =
      attachments
        ?.map((att) => {
          const parsed = dataUrlToBase64(att.dataUrl);
          if (!parsed) {
            return null;
          }
          const isImage = parsed.mimeType.startsWith("image/");
          return {
            type: isImage ? "image" : "file",
            mimeType: parsed.mimeType,
            fileName: att.fileName,
            content: parsed.content,
          };
        })
        .filter(
          (
            a
          ): a is {
            type: "image" | "file";
            mimeType: string;
            fileName: string | undefined;
            content: string;
          } => a !== null
        ) ?? [];

    try {
      await request("chat.send", {
        sessionKey,
        message: trimmed,
        deliver: false,
        idempotencyKey: runId,
        ...(apiAttachments.length > 0 ? { attachments: apiAttachments } : {}),
      });
      thunkApi.dispatch(chatActions.markUserMessageDelivered({ localId }));
    } catch (err) {
      console.error("[Chat] sendChatMessage failed:", {
        error: err,
        sessionKey,
        runId,
        message: message.slice(0, 100),
      });
      thunkApi.dispatch(chatActions.markUserMessageDelivered({ localId }));
      thunkApi.dispatch(chatActions.streamCleared({ runId }));
      thunkApi.dispatch(chatActions.setError(String(err)));
    } finally {
      thunkApi.dispatch(chatActions.setSending(false));
    }
  }
);

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    setSending(state, action: PayloadAction<boolean>) {
      state.sending = action.payload;
    },
    setAwaitingContinuation(state, action: PayloadAction<boolean>) {
      state.awaitingContinuation = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    /** Clear transcript when switching to another session so we don't show the previous thread. */
    sessionCleared(state, action: PayloadAction<string>) {
      state.messages = [];
      state.streamByRun = {};
      state.liveToolCalls = {};
      state.epoch += 1;
      state.activeSessionKey = action.payload;
    },
    historyLoaded(state, action: PayloadAction<UiMessage[]>) {
      const fromHistory = action.payload;
      const lastHistoryTs =
        fromHistory.length > 0 ? Math.max(...fromHistory.map((m) => m.ts ?? 0)) : 0;
      // Keep assistant messages from live stream (runId) that are newer than history,
      // so we don't lose them when the API hasn't persisted yet.
      // Deduplicate against history by text to avoid race-condition duplicates
      // (e.g. a stream final arriving between sessionCleared and historyLoaded).
      const historyTexts = new Set(fromHistory.map((m) => m.text));
      const liveOnly: UiMessage[] = [];
      for (const m of state.messages) {
        if (m.role === "assistant" && m.runId && m.ts != null && m.ts > lastHistoryTs) {
          if (!historyTexts.has(m.text)) {
            liveOnly.push(m);
          }
        }
      }
      state.messages =
        liveOnly.length > 0
          ? [...fromHistory, ...liveOnly.toSorted((a, b) => (a.ts ?? 0) - (b.ts ?? 0))]
          : fromHistory;
      state.streamByRun = {};

      // Resolve approval-pending statuses and clear the loader when the
      // closing continue/denied message has appeared in history.
      const allMsgs = state.messages;
      for (let i = 0; i < allMsgs.length; i++) {
        const msg = allMsgs[i];
        if (!msg.toolResults?.some((r) => r.status === "approval-pending")) {
          continue;
        }
        // Look for the first closure message after this pending result.
        let resolvedAs: "approved" | "denied" | null = null;
        for (let j = i + 1; j < allMsgs.length; j++) {
          if (isApprovalContinueMessage(allMsgs[j].role, allMsgs[j].text)) {
            const word = allMsgs[j].text.trim().toLowerCase();
            resolvedAs = word === "denied" ? "denied" : "approved";
            break;
          }
        }
        if (resolvedAs && msg.toolResults) {
          for (const r of msg.toolResults) {
            if (r.status === "approval-pending") {
              r.status = resolvedAs;
            }
          }
        }
      }

      if (state.awaitingContinuation) {
        const hasPendingLeft = allMsgs.some((m) =>
          m.toolResults?.some((r) => r.status === "approval-pending")
        );
        if (!hasPendingLeft) {
          state.awaitingContinuation = false;
        }
      }
    },
    userMessageQueued(
      state,
      action: PayloadAction<{
        localId: string;
        message: string;
        attachments?: UiMessageAttachment[];
      }>
    ) {
      state.messages.push({
        id: action.payload.localId,
        role: "user",
        text: action.payload.message,
        ts: Date.now(),
        pending: true,
        attachments: action.payload.attachments,
      });
    },
    markUserMessageDelivered(state, action: PayloadAction<{ localId: string }>) {
      state.messages = state.messages.map((m) =>
        m.id === action.payload.localId ? { ...m, pending: false } : m
      );
    },
    ensureStreamRun(state, action: PayloadAction<{ runId: string }>) {
      const runId = action.payload.runId;
      if (state.streamByRun[runId]) {
        return;
      }
      state.streamByRun[runId] = {
        id: `s-${runId}`,
        role: "assistant",
        text: "",
        runId,
        ts: Date.now(),
      };
    },
    streamDeltaReceived(state, action: PayloadAction<{ runId: string; text: string }>) {
      const runId = action.payload.runId;
      // Suppress heartbeat deltas from appearing in the stream UI
      if (isHeartbeatMessage("assistant", action.payload.text)) {
        return;
      }
      state.streamByRun[runId] = {
        id: `s-${runId}`,
        role: "assistant",
        text: action.payload.text,
        runId,
        ts: Date.now(),
      };
    },
    streamFinalReceived(
      state,
      action: PayloadAction<{
        runId: string;
        seq: number;
        text: string;
        attachments?: UiMessageAttachment[];
      }>
    ) {
      const { runId, seq, text, attachments } = action.payload;
      delete state.streamByRun[runId];
      if (!text && !attachments?.length) {
        return;
      }
      // Suppress heartbeat ack messages from appearing in chat history
      if (text && isHeartbeatMessage("assistant", text)) {
        return;
      }
      state.messages.push({
        id: `a-${runId}-${seq}`,
        role: "assistant",
        text: text || (attachments?.length ? "" : ""),
        runId,
        ts: Date.now(),
        attachments,
      });
    },
    streamErrorReceived(state, action: PayloadAction<{ runId: string; errorMessage?: string }>) {
      delete state.streamByRun[action.payload.runId];
      if (action.payload.errorMessage) {
        state.error = action.payload.errorMessage;
      }
    },
    streamAborted(state, action: PayloadAction<{ runId: string }>) {
      delete state.streamByRun[action.payload.runId];
    },
    streamCleared(state, action: PayloadAction<{ runId: string }>) {
      delete state.streamByRun[action.payload.runId];
    },
    /** A tool call started (agent event with stream="tool", phase="start"). */
    toolCallStarted(
      state,
      action: PayloadAction<{
        toolCallId: string;
        runId: string;
        name: string;
        arguments: Record<string, unknown>;
      }>
    ) {
      const { toolCallId, runId, name, arguments: args } = action.payload;
      state.liveToolCalls[toolCallId] = {
        toolCallId,
        runId,
        name,
        arguments: args,
        phase: "start",
      };
    },
    /** A tool call finished (agent event with stream="tool", phase="result"). */
    toolCallFinished(
      state,
      action: PayloadAction<{
        toolCallId: string;
        resultText?: string;
        isError?: boolean;
      }>
    ) {
      const entry = state.liveToolCalls[action.payload.toolCallId];
      if (entry) {
        entry.phase = "result";
        entry.resultText = action.payload.resultText;
        entry.isError = action.payload.isError;
      }
    },
    /** Clear all live tool calls for a given runId (e.g. when the run finishes). */
    liveToolCallsClearedForRun(state, action: PayloadAction<{ runId: string }>) {
      for (const key of Object.keys(state.liveToolCalls)) {
        if (state.liveToolCalls[key].runId === action.payload.runId) {
          delete state.liveToolCalls[key];
        }
      }
    },
  },
});

export const chatActions = chatSlice.actions;
export const chatReducer = chatSlice.reducer;
