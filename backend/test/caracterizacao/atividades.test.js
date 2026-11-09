/* Registro de Atividades: Implantação e Projetos rodam os MESMOS casos, para a base mostrar cada ponto em que divergem. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { caracterizar, SESSAO, regra, comRegras, comParametros, anexosNoDisco } = require('../apoio/atividadesEscalas');

const LINHA_ATIVIDADE = {
    id_atividade: 9, data_atividade: '2026-10-05T00:00:00.000Z', data_inicio: '2026-10-05T00:00:00.000Z', data_fim: '2026-10-06T00:00:00.000Z',
    id_implantador: 3, nome_implantador: 'Ana Lima', motivos: 'Treinamento', id_projeto: 2, nome_projeto: 'Projeto Dois', id_unidade: 5, nome_unidade: 'UBS Centro',
    caminho_arquivo: 'uploads/atividades/a.pdf,legado.pdf', lista_implantadores: '[{"id_usuario":3,"nome_completo":"Ana Lima"}]', lista_equipe_projeto: '[{"id_usuario":8,"nome_completo":"Bia Reis"}]'
};
const listagem = (linhas, total = linhas.length) => [[/SELECT COUNT\(\*\) as total/, [{ total }]], [/SELECT a\.\*/, linhas]];
const LISTAGEM_PADRAO = listagem([LINHA_ATIVIDADE, { ...LINHA_ATIVIDADE, id_atividade: 10, caminho_arquivo: null, lista_implantadores: null, lista_equipe_projeto: null }], 12);

const ANTERIORES = 'uploads/atividades/antigo.pdf?t=abc';
const formulario = (extras = {}) => ({
    data_inicio: '2026-10-05', data_fim: '2026-10-06', redmine: 'RM-12', profissionais_env: '3', tempo_gasto: '02:30',
    implantadores_ids: [3, 4], equipe_projeto_ids: [], motivos: 'Treinamento, Visita', id_projeto: '2', id_unidade: '5',
    produtos_trabalhados: 'Prontuário, Agenda', arquivos_antigos_mantidos: ANTERIORES, nome_usuario_upload: 'Maria Silva', ...extras
});
const semCampo = (nome) => {
    const { [nome]: _removido, ...resto } = formulario();
    return resto;
};
const REGISTRO_ATUAL = [[/SELECT caminho_arquivo FROM/, [{ caminho_arquivo: 'uploads/atividades/antigo.pdf,legado.pdf' }]], [/SELECT id_projeto FROM tab(_proj)?_atividades/, [{ id_projeto: 2 }]]];
const INSERIDO = [/OUTPUT INSERTED\.id_atividade/, [{ id_atividade: 77 }]];
const PARAMETROS_DESLIGADOS = (sufixo) => comParametros({ [`anexo_obrigatorio_${sufixo}`]: '0', [`horas_obrigatorias_${sufixo}`]: '0', [`equipe_apoio_obrigatoria_${sufixo}`]: '0' });

