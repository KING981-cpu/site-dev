import {
  STORAGE_KEYS,
  addBackup,
  addCalendarEvent,
  addLink,
  addNote,
  addTask,
  computeMetrics,
  createBackupRecord,
  createDefaultState,
  dateKey,
  deleteCalendarEvent,
  deleteLink,
  deleteNote,
  deleteTask,
  exportWorkspaceBundle,
  formatBytes,
  formatDuration,
  getCalendarGrid,
  getLiveFocusMs,
  humanDate,
  importWorkspaceBundle,
  isoNow,
  normalizeState,
  pauseFocusTimer,
  readJson,
  recordRuntimeError,
  resetFocusTimer,
  restoreBackup,
  selectCalendarDate,
  setActiveView,
  setTaskFilter,
  setTheme,
  shiftCalendarCursor,
  shouldAutoBackup,
  startFocusTimer,
  toggleTask,
} from "./core.js";

const VIEW_LABELS = {
  dashboard: "Dashboard",
  focus: "Focus Engine",
  tasks: "Tarefas",
  notes: "Notas",
  links: "Atalhos",
  calendar: "Calendario",
  team: "Equipe & Ambientes",
  observability: "Observabilidade",
};

const runtime = {
  state: null,
  backups: [],
  renderCount: 0,
  bootStartedAt: performance.now(),
  bootDurationMs: 0,
  focusTicker: null,
  toastTimer: null,
};

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isExternalUrl(url) {
  return /^https?:\/\//i.test(url);
}

function normalizeBackups(candidate, now = isoNow()) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate
    .filter((item) => item && item.snapshot)
    .slice(0, 8)
    .map((item) => ({
      id: item.id || `backup-${Math.random().toString(36).slice(2, 8)}`,
      reason: String(item.reason || "restored").trim(),
      createdAt: item.createdAt || now,
      summary: item.summary || {},
      snapshot: normalizeState(item.snapshot, now),
    }));
}

function loadRuntime() {
  const now = isoNow();
  const params = new URLSearchParams(window.location.search);

  if (params.has("reset")) {
    localStorage.removeItem(STORAGE_KEYS.state);
    localStorage.removeItem(STORAGE_KEYS.backups);
  }

  const persistedState = readJson(localStorage.getItem(STORAGE_KEYS.state), null);
  const persistedBackups = readJson(localStorage.getItem(STORAGE_KEYS.backups), []);

  runtime.state = normalizeState(persistedState, now);
  runtime.backups = normalizeBackups(persistedBackups, now);
}

function persistWorkspace() {
  try {
    localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(runtime.state));
    localStorage.setItem(STORAGE_KEYS.backups, JSON.stringify(runtime.backups));
  } catch (error) {
    console.error(error);
    runtime.state = recordRuntimeError(runtime.state, error.message, isoNow(), "storage");
  }
}

function notify(message, tone = "info") {
  const toast = $("[data-role='toast']");
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;

  window.clearTimeout(runtime.toastTimer);
  runtime.toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function captureError(error, source = "runtime") {
  const message = error instanceof Error ? error.message : String(error);
  runtime.state = recordRuntimeError(runtime.state, message, isoNow(), source);
  persistWorkspace();
  render();
  notify(`Falha capturada em ${source}: ${message}`, "error");
}

function commit(mutator, options = {}) {
  const now = isoNow();

  try {
    runtime.state = mutator(runtime.state, now);

    if (options.manualBackup) {
      const manualBackup = addBackup(runtime.state, runtime.backups, options.manualBackup, now);
      runtime.state = manualBackup.state;
      runtime.backups = manualBackup.backups;
    } else if (options.allowAutoBackup && shouldAutoBackup(runtime.state)) {
      const automaticBackup = addBackup(runtime.state, runtime.backups, `auto:${options.reason || "mutation"}`, now);
      runtime.state = automaticBackup.state;
      runtime.backups = automaticBackup.backups;
    }

    persistWorkspace();
    render();

    if (options.toast) {
      notify(options.toast, options.tone || "success");
    }
  } catch (error) {
    captureError(error, options.scope || "mutation");
  }
}

function activeView() {
  return runtime.state.ui.activeView;
}

function currentMetrics() {
  return computeMetrics(runtime.state, runtime.backups, isoNow());
}

function healthModel() {
  const metrics = currentMetrics();
  if (metrics.errors > 0) {
    return { tone: "critical", label: "Atencao critica" };
  }
  if (metrics.backups === 0) {
    return { tone: "warning", label: "Sem backup recente" };
  }
  return { tone: "healthy", label: "Operacao saudavel" };
}

function renderNav() {
  const view = activeView();
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });

  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });
}

