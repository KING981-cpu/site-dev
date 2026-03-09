import test from "node:test";
import assert from "node:assert/strict";

import {
  addBackup,
  addCalendarEvent,
  addLink,
  addNote,
  addTask,
  computeMetrics,
  createDefaultState,
  exportWorkspaceBundle,
  formatDuration,
  importWorkspaceBundle,
  normalizeState,
  pauseFocusTimer,
  restoreBackup,
  sanitizeUrl,
  startFocusTimer,
  toggleTask,
} from "../assets/scripts/core.js";

test("createDefaultState entrega estrutura minima consistente", () => {
  const state = createDefaultState("2026-03-09T12:00:00.000Z");
  assert.equal(state.workspace.name, "Site Dev Control Center");
  assert.equal(state.tasks.length, 0);
  assert.equal(state.links.length >= 3, true);
  assert.equal(state.ui.activeView, "dashboard");
});

test("sanitizeUrl aceita relativo e normaliza dominio sem protocolo", () => {
  assert.equal(sanitizeUrl("./operacao.html"), "./operacao.html");
  assert.equal(sanitizeUrl("github.com/KING981-cpu/site-dev"), "https://github.com/KING981-cpu/site-dev");
});

test("tarefas podem ser criadas e alternadas", () => {
  let state = createDefaultState("2026-03-09T12:00:00.000Z");
  state = addTask(state, "Executar release gate", "2026-03-09T12:01:00.000Z");
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].done, false);

  state = toggleTask(state, state.tasks[0].id, "2026-03-09T12:02:00.000Z");
  assert.equal(state.tasks[0].done, true);
});

test("notas, links e eventos entram na estrutura e aparecem nas metricas", () => {
  let state = createDefaultState("2026-03-09T12:00:00.000Z");
  state = addNote(state, "Checklist", "Validar deploy, smoke e release.", "2026-03-09T12:01:00.000Z");
  state = addLink(
    state,
    { label: "Homologacao", url: "staging.example.com", category: "Deploy" },
    "2026-03-09T12:02:00.000Z",
  );
  state = addCalendarEvent(
    state,
    { title: "Go live", date: "2026-03-10", category: "Release" },
    "2026-03-09T12:03:00.000Z",
  );

  const metrics = computeMetrics(state, [], "2026-03-09T18:00:00.000Z");
  assert.equal(metrics.notes, 1);
  assert.equal(metrics.links >= 4, true);
  assert.equal(metrics.upcomingEvents, 1);
});

test("timer registra blocos de foco", () => {
  let state = createDefaultState("2026-03-09T12:00:00.000Z");
  state = startFocusTimer(state, "2026-03-09T12:00:00.000Z");
  state = pauseFocusTimer(state, "2026-03-09T12:15:05.000Z");

  assert.equal(state.focus.running, false);
  assert.equal(state.focus.sessions.length, 1);
  assert.equal(state.focus.elapsedMs, 905000);
  assert.equal(formatDuration(state.focus.elapsedMs), "00:15:05");
});

test("backup, exportacao e restauracao funcionam em roundtrip", () => {
  let state = createDefaultState("2026-03-09T12:00:00.000Z");
  state = addTask(state, "Montar release", "2026-03-09T12:01:00.000Z");
  const created = addBackup(state, [], "manual", "2026-03-09T12:02:00.000Z");

  assert.equal(created.backups.length, 1);
  const restored = restoreBackup(created.backups, created.backups[0].id, "2026-03-09T12:03:00.000Z");
  assert.equal(restored.tasks.length, 1);

  const bundle = exportWorkspaceBundle(created.state, created.backups, "2026-03-09T12:04:00.000Z");
  const imported = importWorkspaceBundle(bundle, "2026-03-09T12:05:00.000Z");

  assert.equal(imported.state.tasks.length, 1);
  assert.equal(imported.backups.length, 1);
  assert.equal(normalizeState(imported.state).workspace.name, "Site Dev Control Center");
});
