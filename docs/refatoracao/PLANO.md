# Refatoração do OperaEcho — plano

Stack de destino do front: **React 19 + TypeScript + Tailwind CSS 4**, no Vite atual.
Trabalho feito no ambiente local. O app mobile (`opera-echo-mobile/`) **não muda**.

Situação: `[ ]` pendente · `[~]` em andamento · `[x]` concluído.

> **Atualização:** a direção visual é a do **RenoveReg**, com a paleta do OperaEcho. O sistema **não é responsivo**: o acesso é pela web em computador, e as ações em campo usam o PWA. A área logada fica em `/system`. O login recebeu efeitos antes da fase 6, a pedido, sem mudar sua lógica.

## 1. Regras combinadas

| # | Regra | Como será cumprida |
|---|---|---|
| 1 | Componentes de UI compartilhados | Tudo que for visual e reutilizável fica em `shared/ui` |
| 2 | Lógica separada do layout | Cada tela tem `pages/` e `components/` (layout), `hooks/` (lógica) e `api/` (chamadas) |
| 3 | URL própria para cada página | Rotas reais em `/system/...`, com carregamento sob demanda de todas as telas |
| 4 | Mobile com o mesmo código | Nenhum arquivo do mobile é alterado; as rotas que ele usa continuam respondendo igual |
| 5 | CSS antigo totalmente substituído | Cada tela migrada apaga o seu CSS; no fim, só resta o Tailwind |
| 6 | APIs bem desenhadas e fechadas | Prefixo `/api/v1`, autenticação por padrão e validação de entrada |
| 7 | TS, ESLint e Tailwind ativos | Fase 0 |
| 8 | Remover dependências sem import | Fase 0 |
| 9 | Código limpo | ESLint obrigatório, funções curtas, arquivos com menos de 400 linhas sempre que possível |
| 10 | Redesenho com padrão `Swal.fire` | Ver seção 4 |
| 11 | Ordem das telas | Relatórios e Hora Extra por último; Login é o último passo |
| 12 | Paleta mantida | Verde-pinheiro e latão, com os mesmos valores de `theme.css` |
| 13 | Arquivos sem uso | Vão para `_lixo/`, fora do Git |
| 14 | Sem source maps em produção | `build.sourcemap: false` permanece |

## 2. Decisões técnicas

**URLs das telas em `/system/...`.** A API responde na raiz (`/projetos`, `/unidades`...) e os painéis públicos usam `/:slug`. Uma tela em `/projetos` colidiria com a API. `system` é reservado em `backend/utils/slugPublico.js`. `/dashboard` passa a redirecionar para `/system`. As rotas públicas atuais continuam com os mesmos endereços.

**API nova convive com a antiga.** O mobile instalado nos aparelhos chama cerca de 30 rotas na raiz (seção 6), e versões antigas do app continuam em uso depois de qualquer publicação. Por isso:

- o web passa a usar `/api/v1/...`;
- as rotas da seção 6 permanecem, com o mesmo contrato, ligadas aos mesmos serviços novos;
- as demais rotas antigas são removidas quando a tela correspondente migrar.

**Tailwind durante a transição.** Até a fase 6, as telas antigas precisam ficar visualmente intactas. Por isso, temporariamente:

- o Tailwind analisa só `src/app`, `src/features` e `src/shared`. Classes antigas como `hidden` ou `container` não geram utilitários;
- os utilitários usam `important`, para vencer o CSS antigo nas telas novas;
- o reset (Preflight) fica desligado, para não alterar as telas antigas.

Na fase 6, o `important` saiu e o Preflight entrou, deixando o Tailwind original em todas as camadas. A transição acima já terminou.

**PDFs.** O `html2canvas` 1.4.1 não interpreta `oklch()` nem `color()`. A paleta é definida em hexadecimal e a primeira tela com PDF migrada testa a captura. Se falhar, a biblioteca é trocada por `html2canvas-pro` em `captura.js`.

