/* SQL dos usuários. As funções que recebem `transacao` rodam dentro dela; as demais, direto no pool. */
const { sql } = require('../../config/database');
const { filtroPorProjeto } = require('../../middlewares/lotacao');
const { parseIntSafe } = require('../../shared/validators');

// ---------------------------------------------------------------- implantadores
const VISAO_TODOS = 'todos';
const VISAO_SO_IMPLANTADORES = 'so_implantadores';
const VISAO_LOTACOES_DO_LOGADO = 'lotacoes_do_logado';

const FILTRO_SO_ATIVOS = ' AND u.ativo = 1 ';
const FILTRO_VIGENCIA_NA_ESCALA = `
    AND COALESCE(u.data_ativacao, u.data_admissao, '1900-01-01') <= @escFim
    AND ( (u.ativo = 1 AND u.data_inativacao IS NULL) OR u.data_inativacao >= @escIni )
`;
const FILTRO_LOTACAO_E_ASSOCIADAS = ` AND ( u.id_lotacao = @pLotacao
            OR EXISTS (SELECT 1 FROM tab_usuario_lotacoes ul WHERE ul.id_usuario = u.id_usuario AND ul.id_projeto = @pLotacao) ) `;
const FILTRO_OPERADORES_E_ANALISTAS = " AND UPPER(LTRIM(RTRIM(f.nome_funcao))) IN ('OPERADOR', 'ANALISTA') ";
const FILTRO_SO_IMPLANTADORES = " AND UPPER(LTRIM(RTRIM(f.nome_funcao))) = 'IMPLANTADOR' ";

/* Filtro ESTRITO pelas lotações do usuário logado (home + extras), ignorando a visão global. Garante que funções
 * globais (ex.: Gerente) também fiquem restritas à sua lotação neste dropdown - mesma regra dos Projetos. */
function filtroLotacaoEstrita(pedido, escopo, coluna) {
    if (!escopo || !escopo.lotacoes || escopo.lotacoes.length === 0) return ' AND 1=0 ';
    const base = '__estrita_' + coluna.replace(/[^a-zA-Z0-9]/g, '_');
    const marcas = escopo.lotacoes.map((id, i) => {
        const nome = `${base}_${i}`;
        pedido.input(nome, sql.Int, id);
        return '@' + nome;
    });
    return ` AND ${coluna} IN (${marcas.join(',')}) `;
}

function filtroDeVigencia(pedido, vigencia) {
    if (!vigencia) return FILTRO_SO_ATIVOS;
    pedido.input('escIni', sql.Date, vigencia.inicio).input('escFim', sql.Date, vigencia.fim);
    return FILTRO_VIGENCIA_NA_ESCALA;
}

function filtroDeVisao(pedido, { idLotacao, soOperadoresEAnalistas, visao, escopo }) {
    if (idLotacao !== undefined) {
        pedido.input('pLotacao', sql.Int, idLotacao);
        return FILTRO_LOTACAO_E_ASSOCIADAS + (soOperadoresEAnalistas ? FILTRO_OPERADORES_E_ANALISTAS : '');
    }
    if (visao === VISAO_SO_IMPLANTADORES) return FILTRO_SO_IMPLANTADORES;
    if (visao === VISAO_LOTACOES_DO_LOGADO) return filtroLotacaoEstrita(pedido, escopo, 'u.id_lotacao');
    return '';
}

/** `idLotacao` indefinido = sem lotação escolhida (vale a `visao`); `vigencia` = { inicio, fim } ou nulo. Devolve as linhas com senha_hash. */
async function listarImplantadores(pool, filtros) {
    const pedido = pool.request();
    const filtroVigencia = filtroDeVigencia(pedido, filtros.vigencia);
    const filtroCustom = filtroDeVisao(pedido, filtros);
    const r = await pedido.query(`
        SELECT u.* FROM tab_usuarios u
        LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
        WHERE 1=1 ${filtroVigencia} ${filtroCustom}
        ORDER BY u.nome_completo
    `);
    return r.recordset;
}

