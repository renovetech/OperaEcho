/* Plano de Ação: cada rota (interna e pública) continua gerando as mesmas consultas, status e respostas.
 * O relógio e o UUID são fixos para a base não depender do dia em que o teste roda. */
const HOJE_FIXO = Date.parse('2026-10-15T15:00:00Z'); // 12:00 em Brasília: hoje = 2026-10-15
Date.now = () => HOJE_FIXO;
require('node:crypto').randomUUID = () => '11111111-1111-4111-8111-111111111111';

const { caracterizar } = require('../apoio/caracterizacao');

const TOKEN = 'ABCDEF01-2345-4678-89AB-CDEF01234567';
const data = (texto) => new Date(`${texto}T12:00:00Z`);

/* Perfis: o cache de regras é por perfil, então cada conjunto de regras tem o seu. */
const regra = (modulo, acessar, novo, editar) => ({ nome_modulo: modulo, pode_acessar: acessar, pode_novo: novo, pode_editar: editar });
const REGRAS = {
    Gestor: [regra('plano_acao', 1, 1, 1), regra('painel_plano_acao', 1, 0, 0)],
    Implantador: [regra('plano_acao', 1, 0, 0)],
    Visitante: [regra('painel_plano_acao', 1, 0, 0)],
    Estagiario: []
};
const regrasDe = (perfil) => (REGRAS[perfil] ? [/FROM tab_regras_acesso/, REGRAS[perfil]] : null);
const comPerfil = (perfil, respostas = []) => ({ perfil, respostas: [regrasDe(perfil), ...respostas].filter(Boolean) });

const PLANO = { id_plano: 3, id_projeto: 2, status: 'EM ANDAMENTO', titulo: 'Implantação Alfa', cliente: 'Prefeitura Alfa', publico: false, token_publico: null, criado_por: 1 };
const ITEM = {
    id_item: 10, id_plano: 3, id_unidade: null, titulo: 'GERAL', modulo: 'Cadastro', descricao: 'Configurar parâmetros', responsavel: 'Ana', cliente: 'Prefeitura Alfa',
    observacao: 'obs', status: 'A Iniciar', prioridade: 'Alta', ordem: 2, percentual: 0, data_inicio: data('2026-10-01'), data_fim: data('2026-10-30'),
    data_inicio_real: null, data_fim_real: null, tempo_previsto: 60, tempo_gasto: null, horas_trabalhadas: null, dt_inicio_andamento: null, dt_fechamento: null
};
const ITEM_ANDAMENTO = { ...ITEM, id_item: 11, status: 'Em andamento', data_inicio_real: data('2026-10-10'), dt_inicio_andamento: new Date('2026-10-10T11:00:00Z'), horas_trabalhadas: 120 };
const ITEM_FECHADO = { ...ITEM, id_item: 12, status: 'Fechado', data_inicio_real: data('2026-10-05'), data_fim_real: data('2026-10-08'), percentual: 100, dt_inicio_andamento: new Date('2026-10-05T11:00:00Z'), dt_fechamento: new Date('2026-10-08T15:00:00Z') };
const ITEM_ATRASADO = { ...ITEM, id_item: 13, status: 'Atrasado', data_fim: data('2026-10-01'), data_inicio_real: data('2026-10-02'), dt_inicio_andamento: new Date('2026-10-02T11:00:00Z') };

