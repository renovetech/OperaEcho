/* Regras comuns de período e escopo dos relatórios, iguais às telas de Registro de Atividades,
 * para que relatório e registro mostrem SEMPRE o mesmo conjunto de dados. */
const { sql } = require('../../config/database');
const { filtroPorProjeto } = require('../../middlewares/lotacao');

const FUNCOES_LOTACAO = ['ANALISTA', 'LIDER DE PROJETO', 'OPERADOR'];
const funcaoDoUsuario = (req) => ((req.escopo && req.escopo.nome_funcao) || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

// Implantação: isola só as funções vinculadas à lotação. Projetos: sempre isola.
const filtroEscopo = (request, req, coluna, origem) => {
    if (origem === 'projetos') return filtroPorProjeto(request, req.escopo, coluna);
    return FUNCOES_LOTACAO.includes(funcaoDoUsuario(req)) ? filtroPorProjeto(request, req.escopo, coluna) : '';
};

// Atividade de vários dias entra se o intervalo dela toca o período filtrado.
const SQL_INI = 'CAST(ISNULL(a.data_inicio, a.data_atividade) AS DATE)';
const SQL_FIM = 'CAST(ISNULL(a.data_fim, ISNULL(a.data_inicio, a.data_atividade)) AS DATE)';
const filtroPeriodo = (request, di, df) => {
    request.input('di', sql.Date, di);
    request.input('df', sql.Date, df);
    return ` AND ${SQL_FIM} >= @di AND ${SQL_INI} <= @df `;
};

const valido = (v, ...vazios) => v !== undefined && v !== null && v !== '' && v !== 'undefined' && !vazios.includes(v);

module.exports = { filtroEscopo, filtroPeriodo, valido, SQL_FIM, SQL_INI };