function casosDeListagem(p, url, mod) {
    const COM_MODULO = comRegras(regra(mod));
    return [
        { nome: `${p}: listar sem o módulo`, url: `${url}/buscar`, perfil: 'Restrito', id: 7, respostas: [comRegras()] },
        { nome: `${p}: listar sem filtros`, url: `${url}/buscar`, respostas: LISTAGEM_PADRAO },
        { nome: `${p}: listar sem resultado`, url: `${url}/buscar`, respostas: listagem([], 0) },
        { nome: `${p}: listar com todos os filtros`, url: `${url}/buscar?id=9&termo=Ana&dataInicio=2026-10-01&dataFim=2026-10-31&id_implantador=3&id_projeto=2&id_unidade=5&motivo=Treino&pagina=2&limite=10`, respostas: LISTAGEM_PADRAO },
        { nome: `${p}: filtros com texto undefined são ignorados`, url: `${url}/buscar?termo=undefined&id_implantador=undefined&id_projeto=undefined&id_unidade=undefined&motivo=undefined`, respostas: LISTAGEM_PADRAO },
        { nome: `${p}: filtros vazios são ignorados`, url: `${url}/buscar?termo=&dataInicio=&dataFim=&id_implantador=&id_projeto=&id_unidade=&motivo=`, respostas: LISTAGEM_PADRAO },
        { nome: `${p}: id de busca não numérico`, url: `${url}/buscar?id=abc&id_projeto=xyz`, respostas: LISTAGEM_PADRAO },
        { nome: `${p}: paginação nos limites`, url: `${url}/buscar?pagina=0&limite=5000`, respostas: LISTAGEM_PADRAO },
        { nome: `${p}: paginação inválida`, url: `${url}/buscar?pagina=abc&limite=-3`, respostas: LISTAGEM_PADRAO },
        { nome: `${p}: data inválida na busca`, url: `${url}/buscar?dataInicio=20226-01-01` },
        { nome: `${p}: listar anônimo`, url: `${url}/buscar`, anonimo: true },
        { nome: `${p}: listar com usuário inativo`, url: `${url}/buscar`, perfil: 'Implantador', id: SESSAO.INATIVO },
        { nome: `${p}: listar como implantador lotado`, url: `${url}/buscar`, perfil: 'Implantador', id: 7, respostas: [COM_MODULO, ...LISTAGEM_PADRAO] },
        { nome: `${p}: listar como analista`, url: `${url}/buscar`, perfil: 'Implantador', id: SESSAO.ANALISTA, respostas: [COM_MODULO, ...LISTAGEM_PADRAO] },
        { nome: `${p}: listar como líder de projeto`, url: `${url}/buscar`, perfil: 'Implantador', id: SESSAO.LIDER, respostas: [COM_MODULO, ...LISTAGEM_PADRAO] },
        { nome: `${p}: listar como operador`, url: `${url}/buscar`, perfil: 'Implantador', id: SESSAO.OPERADOR, respostas: [COM_MODULO, ...LISTAGEM_PADRAO] },
        { nome: `${p}: listar com função de visão global`, url: `${url}/buscar`, perfil: 'Implantador', id: SESSAO.FUNCAO_GLOBAL, respostas: [COM_MODULO, ...LISTAGEM_PADRAO] },
        { nome: `${p}: listar sem lotação`, url: `${url}/buscar`, perfil: 'Implantador', id: SESSAO.SEM_LOTACAO, respostas: [COM_MODULO, ...LISTAGEM_PADRAO] },
        { nome: `${p}: listar com duas lotações`, url: `${url}/buscar`, perfil: 'Implantador', id: SESSAO.DUAS_LOTACOES, respostas: [COM_MODULO, ...LISTAGEM_PADRAO] }
    ];
}

function casosDePermissao(p, url, mod, outroMod) {
    const salvar = { metodo: 'POST', url: `${url}/salvar`, perfil: 'Restrito', id: 7 };
    return [
        { ...salvar, nome: `${p}: salvar anônimo`, anonimo: true, formulario: formulario() },
        { ...salvar, nome: `${p}: data final antes da inicial`, perfil: undefined, id: undefined, formulario: formulario({ data_inicio: '2026-10-06', data_fim: '2026-10-05' }) },
        { ...salvar, nome: `${p}: salvar sem regra nenhuma`, formulario: formulario(), respostas: [comRegras()] },
        { ...salvar, nome: `${p}: salvar com regra só do outro módulo`, formulario: formulario(), respostas: [comRegras(regra(outroMod))] },
        { ...salvar, nome: `${p}: salvar com novo mas sem acessar`, formulario: formulario(), respostas: [comRegras(regra(mod, { acessar: false }))] },
        { ...salvar, nome: `${p}: criar com permissão de novo`, formulario: formulario(), respostas: [comRegras(regra(mod, { editar: false })), INSERIDO] },
        { ...salvar, nome: `${p}: criar só com permissão de editar`, formulario: formulario(), respostas: [comRegras(regra(mod, { novo: false }))] },
        { ...salvar, nome: `${p}: criar só com editar descarta o anexo`, formulario: formulario({ anexos: `recusa-permissao-${p}.pdf` }), respostas: [comRegras(regra(mod, { novo: false }))] },
        { ...salvar, nome: `${p}: editar só com permissão de novo`, formulario: formulario({ id_atividade: '9' }), respostas: [comRegras(regra(mod, { editar: false }))] },
        { ...salvar, nome: `${p}: editar com permissão de editar`, formulario: formulario({ id_atividade: '9' }), respostas: [comRegras(regra(mod, { novo: false })), ...REGISTRO_ATUAL] }
    ];
}