function renderHeader(metrics) {
  const view = activeView();
  const health = healthModel();
  document.title = `${VIEW_LABELS[view] || "Workspace"} | Site Dev Control Center`;
  document.documentElement.dataset.theme = runtime.state.ui.theme;

  $("[data-role='view-title']").textContent = VIEW_LABELS[view] || "Workspace";
  $("[data-role='workspace-name']").textContent = runtime.state.workspace.name;
  $("[data-role='workspace-owner']").textContent = runtime.state.workspace.owner;
  $("[data-role='save-status']").textContent = `Ultimo save: ${humanDate(metrics.lastSavedAt)}`;
  $("[data-role='header-focus']").textContent = metrics.focusDisplay;
  $("[data-role='header-open-tasks']").textContent = String(metrics.openTasks);

  const healthChip = $("[data-role='health-status']");
  healthChip.textContent = health.label;
  healthChip.dataset.tone = health.tone;

  const themeLabel = runtime.state.ui.theme === "night" ? "Modo noturno" : "Modo diurno";
  $("[data-role='theme-label']").textContent = themeLabel;
}

function renderDashboard(metrics) {
  $("[data-role='metric-focus']").textContent = metrics.focusDisplay;
  $("[data-role='metric-open-tasks']").textContent = String(metrics.openTasks);
  $("[data-role='metric-events']").textContent = String(metrics.upcomingEvents);
  $("[data-role='metric-storage']").textContent = formatBytes(metrics.storageBytes);
  $("[data-role='metric-backups']").textContent = String(metrics.backups);
  $("[data-role='metric-errors']").textContent = String(metrics.errors);

  const linksHtml = runtime.state.links
    .slice(0, 6)
    .map((link) => {
      const target = isExternalUrl(link.url) ? ' target="_blank" rel="noreferrer"' : "";
      return `
        <a class="quick-link-card" href="${escapeHtml(link.url)}"${target}>
          <span class="quick-link-meta">${escapeHtml(link.category)}</span>
          <strong>${escapeHtml(link.label)}</strong>
          <span>${escapeHtml(link.url)}</span>
        </a>
      `;
    })
    .join("");

  $("[data-role='dashboard-links']").innerHTML =
    linksHtml ||
    `<div class="empty-state">Sem atalhos configurados. Use a view "Atalhos" para criar os primeiros.</div>`;

  const activityHtml = runtime.state.observability.audit
    .slice(0, 10)
    .map(
      (entry) => `
        <article class="timeline-entry">
          <div>
            <strong>${escapeHtml(entry.scope)}</strong>
            <p>${escapeHtml(entry.message)}</p>
          </div>
          <time datetime="${escapeHtml(entry.timestamp)}">${humanDate(entry.timestamp)}</time>
        </article>
      `,
    )
    .join("");

  $("[data-role='activity-feed']").innerHTML = activityHtml;

  $("[data-role='release-summary']").innerHTML = `
    <li>Release alvo: <strong>v1.0.0</strong></li>
    <li>Branching: <strong>main</strong>, <strong>staging</strong> e <strong>developer</strong></li>
    <li>Observabilidade local com log estruturado, captura de erro e auditoria</li>
    <li>Backup manual e auto-backup a cada 5 mutacoes de dados</li>
  `;
}

function renderFocus() {
  const focusMs = getLiveFocusMs(runtime.state.focus, isoNow());
  const goalMs = runtime.state.focus.goalMinutes * 60 * 1000;
  const progress = Math.min(100, Math.round((focusMs / goalMs) * 100));

  $("[data-role='focus-display']").textContent = formatDuration(focusMs);
  $("[data-role='focus-progress']").style.width = `${progress}%`;
  $("[data-role='focus-goal']").textContent = `${progress}% da meta de ${runtime.state.focus.goalMinutes} min`;

  const actionButton = $("[data-action='toggle-focus']");
  actionButton.textContent = runtime.state.focus.running ? "Pausar bloco" : "Iniciar bloco";
  actionButton.dataset.state = runtime.state.focus.running ? "running" : "idle";

  const sessionsHtml = runtime.state.focus.sessions
    .slice(0, 8)
    .map(
      (session) => `
        <article class="log-card">
          <div>
            <strong>${formatDuration(session.durationMs)}</strong>
            <p>Bloco registrado em ${humanDate(session.stoppedAt)}</p>
          </div>
          <span class="badge">${escapeHtml(session.date)}</span>
        </article>
      `,
    )
    .join("");

  $("[data-role='focus-sessions']").innerHTML =
    sessionsHtml || `<div class="empty-state">Nenhum bloco finalizado ainda.</div>`;
}