// ---------------------------------------------------------------- consultas
/** `idLotacao` definido = uma lotação escolhida; indefinido = as lotações do escopo. */
async function buscarUsuarios(pool, { termo, id, idLotacao, escopo }) {
    const pedido = pool.request().input('t', sql.VarChar, `%${termo || ''}%`);

    // Abre um usuário direto pela URL do cadastro; o filtro de lotação continua valendo.
    let filtroId = '';
    if (id) {
        filtroId = ' AND u.id_usuario = @idBusca ';
        pedido.input('idBusca', sql.Int, parseIntSafe(id));
    }

    let filtroLot = '';
    if (idLotacao !== undefined) {
        filtroLot = ' AND u.id_lotacao = @pLotacaoBusca ';
        pedido.input('pLotacaoBusca', sql.Int, idLotacao);
    } else {
        filtroLot = filtroPorProjeto(pedido, escopo, 'u.id_lotacao');
    }

    const r = await pedido.query(`
            SELECT u.*, s.nome_setor, f.nome_funcao
            FROM tab_usuarios u
            LEFT JOIN tab_setores s ON u.id_setor = s.id_setor
            LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
            WHERE (u.nome_completo LIKE @t OR u.cpf LIKE @t) ${filtroId} ${filtroLot}
            ORDER BY u.nome_completo
        `);
    return r.recordset;
}

async function listarIdsDeProdutos(pool, idUsuario) {
    const r = await pool.request()
        .input('id', sql.Int, idUsuario)
        .query("SELECT id_produto FROM tab_usuario_produtos WHERE id_usuario = @id");
    return r.recordset.map((item) => item.id_produto);
}

async function listarIdsDeLotacoes(pool, idUsuario) {
    const r = await pool.request()
        .input('id', sql.Int, idUsuario)
        .query("SELECT id_projeto FROM tab_usuario_lotacoes WHERE id_usuario = @id");
    return r.recordset.map((x) => x.id_projeto);
}

async function listarPerfis(pool) {
    const r = await pool.request().query("SELECT id_perfil, nome_perfil FROM tab_perfis ORDER BY nome_perfil");
    return r.recordset;
}

async function listarSetores(pool) {
    const r = await pool.request().query("SELECT * FROM tab_setores ORDER BY nome_setor");
    return r.recordset;
}

async function listarFuncoes(pool) {
    const r = await pool.request().query("SELECT * FROM tab_funcoes ORDER BY nome_funcao");
    return r.recordset;
}

// ---------------------------------------------------------------- verificações
async function buscarLoginPorId(pool, idUsuario) {
    const r = await pool.request()
        .input('id', sql.Int, idUsuario)
        .query("SELECT usuario FROM tab_usuarios WHERE id_usuario = @id");
    return r.recordset[0];
}

async function buscarLotacaoDoUsuario(pool, idUsuario) {
    const r = await pool.request().input('id', sql.Int, idUsuario)
        .query("SELECT id_lotacao FROM tab_usuarios WHERE id_usuario = @id");
    return r.recordset[0];
}

async function buscarPerfilDoUsuario(pool, idUsuario) {
    const r = await pool.request()
        .input('id', sql.Int, idUsuario)
        .query("SELECT perfil_acesso FROM tab_usuarios WHERE id_usuario = @id");
    return r.recordset[0];
}

async function loginEmUso(pool, usuario, idUsuario) {
    const r = await pool.request().input('u', sql.VarChar, usuario).input('id', sql.Int, idUsuario)
        .query("SELECT 1 AS x FROM tab_usuarios WHERE usuario = @u AND id_usuario <> @id");
    return r.recordset.length > 0;
}

async function perfilExiste(pool, nomePerfil) {
    const r = await pool.request().input('p', sql.VarChar, nomePerfil)
        .query("SELECT 1 AS x FROM tab_perfis WHERE nome_perfil = @p");
    return r.recordset.length > 0;
}

/** Lotação e perfil do usuário-alvo de uma aprovação ou exclusão; indefinido se não existe. */
async function buscarAlvo(pool, idUsuario) {
    const r = await pool.request().input('id', sql.Int, idUsuario)
        .query("SELECT id_lotacao, perfil_acesso FROM tab_usuarios WHERE id_usuario = @id");
    return r.recordset[0];
}

// ---------------------------------------------------------------- gravação
function abrirTransacao(pool) {
    const transacao = new sql.Transaction(pool);
    return transacao.begin().then(() => transacao);
}

async function existeCpfOuMatricula(transacao, cpf, matricula) {
    const r = await new sql.Request(transacao)
        .input('cpf', sql.VarChar, cpf)
        .input('mat', sql.VarChar, matricula)
        .query("SELECT id_usuario FROM tab_usuarios WHERE cpf = @cpf OR matricula = @mat");
    return r.recordset.length > 0;
}

