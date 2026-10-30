/* ============================================================================
   middlewares/lotacao.js
   Camada central de ISOLAMENTO POR LOTAÇÃO.

   Modelo:
   - Lotação operacional = projeto com gera_lotacao = 1.
   - Cada usuário tem uma lotação-home (tab_usuarios.id_lotacao).
   - Líderes de Projeto podem cobrir lotações extras (tab_usuario_lotacoes).
   - VISÃO GLOBAL (SEDE - GD) NÃO é um projeto: é dada pela FUNÇÃO do usuário
     (tab_funcoes.visao_global = 1) ou pelo perfil Administrador.
     Esses usuários veem tudo e podem ficar com id_lotacao = NULL.

   Uso:
     1) Em index.js, após as rotas públicas:
          app.use(autenticar, carregarEscopo);
     2) Nas queries, injete o filtro:
          where += filtroPorProjeto(request, req.escopo, 'a.id_projeto');
          where += filtroPorUsuarioLotacao(request, req.escopo, 'e.id_usuario');
   ============================================================================ */
const { connectToDb, sql } = require('../config/database');

// Fallback por nome, caso a flag tab_funcoes.visao_global ainda não esteja
// marcada para alguma função de sede. Mantém o sistema seguro na transição.
const FUNCOES_GLOBAIS = ['GERENTE', 'COORDENADOR DE IMPLANTAÇÃO'];

/**
 * Carrega o escopo de lotação do usuário autenticado e anexa em req.escopo:
 *   { global: bool, lotacoes: number[], id_lotacao_home: number|null }
 * Se não houver usuário autenticado, req.escopo fica null (rotas públicas).
 */
async function carregarEscopo(req, res, next) {
    try {
        if (!req.usuario || !req.usuario.id_usuario) {
            req.escopo = null;
            return next();
        }

        const pool = await connectToDb();

        // Dados do usuário + se a FUNÇÃO concede visão global (SEDE - GD)
        const rUser = await pool.request()
            .input('id', sql.Int, req.usuario.id_usuario)
            .query(`
                SELECT u.id_lotacao, u.perfil_acesso, u.ativo, u.usuario,
                       f.nome_funcao, f.visao_global AS funcao_global
                FROM tab_usuarios u
                LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
                WHERE u.id_usuario = @id
            `);

        // Usuário excluído ou inativado: o JWT ainda válido NÃO mantém o acesso.
        if (rUser.recordset.length === 0 || !rUser.recordset[0].ativo) {
            return res.status(401).json({ erro: 'Sessão encerrada: usuário inativo ou removido.' });
        }

        const info = rUser.recordset[0];

        // Perfil e login sempre do banco (o token pode estar desatualizado após
        // um rebaixamento de perfil, por exemplo).
        req.usuario.perfil_acesso = info.perfil_acesso;
        req.usuario.usuario = info.usuario;

        // Lotações extras (Líder cobrindo várias)
        const rExtras = await pool.request()
            .input('id', sql.Int, req.usuario.id_usuario)
            .query(`
                SELECT id_projeto
                FROM tab_usuario_lotacoes
                WHERE id_usuario = @id
            `);

        const funcao = (info.nome_funcao || '').toUpperCase();
        const ehAdmin = info.perfil_acesso === 'Administrador';
        const ehFuncaoGlobal =
            info.funcao_global === true ||
            FUNCOES_GLOBAIS.some(c => funcao.includes(c));

        const global = ehAdmin || ehFuncaoGlobal;

        // Conjunto de lotações visíveis (home + extras), sem nulos/duplicados
        const set = new Set();
        if (info.id_lotacao) set.add(info.id_lotacao);
        rExtras.recordset.forEach(r => { if (r.id_projeto) set.add(r.id_projeto); });

        req.escopo = {
            global,
            lotacoes: [...set],
            id_lotacao_home: info.id_lotacao || null,
            nome_funcao: info.nome_funcao || null,
            perfil_acesso: info.perfil_acesso || null
        };

        next();
    } catch (err) {
        next(err);
    }
}

/**
 * Filtro por id_projeto (lotação). Use em tabelas que carregam id_projeto.
 * Retorna o trecho SQL ( " AND <coluna> IN (...) " ) e registra os inputs.
 * - global  -> '' (sem restrição)
 * - sem escopo / sem lotação -> ' AND 1=0 ' (não vaza nada)
 */
function filtroPorProjeto(reqSql, escopo, coluna) {
    if (!escopo) return ' AND 1=0 ';
    if (escopo.global) return '';
    if (!escopo.lotacoes || escopo.lotacoes.length === 0) return ' AND 1=0 ';

    const base = '__lot_' + coluna.replace(/[^a-zA-Z0-9]/g, '_');
    const marks = escopo.lotacoes.map((id, i) => {
        const nome = `${base}_${i}`;
        reqSql.input(nome, sql.Int, id);
        return '@' + nome;
    });
    return ` AND ${coluna} IN (${marks.join(',')}) `;
}

/**
 * Filtro por lotação do USUÁRIO dono do registro (ex.: escalas).
 * Restringe pela lotação-home do usuário referenciado na coluna informada.
 */
function filtroPorUsuarioLotacao(reqSql, escopo, colunaIdUsuario) {
    if (!escopo) return ' AND 1=0 ';
    if (escopo.global) return '';
    if (!escopo.lotacoes || escopo.lotacoes.length === 0) return ' AND 1=0 ';

    const base = '__ulot_' + colunaIdUsuario.replace(/[^a-zA-Z0-9]/g, '_');
    const marks = escopo.lotacoes.map((id, i) => {
        const nome = `${base}_${i}`;
        reqSql.input(nome, sql.Int, id);
        return '@' + nome;
    });
    return ` AND ${colunaIdUsuario} IN (
                SELECT id_usuario FROM tab_usuarios WHERE id_lotacao IN (${marks.join(',')})
            ) `;
}

/**
 * Valida se uma lotação escolhida (ex.: seletor do menu Projetos) está
 * dentro do escopo do usuário. Retorna true/false.
 */
function lotacaoNoEscopo(escopo, idLotacao) {
    if (!escopo) return false;
    if (escopo.global) return true;
    return escopo.lotacoes.includes(parseInt(idLotacao));
}

module.exports = {
    carregarEscopo,
    filtroPorProjeto,
    filtroPorUsuarioLotacao,
    lotacaoNoEscopo
};