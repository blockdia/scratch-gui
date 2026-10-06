// Adapt the legacy debugger sources to the VM's project log. No thread is retained.
export const logToRuntime = (logger, message, thread, type) => {
  const internal = type === "internal" || type === "internal-warn";
  const level = type === "internal-warn" ? "warn" : type === "internal" ? "log" : type;
  logger[level](message, {
    ...logger.captureContext(thread),
    source: internal ? "debugger" : "script",
  });
};

export const isCloneLimit = (entry) => entry.code === "CLONE_LIMIT" &&
  (entry.source === "clones" || entry.source === "containers");

export const toLogRow = (entry, msg) => ({
  id: entry.id,
  text: isCloneLimit(entry)
    ? msg("log-msg-clone-cap", { sprite: entry.subjectName, limit: entry.limit })
    : entry.message,
  type: entry.level,
  source: entry.source,
  code: entry.code,
  count: entry.count,
  // Source and severity are separate: internal warnings still get an unread indicator.
  internal: entry.source === "debugger" && entry.level === "log",
  preview: entry.source === "script",
  targetId: entry.targetId,
  blockId: entry.blockId,
  targetInfo: entry.targetId ? {
    exists: Boolean(entry.originalTargetId),
    originalId: entry.originalTargetId,
    name: entry.isClone
      ? `${msg("clone-of", { sprite: entry.targetName })} (${entry.publicId})`
      : entry.targetName || msg("unknown-sprite"),
  } : null,
});

// Preserve row identity so repeated messages update counts without recreating DOM previews.
export const followRuntimeLogs = (logger, msg, update, include = () => true) => {
  let previous = new Map();
  const sync = (entries) => {
    const next = new Map();
    const rows = entries.filter(include).map((entry) => {
      const row = previous.get(entry.id) || toLogRow(entry, msg);
      const changed = !previous.has(entry.id) || row.count !== entry.count;
      row.count = entry.count;
      next.set(entry.id, row);
      return { row, changed };
    });
    previous = next;
    update(rows.map(({ row }) => row), rows.some(({ row, changed }) => changed && !row.internal));
  };
  const unsubscribe = logger.subscribe(sync);
  sync(logger.getEntries());
  return unsubscribe;
};
