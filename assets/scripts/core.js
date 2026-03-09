const APP_VERSION = "1.0.0";
const MAX_AUDIT_ITEMS = 60;
const MAX_ERROR_ITEMS = 20;
const MAX_SESSION_ITEMS = 30;
const MAX_BACKUP_ITEMS = 8;

export const STORAGE_KEYS = {
  state: "site-dev::control-center::state",
  backups: "site-dev::control-center::backups",
};

export const DEFAULT_LINKS = [
  {
    id: "link-repo",
    label: "Repositorio GitHub",
    url: "https://github.com/KING981-cpu/site-dev",
    category: "Governanca",
  },
  {
    id: "link-team",
    label: "Pagina de Operacao",
    url: "./operacao.html",
    category: "Operacao",
  },
  {
    id: "link-readme",
    label: "README",
    url: "https://github.com/KING981-cpu/site-dev#readme",
    category: "Docs",
  },
];

export const DEFAULT_STREAMS = [
  {
    id: "stream-main",
    name: "main",
    role: "Producao",
    status: "stable",
    summary: "Branch protegida para deploy e releases.",
  },
  {
    id: "stream-staging",
    name: "staging",
    role: "Homologacao",
    status: "ready",
    summary: "Validacao funcional antes do merge final.",
  },
  {
    id: "stream-developer",
    name: "developer",
    role: "Integracao",
    status: "active",
    summary: "Concentrador das entregas em desenvolvimento.",
  },
];

export function isoNow(value = new Date()) {
  return new Date(value).toISOString();
}