function casosDeEscopo(p, url, mod) {
    const restrito = { metodo: 'POST', url: `${url}/salvar`, perfil: 'Restrito', id: 7 };
    const permissao = comRegras(regra(mod));
    return [
        { ...restrito, nome: `${p}: criar dentro da lotação`, formulario: formulario(), respostas: [permissao, INSERIDO] },
        { ...restrito, nome: `${p}: criar fora da lotação`, formulario: formulario({ id_projeto: '9' }), respostas: [permissao, INSERIDO] },
        ...(p === 'projetos' ? [{ ...restrito, nome: 'projetos: criar em projeto não numérico responde pelo escopo', formulario: formulario({ id_projeto: 'abc' }), respostas: [permissao] }] : []),
        { ...restrito, nome: `${p}: criar sem nenhuma lotação`, id: SESSAO.SEM_LOTACAO, formulario: formulario(), respostas: [permissao, INSERIDO] },
        { ...restrito, nome: `${p}: criar na lotação extra`, id: SESSAO.DUAS_LOTACOES, formulario: formulario({ id_projeto: '9' }), respostas: [permissao, INSERIDO] },
        { ...restrito, nome: `${p}: criar fora da lotação com função global`, id: SESSAO.FUNCAO_GLOBAL, formulario: formulario({ id_projeto: '9' }), respostas: [permissao, INSERIDO] },
        { ...restrito, nome: `${p}: editar registro de outra lotação`, formulario: formulario({ id_atividade: '9' }), respostas: [permissao, [/SELECT caminho_arquivo FROM/, [{ caminho_arquivo: '' }]], [/SELECT id_projeto FROM tab(_proj)?_atividades/, [{ id_projeto: 9 }]]] },
        { ...restrito, nome: `${p}: editar registro da lotação`, formulario: formulario({ id_atividade: '9' }), respostas: [permissao, ...REGISTRO_ATUAL] },
        { ...restrito, nome: `${p}: fora da lotação e com tempo inválido`, formulario: formulario({ id_projeto: '9', tempo_gasto: 'x' }), respostas: [permissao] }
    ];
}

