import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("app shell expõe os painéis principais e scripts corretos", async () => {
  const html = await readFile(new URL("../app.html", import.meta.url), "utf8");

  assert.match(html, /data-view-panel="dashboard"/);
  assert.match(html, /data-view-panel="focus"/);
  assert.match(html, /data-view-panel="tasks"/);
  assert.match(html, /data-view-panel="observability"/);
  assert.match(html, /src="\.\/assets\/scripts\/app\.js"/);
});

test("entradas legadas redirecionam para a nova base", async () => {
  const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const teamHtml = await readFile(new URL("../equipe.html", import.meta.url), "utf8");

  assert.match(indexHtml, /app\.html/);
  assert.match(teamHtml, /operacao\.html/);
});

test("documentacao principal foi criada", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
  const release = await readFile(new URL("../docs/releases/v1.0.0.md", import.meta.url), "utf8");

  assert.match(readme, /Site Dev Control Center/);
  assert.match(changelog, /v1\.0\.0/);
  assert.match(release, /Release v1\.0\.0/);
});
