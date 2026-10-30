/* utils/parametros.js
 * Leitura dos parâmetros do sistema (tab_parametros) com cache curto.
 * Valores padrão garantem o comportamento atual caso a tabela ainda não exista. */
const { connectToDb } = require('../config/database');

const PADROES = {
    anexo_obrigatorio_implantacao: '1',
    anexo_obrigatorio_projetos: '1',
    horas_obrigatorias_implantacao: '1',
    horas_obrigatorias_projetos: '1',
    equipe_apoio_obrigatoria_implantacao: '1',
    equipe_apoio_obrigatoria_projetos: '1'
};

// "08:30" / "120:45" / "1500:00" válidos (h:mm, até 4 dígitos de hora) - mesma máscara da web e do app.
// Coluna tempo_gasto é varchar(10) em tab_atividades e tab_proj_atividades.
const HORA_VALIDA = /^\d{2,4}:[0-5]\d$/;

/** Regras de obrigatoriedade do Registro de Atividades por módulo ('implantacao' | 'projetos'). */
async function regrasRegistro(modulo) {
    const p = await carregarParametros();
    const on = (k) => p[`${k}_${modulo}`] === '1' || p[`${k}_${modulo}`] === 'true';
    return { anexo: on('anexo_obrigatorio'), horas: on('horas_obrigatorias'), equipeApoio: on('equipe_apoio_obrigatoria') };
}

const TTL = 30 * 1000;
let cache = { em: 0, valores: null };

async function carregarParametros() {
    if (cache.valores && Date.now() - cache.em < TTL) return cache.valores;
    const valores = { ...PADROES };
    try {
        const pool = await connectToDb();
        const r = await pool.request().query('SELECT chave, valor FROM tab_parametros');
        r.recordset.forEach(p => { valores[p.chave] = p.valor; });
    } catch (e) {
        // Tabela ausente (patch não aplicado): segue com os padrões.
    }
    cache = { em: Date.now(), valores };
    return valores;
}

async function parametroAtivo(chave) {
    const v = (await carregarParametros())[chave];
    return v === '1' || v === 'true';
}

function limparCacheParametros() { cache = { em: 0, valores: null }; }

module.exports = { PADROES, HORA_VALIDA, carregarParametros, parametroAtivo, regrasRegistro, limparCacheParametros };
