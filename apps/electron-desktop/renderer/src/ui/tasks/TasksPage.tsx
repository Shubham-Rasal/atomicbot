import React from "react";
import { useGatewayRpc } from "@gateway/context";
import { addToastError } from "@shared/toast";
import { HeroPageLayout } from "@shared/kit";
import s from "./TasksPage.module.css";

// ---------------------------------------------------------------------------
// Types (mirror gateway cron schema)
// ---------------------------------------------------------------------------

type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number }
  | { kind: "cron"; expr: string; tz?: string };

type CronPayload =
  | { kind: "systemEvent"; text: string }
  | { kind: "agentTurn"; message: string; model?: string };

type CronDelivery = {
  mode: "none" | "announce";
  channel?: string;
  to?: string;
  bestEffort?: boolean;
};

type CronJobState = {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
};

type CronJob = {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  sessionTarget: string;
  wakeMode: string;
  payload: CronPayload;
  delivery?: CronDelivery;
  state: CronJobState;
};

type CronListResult = { jobs: CronJob[] };
type CronStatusResult = {
  enabled: boolean;
  storePath: string;
  jobs: number;
  nextWakeAtMs?: number;
};

type ChannelInfo = { id: string; label: string };

type ChannelsStatusResult = {
  channelOrder?: string[];
  channelLabels?: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case "at":
      return `At: ${schedule.at}`;
    case "every": {
      const ms = schedule.everyMs;
      if (ms < 60_000) {return `Every ${Math.round(ms / 1000)}s`;}
      if (ms < 3_600_000) {return `Every ${Math.round(ms / 60_000)}m`;}
      if (ms < 86_400_000) {
        const h = Math.round(ms / 3_600_000);
        return `Every ${h}h`;
      }
      const d = Math.round(ms / 86_400_000);
      return `Every ${d}d`;
    }
    case "cron":
      return `${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ""}`;
    default:
      return "Unknown";
  }
}

function formatTime(ms: number | undefined): string {
  if (!ms) {return "—";}
  const d = new Date(ms);
  return d.toLocaleString();
}

function payloadPreview(payload: CronPayload): string {
  if (payload.kind === "systemEvent") {return payload.text;}
  if (payload.kind === "agentTurn") {return payload.message;}
  return "—";
}

function deliveryLabel(job: CronJob, channels: ChannelInfo[]): string {
  if (job.sessionTarget === "main") {return "Main session";}
  if (!job.delivery || job.delivery.mode === "none") {return "Isolated (no delivery)";}
  const ch = job.delivery.channel ?? "last";
  if (ch === "last") {return "Isolated → Last channel";}
  const found = channels.find((c) => c.id === ch);
  return `Isolated → ${found?.label ?? ch}`;
}

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className={s.UiTaskToggle} title={label}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={s.UiTaskToggleTrack}>
        <span className={s.UiTaskToggleThumb} />
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Inline delivery selector
// ---------------------------------------------------------------------------