function filteredTasks() {
  const filter = runtime.state.ui.taskFilter;
  if (filter === "open") {
    return runtime.state.tasks.filter((task) => !task.done);
  }
  if (filter === "done") {
    return runtime.state.tasks.filter((task) => task.done);
  }
  return runtime.state.tasks;
}

function renderTaskFilters() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.filter === runtime.state.ui.taskFilter);
  });
}

function renderTasks() {
  const tasks = filteredTasks();
  renderTaskFilters();

  $("[data-role='tasks-summary']").textContent = `${runtime.state.tasks.filter((task) => !task.done).length} abertas de ${
    runtime.state.tasks.length
  } totais`;

  const taskHtml = tasks
    .map(
      (task) => `
        <article class="list-card ${task.done ? "is-complete" : ""}">
          <button class="toggle-bullet" data-action="toggle-task" data-id="${escapeHtml(task.id)}" aria-label="Alternar status da tarefa"></button>
          <div class="list-card-body">
            <strong>${escapeHtml(task.title)}</strong>
            <span>Criada em ${humanDate(task.createdAt)}</span>
          </div>
          <span class="badge ${task.done ? "badge-success" : "badge-muted"}">${task.done ? "Concluida" : "Aberta"}</span>
          <button class="ghost-button" data-action="delete-task" data-id="${escapeHtml(task.id)}">Excluir</button>
        </article>
      `,
    )
    .join("");

  $("[data-role='tasks-list']").innerHTML =
    taskHtml || `<div class="empty-state">Nenhuma tarefa cadastrada. Comece pelo formulario acima.</div>`;
}

function renderNotes() {
  const notesHtml = runtime.state.notes
    .map(
      (note) => `
        <article class="note-card">
          <div>
            <strong>${escapeHtml(note.title)}</strong>
            <p>${escapeHtml(note.body)}</p>
          </div>
          <footer>
            <span>${humanDate(note.createdAt)}</span>
            <button class="ghost-button" data-action="delete-note" data-id="${escapeHtml(note.id)}">Remover</button>
          </footer>
        </article>
      `,
    )
    .join("");

  $("[data-role='notes-list']").innerHTML =
    notesHtml || `<div class="empty-state">Sem notas operacionais registradas.</div>`;
}

function renderLinks() {
  const linksHtml = runtime.state.links
    .map((link) => {
      const target = isExternalUrl(link.url) ? ' target="_blank" rel="noreferrer"' : "";
      return `
        <article class="list-card">
          <div class="list-card-body">
            <strong>${escapeHtml(link.label)}</strong>
            <span>${escapeHtml(link.category)}</span>
          </div>
          <a class="ghost-button" href="${escapeHtml(link.url)}"${target}>Abrir</a>
          <button class="ghost-button" data-action="delete-link" data-id="${escapeHtml(link.id)}">Excluir</button>
        </article>
      `;
    })
    .join("");

  $("[data-role='links-list']").innerHTML =
    linksHtml || `<div class="empty-state">Sem atalhos. Cadastre links criticos da operacao.</div>`;
}