**TypeScript.** Versão 5.9, a mesma do mobile; o `typescript-eslint` ainda não aceita a 7. O modo `strict` vale para o código novo; o `.jsx` antigo convive sem checagem até ser migrado.

## 3. Estrutura de pastas

```text
frontend/src/
├── app/                     # router, guards, navegacao e layout/
├── features/<dominio>/
│   ├── pages/               # layout da tela (uma por URL)
│   ├── components.tsx       # layout específico do domínio
│   ├── hooks.ts             # lógica e estado
│   └── api.ts               # chamadas HTTP e tipos
├── shared/
│   ├── ui/                  # Button, Campos, Pagina, Estados...
│   ├── auth/                # sessão e permissões
│   ├── hooks.ts
│   └── lib.ts
├── styles/tailwind.css
└── styles/legacy.css        # temporário: sai seção a seção

backend/src/
├── app.js  e  server.js
├── config/
├── middlewares/
├── modules/<dominio>/
│   ├── <dominio>.routes.js      # URLs e permissões
│   ├── <dominio>.controller.js  # HTTP
│   ├── <dominio>.service.js     # regra de negócio
│   ├── <dominio>.repository.js  # SQL
│   └── <dominio>.schema.js      # validação de entrada
├── legacy-mobile/           # rotas da seção 6, sem regra própria
└── shared/
```

## 4. Direção visual: semelhante ao RenoveReg

- **Base:** fundo cinza-azulado `#F4F6F9`, cartões brancos com borda fina `#E5E7EB` e raio de 10 px.
- **Navegação:** cabeçalho sólido de 60 px em verde `#1B5E20`, menu horizontal com submenus brancos, sem níveis aninhados. Resolução mínima de 1366x768, sem layout para celular.
- **Tipografia:** Inter em toda a área logada. O login mantém as fontes atuais até a fase 6.
- **Cores:** verde e latão do OperaEcho na marca; neutros em tons de cinza-azulado, como no RenoveReg.
- **Hierarquia:** título de página com ação à direita, indicadores, filtros e tabelas em cartão.

**Padrão de diálogos**

| Caso | Solução |
|---|---|
| Confirmação, alerta, sucesso, erro | `Swal.fire` por `shared/feedback` |
| Formulário curto (até cerca de 3 campos) | `Swal.fire` com campos |
| Formulário longo ou com tabela, mapa, anexos | Página própria com URL, como `/system/cadastros/unidades/novo` |

Formulários longos não entram no Swal porque ele trabalha com HTML solto, fora do React: perderíamos componentes, tipos e validação.

## 5. Fases

### Fase 0 — Fundação
- [x] TypeScript, ESLint e Tailwind 4 configurados
- [x] Dependências sem import removidas (`chart.js`, `react-chartjs-2`, `react-input-mask`, `leaflet.markercluster`)
- [x] Primeiro componente compartilhado (`shared/ui/Button`)
- [x] `_backup_pre_vite/` movido para `_lixo/`
- [x] `scripts/deploy.sh` roda os testes do backend, `typecheck` e `lint` antes do build; se falharem, o código volta e o sistema no ar não reinicia
- [x] Testes Playwright dos fluxos críticos em `frontend/e2e` (`npm run test:e2e`, com `E2E_USUARIO` e `E2E_SENHA` no ambiente)

### Fase 1 — Navegação
- [x] `app/router.tsx` com todas as rotas da seção 7, carregadas com `lazy()`
- [x] Guarda de rota por permissão, no lugar de `podeAcessar()` dentro do `Dashboard`
- [x] `Dashboard.jsx` dividido: layout, menu, home, alterar senha, aprovação de acesso, contato obrigatório
- [x] Telas antigas ligadas às novas URLs
- [x] Abas de Parâmetros e lotação de Projetos refletidas na URL
- [x] Filtros das listagens na URL, entregues com a migração de cada tela