function casosDeCampos(p, url) {
    const salvar = { metodo: 'POST', url: `${url}/salvar` };
    return [
        { ...salvar, nome: `${p}: criar completo`, formulario: formulario(), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: criar com campos opcionais vazios`, formulario: formulario({ data_fim: '', redmine: '', profissionais_env: '', produtos_trabalhados: '' }), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: anexos mantidos só locais`, formulario: formulario({ arquivos_antigos_mantidos: 'http://fora/x.pdf,../../y.pdf,legado.pdf,uploads/atividades/ok.pdf?t=1' }), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: editar mantém anexo legado do registro`, formulario: formulario({ id_atividade: '9', arquivos_antigos_mantidos: 'legado.pdf,outro.pdf,uploads/atividades/antigo.pdf' }), respostas: REGISTRO_ATUAL },
        { ...salvar, nome: `${p}: editar com caminho nulo no registro`, formulario: formulario({ id_atividade: '9' }), respostas: [[/SELECT caminho_arquivo FROM/, [{ caminho_arquivo: null }]], REGISTRO_ATUAL[1]] },
        { ...salvar, nome: `${p}: editar registro inexistente`, formulario: formulario({ id_atividade: '404' }), respostas: [[/SELECT caminho_arquivo FROM/, []], [/SELECT id_projeto FROM tab(_proj)?_atividades/, []]] },
        { ...salvar, nome: `${p}: editar sem linha de anexos mas com linha de projeto`, formulario: formulario({ id_atividade: '9' }), respostas: [[/SELECT caminho_arquivo FROM/, []], REGISTRO_ATUAL[1]] },
        { ...salvar, nome: `${p}: editar inexistente com tempo inválido`, formulario: formulario({ id_atividade: '404', tempo_gasto: 'x' }), respostas: [[/SELECT caminho_arquivo FROM/, []], [/SELECT id_projeto FROM tab(_proj)?_atividades/, []]] },
        { ...salvar, nome: `${p}: editar inexistente sem anexo`, formulario: formulario({ id_atividade: '404', arquivos_antigos_mantidos: '' }), respostas: [[/SELECT caminho_arquivo FROM/, []], [/SELECT id_projeto FROM tab(_proj)?_atividades/, []]] },
        { ...salvar, nome: `${p}: sem data de início`, formulario: semCampo('data_inicio') },
        { ...salvar, nome: `${p}: sem unidade`, formulario: semCampo('id_unidade') },
        { ...salvar, nome: `${p}: sem motivos`, formulario: semCampo('motivos') },
        { ...salvar, nome: `${p}: sem projeto`, formulario: semCampo('id_projeto'), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: sem projeto e sem unidade`, formulario: { ...semCampo('id_projeto'), id_unidade: '' } },
        { ...salvar, nome: `${p}: formulário vazio`, formulario: {} },
        { ...salvar, nome: `${p}: corpo json vazio`, corpo: {} },
        { ...salvar, nome: `${p}: implantadores ausentes`, formulario: semCampo('implantadores_ids') },
        { ...salvar, nome: `${p}: implantadores lista vazia`, formulario: formulario({ implantadores_ids: [] }) },
        { ...salvar, nome: `${p}: implantadores sem id válido`, formulario: formulario({ implantadores_ids: [0, -1, 'x'] }) },
        { ...salvar, nome: `${p}: implantadores com duplicatas`, formulario: formulario({ implantadores_ids: [3, '3', 4, 0] }), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: implantador número em texto`, formulario: formulario({ implantadores_ids: '7' }), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: implantador texto solto`, formulario: formulario({ implantadores_ids: 'abc' }) },
        { ...salvar, nome: `${p}: implantador número seguido de texto`, formulario: formulario({ implantadores_ids: '7x' }), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: implantadores json que não é lista`, formulario: formulario({ implantadores_ids: '{"a":1}' }) },
        { ...salvar, nome: `${p}: implantadores em json como lista`, corpo: { ...formulario(), implantadores_ids: ['3', 'x', 4] }, respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: implantadores em json só com inválidos`, corpo: { ...formulario(), implantadores_ids: ['x'] } },
        { ...salvar, nome: `${p}: implantador em json como número`, corpo: { ...formulario(), implantadores_ids: 5 }, respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: falha no insert desfaz a transação`, formulario: formulario(), respostas: [[/OUTPUT INSERTED\.id_atividade/, []]] }
    ];
}

function casosDeParametros(p, url, sufixo) {
    const salvar = { metodo: 'POST', url: `${url}/salvar` };
    const desligados = PARAMETROS_DESLIGADOS(sufixo);
    const apoio = { motivos: 'Treinamento, Apoio ao Projeto', arquivos_antigos_mantidos: '' };
    return [
        { ...salvar, nome: `${p}: tempo vazio obrigatório`, formulario: formulario({ tempo_gasto: '' }) },
        { ...salvar, nome: `${p}: tempo vazio com parâmetro desligado`, formulario: formulario({ tempo_gasto: '  ' }), respostas: [desligados, INSERIDO] },
        { ...salvar, nome: `${p}: tempo inválido`, formulario: formulario({ tempo_gasto: '2:75' }) },
        { ...salvar, nome: `${p}: tempo inválido com parâmetro desligado`, formulario: formulario({ tempo_gasto: 'abc' }), respostas: [desligados] },
        { ...salvar, nome: `${p}: tempo com espaços e horas altas`, formulario: formulario({ tempo_gasto: ' 1500:00 ' }), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: sem anexo obrigatório`, formulario: formulario({ arquivos_antigos_mantidos: '' }) },
        { ...salvar, nome: `${p}: anexo só com caminho inválido`, formulario: formulario({ arquivos_antigos_mantidos: 'http://fora/x.pdf' }) },
        { ...salvar, nome: `${p}: sem anexo com parâmetro desligado`, formulario: formulario({ arquivos_antigos_mantidos: '' }), respostas: [desligados, INSERIDO] },
        { ...salvar, nome: `${p}: apoio sem equipe`, formulario: formulario(apoio) },
        { ...salvar, nome: `${p}: apoio sem equipe com parâmetro desligado`, formulario: formulario(apoio), respostas: [desligados, INSERIDO] },
        { ...salvar, nome: `${p}: apoio com equipe e sem anexo`, formulario: formulario({ ...apoio, equipe_projeto_ids: [8, 8, 0, 9] }), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: apoio com equipe número em texto`, formulario: formulario({ ...apoio, equipe_projeto_ids: '8' }), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: apoio com equipe texto solto`, formulario: formulario({ ...apoio, equipe_projeto_ids: 'abc' }) },
        { ...salvar, nome: `${p}: apoio com equipe json que não é lista`, formulario: formulario({ ...apoio, equipe_projeto_ids: '{"a":1}' }) },
        { ...salvar, nome: `${p}: apoio com equipe em json como lista`, corpo: { ...formulario(apoio), equipe_projeto_ids: ['8', 'x'] }, respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: apoio com equipe em json como número`, corpo: { ...formulario(apoio), equipe_projeto_ids: 8 }, respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: equipe informada sem motivo de apoio`, formulario: formulario({ equipe_projeto_ids: [8, 9] }), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: editar equipe informada sem motivo de apoio`, formulario: formulario({ id_atividade: '9', equipe_projeto_ids: [8] }), respostas: REGISTRO_ATUAL },
        { ...salvar, nome: `${p}: motivo parecido com apoio não conta`, formulario: formulario({ motivos: 'Apoio ao Projeto X', arquivos_antigos_mantidos: '' }) }
    ];
}

function casosDeAnexos(p, url) {
    const salvar = { metodo: 'POST', url: `${url}/salvar` };
    return [
        { ...salvar, nome: `${p}: criar com anexo novo`, formulario: formulario({ anexos: `novo-${p}-1.pdf,novo-${p}-2.pdf`, arquivos_antigos_mantidos: '' }), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: anexo sem usuário no nome é renomeado`, formulario: formulario({ anexos: `ren-Colaborador-${p}.pdf` }), respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: renomear usa o login quando falta nome`, perfil: 'Administrador', id: 1, formulario: { ...semCampo('nome_usuario_upload'), anexos: `log-Colaborador-${p}.pdf` }, respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: renomear sem nome e sem login`, id: SESSAO.SEM_LOGIN, formulario: { ...semCampo('nome_usuario_upload'), anexos: `sem-Colaborador-${p}.pdf` }, respostas: [INSERIDO] },
        { ...salvar, nome: `${p}: recusa descarta o anexo`, formulario: formulario({ anexos: `recusa-campos-${p}.pdf`, motivos: '' }) },
        { ...salvar, nome: `${p}: recusa por tempo inválido com anexo a renomear`, formulario: formulario({ anexos: `tempo-Colaborador-${p}.pdf`, tempo_gasto: 'x' }) },
        { ...salvar, nome: `${p}: tipo de arquivo não permitido`, formulario: formulario({ anexos: 'virus.exe' }) },
        { ...salvar, nome: `${p}: arquivos demais`, formulario: formulario({ anexos: Array.from({ length: 21 }, (_, i) => `muitos-${p}-${i}.pdf`).join(',') }) }
    ];
}