async function buscarNomeDoSetor(transacao, idSetor) {
    const r = await new sql.Request(transacao)
        .input('ids', sql.Int, idSetor)
        .query("SELECT nome_setor FROM tab_setores WHERE id_setor = @ids");
    return r.recordset.length > 0 ? r.recordset[0].nome_setor : null;
}

async function buscarNomeDaFuncao(transacao, idFuncao) {
    const r = await new sql.Request(transacao)
        .input('idf', sql.Int, idFuncao)
        .query("SELECT nome_funcao FROM tab_funcoes WHERE id_funcao = @idf");
    return r.recordset.length > 0 ? r.recordset[0].nome_funcao : null;
}

async function buscarAtivacaoAtual(transacao, idUsuario) {
    const r = await new sql.Request(transacao).input('id', sql.Int, idUsuario)
        .query("SELECT ativo, data_ativacao FROM tab_usuarios WHERE id_usuario=@id");
    return r.recordset[0];
}

function informarCamposComuns(pedido, d, v) {
    pedido.input('n', sql.VarChar, d.nome_completo)
        .input('c', sql.VarChar, d.cpf)
        .input('dt', sql.Date, d.data_nascimento || null)
        .input('dadm', sql.Date, d.data_admissao || null)
        .input('s', sql.VarChar, d.sexo)
        .input('cel', sql.VarChar, d.celular)
        .input('cw', sql.Bit, d.celular_whatsapp ? 1 : 0)
        .input('em', sql.VarChar(100), d.email || null)
        .input('m', sql.VarChar, d.matricula)
        .input('ids', sql.Int, v.idSetor)
        .input('idf', sql.Int, v.idFuncao)
        .input('idl', sql.Int, v.idLotacao)
        .input('txtSetor', sql.VarChar, v.nomeSetor)
        .input('txtFuncao', sql.VarChar, v.nomeFuncao)
        .input('u', sql.VarChar, d.usuario)
        .input('p', sql.VarChar, d.perfil_acesso)
        .input('a', sql.Bit, v.ativo);
}

const DATA_DE_HOJE_EM_BRASILIA = "CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'E. South America Standard Time' AS DATE)";

/* Vigência na escala: ao inativar, marca a data de inativação (mantém os registros até ela). Ao (re)ativar, limpa a
 * inativação e garante a data de ativação. */
function textoDaAtualizacao({ ativo, eraAtivo, jaTinhaAtivacao, comSenha }) {
    let texto = `UPDATE tab_usuarios SET
                        nome_completo=@n, cpf=@c, data_nascimento=@dt, data_admissao=@dadm, sexo=@s, celular=@cel,
                        celular_whatsapp=@cw, email=@em,
                        matricula=@m,
                        id_setor=@ids, setor=@txtSetor,
                        id_funcao=@idf, funcao=@txtFuncao,
                        id_lotacao=@idl,
                        usuario=@u, perfil_acesso=@p, ativo=@a`;
    if (ativo === 1) {
        texto += ', data_inativacao=NULL';
        if (!jaTinhaAtivacao) texto += `, data_ativacao=${DATA_DE_HOJE_EM_BRASILIA}`;
    } else if (eraAtivo) {
        texto += `, data_inativacao=${DATA_DE_HOJE_EM_BRASILIA}`;
    }
    if (comSenha) texto += ', senha_hash=@pwd';
    return `${texto} WHERE id_usuario=@id`;
}

/** `valores`: idSetor, idFuncao, idLotacao, nomeSetor, nomeFuncao, ativo (0/1), situacaoAnterior ({ativo, data_ativacao}), hashSenha (opcional). */
async function atualizarUsuario(transacao, idUsuario, d, valores) {
    const pedido = new sql.Request(transacao);
    const anterior = valores.situacaoAnterior;
    const texto = textoDaAtualizacao({
        ativo: valores.ativo,
        eraAtivo: anterior && anterior.ativo,
        jaTinhaAtivacao: anterior && anterior.data_ativacao,
        comSenha: !!valores.hashSenha
    });
    if (valores.hashSenha) pedido.input('pwd', sql.VarChar, valores.hashSenha);
    pedido.input('id', sql.Int, idUsuario);
    informarCamposComuns(pedido, d, valores);
    await pedido.query(texto);
}

async function removerProdutos(transacao, idUsuario) {
    await new sql.Request(transacao).input('id', sql.Int, idUsuario)
        .query("DELETE FROM tab_usuario_produtos WHERE id_usuario=@id");
}