### Fase 2 — Design e componentes
- [x] Cabeçalho, menu e home no padrão RenoveReg
- [x] Tema das telas antigas alinhado ao novo visual (seção "Tema RenoveReg" em `styles/legacy.css`)
- [x] Primeiros componentes: Button, Field, Input, Select, Card, PageHeader, Stat, Badge, Aviso, Carregando
- [x] Checkbox, Interruptor, GrupoSelecao, Tabela, Paginacao, FormCard e filtros na URL
- [x] Componentes: Textarea, `shared/ui/Abas` e `Esqueleto`
- [x] `shared/feedback` no lugar dos `Swal.fire` soltos. Ficam com Swal próprio só os diálogos com campos (`planoAcao/dialogos.ts`, contato obrigatório) e o Login, que entra na fase 6

### Fase 3 — Base da API
- [x] Hora Extra de Implantação e Projetos em um só arquivo de rotas
- [x] Atividades e Escalas de Implantação e Projetos unificadas em `<dominio>.montagem.js`, com cada diferença como opção explícita em `<dominio>.modulos.js`
- [x] Timeouts de 15 s: limite de consulta em 30 s (`DB_REQUEST_TIMEOUT`), até 20 conexões (`DB_POOL_MAX`), conexão inicial compartilhada, Projetos Ativos dividido em consultas e erro próprio (503) no lugar de "Erro nos dados enviados"
- [x] `backend/src/` com `app.js`, `server.js`, `rotas.js`, `config/`, `middlewares/`, `shared/` e `modules/<dominio>/`, separados em rotas, repositório, serviço e esquema. Sem SQL nos arquivos de rotas; todos abaixo de 400 linhas
- [x] `/api/v1` com autenticação por padrão, formato único de erro `{ erro }` e validação com zod nas rotas de escrita que recebem corpo; o front inteiro já chama `/api/v1`
- [x] `legacy-mobile/contrato.js`: só as rotas da seção 6 respondem na raiz. Testes em `backend/test` (`npm test`): contrato, esquemas e caracterização, que compara status, resposta, SQL e envios com a base gravada antes da refatoração

### Fase 4 — Telas, por domínio
Cada domínio migra tudo junto: API, tela, CSS antigo apagado.

- [x] Cadastros: Produtos, Projetos, Unidades, Regiões, Perfis, Usuários. Telas migradas, com URL própria para novo e editar.
- [x] Parâmetros, WhatsApp, Links externos. Telas migradas.
- [x] Consulta e importação SIGTAP, com busca, aba e ficha na URL (`/sigtap?proc=...`). Telas migradas. O app mobile consome `/sigtap/*` na raiz, que continua igual
- [x] Gerador de Escalas, com a semana na URL (`?semana=`), exportação em JPG e PDF A4 vertical e janela compartilhada `shared/ui/Janela`. Tela migrada, também usada pelo módulo Projetos.
- [x] Registro de Atividades, com filtros e formulário na URL (`?registro=novo` ou `?registro=123`). Tela migrada, também usada pelo módulo Projetos.
- [x] Férias: solicitação e aprovação, com recibo e relatórios em PDF de várias páginas. Telas migradas.
- [x] Módulo Projetos: moldura com a lotação na URL, atividades, escalas, férias e hora extra migradas
- [x] Plano de Ação: lista, novo, detalhes e painel (interno e público) migrados; filtros, aba e passo de criação com URL própria. O relatório do plano fica com os Relatórios, na fase 5.
- [x] Painéis (mapa, produtividade, métricas, por unidade) e Faturamento (lançamento e consolidado) em `features/paineis` e `features/faturamento`; cálculos do consolidado em funções puras, exportações sob demanda
- [x] Balão de ajuda (`shared/ui/BalaoAjuda`) no lugar das legendas: abre ao apontar o cursor. Regras em `features/faturamento/regrasCalculo.ts`, `features/relatorios/regrasRelatorios.ts` e `AJUDA_FERIAS`
- [x] Páginas públicas: Indicadores APS (também em Operações, módulo `indicadores_aps`, com o CNES mantido na pública) e Painel do Projeto em `features/indicadoresAps` e `features/painelProjeto`. Indicadores conferidos com as Notas Metodológicas atualizadas em 02/10/2026 e aba com o cálculo quadrimestral (NT 8/2026 e 12/2026)

