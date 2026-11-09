# OperaEcho: site

React 19, TypeScript, Tailwind 4 e Vite. Cada página tem URL própria e carrega sob demanda.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o site em `http://localhost:3000` |
| `npm run build` | Gera o site em `build/`, sem source maps |
| `npm run typecheck` | Confere os tipos |
| `npm run lint` | Roda o ESLint |
| `npm run test:e2e` | Roda os fluxos críticos no navegador |

## Estrutura

```text
src/
├── app/                 # rotas, proteção de acesso, menu e layout
├── features/<dominio>/  # telas de cada domínio
│   ├── *Page.tsx        # layout da tela
│   ├── hooks.ts         # lógica e estado
│   └── api.ts           # chamadas à API e tipos
├── shared/
│   ├── ui/              # componentes compartilhados
│   ├── auth/            # sessão e permissões
│   ├── exportacao.ts    # captura para JPG e PDF
│   └── pdfRelatorio.ts  # PDF padrão dos relatórios
└── styles/tailwind.css  # paleta, fontes e padrões de elementos
```

## Convenções

- **Layout e lógica:** ficam separados. O visual reutilizável vai para `shared/ui`.
- **Estilo:** só Tailwind, com as cores definidas em `styles/tailwind.css`. Não há outro CSS.
- **API:** as chamadas usam `shared/api.ts`, que aponta para `/api/v1`.
- **Diálogos:** confirmações e alertas usam `shared/feedback`. Formulários longos têm página própria.
- **Ajuda:** as regras da tela ficam em um balão ao lado do título, não em legendas.
- **Relatórios:** o PDF usa `gerarPdf`, em `features/relatorios/exportacao.ts`, e o JPG usa a captura da tela.

## Testes no navegador

Exigem o site e a API no ar e o Microsoft Edge instalado. Sem as variáveis `E2E_USUARIO` e `E2E_SENHA`, os fluxos com sessão são ignorados. Use um usuário de teste do seu ambiente local.