function renderCalendar() {
  const grid = getCalendarGrid(
    runtime.state.ui.calendarCursor,
    runtime.state.calendar.events,
    runtime.state.ui.selectedDate,
  );

  $("[data-role='calendar-label']").textContent = grid.monthLabel;
  $("[data-role='calendar-selected']").textContent = runtime.state.ui.selectedDate;
  $("[data-role='event-date']").value = runtime.state.ui.selectedDate;

  const cellsHtml = grid.cells
    .map((cell) => {
      if (cell.empty) {
        return `<div class="calendar-cell is-empty" aria-hidden="true"></div>`;
      }

      return `
        <button
          class="calendar-cell ${cell.selected ? "is-selected" : ""} ${cell.today ? "is-today" : ""}"
          data-action="select-date"
          data-date="${escapeHtml(cell.date)}"
        >
          <span>${cell.day}</span>
          <small>${cell.events ? `${cell.events} evento${cell.events > 1 ? "s" : ""}` : "Livre"}</small>
        </button>
      `;
    })
    .join("");

  $("[data-role='calendar-grid']").innerHTML = cellsHtml;

  const eventsForDay = runtime.state.calendar.events
    .filter((event) => event.date === runtime.state.ui.selectedDate)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  const eventsHtml = eventsForDay
    .map(
      (event) => `
        <article class="list-card">
          <div class="list-card-body">
            <strong>${escapeHtml(event.title)}</strong>
            <span>${escapeHtml(event.category)}</span>
          </div>
          <button class="ghost-button" data-action="delete-event" data-id="${escapeHtml(event.id)}">Excluir</button>
        </article>
      `,
    )
    .join("");

  $("[data-role='events-list']").innerHTML =
    eventsHtml || `<div class="empty-state">Nenhum evento para a data selecionada.</div>`;
}

function renderTeam() {
  const streamsHtml = runtime.state.streams
    .map(
      (stream) => `
        <article class="stream-card" data-status="${escapeHtml(stream.status)}">
          <header>
            <strong>${escapeHtml(stream.name)}</strong>
            <span class="badge">${escapeHtml(stream.role)}</span>
          </header>
          <p>${escapeHtml(stream.summary)}</p>
          <footer>Status: ${escapeHtml(stream.status)}</footer>
        </article>
      `,
    )
    .join("");

  $("[data-role='streams-list']").innerHTML = streamsHtml;

  const branchesHtml = runtime.state.workspace.branchStrategy
    .map((branch) => `<li><code>${escapeHtml(branch)}</code></li>`)
    .join("");
  $("[data-role='branch-list']").innerHTML = branchesHtml;
}

function renderObservability(metrics) {
  $("[data-role='obs-render-count']").textContent = String(runtime.renderCount);
  $("[data-role='obs-boot-ms']").textContent = `${runtime.bootDurationMs} ms`;
  $("[data-role='obs-storage']").textContent = formatBytes(metrics.storageBytes);
  $("[data-role='obs-last-backup']").textContent = humanDate(metrics.lastBackupAt);
  $("[data-role='obs-last-restore']").textContent = humanDate(metrics.lastRestoreAt);
  $("[data-role='obs-last-save']").textContent = humanDate(metrics.lastSavedAt);
  $("[data-role='obs-errors']").textContent = String(metrics.errors);

  const auditHtml = runtime.state.observability.audit
    .slice(0, 20)
    .map(
      (entry) => `
        <article class="log-card" data-level="${escapeHtml(entry.level)}">
          <div>
            <strong>${escapeHtml(entry.scope)}</strong>
            <p>${escapeHtml(entry.message)}</p>
          </div>
          <span>${humanDate(entry.timestamp)}</span>
        </article>
      `,
    )
    .join("");

  $("[data-role='audit-log']").innerHTML = auditHtml;

  const errorsHtml = runtime.state.observability.errors
    .map(
      (entry) => `
        <article class="log-card" data-level="error">
          <div>
            <strong>${escapeHtml(entry.source)}</strong>
            <p>${escapeHtml(entry.message)}</p>
          </div>
          <span>${humanDate(entry.timestamp)}</span>
        </article>
      `,
    )
    .join("");

  $("[data-role='error-list']").innerHTML =
    errorsHtml || `<div class="empty-state">Nenhum erro registrado nesta sessao.</div>`;

  const backupsHtml = runtime.backups
    .map(
      (backup) => `
        <article class="list-card">
          <div class="list-card-body">
            <strong>${escapeHtml(backup.reason)}</strong>
            <span>${humanDate(backup.createdAt)} · ${formatDuration(backup.summary.focusMs || 0)}</span>
          </div>
          <button class="ghost-button" data-action="restore-backup" data-id="${escapeHtml(backup.id)}">Restaurar</button>
        </article>
      `,
    )
    .join("");

  $("[data-role='backups-list']").innerHTML =
    backupsHtml || `<div class="empty-state">Nenhum backup salvo ainda.</div>`;
}

function render() {
  runtime.renderCount += 1;
  const metrics = currentMetrics();

  renderHeader(metrics);
  renderNav();
  renderDashboard(metrics);
  renderFocus();
  renderTasks();
  renderNotes();
  renderLinks();
  renderCalendar();
  renderTeam();
  renderObservability(metrics);
}