function casosDeExclusao(p, url, mod, outroMod) {
    const excluir = { metodo: 'DELETE' };
    const naLotacao = [/SELECT id_projeto FROM tab(_proj)?_atividades/, [{ id_projeto: 2 }]];
    const foraDaLotacao = [/SELECT id_projeto FROM tab(_proj)?_atividades/, [{ id_projeto: 9 }]];
    const restrito = { perfil: 'Restrito', id: 7 };
    return [
        { ...excluir, nome: `${p}: excluir`, url: `${url}/9`, respostas: [naLotacao] },
        { ...excluir, nome: `${p}: excluir inexistente`, url: `${url}/404`, respostas: [[/SELECT id_projeto FROM tab(_proj)?_atividades/, []]] },
        { ...excluir, nome: `${p}: excluir id não numérico`, url: `${url}/abc`, respostas: [naLotacao] },
        { ...excluir, nome: `${p}: excluir anônimo`, url: `${url}/9`, anonimo: true },
        { ...excluir, ...restrito, nome: `${p}: excluir sem permissão`, url: `${url}/9`, respostas: [comRegras(regra(mod, { editar: false }))] },
        { ...excluir, ...restrito, nome: `${p}: excluir com regra só do outro módulo`, url: `${url}/9`, respostas: [comRegras(regra(outroMod))] },
        { ...excluir, ...restrito, nome: `${p}: excluir dentro da lotação`, url: `${url}/9`, respostas: [comRegras(regra(mod)), naLotacao] },
        { ...excluir, ...restrito, nome: `${p}: excluir fora da lotação`, url: `${url}/9`, respostas: [comRegras(regra(mod)), foraDaLotacao] },
        { ...excluir, ...restrito, nome: `${p}: excluir sem nenhuma lotação`, url: `${url}/9`, id: SESSAO.SEM_LOTACAO, respostas: [comRegras(regra(mod)), naLotacao] },
        { ...excluir, ...restrito, nome: `${p}: excluir na lotação extra`, url: `${url}/9`, id: SESSAO.DUAS_LOTACOES, respostas: [comRegras(regra(mod)), foraDaLotacao] }
    ];
}