### Fase 5 — Telas finais
- [x] Relatórios em `features/relatorios`, com o padrão formal de documento em `shared/ui/DocumentoFormal` e no motor `pdfRelatorio.js` (usado também por Faturamento e pelos relatórios de Férias)
- [x] Gerador de Notas e `/dark`: removidos a pedido do responsável (tela, rota e `/gerador/*`, em `_lixo/`). As tabelas `tab_gerador*` continuam no banco
- [x] Lançamento de Hora Extra em `features/horaExtra` (implantação e projetos): regras puras em `calculos.ts`, conferidas contra os 885 dias gravados no banco local, e folha no padrão formal
- [x] Nova forma de gerar JPG e PDF em `shared/exportacao.ts` (`modern-screenshot`), usada por Escalas, Plano de Ação, Férias, Relatórios e Hora Extra; `html2canvas`, `captura.js` e o alias saíram

### Correções antes da fase 6
- [x] Permissões: painéis, férias, atividades, escalas e `/regras/:perfil` conferem o módulo no servidor; vínculos de usuário conferem o escopo; presença e prazos isolados por lotação. O resumo "Atividades de hoje" do Início segue aberto a todos, por ser consolidado
- [x] Autocadastro anônimo não revela login nem CPF já cadastrados
- [x] Dados: saldo e sobreposição de férias conferidos no servidor (o aviso de conflito com colegas segue só como aviso); data final de atividade não antecede a inicial; escalas de Projetos leem também as lotações extras; excluir usuário apaga as lotações
- [x] Anexos saem do disco ao excluir a atividade ou retirá-los na edição; recusa não deixa arquivo órfão
- [x] Mensagem da Evolution chega à tela; estrutura do SIGTAP é criada ao subir a API, não na consulta pública
- [x] Limite de login e recuperação compartilhado entre instâncias. **Na publicação, rodar `node scripts/aplicarPatch.js sql/patch_limites_acesso.sql` em `backend/`**; sem isso, vale só o limite em memória

### Fase 6 — Login e encerramento do CSS antigo
- [x] Redesenho do Login (`features/login`), com lógica separada do layout
- [x] Todo o CSS antigo, as telas legadas e o `.jsx` restante foram para `_lixo/`; `important` removido e Preflight ligado; `src` só tem `.ts` e `.tsx`
- [x] Revisão visual: 45 telas em 1366x768 sem erro de JavaScript ou de rede, além de diálogos e exportações
- [x] Relatórios: títulos não se sobrepõem no PDF vetorial; PDF por captura corta as páginas entre as linhas da tabela (`shared/exportacao`, usado por Férias e Plano de Ação); Auditoria de Localização passou ao PDF padrão
- [x] Telas de Projetos: a Lotação fica em uma faixa própria, e título, balão e ações ficam só no cabeçalho da tela

### Fase 7 — Limpeza
- [x] Rotas sem uso removidas: `POST /recuperar-senha/validar`, `GET /dashboard/produtos-detalhes`, `GET /plano-acao/situacoes` e `GET /projetos/validar/:id`. Nenhuma pasta vazia
- [x] Nenhum arquivo do sistema ficou sem referência; três funções sem uso foram para `_lixo/backend/funcoes-sem-uso.js`
- [x] READMEs da raiz, do site e da API (o do mobile não muda)
- [x] App conferido: as 36 chamadas estão no contrato e o código do mobile não mudou. "Minha Escala" volta a abrir para quem não tem o módulo, só com a própria escala

## 6. Rotas que o mobile usa (contrato congelado)

