# OperaEcho: API

Node.js, Express e SQL Server. As variáveis de ambiente estão descritas em `.env.example`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe a API e reinicia ao salvar |
| `npm start` | Sobe a API |
| `npm test` | Roda os testes, sem precisar de banco |

## Estrutura

```text
src/
├── server.js            # início do processo
├── app.js               # Express, arquivos do site e prefixos
├── rotas.js             # API completa: públicas primeiro, depois exige sessão
├── config/              # banco e upload
├── middlewares/         # sessão, lotação, validação e erros
├── shared/              # utilidades entre módulos
├── legacy-mobile/       # rotas que o app chama sem prefixo
└── modules/<dominio>/   # rotas, serviço, repositório e esquema de cada domínio
```

## Rotas

- **Prefixo:** a API responde em `/api/v1` e exige sessão por padrão. As exceções ficam em `src/rotas.js`.
- **App mobile:** chama algumas rotas sem prefixo. Elas estão listadas em `src/legacy-mobile/contrato.js` e não devem mudar sem atualizar o app.
- **Entrada:** as rotas de escrita validam o corpo com zod, em `<dominio>.schema.js`.
- **Erros:** respondem sempre no formato `{ erro }`.

## Testes

Os testes de caracterização, em `test/caracterizacao`, comparam cada resposta e cada consulta com a base gravada em `test/caracterizacao/base`. Depois de uma mudança intencional, regrave a base e confira a diferença:

```bash
ATUALIZAR_BASE=1 node --test test/caracterizacao/nome.test.js
```

## Alterações de banco

Cada alteração é um arquivo em `sql/`, aplicado à parte em cada ambiente:

```bash
node scripts/aplicarPatch.js sql/nome_do_patch.sql
```
