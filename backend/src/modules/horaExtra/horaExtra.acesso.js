/*
 * Regras de acesso dos lançamentos de Hora Extra (Implantação e Projetos).
 * Mesma regra que as telas já aplicam: Administrador/Gestor veem e editam
 * tudo; os demais, apenas os próprios lançamentos. O perfil vem SEMPRE do
 * token/escopo, nunca da query string. */
const { sql } = require('../../config/database');

const PERFIS_GESTAO = ['Administrador', 'Gestor'];

function perfilDoToken(req) {
    return (req.escopo && req.escopo.perfil_acesso) || (req.usuario && req.usuario.perfil_acesso) || '';
}

function ehGestaoHE(req) {
    return PERFIS_GESTAO.includes(perfilDoToken(req));
}

/** true se o usuário do token pode ler/alterar o lançamento informado. */
async function podeAcessarLancamento(pool, req, tabelaCabecalho, idLancamento) {
    if (ehGestaoHE(req)) return true;
    const id = parseInt(idLancamento);
    if (!id) return false;
    const r = await pool.request().input('id', sql.Int, id)
        .query(`SELECT id_usuario FROM ${tabelaCabecalho} WHERE id_lancamento = @id`);
    if (r.recordset.length === 0) return true; // inexistente: a rota devolve vazio
    return String(r.recordset[0].id_usuario) === String(req.usuario.id_usuario);
}

/** Lançamento novo: quem não é gestão só lança para si mesmo. */
function podeLancarPara(req, idUsuario) {
    return ehGestaoHE(req) || String(idUsuario) === String(req.usuario.id_usuario);
}

module.exports = { perfilDoToken, ehGestaoHE, podeAcessarLancamento, podeLancarPara };