function DeliverySelect({
  job,
  channels,
  onUpdate,
}: {
  job: CronJob;
  channels: ChannelInfo[];
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  // Build a combined value: "main", "isolated", "isolated:none", "isolated:last", "isolated:<channel>"
  const currentValue = React.useMemo(() => {
    if (job.sessionTarget === "main") {return "main";}
    if (!job.delivery || job.delivery.mode === "none") {return "isolated:none";}
    return `isolated:${job.delivery.channel ?? "last"}`;
  }, [job.sessionTarget, job.delivery]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "main") {
      // Switching to main requires systemEvent payload
      onUpdate({
        sessionTarget: "main",
        delivery: { mode: "none" },
        payload: { kind: "systemEvent", text: payloadPreview(job.payload) },
      });
    } else if (val === "isolated:none") {
      onUpdate({
        sessionTarget: "isolated",
        delivery: { mode: "none" },
        ...(job.payload.kind !== "agentTurn"
          ? { payload: { kind: "agentTurn", message: payloadPreview(job.payload) } }
          : {}),
      });
    } else if (val.startsWith("isolated:")) {
      const channel = val.slice("isolated:".length);
      onUpdate({
        sessionTarget: "isolated",
        delivery: { mode: "announce", channel: channel || "last" },
        ...(job.payload.kind !== "agentTurn"
          ? { payload: { kind: "agentTurn", message: payloadPreview(job.payload) } }
          : {}),
      });
    }
  };

  return (
    <select
      className={s.UiTaskInlineSelect}
      value={currentValue}
      onChange={handleChange}
    >
      <option value="main">Main session</option>
      <optgroup label="Isolated session">
        <option value="isolated:none">No delivery</option>
        <option value="isolated:last">Last active channel</option>
        {channels.map((ch) => (
          <option key={ch.id} value={`isolated:${ch.id}`}>
            {ch.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

// ---------------------------------------------------------------------------
// Edit form
// ---------------------------------------------------------------------------

function EditForm({
  job,
  channels,
  onSave,
  onCancel,
}: {
  job: CronJob;
  channels: ChannelInfo[];
  onSave: (patch: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(job.name);
  const [scheduleKind, setScheduleKind] = React.useState(job.schedule.kind);
  const [scheduleValue, setScheduleValue] = React.useState(() => {
    if (job.schedule.kind === "at") {return job.schedule.at;}
    if (job.schedule.kind === "every") {return String(job.schedule.everyMs);}
    if (job.schedule.kind === "cron") {return job.schedule.expr;}
    return "";
  });
  const [scheduleTz, setScheduleTz] = React.useState(
    job.schedule.kind === "cron" ? (job.schedule.tz ?? "") : ""
  );
  const [message, setMessage] = React.useState(payloadPreview(job.payload));

  const [sessionTarget, setSessionTarget] = React.useState(job.sessionTarget || "main");
  const [deliveryMode, setDeliveryMode] = React.useState(job.delivery?.mode ?? "none");
  const [deliveryChannel, setDeliveryChannel] = React.useState(job.delivery?.channel ?? "last");

  const handleSave = () => {
    const patch: Record<string, unknown> = {};
    if (name !== job.name) {patch.name = name;}

    let schedule: CronSchedule | undefined;
    if (scheduleKind === "at") {
      schedule = { kind: "at", at: scheduleValue };
    } else if (scheduleKind === "every") {
      schedule = { kind: "every", everyMs: Number(scheduleValue) || 60000 };
    } else if (scheduleKind === "cron") {
      schedule = { kind: "cron", expr: scheduleValue, ...(scheduleTz ? { tz: scheduleTz } : {}) };
    }
    if (schedule) {patch.schedule = schedule;}

    // Session target + delivery
    if (sessionTarget !== job.sessionTarget) {
      patch.sessionTarget = sessionTarget;
    }
    if (sessionTarget === "isolated") {
      patch.delivery = {
        mode: deliveryMode,
        ...(deliveryMode === "announce" ? { channel: deliveryChannel } : {}),
      };
      // Ensure payload is agentTurn
      patch.payload = { kind: "agentTurn", message };
    } else {
      patch.delivery = { mode: "none" };
      patch.payload = { kind: "systemEvent", text: message };
    }

    onSave(patch);
  };

  return (
    <div className={s.UiTaskEditForm}>
      <div className={s.UiTaskEditField}>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className={s.UiTaskEditField}>
        <label>Schedule type</label>
        <select value={scheduleKind} onChange={(e) => setScheduleKind(e.target.value as CronSchedule["kind"])}>
          <option value="every">Every (interval)</option>
          <option value="cron">Cron expression</option>
          <option value="at">At (one-time)</option>
        </select>
      </div>
      <div className={s.UiTaskEditField}>
        <label>{scheduleKind === "every" ? "Interval (ms)" : scheduleKind === "cron" ? "Cron expression" : "ISO timestamp"}</label>
        <input value={scheduleValue} onChange={(e) => setScheduleValue(e.target.value)} />
      </div>
      {scheduleKind === "cron" && (
        <div className={s.UiTaskEditField}>
          <label>Timezone (optional)</label>
          <input value={scheduleTz} onChange={(e) => setScheduleTz(e.target.value)} placeholder="UTC" />
        </div>
      )}
      <div className={s.UiTaskEditField}>
        <label>Session target</label>
        <select value={sessionTarget} onChange={(e) => setSessionTarget(e.target.value)}>
          <option value="main">Main session</option>
          <option value="isolated">Isolated session</option>
        </select>
      </div>
      {sessionTarget === "isolated" && (
        <>
          <div className={s.UiTaskEditField}>
            <label>Delivery</label>
            <select value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value as "none" | "announce")}>
              <option value="none">No delivery</option>
              <option value="announce">Send to channel</option>
            </select>
          </div>
          {deliveryMode === "announce" && (
            <div className={s.UiTaskEditField}>
              <label>Channel</label>
              <select value={deliveryChannel} onChange={(e) => setDeliveryChannel(e.target.value)}>
                <option value="last">Last active channel</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.label}</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      <div className={s.UiTaskEditField}>
        <label>Message / Text</label>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className={s.UiTaskEditActions}>
        <button type="button" className={s.UiTaskEditCancel} onClick={onCancel}>Cancel</button>
        <button type="button" className={s.UiTaskEditSave} onClick={handleSave}>Save</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job card
// ---------------------------------------------------------------------------

function JobCard({
  job,
  channels,
  onToggle,
  onRunNow,
  onDelete,
  onUpdate,
}: {
  job: CronJob;
  channels: ChannelInfo[];
  onToggle: (enabled: boolean) => void;
  onRunNow: () => void;
  onDelete: () => void;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [msgExpanded, setMsgExpanded] = React.useState(false);

  const statusBadge = () => {
    if (!job.enabled) {return <span className={`${s.UiTaskStatusBadge} ${s["UiTaskStatusBadge--disabled"]}`}>disabled</span>;}
    if (job.state.lastStatus === "error") {return <span className={`${s.UiTaskStatusBadge} ${s["UiTaskStatusBadge--error"]}`}>error</span>;}
    if (job.state.lastStatus === "skipped") {return <span className={`${s.UiTaskStatusBadge} ${s["UiTaskStatusBadge--skipped"]}`}>skipped</span>;}
    if (job.state.lastStatus === "ok") {return <span className={`${s.UiTaskStatusBadge} ${s["UiTaskStatusBadge--ok"]}`}>ok</span>;}
    return null;
  };

  const msg = payloadPreview(job.payload);
  const isLongMsg = msg.length > 120;

  return (
    <div className={s.UiTaskCard}>
      {/* Header: name + status + toggle */}
      <div className={s.UiTaskCardHeader}>
        <div className={s.UiTaskCardHeaderLeft}>
          <span className={s.UiTaskCardName}>{job.name || job.id}</span>
          {statusBadge()}
        </div>
        <div className={s.UiTaskCardHeaderRight}>
          <Toggle checked={job.enabled} onChange={onToggle} label={job.enabled ? "Disable" : "Enable"} />
        </div>
      </div>

      {/* Key details */}
      <div className={s.UiTaskDetails}>
        <div className={s.UiTaskDetailRow}>
          <span className={s.UiTaskDetailLabel}>Schedule</span>
          <span className={s.UiTaskDetailValue}>
            <code>{formatSchedule(job.schedule)}</code>
          </span>
        </div>
        <div className={s.UiTaskDetailRow}>
          <span className={s.UiTaskDetailLabel}>Deliver to</span>
          <span className={s.UiTaskDetailValue}>
            <DeliverySelect job={job} channels={channels} onUpdate={onUpdate} />
          </span>
        </div>
        <div className={s.UiTaskDetailRow}>
          <span className={s.UiTaskDetailLabel}>Next run</span>
          <span className={s.UiTaskDetailValue}>{formatTime(job.state.nextRunAtMs)}</span>
        </div>
        {job.state.lastRunAtMs ? (
          <div className={s.UiTaskDetailRow}>
            <span className={s.UiTaskDetailLabel}>Last run</span>
            <span className={s.UiTaskDetailValue}>
              {formatTime(job.state.lastRunAtMs)}
              {job.state.lastError && (
                <span title={job.state.lastError}> — {job.state.lastError.slice(0, 50)}</span>
              )}
            </span>
          </div>
        ) : null}
      </div>

      {/* Message preview */}
      <div className={s.UiTaskMessage}>
        <div className={`${s.UiTaskMessageText} ${msgExpanded ? s["UiTaskMessageText--expanded"] : ""}`}>
          {msg}
        </div>
        {isLongMsg && (
          <button
            type="button"
            className={s.UiTaskMessageToggle}
            onClick={() => setMsgExpanded(!msgExpanded)}
          >
            {msgExpanded ? "Show less" : "Show more"}
          </button>
        )}
      </div>

      {/* Actions / edit */}
      {editing ? (
        <EditForm
          job={job}
          channels={channels}
          onSave={(patch) => {
            onUpdate(patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className={s.UiTaskActions}>
          <button
            type="button"
            className={`${s.UiTaskActionBtn} ${s["UiTaskActionBtn--primary"]}`}
            onClick={onRunNow}
          >
            Run Now
          </button>
          <button type="button" className={s.UiTaskActionBtn} onClick={() => setEditing(true)}>
            Edit
          </button>
          <span className={s.UiTaskActionSpacer} />
          {confirmDelete ? (
            <span className={s.UiTaskDeleteConfirm}>
              Delete?
              <button type="button" className={s.UiTaskDeleteYes} onClick={onDelete}>Yes</button>
              <button type="button" className={s.UiTaskDeleteNo} onClick={() => setConfirmDelete(false)}>No</button>
            </span>
          ) : (
            <button
              type="button"
              className={`${s.UiTaskActionBtn} ${s["UiTaskActionBtn--danger"]}`}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TasksPage
// ---------------------------------------------------------------------------

export function TasksPage() {
  const gw = useGatewayRpc();
  const [jobs, setJobs] = React.useState<CronJob[]>([]);
  const [status, setStatus] = React.useState<CronStatusResult | null>(null);
  const [channels, setChannels] = React.useState<ChannelInfo[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadData = React.useCallback(async () => {
    try {
      const [listRes, statusRes, channelsRes] = await Promise.all([
        gw.request<CronListResult>("cron.list", { includeDisabled: true }),
        gw.request<CronStatusResult>("cron.status"),
        gw.request<ChannelsStatusResult>("channels.status", { probe: false }),
      ]);
      setJobs(listRes.jobs ?? []);
      setStatus(statusRes);

      // Build channel list from gateway response
      const order = channelsRes?.channelOrder ?? [];
      const labels = channelsRes?.channelLabels ?? {};
      setChannels(order.map((id) => ({ id, label: labels[id] ?? id })));
    } catch (err) {
      addToastError(err);
    } finally {
      setLoading(false);
    }
  }, [gw.request]);

  React.useEffect(() => {
    if (!gw.connected) {return;}
    void loadData();
  }, [gw.connected, loadData]);

  React.useEffect(() => {
    return gw.onEvent((evt) => {
      if (evt.event === "cron") {
        void loadData();
      }
    });
  }, [gw.onEvent, loadData]);

  const handleToggle = React.useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await gw.request("cron.update", { id, patch: { enabled } });
        void loadData();
      } catch (err) {
        addToastError(err);
      }
    },
    [gw.request, loadData]
  );

  const handleRunNow = React.useCallback(
    async (id: string) => {
      try {
        await gw.request("cron.run", { id, mode: "force" });
        void loadData();
      } catch (err) {
        addToastError(err);
      }
    },
    [gw.request, loadData]
  );

  const handleDelete = React.useCallback(
    async (id: string) => {
      try {
        await gw.request("cron.remove", { id });
        void loadData();
      } catch (err) {
        addToastError(err);
      }
    },
    [gw.request, loadData]
  );

  const handleUpdate = React.useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      try {
        await gw.request("cron.update", { id, patch });
        void loadData();
      } catch (err) {
        addToastError(err);
      }
    },
    [gw.request, loadData]
  );

  return (
    <HeroPageLayout aria-label="Tasks page" hideTopbar color="secondary">
      <div className={s.UiTasksPage}>
        <div className={s.UiTasksHeader}>
          <h1 className={s.UiTasksTitle}>Tasks</h1>
          <span className={s.UiTasksBadge}>{jobs.length}</span>
        </div>

        <div className={s.UiTasksStatus}>
          <span
            className={`${s.UiTasksStatusDot} ${
              status?.enabled ? s["UiTasksStatusDot--enabled"] : s["UiTasksStatusDot--disabled"]
            }`}
          />
          {status?.enabled ? "Scheduler active" : "Scheduler inactive"}
        </div>

        {loading ? (
          <div className={s.UiTasksLoading}>Loading tasks...</div>
        ) : jobs.length === 0 ? (
          <div className={s.UiTasksEmpty}>No scheduled tasks</div>
        ) : (
          jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              channels={channels}
              onToggle={(enabled) => handleToggle(job.id, enabled)}
              onRunNow={() => handleRunNow(job.id)}
              onDelete={() => handleDelete(job.id)}
              onUpdate={(patch) => handleUpdate(job.id, patch)}
            />
          ))
        )}
      </div>
    </HeroPageLayout>
  );
}