const rPlano = (extra = {}) => [/SELECT id_plano, id_projeto, status, titulo, cliente, publico, token_publico, criado_por FROM tab_plano_acao WHERE id_plano = @id/, [{ ...PLANO, ...extra }]];
const rSemPlano = [/SELECT id_plano, id_projeto, status, titulo, cliente, publico, token_publico, criado_por FROM tab_plano_acao WHERE id_plano = @id/, []];
const rItem = (item = ITEM) => [/SELECT \* FROM tab_plano_itens WHERE id_item = @id/, [item]];
const rContagem = (padrao, linha) => [padrao, [linha]];
const rRecalculo = (status = 'EM ANDAMENTO', total = 3, fechados = 1) => [/SELECT p\.status, \(SELECT COUNT\(\*\) FROM tab_plano_itens/, [{ status, total, fechados }]];
const rIdPlano = [/INSERT INTO tab_plano_acao \(titulo/, [{ id_plano: 7 }]];
const rIdItem = [/INSERT INTO tab_plano_itens/, [{ id_item: 55 }]];

const PLANO_BASE = {
    id_plano: 3, titulo: 'Implantação Alfa', status: 'EM ANDAMENTO', sub_tipo: 'Implantação', cliente: 'Prefeitura Alfa', descricao: 'Plano de teste',
    data_criacao: data('2026-09-01'), data_inicio_prevista: data('2026-09-01'), data_fim_prevista: data('2026-12-31'), data_encerramento: null, publico: true,
    token_publico: TOKEN, criado_por: 1, id_projeto: 2, nome_projeto: 'Projeto Alfa', nome_produto: 'Regulação'
};
const itemBase = (id, extra) => ({
    id_item: id, id_plano: 3, id_unidade: null, nome_unidade: null, modulo: 'Cadastro', grupo: 'GERAL', descricao: `Ação ${id}`, responsavel: 'Ana', cliente: null,
    observacao: 'segredo', status: 'A Iniciar', prioridade: 'Alta', ordem: id, percentual: 0, data_inicio: data('2026-10-01'), data_fim: data('2026-10-30'),
    data_inicio_real: null, data_fim_real: null, tempo_previsto: 60, tempo_gasto: null, horas_trabalhadas: null, ...extra
});
const ITENS_BASE = [
    itemBase(10, {}),
    itemBase(11, { status: 'Em andamento', data_inicio_real: data('2026-10-10'), data_fim: data('2026-10-18'), horas_trabalhadas: 90 }),
    itemBase(12, { status: 'Fechado', percentual: 100, data_fim_real: data('2026-10-08'), data_fim: data('2026-10-09'), modulo: 'Faturamento' }),
    itemBase(13, { status: 'Atrasado', data_fim: data('2026-10-01'), id_unidade: 4, nome_unidade: 'UBS Central', modulo: 'Cadastro', responsavel: 'Bruno' })
];
const respostasBase = [
    [/FROM tab_plano_acao p LEFT JOIN tab_projetos pj ON pj\.id_projeto = p\.id_projeto/, [PLANO_BASE]],
    [/SELECT i\.id_item, i\.id_plano, i\.id_unidade, u\.nome_unidade/, ITENS_BASE],
    [/SELECT e\.id_item, i\.id_plano, e\.id_usuario/, [{ id_item: 10, id_plano: 3, id_usuario: 1, nome_completo: 'ana maria souza' }]],
    [/SELECT a\.id_item, a\.id_plano/, [{ id_item: 11, id_plano: 3, id_usuario: 1, nome_completo: 'ana maria souza', data_execucao: data('2026-10-10'), minutos: 90 }]]
];

const ETAPA = { acao: 'Treinar equipe', modulo: 'Cadastro', responsavel: 'Ana', prioridade: 'Média', data_inicio: '2026-10-01', data_fim: '2026-10-20' };
const NOVO_PLANO = {
    titulo: 'Plano Beta', id_projeto: 2, id_produto: 1, sub_tipo: 'Implantação', cliente: 'Cliente Beta', descricao: 'Descrição', data_inicio_prevista: '2026-10-01', data_fim_prevista: '2026-12-31',
    publico: false, unidades_ids: [4, 5, 4], etapas_padrao: [{ ...ETAPA, grupo: 'preparação' }, { acao: '   ' }], etapas_unidade: [ETAPA]
};

const itensDoLote = (...itens) => [/SELECT \* FROM tab_plano_itens WHERE id_item IN/, itens];
const lote = (...etapas) => ({ id_plano: 3, etapas });
const respostasLote = (...itens) => [itensDoLote(...itens), rPlano(), rRecalculo()];
const ap = { data_execucao: '2026-10-14', minutos: 90, descricao: 'Configuração inicial' };
const respostasApontamento = (item = ITEM, extra = []) => [rPlano(), rItem(item), [/SELECT ISNULL\(SUM\(minutos\), 0\) AS total/, [{ total: 60 }]], [/SELECT 1 AS ok FROM tab_plano_item_equipe/, [{ ok: 1 }]], ...extra];
const respostasDetalhe = (cabecalho = {}) => [
    rPlano(),
    [/SELECT p\.\*, pj\.nome_projeto, pr\.nome_produto/, [{ ...PLANO, ...PLANO_BASE, ...cabecalho }]],
    [/SELECT d\.\*, u\.nome_unidade/, [{ id_plano: 3, id_unidade: 4, status_unidade: 'A INICIAR', nome_unidade: 'UBS Central' }]],
    [/SELECT \* FROM tab_plano_itens WHERE id_plano = @id ORDER BY CASE/, ITENS_BASE],
    [/SELECT e\.id_item, e\.id_usuario, us\.nome_completo/, [{ id_item: 10, id_usuario: 1, nome_nome: 'x', nome_completo: 'carlos de souza lima' }]]
];

const casos = [
    // ---------- listas e consultas ----------
    { nome: 'buscar como administrador', url: '/plano-acao/buscar', respostas: respostasBase },
    { nome: 'buscar com filtros como gestor', url: '/plano-acao/buscar?data=2026-09-01&projeto=2&status=EM%20ANDAMENTO&busca=alfa', ...comPerfil('Gestor', respostasBase) },
    { nome: 'buscar como implantador (editar pela lotação, excluir só se criador)', url: '/plano-acao/buscar', ...comPerfil('Implantador', respostasBase) },
    { nome: 'buscar sem planos', url: '/plano-acao/buscar', respostas: [[/FROM tab_plano_acao p LEFT JOIN/, []]] },
    { nome: 'buscar sem permissão', url: '/plano-acao/buscar', ...comPerfil('Visitante') },
    { nome: 'painel completo', url: '/plano-acao/painel?id_plano=3&projeto=2&status=EM%20ANDAMENTO&cliente=alfa&dataInicio=2026-09-01&dataFim=2026-10-31', respostas: respostasBase },
    { nome: 'painel sem filtros como gestor', url: '/plano-acao/painel', ...comPerfil('Gestor', respostasBase) },
    { nome: 'painel liberado só pelo módulo do painel', url: '/plano-acao/painel', ...comPerfil('Visitante', respostasBase) },
    { nome: 'painel sem permissão', url: '/plano-acao/painel', ...comPerfil('Estagiario') },
    { nome: 'apontamentos do item', url: '/plano-acao/itens/10/apontamentos', respostas: [rPlano(), rItem(), [/FROM tab_plano_apontamentos a JOIN tab_usuarios us/, [{ id_apontamento: 1, id_usuario: 1, nome_completo: 'ana maria souza', data_execucao: data('2026-10-10'), minutos: 90, descricao: 'x', data_registro: data('2026-10-10'), registrado_por: 1 }]]] },
    { nome: 'apontamentos de item inexistente', url: '/plano-acao/itens/99/apontamentos', respostas: [[/SELECT \* FROM tab_plano_itens WHERE id_item = @id/, []]] },
    { nome: 'apontamentos de plano de outra lotação', url: '/plano-acao/itens/10/apontamentos', ...comPerfil('Gestor', [rPlano({ id_projeto: 9 }), rItem()]) },
    { nome: 'historico', url: '/plano-acao/3/historico', respostas: [rPlano(), [/FROM tab_plano_historico h/, [{ id_historico: 1, id_item: 10, item: 'Configurar', acao: 'ALTERACAO', campo: 'status', valor_anterior: 'A Iniciar', valor_novo: 'Em andamento', data_hora: data('2026-10-10'), usuario: 'ana maria souza' }]]] },
    { nome: 'historico de plano inexistente', url: '/plano-acao/99/historico', respostas: [rSemPlano] },
    { nome: 'historico com id inválido', url: '/plano-acao/abc/historico' },
    { nome: 'equipe disponível', url: '/plano-acao/3/equipe-disponivel', respostas: [rPlano(), [/FROM tab_usuarios u LEFT JOIN tab_funcoes f ON f\.id_funcao = u\.id_funcao CROSS JOIN/, [{ id_usuario: 1, nome_completo: 'ana maria souza', nome_funcao: 'Analista', ativo: 1, da_lotacao: 1 }, { id_usuario: 2, nome_completo: 'JOÃO', nome_funcao: null, ativo: 0, da_lotacao: 0 }]]] },
    { nome: 'detalhe do plano', url: '/plano-acao/3', respostas: respostasDetalhe() },
    { nome: 'detalhe com link público e criador', url: '/plano-acao/3', ...comPerfil('Implantador', respostasDetalhe({ publico: true, criado_por: 1 })) },
    { nome: 'detalhe de outra lotação', url: '/plano-acao/3', ...comPerfil('Gestor', [rPlano({ id_projeto: 9 })]) },
    { nome: 'detalhe inexistente', url: '/plano-acao/99', respostas: [rSemPlano] },

    // ---------- criar plano ----------
    { nome: 'criar plano completo', metodo: 'POST', url: '/plano-acao/salvar', corpo: NOVO_PLANO, respostas: [rIdPlano, rIdItem] },
    { nome: 'criar plano público', metodo: 'POST', url: '/plano-acao/salvar', corpo: { ...NOVO_PLANO, publico: true }, respostas: [rIdPlano, rIdItem] },
    { nome: 'criar plano vazio', metodo: 'POST', url: '/plano-acao/salvar', corpo: { titulo: ' Plano vazio ', id_projeto: '2' }, respostas: [rIdPlano] },
    { nome: 'criar plano como gestor na própria lotação', metodo: 'POST', url: '/plano-acao/salvar', corpo: { titulo: 'Plano G', id_projeto: 2 }, ...comPerfil('Gestor', [rIdPlano]) },
    { nome: 'criar plano em projeto de outra lotação', metodo: 'POST', url: '/plano-acao/salvar', corpo: { titulo: 'Plano G', id_projeto: 9 }, ...comPerfil('Gestor') },
    { nome: 'criar plano sem permissão de novo', metodo: 'POST', url: '/plano-acao/salvar', corpo: NOVO_PLANO, ...comPerfil('Implantador') },
    { nome: 'criar plano sem título', metodo: 'POST', url: '/plano-acao/salvar', corpo: { id_projeto: 2 } },
    { nome: 'criar plano sem projeto', metodo: 'POST', url: '/plano-acao/salvar', corpo: { titulo: 'X' } },
    { nome: 'criar plano com data prevista inválida', metodo: 'POST', url: '/plano-acao/salvar', corpo: { titulo: 'X', id_projeto: 2, data_inicio_prevista: '31/12/2026' } },
    { nome: 'criar plano com fim antes do início', metodo: 'POST', url: '/plano-acao/salvar', corpo: { titulo: 'X', id_projeto: 2, data_inicio_prevista: '2026-12-01', data_fim_prevista: '2026-11-01' } },
    { nome: 'criar plano com erros nas etapas', metodo: 'POST', url: '/plano-acao/salvar', corpo: { titulo: 'X', id_projeto: 2, etapas_padrao: [{ acao: 'A', data_inicio: 'ontem' }, { acao: 'Segunda ação longa para cortar no limite', data_inicio: '2026-10-10', data_fim: '2026-10-01' }], etapas_unidade: [{ acao: 'B', data_fim: 'x' }] } },

    // ---------- apontamentos ----------
    { nome: 'apontar horas no item a iniciar', metodo: 'POST', url: '/plano-acao/itens/10/apontamentos', corpo: ap, respostas: respostasApontamento() },
    { nome: 'apontar horas para outra pessoa em item em andamento', metodo: 'POST', url: '/plano-acao/itens/11/apontamentos', corpo: { ...ap, id_usuario: 2, data_execucao: '2026-10-05' }, respostas: respostasApontamento(ITEM_ANDAMENTO) },
    { nome: 'apontar horas em item em andamento sem data informada', metodo: 'POST', url: '/plano-acao/itens/11/apontamentos', corpo: { minutos: 30 }, respostas: respostasApontamento(ITEM_ANDAMENTO) },
    { nome: 'apontar horas como implantador da lotação', metodo: 'POST', url: '/plano-acao/itens/10/apontamentos', corpo: ap, ...comPerfil('Implantador', respostasApontamento()) },
    { nome: 'apontar horas com data inválida', metodo: 'POST', url: '/plano-acao/itens/10/apontamentos', corpo: { ...ap, data_execucao: '14/10' }, respostas: respostasApontamento() },
    { nome: 'apontar horas em data futura', metodo: 'POST', url: '/plano-acao/itens/10/apontamentos', corpo: { ...ap, data_execucao: '2026-10-20' }, respostas: respostasApontamento() },
    { nome: 'apontar tempo zerado', metodo: 'POST', url: '/plano-acao/itens/10/apontamentos', corpo: { ...ap, minutos: 0 }, respostas: respostasApontamento() },
    { nome: 'apontar tempo acima de 24h', metodo: 'POST', url: '/plano-acao/itens/10/apontamentos', corpo: { ...ap, minutos: 1500 }, respostas: respostasApontamento() },
    { nome: 'apontar em item fechado', metodo: 'POST', url: '/plano-acao/itens/12/apontamentos', corpo: ap, respostas: respostasApontamento(ITEM_FECHADO) },
    { nome: 'apontar acima do teto diário', metodo: 'POST', url: '/plano-acao/itens/10/apontamentos', corpo: { ...ap, minutos: 1400 }, respostas: respostasApontamento() },
    { nome: 'apontar em plano encerrado', metodo: 'POST', url: '/plano-acao/itens/10/apontamentos', corpo: ap, respostas: [rPlano({ status: 'ENCERRADO' }), rItem()] },
    { nome: 'apontar em item inexistente', metodo: 'POST', url: '/plano-acao/itens/99/apontamentos', corpo: ap, respostas: [[/SELECT \* FROM tab_plano_itens WHERE id_item = @id/, []]] },
    { nome: 'apontar sem permissão no módulo', metodo: 'POST', url: '/plano-acao/itens/10/apontamentos', corpo: ap, ...comPerfil('Visitante') },
    { nome: 'excluir apontamento próprio', metodo: 'DELETE', url: '/plano-acao/apontamentos/5', respostas: [[/SELECT \* FROM tab_plano_apontamentos WHERE id_apontamento = @id/, [{ id_apontamento: 5, id_item: 10, id_plano: 3, id_usuario: 1, registrado_por: 1, minutos: 90, data_execucao: data('2026-10-10') }]], rPlano()] },
    { nome: 'excluir apontamento de outra pessoa como gestor', metodo: 'DELETE', url: '/plano-acao/apontamentos/5', ...comPerfil('Gestor', [[/SELECT \* FROM tab_plano_apontamentos WHERE id_apontamento = @id/, [{ id_apontamento: 5, id_item: 10, id_plano: 3, id_usuario: 8, registrado_por: 8, minutos: 30, data_execucao: data('2026-10-10') }]], rPlano()]) },
    { nome: 'excluir apontamento inexistente', metodo: 'DELETE', url: '/plano-acao/apontamentos/99', respostas: [[/SELECT \* FROM tab_plano_apontamentos WHERE id_apontamento = @id/, []]] },
    { nome: 'excluir apontamento de plano encerrado', metodo: 'DELETE', url: '/plano-acao/apontamentos/5', respostas: [[/SELECT \* FROM tab_plano_apontamentos WHERE id_apontamento = @id/, [{ id_apontamento: 5, id_item: 10, id_plano: 3, id_usuario: 1, registrado_por: 1, minutos: 90, data_execucao: data('2026-10-10') }]], rPlano({ status: 'ENCERRADO' })] },

    // ---------- itens ----------
    { nome: 'mover item para cima', metodo: 'POST', url: '/plano-acao/itens/10/mover', corpo: { direcao: 'cima' }, respostas: [rPlano(), rItem(), [/SELECT TOP 1 id_item, ordem FROM tab_plano_itens/, [{ id_item: 9, ordem: 1 }]]] },
    { nome: 'mover item para baixo com a mesma ordem', metodo: 'POST', url: '/plano-acao/itens/10/mover', corpo: { direcao: 'baixo' }, respostas: [rPlano(), rItem(), [/SELECT TOP 1 id_item, ordem FROM tab_plano_itens/, [{ id_item: 14, ordem: 2 }]]] },
    { nome: 'mover item de unidade para cima', metodo: 'POST', url: '/plano-acao/itens/13/mover', corpo: { direcao: 'cima' }, respostas: [rPlano(), rItem({ ...ITEM_ATRASADO, ordem: null }), [/SELECT TOP 1 id_item, ordem FROM tab_plano_itens/, [{ id_item: 9, ordem: null }]]] },
    { nome: 'mover item sem vizinho', metodo: 'POST', url: '/plano-acao/itens/10/mover', corpo: { direcao: 'baixo' }, respostas: [rPlano(), rItem(), [/SELECT TOP 1 id_item, ordem FROM tab_plano_itens/, []]] },
    { nome: 'mover item em plano encerrado', metodo: 'POST', url: '/plano-acao/itens/10/mover', corpo: { direcao: 'cima' }, respostas: [rPlano({ status: 'ENCERRADO' }), rItem()] },
    { nome: 'excluir item sem apontamentos', metodo: 'DELETE', url: '/plano-acao/itens/10', respostas: [rPlano(), rItem(), rContagem(/SELECT COUNT\(\*\) AS n FROM tab_plano_apontamentos/, { n: 0 }), rRecalculo()] },
    { nome: 'excluir item com apontamentos pede confirmação', metodo: 'DELETE', url: '/plano-acao/itens/10', respostas: [rPlano(), rItem(), rContagem(/SELECT COUNT\(\*\) AS n FROM tab_plano_apontamentos/, { n: 2 })] },
    { nome: 'excluir item com apontamentos forçando', metodo: 'DELETE', url: '/plano-acao/itens/10?forcar=1', respostas: [rPlano(), rItem(), rContagem(/SELECT COUNT\(\*\) AS n FROM tab_plano_apontamentos/, { n: 2 }), rRecalculo('CONCLUÍDO', 2, 2)] },
    { nome: 'incluir item após outro', metodo: 'POST', url: '/plano-acao/3/itens', corpo: { descricao: ' Nova ação ', modulo: 'Cadastro', grupo: 'etapa x', responsavel: 'Ana', cliente: 'C', prioridade: 'Baixa', data_inicio: '2026-10-01', data_fim: '2026-10-10', apos_id_item: 10 }, respostas: [rPlano(), [/SELECT ordem FROM tab_plano_itens WHERE id_item = @a/, [{ ordem: 4 }]], rIdItem, rRecalculo()] },
    { nome: 'incluir item após outro que não está no contexto', metodo: 'POST', url: '/plano-acao/3/itens', corpo: { descricao: 'Ação', apos_id_item: 10 }, respostas: [rPlano(), [/SELECT ordem FROM tab_plano_itens WHERE id_item = @a/, []], [/SELECT ISNULL\(MAX\(ordem\), 0\) \+ 1 AS o/, [{ o: 6 }]], rIdItem, rRecalculo()] },
    { nome: 'incluir item em unidade do plano', metodo: 'POST', url: '/plano-acao/3/itens', corpo: { descricao: 'Ação na unidade', id_unidade: 4 }, respostas: [rPlano(), [/SELECT 1 FROM tab_plano_acao_detalhes WHERE id_plano = @p AND id_unidade = @u/, [{ x: 1 }]], [/SELECT ISNULL\(MAX\(ordem\), 0\) \+ 1 AS o/, [{ o: 1 }]], rIdItem, rRecalculo()] },
    { nome: 'incluir item em unidade que não é do plano', metodo: 'POST', url: '/plano-acao/3/itens', corpo: { descricao: 'Ação', id_unidade: 77 }, respostas: [rPlano(), [/SELECT 1 FROM tab_plano_acao_detalhes WHERE id_plano = @p AND id_unidade = @u/, []]] },
    { nome: 'incluir item sem descrição', metodo: 'POST', url: '/plano-acao/3/itens', corpo: { descricao: '  ' }, respostas: [rPlano()] },
    { nome: 'incluir item com data inválida', metodo: 'POST', url: '/plano-acao/3/itens', corpo: { descricao: 'A', data_fim: '10/10' }, respostas: [rPlano()] },
    { nome: 'incluir item com fim antes do início', metodo: 'POST', url: '/plano-acao/3/itens', corpo: { descricao: 'A', data_inicio: '2026-10-10', data_fim: '2026-10-01' }, respostas: [rPlano()] },
    { nome: 'incluir item em plano encerrado', metodo: 'POST', url: '/plano-acao/3/itens', corpo: { descricao: 'A' }, respostas: [rPlano({ status: 'ENCERRADO' })] },
    { nome: 'incluir item em plano de outra lotação', metodo: 'POST', url: '/plano-acao/3/itens', corpo: { descricao: 'A' }, ...comPerfil('Gestor', [rPlano({ id_projeto: 9 })]) },
    { nome: 'incluir item em plano inexistente', metodo: 'POST', url: '/plano-acao/99/itens', corpo: { descricao: 'A' }, respostas: [rSemPlano] },

    // ---------- grade (lote) ----------
    { nome: 'lote vazio', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: { id_plano: 3, etapas: [] } },
    { nome: 'lote grande demais', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: { id_plano: 3, etapas: Array.from({ length: 3001 }, (_, i) => ({ id_item: i + 1 })) } },
    { nome: 'lote com itens repetidos', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: lote({ id_item: 10 }, { id_item: 10 }) },
    { nome: 'lote com item inexistente', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: lote({ id_item: 10 }, { id_item: 99 }), respostas: [itensDoLote(ITEM)] },
    { nome: 'lote com itens de planos diferentes', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: lote({ id_item: 10 }, { id_item: 11 }), respostas: [itensDoLote(ITEM, { ...ITEM_ANDAMENTO, id_plano: 4 })] },
    { nome: 'lote em plano encerrado', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: lote({ id_item: 10, descricao: 'X' }), respostas: [itensDoLote(ITEM), rPlano({ status: 'ENCERRADO' })] },
    { nome: 'lote com dados inválidos', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: lote({ id_item: 10, descricao: ' ', status: 'Feito', prioridade: 'Urgente', data_inicio: 'x', percentual: 150, tempo_previsto: -5 }, { id_item: 11, data_inicio: '2026-10-20', data_fim: '2026-10-10', data_inicio_real: '2026-10-30', data_fim_real: '2026-10-29', equipe: Array.from({ length: 51 }, (_, i) => i + 1) }), respostas: respostasLote(ITEM, ITEM_ANDAMENTO) },
    { nome: 'lote com data futura e fim realizado antes do início', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: lote({ id_item: 10, data_fim_real: '2026-11-20' }, { id_item: 11, data_inicio_real: '2026-10-12', data_fim_real: '2026-10-11' }), respostas: respostasLote(ITEM, ITEM_ANDAMENTO) },
    { nome: 'lote com alterações de situação, datas e equipe', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: lote(
        { id_item: 10, descricao: 'Novo texto', responsavel: 'Carlos', cliente: '', observacao: 'ok', prioridade: 'Média', status: 'Em andamento', percentual: '30', tempo_previsto: '120', equipe: [1, 2, '3', null], data_inicio: '2026-10-02', data_fim: '2026-10-28' },
        { id_item: 11, data_fim_real: '2026-10-14' },
        { id_item: 12, status: 'Em andamento', percentual: 100 },
        { id_item: 13, data_fim: '2026-10-20', status: 'Atrasado', equipe: [] }
    ), respostas: [...respostasLote(ITEM, ITEM_ANDAMENTO, ITEM_FECHADO, ITEM_ATRASADO), [/SELECT e\.id_item, e\.id_usuario FROM tab_plano_item_equipe e/, [{ id_item: 10, id_usuario: 1 }, { id_item: 13, id_usuario: 4 }]]] },
    { nome: 'lote fechando item sem cronômetro e com prazo vencido', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: lote({ id_item: 10, status: 'Fechado' }, { id_item: 11, data_fim: '2026-10-01' }, { id_item: 12, percentual: null, observacao: null }), respostas: [...respostasLote(ITEM, ITEM_ANDAMENTO, ITEM_FECHADO), rRecalculo('CONCLUÍDO', 4, 4)] },
    { nome: 'lote como implantador da lotação', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: lote({ id_item: 10, descricao: 'Editado pelo implantador' }), ...comPerfil('Implantador', [itensDoLote(ITEM), rPlano(), rRecalculo()]) },
    { nome: 'lote sem permissão no módulo', metodo: 'POST', url: '/plano-acao/atualizar-lote-etapas', corpo: lote({ id_item: 10 }), ...comPerfil('Visitante') },

    // ---------- unidades ----------
    { nome: 'adicionar unidade com etapas do modelo', metodo: 'POST', url: '/plano-acao/adicionar-unidade-etapas', corpo: { id_plano: 3, id_unidade: 6, etapas_template: [ETAPA, { acao: ' ' }] }, respostas: [rPlano(), [/SELECT 1 FROM tab_plano_acao_detalhes WHERE id_plano=@p AND id_unidade=@u/, []], [/SELECT nome_unidade FROM tab_unidades/, [{ nome_unidade: 'UBS Norte' }]], rIdItem, rRecalculo()] },
    { nome: 'adicionar unidade com etapa padrão', metodo: 'POST', url: '/plano-acao/adicionar-unidade-etapas', corpo: { id_plano: 3, id_unidade: 6 }, respostas: [rPlano(), [/SELECT 1 FROM tab_plano_acao_detalhes WHERE id_plano=@p AND id_unidade=@u/, []], [/SELECT nome_unidade FROM tab_unidades/, []], rIdItem, rRecalculo()] },
    { nome: 'adicionar unidade que já existe', metodo: 'POST', url: '/plano-acao/adicionar-unidade-etapas', corpo: { id_plano: 3, id_unidade: 4 }, respostas: [rPlano()] },
    { nome: 'adicionar unidade inválida', metodo: 'POST', url: '/plano-acao/adicionar-unidade-etapas', corpo: { id_plano: 3 }, respostas: [rPlano()] },
    { nome: 'adicionar unidade sem plano', metodo: 'POST', url: '/plano-acao/adicionar-unidade-etapas', corpo: { id_unidade: 4 } },
    { nome: 'adicionar unidade em plano encerrado', metodo: 'POST', url: '/plano-acao/adicionar-unidade-etapas', corpo: { id_plano: 3, id_unidade: 6 }, respostas: [rPlano({ status: 'ENCERRADO' })] },
    { nome: 'remover unidade sem itens iniciados', metodo: 'DELETE', url: '/plano-acao/3/unidades/4', respostas: [rPlano(), [/SUM\(CASE WHEN status <> 'A Iniciar'/, [{ itens: 2, iniciados: 0, apontamentos: 0 }]], rRecalculo()] },
    { nome: 'remover unidade iniciada pede confirmação', metodo: 'DELETE', url: '/plano-acao/3/unidades/4', respostas: [rPlano(), [/SUM\(CASE WHEN status <> 'A Iniciar'/, [{ itens: 2, iniciados: 1, apontamentos: 3 }]]] },
    { nome: 'remover unidade iniciada forçando', metodo: 'DELETE', url: '/plano-acao/3/unidades/4?forcar=1', respostas: [rPlano(), [/SUM\(CASE WHEN status <> 'A Iniciar'/, [{ itens: 2, iniciados: 1, apontamentos: 3 }]], rRecalculo()] },
    { nome: 'remover unidade em plano encerrado', metodo: 'DELETE', url: '/plano-acao/3/unidades/4', respostas: [rPlano({ status: 'ENCERRADO' })] },

    // ---------- encerrar e reabrir ----------
    { nome: 'encerrar plano sem pendências', metodo: 'PUT', url: '/plano-acao/encerrar/3', corpo: {}, respostas: [rPlano(), rContagem(/SELECT COUNT\(\*\) AS n FROM tab_plano_itens WHERE id_plano = @p AND status NOT IN/, { n: 0 })] },
    { nome: 'encerrar plano com pendências e justificativa', metodo: 'PUT', url: '/plano-acao/encerrar/3', corpo: { justificativa: 'Cliente cancelou o contrato' }, respostas: [rPlano(), rContagem(/SELECT COUNT\(\*\) AS n FROM tab_plano_itens WHERE id_plano = @p AND status NOT IN/, { n: 4 })] },
    { nome: 'encerrar plano com pendências sem justificativa', metodo: 'PUT', url: '/plano-acao/encerrar/3', corpo: { justificativa: 'curta' }, respostas: [rPlano(), rContagem(/SELECT COUNT\(\*\) AS n FROM tab_plano_itens WHERE id_plano = @p AND status NOT IN/, { n: 4 })] },
    { nome: 'encerrar plano já encerrado', metodo: 'PUT', url: '/plano-acao/encerrar/3', corpo: {}, respostas: [rPlano({ status: 'ENCERRADO' })] },
    { nome: 'encerrar plano de outra lotação', metodo: 'PUT', url: '/plano-acao/encerrar/3', corpo: {}, ...comPerfil('Gestor', [rPlano({ id_projeto: 9 })]) },
    { nome: 'reabrir plano encerrado', metodo: 'PUT', url: '/plano-acao/reabrir/3', respostas: [rPlano({ status: 'ENCERRADO' }), rRecalculo('EM ANDAMENTO', 3, 1)] },
    { nome: 'reabrir plano que já está aberto', metodo: 'PUT', url: '/plano-acao/reabrir/3', respostas: [rPlano()] },
    { nome: 'reabrir plano inexistente', metodo: 'PUT', url: '/plano-acao/reabrir/99', respostas: [rSemPlano] },

    // ---------- etapas (grupos) ----------
    { nome: 'renomear etapa', metodo: 'PUT', url: '/plano-acao/3/etapas', corpo: { modulo: 'Cadastro', de: 'preparação', para: 'implantação' }, respostas: [rPlano()] },
    { nome: 'renomear etapa sem módulo', metodo: 'PUT', url: '/plano-acao/3/etapas', corpo: { de: 'GERAL', para: 'base' }, respostas: [rPlano()] },
    { nome: 'renomear etapa sem nomes', metodo: 'PUT', url: '/plano-acao/3/etapas', corpo: { modulo: 'Cadastro', de: 'x' }, respostas: [rPlano()] },
    { nome: 'renomear etapa em plano encerrado', metodo: 'PUT', url: '/plano-acao/3/etapas', corpo: { de: 'a', para: 'b' }, respostas: [rPlano({ status: 'ENCERRADO' })] },
    { nome: 'excluir etapa', metodo: 'DELETE', url: '/plano-acao/3/etapas?nome=PREPARA%C3%87%C3%83O&modulo=Cadastro', respostas: [rPlano(), [/SELECT COUNT\(\*\) AS itens,/, [{ itens: 3, apontamentos: 0 }]], rRecalculo()] },
    { nome: 'excluir etapa com apontamentos pede confirmação', metodo: 'DELETE', url: '/plano-acao/3/etapas?nome=GERAL', respostas: [rPlano(), [/SELECT COUNT\(\*\) AS itens,/, [{ itens: 3, apontamentos: 2 }]]] },
    { nome: 'excluir etapa com apontamentos forçando', metodo: 'DELETE', url: '/plano-acao/3/etapas?nome=GERAL&forcar=1', respostas: [rPlano(), [/SELECT COUNT\(\*\) AS itens,/, [{ itens: 3, apontamentos: 2 }]], rRecalculo()] },
    { nome: 'excluir etapa sem nome', metodo: 'DELETE', url: '/plano-acao/3/etapas', respostas: [rPlano()] },

    // ---------- dados do plano, publicação e exclusão ----------
    { nome: 'atualizar dados do plano', metodo: 'PUT', url: '/plano-acao/3', corpo: { titulo: 'Título novo', cliente: 'Outro cliente', descricao: 'Nova', data_inicio_prevista: '2026-09-02', data_fim_prevista: '2026-12-30' }, respostas: [rPlano(), [/SELECT \* FROM tab_plano_acao WHERE id_plano = @id/, [{ ...PLANO_BASE, titulo: 'Implantação Alfa', cliente: null }]]] },
    { nome: 'atualizar dados do plano sem mudanças', metodo: 'PUT', url: '/plano-acao/3', corpo: { titulo: 'Implantação Alfa', cliente: 'Prefeitura Alfa', descricao: 'Plano de teste', data_inicio_prevista: '2026-09-01', data_fim_prevista: '2026-12-31' }, respostas: [rPlano(), [/SELECT \* FROM tab_plano_acao WHERE id_plano = @id/, [PLANO_BASE]]] },
    { nome: 'atualizar plano sem título', metodo: 'PUT', url: '/plano-acao/3', corpo: { titulo: ' ' }, respostas: [rPlano()] },
    { nome: 'atualizar plano com data inválida', metodo: 'PUT', url: '/plano-acao/3', corpo: { titulo: 'X', data_fim_prevista: 'amanhã' }, respostas: [rPlano()] },
    { nome: 'atualizar plano com fim antes do início', metodo: 'PUT', url: '/plano-acao/3', corpo: { titulo: 'X', data_inicio_prevista: '2026-10-10', data_fim_prevista: '2026-10-01' }, respostas: [rPlano()] },
    { nome: 'atualizar plano encerrado', metodo: 'PUT', url: '/plano-acao/3', corpo: { titulo: 'X' }, respostas: [rPlano({ status: 'ENCERRADO' })] },
    { nome: 'publicar plano gera link', metodo: 'POST', url: '/plano-acao/3/publico', corpo: { publico: true }, respostas: [rPlano()] },
    { nome: 'publicar plano mantém o link existente', metodo: 'POST', url: '/plano-acao/3/publico', corpo: { publico: true, regenerar: false }, respostas: [rPlano({ publico: true, token_publico: TOKEN })] },
    { nome: 'regenerar link do plano', metodo: 'POST', url: '/plano-acao/3/publico', corpo: { publico: true, regenerar: true }, respostas: [rPlano({ publico: true, token_publico: TOKEN })] },
    { nome: 'despublicar plano', metodo: 'POST', url: '/plano-acao/3/publico', corpo: { publico: false }, respostas: [rPlano({ publico: true, token_publico: TOKEN })] },
    { nome: 'publicar plano sem corpo', metodo: 'POST', url: '/plano-acao/3/publico', respostas: [rPlano()] },
    { nome: 'excluir plano como administrador', metodo: 'DELETE', url: '/plano-acao/3', respostas: [rPlano({ criado_por: 8 })] },
    { nome: 'excluir plano como implantador criador', metodo: 'DELETE', url: '/plano-acao/3', ...comPerfil('Implantador', [rPlano({ criado_por: 1 })]) },
    { nome: 'excluir plano como implantador que não criou', metodo: 'DELETE', url: '/plano-acao/3', ...comPerfil('Implantador', [rPlano({ criado_por: 8 })]) },
    { nome: 'excluir plano como gestor', metodo: 'DELETE', url: '/plano-acao/3', ...comPerfil('Gestor', [rPlano({ criado_por: 8 })]) },
    { nome: 'excluir plano inexistente', metodo: 'DELETE', url: '/plano-acao/99', respostas: [rSemPlano] },
    { nome: 'excluir plano com id inválido', metodo: 'DELETE', url: '/plano-acao/abc' },

    // ---------- painel público (sem login) ----------
    { nome: 'público: carteira', url: '/publico/plano-acao/painel', anonimo: true, respostas: respostasBase },
    { nome: 'público: carteira de um projeto', url: '/publico/plano-acao/painel?projeto=2', anonimo: true, respostas: respostasBase },
    { nome: 'público: carteira vazia', url: '/publico/plano-acao/painel?projeto=abc', anonimo: true, respostas: [[/FROM tab_plano_acao p LEFT JOIN/, []]] },
    { nome: 'público: plano pelo link', url: `/publico/plano-acao/painel/${TOKEN.toLowerCase()}`, anonimo: true, respostas: respostasBase },
    { nome: 'público: link inválido', url: '/publico/plano-acao/painel/nao-e-um-uuid', anonimo: true },
    { nome: 'público: link revogado', url: `/publico/plano-acao/painel/${TOKEN.toLowerCase()}`, anonimo: true, respostas: [[/FROM tab_plano_acao p LEFT JOIN/, []]] }
];

caracterizar('planoAcao', casos);
