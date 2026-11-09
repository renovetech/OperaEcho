/* SIGTAP: consulta pública (competências, filtros, procedimentos, compatibilidades, tabelas auxiliares)
 * e importação (resumo, histórico, upload do .zip, remoção de competência).
 * Não há ZIP real: o envio do arquivo é coberto só pelas recusas (sem arquivo e sem permissão). */
const { caracterizar } = require('../apoio/caracterizacao');

const COMPETENCIA = '202610';
const DATA_FIM = new Date('2026-10-15T12:00:00.000Z');

const regraLeitura = [{ nome_modulo: 'parametros', pode_acessar: true, pode_novo: false, pode_editar: false }];
const PERFIL_LEITURA = { perfil: 'Leitor SIGTAP', respostas: [[/FROM tab_regras_acesso/, regraLeitura]] };
const PERFIL_SEM_ACESSO = { perfil: 'Sem acesso SIGTAP', respostas: [[/FROM tab_regras_acesso/, []]] };

const comp = [[/FROM tab_sigtap_importacao i WHERE/, [
    { competencia: COMPETENCIA, dt_fim: DATA_FIM, usuario: 'Ana', arquivo: 'Tabela.zip', qt_procedimentos: 4500 },
    { competencia: '202609', dt_fim: new Date('2026-09-15T12:00:00.000Z'), usuario: 'Ana', arquivo: 'Antiga.zip', qt_procedimentos: 4400 }
]]];
const semCompetencia = [[/FROM tab_sigtap_importacao i WHERE/, []]];

const importacao = {
    id_importacao: 5, arquivo: 'Tabela.zip', competencia: COMPETENCIA, situacao: 'CONCLUIDA', usuario: 'Ana', removida: false, mensagem: null,
    qt_procedimentos: 4500, qt_novos: 10, qt_compatibilidades: 100, qt_registros: 9000, inicio: '15/10/2026 10:00:00', fim: '15/10/2026 10:05:00', duracao_seg: 300
};
const emAndamento = { ...importacao, id_importacao: 6, situacao: 'PROCESSANDO', fim: null };