function updateLiveFocusDisplays() {
  const focusTarget = $("[data-role='focus-display']");
  const metricFocus = $("[data-role='metric-focus']");
  const headerFocus = $("[data-role='header-focus']");
  const progressBar = $("[data-role='focus-progress']");
  const goalLabel = $("[data-role='focus-goal']");
  if (!focusTarget || !metricFocus || !headerFocus || !progressBar || !goalLabel) {
    return;
  }

  const focusMs = getLiveFocusMs(runtime.state.focus, isoNow());
  const display = formatDuration(focusMs);
  const progress = Math.min(100, Math.round((focusMs / (runtime.state.focus.goalMinutes * 60 * 1000)) * 100));

  focusTarget.textContent = display;
  metricFocus.textContent = display;
  headerFocus.textContent = display;
  progressBar.style.width = `${progress}%`;
  goalLabel.textContent = `${progress}% da meta de ${runtime.state.focus.goalMinutes} min`;
}

function downloadBundle() {
  const blob = new Blob([exportWorkspaceBundle(runtime.state, runtime.backups, isoNow())], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `site-dev-backup-${dateKey()}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function importBundleFromText(rawText) {
  const now = isoNow();
  const preImportBackup = createBackupRecord(runtime.state, "pre-import", now);
  const imported = importWorkspaceBundle(rawText, now);
  runtime.state = imported.state;
  runtime.backups = [preImportBackup, ...normalizeBackups(imported.backups, now)].slice(0, 8);
  persistWorkspace();
  render();
  notify("Backup importado com sucesso.", "success");
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action], [data-view], [data-filter]");
    if (!target) {
      return;
    }

    if (target.dataset.view) {
      commit((state, now) => setActiveView(state, target.dataset.view, now), {
        scope: "navigation",
      });
      return;
    }

    if (target.dataset.filter) {
      commit((state, now) => setTaskFilter(state, target.dataset.filter, now), {
        scope: "tasks",
      });
      return;
    }

    const id = target.dataset.id;
    switch (target.dataset.action) {
      case "toggle-theme":
        commit(
          (state, now) => setTheme(state, state.ui.theme === "night" ? "day" : "night", now),
          {
            toast: "Tema atualizado.",
            scope: "preferences",
          },
        );
        break;
      case "toggle-focus":
        commit(
          (state, now) => (state.focus.running ? pauseFocusTimer(state, now) : startFocusTimer(state, now)),
          {
            toast: runtime.state.focus.running ? "Bloco pausado." : "Bloco iniciado.",
            allowAutoBackup: true,
            reason: "focus",
            scope: "focus",
          },
        );
        break;
      case "reset-focus":
        commit((state, now) => resetFocusTimer(state, now), {
          toast: "Timer reiniciado.",
          allowAutoBackup: true,
          reason: "focus-reset",
          scope: "focus",
        });
        break;
      case "delete-task":
        commit((state, now) => deleteTask(state, id, now), {
          toast: "Tarefa removida.",
          allowAutoBackup: true,
          reason: "task-delete",
          scope: "tasks",
        });
        break;
      case "toggle-task":
        commit((state, now) => toggleTask(state, id, now), {
          toast: "Status da tarefa atualizado.",
          allowAutoBackup: true,
          reason: "task-toggle",
          scope: "tasks",
        });
        break;
      case "delete-note":
        commit((state, now) => deleteNote(state, id, now), {
          toast: "Nota removida.",
          allowAutoBackup: true,
          reason: "note-delete",
          scope: "notes",
        });
        break;
      case "delete-link":
        commit((state, now) => deleteLink(state, id, now), {
          toast: "Atalho removido.",
          allowAutoBackup: true,
          reason: "link-delete",
          scope: "links",
        });
        break;
      case "calendar-prev":
        commit((state, now) => shiftCalendarCursor(state, -1, now), {
          scope: "calendar",
        });
        break;
      case "calendar-next":
        commit((state, now) => shiftCalendarCursor(state, 1, now), {
          scope: "calendar",
        });
        break;
      case "select-date":
        commit((state, now) => selectCalendarDate(state, target.dataset.date, now), {
          scope: "calendar",
        });
        break;
      case "delete-event":
        commit((state, now) => deleteCalendarEvent(state, id, now), {
          toast: "Evento removido.",
          allowAutoBackup: true,
          reason: "event-delete",
          scope: "calendar",
        });
        break;
      case "open-import":
        $("[data-role='import-input']").click();
        break;
      case "export-bundle":
        downloadBundle();
        notify("Exportacao iniciada.", "success");
        break;
      case "create-backup":
        commit((state) => state, {
          manualBackup: "manual",
          toast: "Backup manual criado.",
          scope: "backup",
        });
        break;
      case "restore-latest":
        if (!runtime.backups.length) {
          notify("Ainda nao existe backup para restaurar.", "warning");
          break;
        }
        try {
          runtime.state = restoreBackup(runtime.backups, runtime.backups[0].id, isoNow());
          persistWorkspace();
          render();
          notify("Ultimo backup restaurado.", "warning");
        } catch (error) {
          captureError(error, "backup");
        }
        break;
      case "restore-backup":
        try {
          runtime.state = restoreBackup(runtime.backups, id, isoNow());
          persistWorkspace();
          render();
          notify("Backup restaurado.", "warning");
        } catch (error) {
          captureError(error, "backup");
        }
        break;
      default:
        break;
    }
  });

  $("#task-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const field = form.querySelector("input[name='taskTitle']");
    commit((state, now) => addTask(state, field.value, now), {
      toast: "Tarefa adicionada.",
      allowAutoBackup: true,
      reason: "task-create",
      scope: "tasks",
    });
    form.reset();
  });

  $("#note-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = form.querySelector("input[name='noteTitle']");
    const body = form.querySelector("textarea[name='noteBody']");
    commit((state, now) => addNote(state, title.value, body.value, now), {
      toast: "Nota registrada.",
      allowAutoBackup: true,
      reason: "note-create",
      scope: "notes",
    });
    form.reset();
  });

  $("#link-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const label = form.querySelector("input[name='linkLabel']");
    const url = form.querySelector("input[name='linkUrl']");
    const category = form.querySelector("input[name='linkCategory']");
    commit((state, now) => addLink(state, { label: label.value, url: url.value, category: category.value }, now), {
      toast: "Atalho criado.",
      allowAutoBackup: true,
      reason: "link-create",
      scope: "links",
    });
    form.reset();
  });

  $("#event-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = form.querySelector("input[name='eventTitle']");
    const category = form.querySelector("input[name='eventCategory']");
    const dateField = form.querySelector("input[name='eventDate']");
    commit(
      (state, now) =>
        addCalendarEvent(
          state,
          { title: title.value, category: category.value, date: dateField.value || state.ui.selectedDate },
          now,
        ),
      {
        toast: "Evento registrado.",
        allowAutoBackup: true,
        reason: "event-create",
        scope: "calendar",
      },
    );
    title.value = "";
    category.value = "";
  });

  $("[data-role='import-input']").addEventListener("change", async (event) => {
    const [file] = event.currentTarget.files || [];
    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      importBundleFromText(rawText);
      event.currentTarget.value = "";
    } catch (error) {
      captureError(error, "import");
    }
  });

  window.addEventListener("error", (event) => {
    captureError(event.error || event.message, "window");
  });

  window.addEventListener("unhandledrejection", (event) => {
    captureError(event.reason || "Promise rejeitada sem tratamento.", "promise");
  });
}

function startTicker() {
  runtime.focusTicker = window.setInterval(() => {
    if (runtime.state.focus.running) {
      updateLiveFocusDisplays();
    }
  }, 250);
}

function exposeApi() {
  window.SiteDevApp = {
    getState: () => JSON.parse(JSON.stringify(runtime.state)),
    getBackups: () => JSON.parse(JSON.stringify(runtime.backups)),
    exportBundle: () => exportWorkspaceBundle(runtime.state, runtime.backups, isoNow()),
    importBundle: (payload) => importBundleFromText(typeof payload === "string" ? payload : JSON.stringify(payload)),
    clearStorage: () => {
      localStorage.removeItem(STORAGE_KEYS.state);
      localStorage.removeItem(STORAGE_KEYS.backups);
    },
    navigate: (view) => commit((state, now) => setActiveView(state, view, now)),
  };
}

function boot() {
  loadRuntime();
  bindEvents();
  render();
  startTicker();
  runtime.bootDurationMs = Math.round(performance.now() - runtime.bootStartedAt);
  render();
  exposeApi();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
