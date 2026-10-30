/* routes/painelProjetoPublico.js
 * ------------------------------------------------------------------------
 * PAINEL PÚBLICO DO PROJETO (operaecho.com/<slug>) - sem login, somente leitura.
 * Regras:
 *  - Só responde para projetos com painel_publico = 1 e ativo = 1.
 *  - Dados sanitizados: nenhuma pessoa (nome, matrícula, equipe), nenhum anexo,
 *    nenhum redmine. Atividades vão agregadas por unidade/dia/motivo.
 *  - Rate limit por IP + cache curto em memória por slug.
 * ------------------------------------------------------------------------ */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { asyncHandler, httpErro } = require('../middlewares/errorHandler');
const { limitar } = require('../utils/rateLimit');
const { FORMATO } = require('../utils/slugPublico');

const limite = limitar({ janelaMs: 60 * 1000, max: 90 });
const CACHE_TTL = 60 * 1000;
const cache = new Map(); // slug -> { em, dados }

// "08:30" / "8:30" / "08:30:00" -> minutos. Vazio/ inválido -> 0.
function minutos(t) {
    const m = String(t || '').trim().match(/^(\d{1,4}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
}
const lista = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d ? String(d).slice(0, 10) : null));

async function montarPainel(pool, slug) {
    const rp = await pool.request().input('s', sql.VarChar(60), slug).query(`
        SELECT id_projeto, nome_projeto FROM tab_projetos
        WHERE slug_publico = @s AND painel_publico = 1 AND ativo = 1`);
    if (!rp.recordset.length) return null;
    const projeto = rp.recordset[0];
    const req = () => pool.request().input('p', sql.Int, projeto.id_projeto);

    const [rReg, rUni, rAtv] = await Promise.all([
        req().query(`
            SELECT id_macro, nome_macro, sigla, cor, ordem FROM tab_macro_regioes
            WHERE id_projeto = @p AND ativo = 1 ORDER BY ordem, nome_macro;
            SELECT mi.id_micro, mi.id_macro, mi.nome_micro, mi.sigla, mi.cor, mi.ordem
            FROM tab_micro_regioes mi JOIN tab_macro_regioes m ON m.id_macro = mi.id_macro
            WHERE m.id_projeto = @p AND m.ativo = 1 AND mi.ativo = 1 ORDER BY mi.ordem, mi.nome_micro;`),
        req().query(`
            SELECT u.id_unidade, u.nome_unidade, u.cnes, u.id_cidade, c.nome_cidade, e.sigla AS uf,
                   u.latitude, u.longitude, c.latitude AS lat_cidade, c.longitude AS lng_cidade,
                   u.id_macro, u.id_micro, u.id_tipo_unidade,
                   (SELECT STRING_AGG(CAST(pr.id_produto AS VARCHAR(10)), ',')
                      FROM tab_unidade_produtos up JOIN tab_produtos pr ON pr.id_produto = up.id_produto
                     WHERE up.id_unidade = u.id_unidade AND pr.ativo = 1) AS ids_produtos
            FROM tab_unidades u
            LEFT JOIN tab_cidades c ON c.id_cidade = u.id_cidade
            LEFT JOIN tab_estados e ON e.id_estado = c.id_estado
            WHERE u.id_projeto = @p AND u.ativo = 1
            ORDER BY c.nome_cidade, u.nome_unidade;
            SELECT DISTINCT pr.id_produto, pr.nome_produto
            FROM tab_unidade_produtos up
            JOIN tab_unidades u ON u.id_unidade = up.id_unidade AND u.ativo = 1 AND u.id_projeto = @p
            JOIN tab_produtos pr ON pr.id_produto = up.id_produto AND pr.ativo = 1
            ORDER BY pr.nome_produto;
            SELECT id_tipo_unidade, nome_tipo, sigla, grupo, ordem FROM tab_tipos_unidade WHERE ativo = 1 ORDER BY ordem, nome_tipo;`),
        req().query(`
            SELECT 'implantacao' AS origem, a.id_unidade,
                   ISNULL(a.data_inicio, a.data_atividade) AS di, ISNULL(a.data_fim, ISNULL(a.data_inicio, a.data_atividade)) AS df,
                   a.motivos, a.produtos_trabalhados, a.tempo_gasto
            FROM tab_atividades a WHERE a.id_projeto = @p
            UNION ALL
            SELECT 'projetos', a.id_unidade,
                   ISNULL(a.data_inicio, a.data_atividade), ISNULL(a.data_fim, ISNULL(a.data_inicio, a.data_atividade)),
                   a.motivos, a.produtos_trabalhados, a.tempo_gasto
            FROM tab_proj_atividades a WHERE a.id_projeto = @p`)
    ]);

    const [macros, micros] = rReg.recordsets;
    const [unidades, produtos, tipos] = rUni.recordsets;
    const idsUnidades = new Set(unidades.map(u => u.id_unidade));

    // UF predominante (para o contorno dos municípios no mapa)
    const ufs = {};
    unidades.forEach(u => { if (u.uf) ufs[u.uf] = (ufs[u.uf] || 0) + 1; });
    const uf = Object.entries(ufs).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Atividades compactas: [id_unidade, inicio, fim, origem(0 impl/1 proj), [motivos], [produtos], minutos]
    const atividades = rAtv.recordset
        .filter(a => idsUnidades.has(a.id_unidade))
        .map(a => [a.id_unidade, iso(a.di), iso(a.df), a.origem === 'projetos' ? 1 : 0,
            lista(a.motivos), lista(a.produtos_trabalhados), minutos(a.tempo_gasto)]);

    return {
        projeto: { nome: projeto.nome_projeto, slug, uf },
        gerado_em: new Date().toISOString(),
        regioes: macros.map(m => ({ ...m, micros: micros.filter(x => x.id_macro === m.id_macro) })),
        produtos,
        tipos: tipos.filter(t => unidades.some(u => u.id_tipo_unidade === t.id_tipo_unidade)),
        unidades: unidades.map(({ ids_produtos, lat_cidade, lng_cidade, ...u }) => {
            const propria = u.latitude !== null && u.longitude !== null;
            return {
                ...u,
                latitude: propria ? Number(u.latitude) : (lat_cidade !== null ? Number(lat_cidade) : null),
                longitude: propria ? Number(u.longitude) : (lng_cidade !== null ? Number(lng_cidade) : null),
                aproximada: !propria,
                produtos: ids_produtos ? ids_produtos.split(',').map(Number) : []
            };
        }),
        atividades
    };
}

router.get('/publico/painel-projeto/:slug', limite, asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!FORMATO.test(slug)) throw httpErro(404, 'Painel não encontrado.');

    const c = cache.get(slug);
    let dados = c && Date.now() - c.em < CACHE_TTL ? c.dados : null;
    if (!dados) {
        const pool = await connectToDb();
        dados = await montarPainel(pool, slug);
        if (!dados) { cache.delete(slug); throw httpErro(404, 'Painel não encontrado ou não está público.'); }
        cache.set(slug, { em: Date.now(), dados });
    }
    res.set('Cache-Control', 'no-store').json(dados);
}));

// Slugs publicados (o SPA usa para decidir se a rota da raiz é um painel)
router.get('/publico/painel-projeto', limite, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query(`
        SELECT slug_publico AS slug, nome_projeto AS nome FROM tab_projetos
        WHERE painel_publico = 1 AND ativo = 1 AND slug_publico IS NOT NULL ORDER BY nome_projeto`);
    res.set('Cache-Control', 'no-store').json(r.recordset);
}));

module.exports = router;
module.exports.limparCachePainel = () => cache.clear();