const paginaProcedimentos = [/WITH pagina AS \( SELECT p\.co_procedimento, COUNT/, [
    { co_procedimento: '0101010010', no_procedimento: 'ATIVIDADE EDUCATIVA', tp_complexidade: '0', tp_sexo: 'I', co_financiamento: '01', no_financiamento: 'PAB', vl_sa: 1.5, vl_sh: 0, vl_sp: 0, total_geral: 42, registros: '01,02' }
]];
const fichaBase = [/SELECT p\.\*, g\.no_grupo/, [{ co_procedimento: '0101010010', no_procedimento: 'ATIVIDADE EDUCATIVA', no_grupo: 'ACOES', ds_procedimento: 'Descricao' }]];
const nomesRegistro = [/^SELECT co_registro AS codigo, no_registro AS nome FROM tab_sigtap_tb_registro WHERE competencia = @c$/, [{ codigo: '01', nome: 'BPA' }]];
const paginaCompatibilidades = [/WITH pagina AS \( SELECT x\.co_procedimento_principal/, [
    { principal: '0101010010', nome_principal: 'A', reg_principal: '01', secundario: '0101010028', nome_secundario: 'B', reg_compativel: '02', tipo: '1', quantidade: 1, total_geral: 7 }
]];
const paginaTabela = [/WITH base AS/, [{ codigo: '01', nome: 'Grupo', total_geral: 3, qt_procedimentos: 12 }]];

const ver = (extra = []) => [...comp, ...extra];

const casos = [
    { nome: 'tabelas: lista pública', url: '/sigtap/tabelas', anonimo: true },
    { nome: 'competencias: pública', url: '/sigtap/competencias', anonimo: true, respostas: comp },
    { nome: 'competencias: nenhuma importada', url: '/sigtap/competencias', anonimo: true, respostas: semCompetencia },
    { nome: 'filtros: competência pedida', url: `/sigtap/filtros?competencia=${COMPETENCIA}`, anonimo: true, respostas: comp },
    { nome: 'filtros: competência inexistente cai na mais recente', url: '/sigtap/filtros?competencia=199901', anonimo: true, respostas: comp },
    { nome: 'filtros: sem importação', url: '/sigtap/filtros', anonimo: true, respostas: semCompetencia },
    { nome: 'procedimentos: padrão', url: '/sigtap/procedimentos', anonimo: true, respostas: ver([paginaProcedimentos]) },
    { nome: 'procedimentos: busca por palavras e ordem', url: '/sigtap/procedimentos?q=atividade%20educativa&ordem=nome&pagina=2&tamanho=10', anonimo: true, respostas: ver([paginaProcedimentos]) },
    { nome: 'procedimentos: busca por código', url: '/sigtap/procedimentos?q=01.01.01&ordem=valor_amb&valor_min=10.5', anonimo: true, respostas: ver([paginaProcedimentos]) },
    { nome: 'procedimentos: filtros combinados', url: '/sigtap/procedimentos?forma=010101&financiamento=01&complexidade=1&sexo=M&registro=01&modalidade=02&vinculo=cid&codigo=A00&ordem=valor_hosp&tamanho=999&pagina=-3', anonimo: true, respostas: ver([paginaProcedimentos]) },
    { nome: 'procedimentos: vínculo desconhecido é ignorado', url: '/sigtap/procedimentos?vinculo=xyz&codigo=1&grupo=01', anonimo: true, respostas: ver([paginaProcedimentos]) },
    { nome: 'procedimentos: sem importação', url: '/sigtap/procedimentos', anonimo: true, respostas: semCompetencia },
    { nome: 'ficha: procedimento', url: `/sigtap/procedimentos/01.01.01.001-0?competencia=${COMPETENCIA}`, anonimo: true, respostas: ver([fichaBase, nomesRegistro]) },
    { nome: 'ficha: código curto', url: '/sigtap/procedimentos/0101', anonimo: true, respostas: comp },
    { nome: 'ficha: sem importação', url: '/sigtap/procedimentos/0101010010', anonimo: true, respostas: semCompetencia },
    { nome: 'ficha: não encontrado na competência', url: '/sigtap/procedimentos/0101010010', anonimo: true, respostas: ver([[/SELECT p\.\*, g\.no_grupo/, []]]) },
    { nome: 'compatibilidades/tipos', url: '/sigtap/compatibilidades/tipos', anonimo: true, respostas: comp },
    { nome: 'compatibilidades/tipos: sem importação', url: '/sigtap/compatibilidades/tipos', anonimo: true, respostas: semCompetencia },
    { nome: 'compatibilidades: padrão', url: '/sigtap/compatibilidades', anonimo: true, respostas: ver([paginaCompatibilidades]) },
    { nome: 'compatibilidades: filtros', url: '/sigtap/compatibilidades?tipo=01-02-1&principal=consulta&secundario=0101&pagina=2&tamanho=5', anonimo: true, respostas: ver([paginaCompatibilidades]) },
    { nome: 'compatibilidades: tipo malformado é ignorado', url: '/sigtap/compatibilidades?tipo=x-y-z', anonimo: true, respostas: ver([paginaCompatibilidades]) },
    { nome: 'compatibilidades: sem importação', url: '/sigtap/compatibilidades', anonimo: true, respostas: semCompetencia },
    { nome: 'tabela auxiliar: grupo', url: '/sigtap/tabelas/grupo', anonimo: true, respostas: ver([paginaTabela]) },
    { nome: 'tabela auxiliar: servico com busca', url: '/sigtap/tabelas/servico?q=ambulatorial&pagina=2', anonimo: true, respostas: ver([paginaTabela]) },
    { nome: 'tabela auxiliar: cid com código', url: '/sigtap/tabelas/cid?q=A00&tamanho=5', anonimo: true, respostas: ver([paginaTabela]) },
    { nome: 'tabela auxiliar: inexistente', url: '/sigtap/tabelas/nao-existe', anonimo: true },
    { nome: 'tabela auxiliar: sem importação', url: '/sigtap/tabelas/grupo', anonimo: true, respostas: semCompetencia },

    { nome: 'resumo: administrador', url: '/sigtap/resumo', respostas: ver([
        [/ORDER BY dt_fim DESC, id_importacao DESC/, [importacao]],
        [/WHERE situacao = 'PROCESSANDO' ORDER BY id_importacao DESC/, [emAndamento]]
    ]) },
    { nome: 'resumo: sem importações', url: '/sigtap/resumo', respostas: [...semCompetencia, [/ORDER BY dt_fim DESC, id_importacao DESC/, []], [/WHERE situacao = 'PROCESSANDO'/, []]] },
    { nome: 'resumo: perfil com leitura', url: '/sigtap/resumo', ...PERFIL_LEITURA, respostas: [...PERFIL_LEITURA.respostas, ...semCompetencia] },
    { nome: 'resumo: sem permissão', url: '/sigtap/resumo', ...PERFIL_SEM_ACESSO },
    { nome: 'resumo: sem login', url: '/sigtap/resumo', anonimo: true },
    { nome: 'importacoes: listar', url: '/sigtap/importacoes', respostas: [[/COUNT\(\*\) OVER\(\) AS total_geral FROM tab_sigtap_importacao/, [{ ...importacao, total_geral: 12 }, { ...emAndamento, total_geral: 12 }]]] },
    { nome: 'importacoes: filtros e paginação', url: '/sigtap/importacoes?competencia=2026-10&situacao=ERRO&pagina=3&tamanho=7', respostas: [[/COUNT\(\*\) OVER\(\) AS total_geral FROM tab_sigtap_importacao/, []]] },
    { nome: 'importacoes: situação desconhecida é ignorada', url: '/sigtap/importacoes?situacao=XYZ&tamanho=1', respostas: [[/COUNT\(\*\) OVER\(\) AS total_geral FROM tab_sigtap_importacao/, []]] },
    { nome: 'importacoes: sem permissão', url: '/sigtap/importacoes', ...PERFIL_SEM_ACESSO },
    { nome: 'importacoes: detalhe', url: '/sigtap/importacoes/5', respostas: [[/WHERE id_importacao = @id$/, [importacao]]] },
    { nome: 'importacoes: detalhe em andamento', url: '/sigtap/importacoes/6', respostas: [[/WHERE id_importacao = @id$/, [emAndamento]]] },
    { nome: 'importacoes: detalhe inexistente', url: '/sigtap/importacoes/999', respostas: [[/WHERE id_importacao = @id$/, []]] },

    { nome: 'importar: sem arquivo (multipart)', metodo: 'POST', url: '/sigtap/importacoes', formulario: { observacao: 'x' } },
    { nome: 'importar: arquivo enviado como texto', metodo: 'POST', url: '/sigtap/importacoes', formulario: { arquivo: 'nao-e-arquivo' } },
    { nome: 'importar: sem arquivo (JSON)', metodo: 'POST', url: '/sigtap/importacoes', corpo: {} },
    { nome: 'importar: perfil só de leitura', metodo: 'POST', url: '/sigtap/importacoes', corpo: {}, ...PERFIL_LEITURA },
    { nome: 'importar: sem login', metodo: 'POST', url: '/sigtap/importacoes', corpo: {}, anonimo: true },

    { nome: 'remover competência', metodo: 'DELETE', url: `/sigtap/competencias/${COMPETENCIA}`, respostas: [[/DELETE TOP/, []]] },
    { nome: 'remover competência com pontuação', metodo: 'DELETE', url: '/sigtap/competencias/2026-09', respostas: [[/DELETE TOP/, []]] },
    { nome: 'remover competência inválida', metodo: 'DELETE', url: '/sigtap/competencias/12' },
    { nome: 'remover competência: perfil só de leitura', metodo: 'DELETE', url: `/sigtap/competencias/${COMPETENCIA}`, ...PERFIL_LEITURA },
    { nome: 'remover competência: sem login', metodo: 'DELETE', url: `/sigtap/competencias/${COMPETENCIA}`, anonimo: true }
];

caracterizar('sigtap', casos);
