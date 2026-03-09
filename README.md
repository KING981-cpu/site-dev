# Site Dev Control Center

[![CI](https://github.com/KING981-cpu/site-dev/actions/workflows/ci.yml/badge.svg)](https://github.com/KING981-cpu/site-dev/actions/workflows/ci.yml)
[![Pages](https://github.com/KING981-cpu/site-dev/actions/workflows/pages.yml/badge.svg)](https://github.com/KING981-cpu/site-dev/actions/workflows/pages.yml)
[![Release](https://img.shields.io/github/v/release/KING981-cpu/site-dev?display_name=tag)](https://github.com/KING981-cpu/site-dev/releases)
[![License](https://img.shields.io/github/license/KING981-cpu/site-dev)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-0f8b8d)](./package.json)

Workspace estatico profissional para operacao local-first com:

- dashboard executivo
- focus timer persistente
- tarefas, notas, atalhos e calendario
- backup manual em JSON e auto-backup por mutacao
- observabilidade com audit log, captura de erros e footprint local
- smoke test real em navegador headless

## Stack

- HTML + CSS + JavaScript modular
- persistencia em `localStorage`
- servidor estatico Node para smoke tests
- GitHub Actions para CI, Pages e release

## Estrutura

```text
app.html                     # aplicacao principal
operacao.html                # deck operacional / release
assets/styles/app.css        # design system e layout
assets/scripts/core.js       # regras puras de dominio
assets/scripts/app.js        # camada de UI e runtime
tests/core.test.mjs          # testes unitarios de dominio
tests/structure.test.mjs     # verificacoes estruturais
tests/browser-smoke.html     # fluxo browser real
tests/smoke-runner.mjs       # runner headless
scripts/server.mjs           # servidor estatico local
docs/releases/v1.0.0.md      # release notes
```

`index.html` e `equipe.html` foram mantidos como pontos de entrada legados e agora redirecionam para `app.html` e `operacao.html`.

## Branching

- `developer`: integracao de trabalho em curso
- `staging`: homologacao funcional
- `main`: producao e releases

## Backups

- botão `Criar backup`: snapshot manual imediato
- botão `Exportar JSON`: exporta o workspace inteiro
- botão `Importar`: restaura um backup salvo
- auto-backup: roda a cada 5 mutacoes de dados

## Observabilidade

- audit log persistido
- captura de `error` e `unhandledrejection`
- contagem de renders
- tempo de boot
- consumo local de storage
- indicador de ultimo backup, restore e save

## Execucao local

```bash
npm ci
npm run serve
```

Aplicacao principal:

- `http://127.0.0.1:4173/app.html`

Smoke test completo:

```bash
npm run test:all
```

## Scripts

- `npm run serve`: sobe o servidor estatico
- `npm test`: executa testes unitarios e estruturais
- `npm run test:smoke`: executa smoke test em navegador headless
- `npm run test:all`: roda tudo

## Release

- versão atual: `v1.0.0`
- changelog: [CHANGELOG.md](./CHANGELOG.md)
- release notes: [docs/releases/v1.0.0.md](./docs/releases/v1.0.0.md)

## Licenca

MIT. Veja [LICENSE](./LICENSE).