const MODULOS = [
    { p: 'implantacao', url: '/atividades', mod: 'registro_atividades', outroMod: 'proj_registro_atividades', sufixo: 'implantacao' },
    { p: 'projetos', url: '/projetos/atividades', mod: 'proj_registro_atividades', outroMod: 'registro_atividades', sufixo: 'projetos' }
];

const casos = MODULOS.flatMap(({ p, url, mod, outroMod, sufixo }) => [
    ...casosDeListagem(p, url, mod),
    ...casosDeCampos(p, url),
    ...casosDeParametros(p, url, sufixo),
    ...casosDePermissao(p, url, mod, outroMod),
    ...casosDeEscopo(p, url, mod),
    ...casosDeAnexos(p, url),
    ...casosDeExclusao(p, url, mod, outroMod)
]);

caracterizar('atividades', casos);

/* Ao fim de todos os casos: o que foi aceito fica no disco, o recusado foi apagado.
 * "tempo-*-projetos" fica órfão porque Projetos renomeia o anexo antes de validar o tempo e o descarte usa o caminho antigo. */
test('atividades: anexos que restam no disco', () => {
    assert.deepEqual(anexosNoDisco(), [
        'log-teste-implantacao.pdf', 'log-teste-projetos.pdf',
        'novo-implantacao-1.pdf', 'novo-implantacao-2.pdf', 'novo-projetos-1.pdf', 'novo-projetos-2.pdf',
        'ren-Maria-implantacao.pdf', 'ren-Maria-projetos.pdf',
        'sem-Usuario-implantacao.pdf', 'sem-Usuario-projetos.pdf'
    ]);
});