/** Devolve o id gerado (indefinido se o banco não devolver linha). */
async function inserirUsuario(transacao, d, valores) {
    const pedido = new sql.Request(transacao);
    informarCamposComuns(pedido, d, valores);
    pedido.input('pwd', sql.VarChar, valores.hashSenha);
    const resultado = await pedido.query(`
                INSERT INTO tab_usuarios (
                    nome_completo, cpf, data_nascimento, data_admissao, sexo, celular, celular_whatsapp, email, matricula,
                    id_setor, setor, id_funcao, funcao, id_lotacao,
                    usuario, senha_hash, perfil_acesso, ativo
                )
                OUTPUT INSERTED.id_usuario
                VALUES (
                    @n, @c, @dt, @dadm, @s, @cel, @cw, @em, @m,
                    @ids, @txtSetor, @idf, @txtFuncao, @idl,
                    @u, @pwd, @p, @a
                )
            `);
    return resultado.recordset && resultado.recordset.length > 0 ? resultado.recordset[0].id_usuario : undefined;
}

async function inserirProduto(transacao, idUsuario, idProduto) {
    await new sql.Request(transacao)
        .input('idu', sql.Int, idUsuario)
        .input('idp', sql.Int, idProduto)
        .query("INSERT INTO tab_usuario_produtos (id_usuario, id_produto) VALUES (@idu, @idp)");
}

async function removerLotacoesExtras(transacao, idUsuario) {
    await new sql.Request(transacao).input('idu', sql.Int, idUsuario)
        .query("DELETE FROM tab_usuario_lotacoes WHERE id_usuario = @idu");
}

async function inserirLotacaoExtra(transacao, idUsuario, idLotacao) {
    await new sql.Request(transacao)
        .input('idu', sql.Int, idUsuario)
        .input('idl', sql.Int, idLotacao)
        .query("INSERT INTO tab_usuario_lotacoes (id_usuario, id_projeto) VALUES (@idu, @idl)");
}

async function ativarUsuario(pool, idUsuario, perfil) {
    await pool.request()
        .input('id', sql.Int, idUsuario)
        .input('p', sql.VarChar, perfil)
        .query("UPDATE tab_usuarios SET ativo = 1, perfil_acesso = @p, data_ativacao = CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'E. South America Standard Time' AS DATE), data_inativacao = NULL WHERE id_usuario = @id");
}

async function excluirUsuario(transacao, idUsuario) {
    await new sql.Request(transacao).input('id', sql.Int, idUsuario)
        .query("DELETE FROM tab_usuario_produtos WHERE id_usuario = @id");
    await new sql.Request(transacao).input('id', sql.Int, idUsuario)
        .query("DELETE FROM tab_usuario_lotacoes WHERE id_usuario = @id");
    await new sql.Request(transacao).input('id', sql.Int, idUsuario)
        .query("DELETE FROM tab_usuarios WHERE id_usuario = @id");
}

// ---------------------------------------------------------------- contato
async function buscarContato(pool, idUsuario) {
    const r = await pool.request().input('id', sql.Int, idUsuario)
        .query('SELECT celular, celular_whatsapp, email FROM tab_usuarios WHERE id_usuario = @id');
    return r.recordset[0];
}

async function atualizarContato(pool, idUsuario, { celular, email }) {
    await pool.request().input('id', sql.Int, idUsuario)
        .input('cel', sql.VarChar(20), celular).input('em', sql.VarChar(100), email)
        .query('UPDATE tab_usuarios SET celular = @cel, celular_whatsapp = 1, email = @em WHERE id_usuario = @id');
}

module.exports = {
    VISAO_TODOS, VISAO_SO_IMPLANTADORES, VISAO_LOTACOES_DO_LOGADO,
    listarImplantadores, buscarUsuarios, listarIdsDeProdutos, listarIdsDeLotacoes, listarPerfis, listarSetores, listarFuncoes,
    buscarLoginPorId, buscarLotacaoDoUsuario, buscarPerfilDoUsuario, loginEmUso, perfilExiste, buscarAlvo,
    abrirTransacao, existeCpfOuMatricula, buscarNomeDoSetor, buscarNomeDaFuncao, buscarAtivacaoAtual, atualizarUsuario, removerProdutos,
    inserirUsuario, inserirProduto, removerLotacoesExtras, inserirLotacaoExtra, ativarUsuario, excluirUsuario, buscarContato, atualizarContato
};