Levantadas com busca em `opera-echo-mobile/app` e `src`. **Conferir de novo na fase 3**: a busca não pega URLs montadas em variáveis, como em `src/escopo.js`.

```text
POST   /login
POST   /recuperar-senha/{canais,solicitar,verificar,confirmar}
GET    /app-version
GET    /regras/:perfil
GET    /parametros
GET    /motivos
GET    /projetos
GET    /projetos/minhas-lotacoes
GET    /implantadores
GET    /unidades/buscar
GET    /unidades/:id/produtos
GET    /ferias/historico/:id
POST   /ferias/salvar
POST   /rastreio-background
GET    /sigtap/competencias
GET    /sigtap/procedimentos
GET    /sigtap/procedimentos/:codigo
```

Com o prefixo do módulo (`apiBase`: raiz ou o prefixo do módulo Projetos):

```text
GET    {apiBase}/atividades/buscar
POST   {apiBase}/atividades/salvar
DELETE {apiBase}/atividades/:id
GET    {apiBase}/escalas
GET    {apiBase}/hora-extra/buscar
GET    {apiBase}/hora-extra/detalhes/:id
POST   {apiBase}/hora-extra/salvar
DELETE {apiBase}/hora-extra/:id
```

## 7. Mapa de telas e URLs

| Hoje (`telaAtual`) | URL nova | Fase |
|---|---|---|
| `home` | `/system` | 1 |
| `alterar_senha` | `/system/conta/senha` | 1 |
| `aprovacao_acesso` | `/system/acessos/aprovacao/:id` | 1 |
| `form_produto` | `/system/cadastros/produtos` | 4 |
| `form_projeto` | `/system/cadastros/projetos` | 4 |
| `form_unidade` | `/system/cadastros/unidades` | 4 |
| `form_regioes` | `/system/cadastros/regioes` | 4 |
| `form_perfil` | `/system/cadastros/perfis` | 4 |
| `form_usuario` | `/system/cadastros/usuarios` | 4 |
| `parametros` | `/system/parametros/:aba?` | 4 |
| `links_externos` | `/system/links` | 4 |
| `sigtap` | `/sigtap` (mantida) | 4 |
| `escala` | `/system/implantacao/escalas` | 4 |
| `registro_atividades` | `/system/implantacao/atividades` | 4 |
| `ferias_solic_impl` | `/system/implantacao/ferias` | 4 |
| `ferias_aprovacao` | `/system/gestao/ferias` | 4 |
| `proj_registro` | `/system/projetos/atividades` | 4 |
| `proj_escala` | `/system/projetos/escalas` | 4 |
| `ferias_solic_proj` | `/system/projetos/ferias` | 4 |
| `plano_acao` | `/system/plano-acao` | 4 |
| `plano_acao_detalhes` | `/system/plano-acao/:id` | 4 |
| `painel_plano_acao` | `/system/plano-acao/painel` | 4 |
| `visualizar_painel` | `/system/paineis/:painel` | 4 |
| `faturamento_lancar` | `/system/faturamento/lancamento` | 4 |
| `faturamento_consolidado` | `/system/faturamento/consolidado` | 4 |
| `relatorios` | `/system/relatorios/:relatorio?` | 5 |
| `hora_extra` | `/system/implantacao/hora-extra` | 5 |
| `proj_hora` | `/system/projetos/hora-extra` | 5 |

Rotas públicas, sem mudança de endereço: `/`, `/indicadoresaps`, `/painel-plano-acao/:token?`, `/sigtap`, `/:slug`.

## 8. Arquivos fora do escopo do lixo, a confirmar

Não serão movidos sem confirmação, porque podem ter uso operacional:

- `Job_backup.sql`, `Job_replica.sql`, `Procedure1.sql`: rotinas de banco
- `download/opera-echo-mobile.apk`: pode estar publicado para download
- `backend/sql/patch_*.sql`: histórico de alterações do banco
- `api evolution.txt`: parece conter credencial, fora do Git. Deve sair da pasta do projeto