export function formatDuration(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function dateKey(value = new Date()) {
  return isoNow(value).slice(0, 10);
}

export function monthCursor(value = new Date()) {
  const date = new Date(value);
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

export function createId(prefix = "item") {
  const randomChunk = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${randomChunk}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function sanitizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error("URL vazia.");
  }

  if (/^(\.\/|\.\.\/|\/|#)/.test(raw)) {
    return raw;
  }

  const candidate = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(candidate);
  return parsed.toString();
}

export function readJson(rawValue, fallback = null) {
  try {
    return rawValue ? JSON.parse(rawValue) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function limit(list, maxSize) {
  return list.slice(0, maxSize);
}

function appendAuditEntry(target, scope, message, level, now) {
  const entry = {
    id: createId("audit"),
    scope,
    level,
    message,
    timestamp: now,
  };
  target.observability.audit = limit([entry, ...target.observability.audit], MAX_AUDIT_ITEMS);
}

function appendErrorEntry(target, message, now, source = "runtime") {
  const entry = {
    id: createId("error"),
    source,
    message,
    timestamp: now,
  };
  target.observability.errors = limit([entry, ...target.observability.errors], MAX_ERROR_ITEMS);
}

function finalizeMutation(target, scope, message, now = isoNow(), level = "info") {
  target.meta.updatedAt = now;
  target.meta.lastSavedAt = now;
  target.meta.mutationCount += 1;
  target.observability.lastActionAt = now;
  appendAuditEntry(target, scope, message, level, now);
  return target;
}

function baseObservability(now) {
  return {
    audit: [
      {
        id: "audit-bootstrap",
        scope: "app",
        level: "info",
        message: "Workspace inicializado com sucesso.",
        timestamp: now,
      },
    ],
    errors: [],
    lastActionAt: now,
    lastBackupAt: null,
    lastRestoreAt: null,
    bootDurationMs: 0,
  };
}

export function createDefaultState(now = isoNow()) {
  return {
    meta: {
      version: APP_VERSION,
      createdAt: now,
      updatedAt: now,
      lastSavedAt: now,
      mutationCount: 0,
    },
    workspace: {
      name: "Site Dev Control Center",
      owner: "KING981-cpu",
      branchStrategy: ["main", "staging", "developer"],
    },
    ui: {
      activeView: "dashboard",
      taskFilter: "all",
      selectedDate: dateKey(now),
      calendarCursor: monthCursor(now),
      theme: "night",
    },
    focus: {
      running: false,
      startedAt: null,
      elapsedMs: 0,
      goalMinutes: 120,
      sessions: [],
    },
    tasks: [],
    notes: [],
    links: clone(DEFAULT_LINKS),
    calendar: {
      events: [],
    },
    streams: clone(DEFAULT_STREAMS),
    observability: baseObservability(now),
  };
}

export function normalizeState(candidate, now = isoNow()) {
  const fallback = createDefaultState(now);
  if (!candidate || typeof candidate !== "object") {
    return fallback;
  }

  const next = clone(fallback);

  next.meta = {
    ...next.meta,
    ...(candidate.meta || {}),
    version: APP_VERSION,
  };

  next.workspace = {
    ...next.workspace,
    ...(candidate.workspace || {}),
    branchStrategy: Array.isArray(candidate?.workspace?.branchStrategy)
      ? candidate.workspace.branchStrategy.slice(0, 5)
      : next.workspace.branchStrategy,
  };

  next.ui = {
    ...next.ui,
    ...(candidate.ui || {}),
    activeView: typeof candidate?.ui?.activeView === "string" ? candidate.ui.activeView : next.ui.activeView,
    taskFilter: typeof candidate?.ui?.taskFilter === "string" ? candidate.ui.taskFilter : next.ui.taskFilter,
    selectedDate: typeof candidate?.ui?.selectedDate === "string" ? candidate.ui.selectedDate : next.ui.selectedDate,
    calendarCursor:
      typeof candidate?.ui?.calendarCursor === "string" ? candidate.ui.calendarCursor : next.ui.calendarCursor,
    theme: candidate?.ui?.theme === "day" ? "day" : "night",
  };

  next.focus = {
    ...next.focus,
    ...(candidate.focus || {}),
    sessions: Array.isArray(candidate?.focus?.sessions)
      ? limit(candidate.focus.sessions, MAX_SESSION_ITEMS)
      : next.focus.sessions,
  };

  next.tasks = Array.isArray(candidate.tasks)
    ? candidate.tasks
        .filter((task) => task && typeof task.title === "string")
        .map((task) => ({
          id: task.id || createId("task"),
          title: task.title.trim(),
          done: Boolean(task.done),
          createdAt: task.createdAt || now,
          updatedAt: task.updatedAt || task.createdAt || now,
        }))
    : next.tasks;

  next.notes = Array.isArray(candidate.notes)
    ? candidate.notes
        .filter((note) => note && typeof note.title === "string")
        .map((note) => ({
          id: note.id || createId("note"),
          title: note.title.trim(),
          body: String(note.body || "").trim(),
          createdAt: note.createdAt || now,
        }))
    : next.notes;

  next.links = Array.isArray(candidate.links)
    ? candidate.links
        .filter((link) => link && typeof link.label === "string" && typeof link.url === "string")
        .map((link) => ({
          id: link.id || createId("link"),
          label: link.label.trim(),
          url: sanitizeUrl(link.url),
          category: String(link.category || "Atalho").trim(),
        }))
    : next.links;

  next.calendar = {
    events: Array.isArray(candidate?.calendar?.events)
      ? candidate.calendar.events
          .filter((event) => event && typeof event.title === "string" && typeof event.date === "string")
          .map((event) => ({
            id: event.id || createId("event"),
            title: event.title.trim(),
            date: event.date,
            category: String(event.category || "Operacao").trim(),
            createdAt: event.createdAt || now,
          }))
      : next.calendar.events,
  };

  next.streams = Array.isArray(candidate.streams)
    ? candidate.streams
        .filter((stream) => stream && typeof stream.name === "string")
        .map((stream) => ({
          id: stream.id || createId("stream"),
          name: stream.name.trim(),
          role: String(stream.role || "Operacao").trim(),
          status: String(stream.status || "ready").trim(),
          summary: String(stream.summary || "").trim(),
        }))
    : next.streams;

  next.observability = {
    ...baseObservability(now),
    ...(candidate.observability || {}),
    audit: Array.isArray(candidate?.observability?.audit)
      ? limit(candidate.observability.audit, MAX_AUDIT_ITEMS)
      : baseObservability(now).audit,
    errors: Array.isArray(candidate?.observability?.errors)
      ? limit(candidate.observability.errors, MAX_ERROR_ITEMS)
      : [],
  };

  if (!next.meta.createdAt) {
    next.meta.createdAt = now;
  }
  if (!next.meta.updatedAt) {
    next.meta.updatedAt = now;
  }
  if (!next.meta.lastSavedAt) {
    next.meta.lastSavedAt = now;
  }

  return next;
}

export function setActiveView(state, view, now = isoNow()) {
  const next = clone(state);
  next.ui.activeView = view;
  return finalizeMutation(next, "navigation", `View alterada para ${view}.`, now);
}

export function setTaskFilter(state, filter, now = isoNow()) {
  const next = clone(state);
  next.ui.taskFilter = filter;
  return finalizeMutation(next, "tasks", `Filtro de tarefas alterado para ${filter}.`, now);
}

export function setTheme(state, theme, now = isoNow()) {
  const next = clone(state);
  next.ui.theme = theme === "day" ? "day" : "night";
  return finalizeMutation(next, "preferences", `Tema atualizado para ${next.ui.theme}.`, now);
}

export function addTask(state, title, now = isoNow()) {
  const normalizedTitle = String(title || "").trim();
  if (!normalizedTitle) {
    throw new Error("A tarefa precisa de um titulo.");
  }

  const next = clone(state);
  next.tasks.unshift({
    id: createId("task"),
    title: normalizedTitle,
    done: false,
    createdAt: now,
    updatedAt: now,
  });
  return finalizeMutation(next, "tasks", `Tarefa criada: ${normalizedTitle}.`, now);
}

export function toggleTask(state, id, now = isoNow()) {
  const next = clone(state);
  const task = next.tasks.find((item) => item.id === id);
  if (!task) {
    return next;
  }

  task.done = !task.done;
  task.updatedAt = now;
  return finalizeMutation(next, "tasks", `Tarefa ${task.done ? "concluida" : "reaberta"}: ${task.title}.`, now);
}

export function deleteTask(state, id, now = isoNow()) {
  const next = clone(state);
  const removed = next.tasks.find((item) => item.id === id);
  next.tasks = next.tasks.filter((item) => item.id !== id);
  return finalizeMutation(next, "tasks", `Tarefa removida: ${removed?.title || id}.`, now);
}

export function addNote(state, title, body, now = isoNow()) {
  const normalizedTitle = String(title || "").trim();
  const normalizedBody = String(body || "").trim();
  if (!normalizedTitle || !normalizedBody) {
    throw new Error("Titulo e conteudo da nota sao obrigatorios.");
  }

  const next = clone(state);
  next.notes.unshift({
    id: createId("note"),
    title: normalizedTitle,
    body: normalizedBody,
    createdAt: now,
  });
  return finalizeMutation(next, "notes", `Nota registrada: ${normalizedTitle}.`, now);
}

export function deleteNote(state, id, now = isoNow()) {
  const next = clone(state);
  const removed = next.notes.find((item) => item.id === id);
  next.notes = next.notes.filter((item) => item.id !== id);
  return finalizeMutation(next, "notes", `Nota removida: ${removed?.title || id}.`, now);
}

export function addLink(state, linkInput, now = isoNow()) {
  const label = String(linkInput?.label || "").trim();
  const category = String(linkInput?.category || "Atalho").trim();
  const url = sanitizeUrl(linkInput?.url);
  if (!label) {
    throw new Error("O atalho precisa de um nome.");
  }

  const next = clone(state);
  next.links.unshift({
    id: createId("link"),
    label,
    url,
    category,
  });
  return finalizeMutation(next, "links", `Atalho criado: ${label}.`, now);
}

export function deleteLink(state, id, now = isoNow()) {
  const next = clone(state);
  const removed = next.links.find((item) => item.id === id);
  next.links = next.links.filter((item) => item.id !== id);
  return finalizeMutation(next, "links", `Atalho removido: ${removed?.label || id}.`, now);
}

export function addCalendarEvent(state, eventInput, now = isoNow()) {
  const title = String(eventInput?.title || "").trim();
  const date = String(eventInput?.date || "").trim();
  const category = String(eventInput?.category || "Operacao").trim();
  if (!title || !date) {
    throw new Error("Evento precisa de data e titulo.");
  }

  const next = clone(state);
  next.calendar.events.unshift({
    id: createId("event"),
    title,
    date,
    category,
    createdAt: now,
  });
  next.ui.selectedDate = date;
  return finalizeMutation(next, "calendar", `Evento registrado em ${date}: ${title}.`, now);
}

export function deleteCalendarEvent(state, id, now = isoNow()) {
  const next = clone(state);
  const removed = next.calendar.events.find((item) => item.id === id);
  next.calendar.events = next.calendar.events.filter((item) => item.id !== id);
  return finalizeMutation(next, "calendar", `Evento removido: ${removed?.title || id}.`, now);
}

export function shiftCalendarCursor(state, delta, now = isoNow()) {
  const next = clone(state);
  const cursor = new Date(next.ui.calendarCursor);
  cursor.setUTCMonth(cursor.getUTCMonth() + delta);
  next.ui.calendarCursor = monthCursor(cursor);
  return finalizeMutation(next, "calendar", `Calendario movido para ${next.ui.calendarCursor}.`, now);
}

export function selectCalendarDate(state, selectedDate, now = isoNow()) {
  const next = clone(state);
  next.ui.selectedDate = selectedDate;
  return finalizeMutation(next, "calendar", `Data selecionada: ${selectedDate}.`, now);
}

export function getLiveFocusMs(focus, now = isoNow()) {
  if (!focus?.running || !focus?.startedAt) {
    return Number(focus?.elapsedMs || 0);
  }

  const currentMs = Date.parse(now) - Date.parse(focus.startedAt);
  return Math.max(0, Number(focus.elapsedMs || 0) + currentMs);
}

export function startFocusTimer(state, now = isoNow()) {
  if (state.focus.running) {
    return clone(state);
  }

  const next = clone(state);
  next.focus.running = true;
  next.focus.startedAt = now;
  return finalizeMutation(next, "focus", "Timer de foco iniciado.", now);
}

export function pauseFocusTimer(state, now = isoNow()) {
  if (!state.focus.running || !state.focus.startedAt) {
    return clone(state);
  }

  const next = clone(state);
  const blockMs = Math.max(0, Date.parse(now) - Date.parse(next.focus.startedAt));
  next.focus.elapsedMs = Number(next.focus.elapsedMs || 0) + blockMs;
  next.focus.running = false;
  next.focus.startedAt = null;

  if (blockMs > 0) {
    next.focus.sessions = limit(
      [
        {
          id: createId("session"),
          durationMs: blockMs,
          stoppedAt: now,
          date: dateKey(now),
        },
        ...next.focus.sessions,
      ],
      MAX_SESSION_ITEMS,
    );
  }

  return finalizeMutation(next, "focus", `Bloco de foco registrado (${formatDuration(blockMs)}).`, now);
}

export function resetFocusTimer(state, now = isoNow()) {
  const next = clone(state);
  next.focus.running = false;
  next.focus.startedAt = null;
  next.focus.elapsedMs = 0;
  return finalizeMutation(next, "focus", "Timer de foco reiniciado.", now);
}

export function recordRuntimeError(state, message, now = isoNow(), source = "runtime") {
  const next = clone(state);
  appendErrorEntry(next, message, now, source);
  return finalizeMutation(next, "observability", `Erro capturado em ${source}.`, now, "error");
}

export function storageFootprintBytes(state, backups) {
  const encoder = new TextEncoder();
  const stateBytes = encoder.encode(JSON.stringify(state || {})).length;
  const backupBytes = encoder.encode(JSON.stringify(backups || [])).length;
  return stateBytes + backupBytes;
}

export function computeMetrics(state, backups = [], now = isoNow()) {
  const today = dateKey(now);
  const openTasks = state.tasks.filter((task) => !task.done).length;
  const completedTasks = state.tasks.filter((task) => task.done).length;
  const upcomingEvents = state.calendar.events.filter((event) => event.date >= today).length;
  const focusMs = getLiveFocusMs(state.focus, now);

  return {
    openTasks,
    completedTasks,
    notes: state.notes.length,
    links: state.links.length,
    upcomingEvents,
    backups: backups.length,
    focusMs,
    focusDisplay: formatDuration(focusMs),
    storageBytes: storageFootprintBytes(state, backups),
    storageKb: (storageFootprintBytes(state, backups) / 1024).toFixed(1),
    mutationCount: state.meta.mutationCount,
    lastBackupAt: state.observability.lastBackupAt,
    lastRestoreAt: state.observability.lastRestoreAt,
    lastSavedAt: state.meta.lastSavedAt,
    errors: state.observability.errors.length,
  };
}

export function getCalendarGrid(cursorValue, events = [], selectedDate) {
  const cursor = new Date(cursorValue);
  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  const leading = first.getUTCDay();
  const totalDays = last.getUTCDate();
  const eventMap = new Map();

  for (const event of events) {
    eventMap.set(event.date, (eventMap.get(event.date) || 0) + 1);
  }

  const cells = [];
  for (let index = 0; index < leading; index += 1) {
    cells.push({
      empty: true,
      key: `empty-${index}`,
    });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const cellDate = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
    cells.push({
      empty: false,
      key: cellDate,
      day,
      date: cellDate,
      selected: cellDate === selectedDate,
      events: eventMap.get(cellDate) || 0,
      today: cellDate === dateKey(),
    });
  }

  return {
    monthLabel: new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(cursor),
    cells,
  };
}

export function createBackupRecord(state, reason, now = isoNow()) {
  return {
    id: createId("backup"),
    reason: String(reason || "manual").trim(),
    createdAt: now,
    summary: {
      tasks: state.tasks.length,
      notes: state.notes.length,
      links: state.links.length,
      events: state.calendar.events.length,
      focusMs: getLiveFocusMs(state.focus, now),
    },
    snapshot: clone(state),
  };
}

export function addBackup(state, backups = [], reason = "manual", now = isoNow()) {
  const record = createBackupRecord(state, reason, now);
  const nextBackups = limit([record, ...clone(backups)], MAX_BACKUP_ITEMS);
  const nextState = clone(state);
  nextState.observability.lastBackupAt = now;
  return {
    state: finalizeMutation(nextState, "backup", `Backup criado (${reason}).`, now),
    backups: nextBackups,
  };
}

export function restoreBackup(backups = [], backupId, now = isoNow()) {
  const backup = backups.find((item) => item.id === backupId);
  if (!backup) {
    throw new Error("Backup nao encontrado.");
  }

  const restored = normalizeState(backup.snapshot, now);
  restored.observability.lastRestoreAt = now;
  appendAuditEntry(restored, "backup", `Backup restaurado: ${backup.reason}.`, "warning", now);
  restored.meta.updatedAt = now;
  restored.meta.lastSavedAt = now;
  restored.meta.mutationCount += 1;
  return restored;
}

export function exportWorkspaceBundle(state, backups = [], now = isoNow()) {
  return JSON.stringify(
    {
      exportedAt: now,
      version: APP_VERSION,
      state,
      backups,
    },
    null,
    2,
  );
}

export function importWorkspaceBundle(rawBundle, now = isoNow()) {
  const payload = typeof rawBundle === "string" ? JSON.parse(rawBundle) : rawBundle;
  const stateCandidate = payload?.state || payload;
  const backupsCandidate = Array.isArray(payload?.backups) ? payload.backups : [];

  const state = normalizeState(stateCandidate, now);
  const backups = backupsCandidate
    .filter((item) => item && item.snapshot)
    .slice(0, MAX_BACKUP_ITEMS)
    .map((item) => ({
      id: item.id || createId("backup"),
      reason: String(item.reason || "imported").trim(),
      createdAt: item.createdAt || now,
      summary: item.summary || {},
      snapshot: normalizeState(item.snapshot, now),
    }));

  state.observability.lastRestoreAt = now;
  appendAuditEntry(state, "backup", "Workspace importado com sucesso.", "warning", now);
  state.meta.updatedAt = now;
  state.meta.lastSavedAt = now;
  state.meta.mutationCount += 1;

  return { state, backups };
}

export function shouldAutoBackup(state) {
  return state.meta.mutationCount > 0 && state.meta.mutationCount % 5 === 0;
}

export function formatBytes(bytes) {
  const safe = Number(bytes) || 0;
  if (safe < 1024) {
    return `${safe} B`;
  }
  if (safe < 1024 * 1024) {
    return `${(safe / 1024).toFixed(1)} KB`;
  }
  return `${(safe / (1024 * 1024)).toFixed(2)} MB`;
}

export function humanDate(value) {
  if (!value) {
    return "Nunca";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
