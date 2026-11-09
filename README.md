# OperaEcho

Sistema de gestão de implantações, projetos e indicadores da Opera Echo.

| Pasta | O que é |
|---|---|
| `frontend/` | Site em React 19, TypeScript e Tailwind 4 |
| `backend/` | API em Node.js, Express e SQL Server |
| `opera-echo-mobile/` | App em Expo, que usa a mesma API |
| `scripts/` | `deploy.sh`, publicação a partir do GitHub |
| `docs/refatoracao/` | Plano e histórico da refatoração |
| `_lixo/` | Arquivos fora do sistema, aguardando descarte (não vai para o Git) |

## Rodar localmente

Requer Node.js e um SQL Server acessível.

1. Copie `backend/.env.example` para `backend/.env` e preencha os valores.
2. Instale as dependências:

```bash
npm install --prefix backend
```

```bash
npm install --prefix frontend
```

3. Suba a API, em `http://localhost:3001`:

```bash
npm --prefix backend run dev
```

4. Em outro terminal, suba o site, em `http://localhost:3000`:

```bash
npm --prefix frontend run dev
```

A área logada fica em `/system` e foi feita para computador, com tela mínima de 1366x768.

## Verificações

```bash
npm --prefix backend test
```

```bash
npm --prefix frontend run typecheck
```

```bash
npm --prefix frontend run lint
```

Os fluxos no navegador estão descritos em [frontend/README.md](frontend/README.md).

## Publicação

Na VPS, `scripts/deploy.sh` baixa a versão, roda testes, tipos e lint, gera o build e reinicia o processo no PM2. Se algum passo falhar, o código volta para a versão anterior e o sistema no ar não é reiniciado. O uso está no cabeçalho do script.

Alterações de banco ficam em `backend/sql/` e são aplicadas à parte. Veja [backend/README.md](backend/README.md).
