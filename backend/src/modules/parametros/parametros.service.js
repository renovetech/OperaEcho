/*
 * Leitura dos parâmetros do sistema (tab_parametros) com cache curto.
 * Valores padrão garantem o comportamento atual caso a tabela ainda não exista. */
const repositorio = require('./parametros.repository');

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
        const linhas = await repositorio.listarValores();
        linhas.forEach(p => { valores[p.chave] = p.valor; });
    } catch (e) {
        // Tabela ausente (patch não aplicado): segue com os padrões.
    }
    cache = { em: Date.now(), valores };
    return valores;
}

function limparCacheParametros() { cache = { em: 0, valores: null }; }

const CHAVES = Object.keys(PADROES);
const VERDADEIROS = [true, '1', 1];
const FALSOS = [false, '0', 0];

/** Verdadeiro/falso viram '1'/'0'; qualquer outro valor vira texto de até 500 caracteres. */
function normalizarValor(valor) {
    if (VERDADEIROS.includes(valor)) return '1';
    if (FALSOS.includes(valor)) return '0';
    return String(valor ?? '').slice(0, repositorio.TAMANHO_VALOR);
}

/** Descarta as chaves desconhecidas: só as de PADROES podem ser gravadas. */
function parametrosValidos(itens) {
    const lista = Array.isArray(itens) ? itens : [];
    return lista.filter(p => CHAVES.includes(p.chave)).map(p => ({ chave: p.chave, valor: normalizarValor(p.valor) }));
}

const nomeDoResponsavel = (usuario) => String(usuario?.nome_completo || usuario?.nome || usuario?.usuario || 'Sistema').slice(0, repositorio.TAMANHO_USUARIO);

/** Grava e devolve os parâmetros já recarregados. */
async function salvarParametros(parametros, usuario) {
    await repositorio.gravar(parametros, nomeDoResponsavel(usuario));
    limparCacheParametros();
    return carregarParametros();
}

module.exports = { PADROES, HORA_VALIDA, carregarParametros, regrasRegistro, limparCacheParametros, parametrosValidos, salvarParametros };
