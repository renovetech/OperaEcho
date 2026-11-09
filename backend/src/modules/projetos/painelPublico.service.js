/*
 * Painel público do projeto (operaecho.com/<slug>): monta a resposta sanitizada e guarda um cache curto por slug.
 * Regras:
 *  - Só responde para projetos com painel_publico = 1 e ativo = 1.
 *  - Dados sanitizados: nenhuma pessoa (nome, matrícula, equipe), nenhum anexo, nenhum redmine.
 *    Atividades vão agregadas por unidade/dia/motivo. */
const { connectToDb } = require('../../config/database');
const repositorio = require('./painelPublico.repository');

const CACHE_TTL = 60 * 1000;
const MINUTOS_POR_HORA = 60;
const ORIGEM_PROJETOS = 1;
const ORIGEM_IMPLANTACAO = 0;
const TAMANHO_DATA = 10;
const cache = new Map(); // slug -> { em, dados }

// "08:30" / "8:30" / "08:30:00" -> minutos. Vazio/ inválido -> 0.
function minutos(tempo) {
    const m = String(tempo || '').trim().match(/^(\d{1,4}):(\d{2})/);
    return m ? parseInt(m[1], 10) * MINUTOS_POR_HORA + parseInt(m[2], 10) : 0;
}
const lista = (texto) => String(texto || '').split(',').map(x => x.trim()).filter(Boolean);
const iso = (data) => (data instanceof Date ? data.toISOString().slice(0, TAMANHO_DATA) : (data ? String(data).slice(0, TAMANHO_DATA) : null));

/** UF predominante (para o contorno dos municípios no mapa). */
function ufPredominante(unidades) {
    const ufs = {};
    unidades.forEach(u => { if (u.uf) ufs[u.uf] = (ufs[u.uf] || 0) + 1; });
    return Object.entries(ufs).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/** Sem coordenada própria, usa a da cidade e marca como aproximada. */
function unidadePublica({ ids_produtos: idsProdutos, lat_cidade: latCidade, lng_cidade: lngCidade, ...u }) {
    const propria = u.latitude !== null && u.longitude !== null;
    return {
        ...u,
        latitude: propria ? Number(u.latitude) : (latCidade !== null ? Number(latCidade) : null),
        longitude: propria ? Number(u.longitude) : (lngCidade !== null ? Number(lngCidade) : null),
        aproximada: !propria,
        produtos: idsProdutos ? idsProdutos.split(',').map(Number) : []
    };
}

async function montarPainel(pool, slug) {
    const projeto = await repositorio.projetoPublico(pool, slug);
    if (!projeto) return null;

    const { macros, micros, unidades, produtos, tipos, atividades } = await repositorio.dadosDoPainel(pool, projeto.id_projeto);
    const idsUnidades = new Set(unidades.map(u => u.id_unidade));

    // Atividades compactas: [id_unidade, inicio, fim, origem(0 impl/1 proj), [motivos], [produtos], minutos]
    const atividadesCompactas = atividades
        .filter(a => idsUnidades.has(a.id_unidade))
        .map(a => [a.id_unidade, iso(a.di), iso(a.df), a.origem === 'projetos' ? ORIGEM_PROJETOS : ORIGEM_IMPLANTACAO,
            lista(a.motivos), lista(a.produtos_trabalhados), minutos(a.tempo_gasto)]);

    return {
        projeto: { nome: projeto.nome_projeto, slug, uf: ufPredominante(unidades) },
        gerado_em: new Date().toISOString(),
        regioes: macros.map(m => ({ ...m, micros: micros.filter(x => x.id_macro === m.id_macro) })),
        produtos,
        tipos: tipos.filter(t => unidades.some(u => u.id_tipo_unidade === t.id_tipo_unidade)),
        unidades: unidades.map(unidadePublica),
        atividades: atividadesCompactas
    };
}

/** Painel do endereço, do cache quando recente; nulo se o projeto não está público. */
async function painelDoSlug(slug) {
    const guardado = cache.get(slug);
    if (guardado && Date.now() - guardado.em < CACHE_TTL) return guardado.dados;
    const pool = await connectToDb();
    const dados = await montarPainel(pool, slug);
    if (!dados) { cache.delete(slug); return null; }
    cache.set(slug, { em: Date.now(), dados });
    return dados;
}

const limparCachePainel = () => cache.clear();

module.exports = { painelDoSlug, limparCachePainel };
