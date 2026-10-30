/* middlewares/validarDatas.js
 * Valida parâmetros de data da query string antes de chegarem ao SQL Server.
 * Ex.: "20226-08-01" (ano digitado com 5 dígitos) gerava RequestError "Out of range".
 */
const CHAVES = /^(data|inicio|fim|dataInicio|dataFim|data_inicio|data_fim|dt|dtInicio|dtFim)$/i;

function dataValida(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (!m) return false;
    const [a, mes, dia] = [+m[1], +m[2], +m[3]];
    if (a < 1900 || a > 2100 || mes < 1 || mes > 12 || dia < 1) return false;
    return dia <= new Date(Date.UTC(a, mes, 0)).getUTCDate();
}

function validarDatasQuery(req, res, next) {
    for (const [k, v] of Object.entries(req.query || {})) {
        if (!CHAVES.test(k) || v === '' || v == null || v === 'Todos') continue;
        if (Array.isArray(v) || !dataValida(v)) {
            return res.status(400).json({ erro: `Data inválida em "${k}": ${String(v).slice(0, 20)}. Use o formato dd/mm/aaaa com ano entre 1900 e 2100.` });
        }
    }
    next();
}

// Relatórios e painéis: período máximo de consulta (mesma regra da web em src/periodo.js).
const PERIODO_MAXIMO_DIAS = 365;
const ROTAS_COM_LIMITE = /^\/(relatorios\/|dashboard\/(estatisticas-produtividade|mapa-implantacao|produtividade-produtos|detalhe-produtividade|metricas-implantacao|produtos-detalhes))/i;
const diaUTC = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v)); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };

function limitarPeriodoRelatorios(req, res, next) {
    if (req.method !== 'GET' || !ROTAS_COM_LIMITE.test(req.path)) return next();
    const { dataInicio, dataFim } = req.query || {};
    if (!dataInicio && !dataFim) return next();
    if (!dataInicio || !dataFim) return res.status(400).json({ erro: 'Informe a data inicial e a data final do período.' });
    const a = diaUTC(dataInicio), b = diaUTC(dataFim);
    if (a === null || b === null) return next(); // formato já tratado por validarDatasQuery
    if (b < a) return res.status(400).json({ erro: 'A data final não pode ser anterior à inicial.' });
    const dias = Math.round((b - a) / 86400000);
    if (dias > PERIODO_MAXIMO_DIAS) {
        return res.status(400).json({ erro: `Período de ${dias} dias acima do máximo permitido (${PERIODO_MAXIMO_DIAS} dias).` });
    }
    next();
}

module.exports = { validarDatasQuery, dataValida, limitarPeriodoRelatorios, PERIODO_MAXIMO_DIAS };
