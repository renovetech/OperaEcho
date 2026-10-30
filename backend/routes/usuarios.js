/* routes/usuarios.js */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo, temPermissao } = require('../middlewares/auth');
const { asyncHandler } = require('../middlewares/errorHandler');
const { parseIntSafe, validarForcaSenha } = require('../utils/validators');
const { filtroPorProjeto, lotacaoNoEscopo } = require('../middlewares/lotacao');
const { limitar } = require('../utils/rateLimit');
const { formatarNumeroBR } = require('../services/whatsapp/evolution');

// Autocadastro anônimo: no máximo 5 solicitações por hora por IP.
const limiteAutocadastroBase = limitar({ janelaMs: 60 * 60 * 1000, max: 5, mensagem: 'Muitas solicitações de cadastro. Tente novamente mais tarde.' });
const limiteAutocadastro = (req, res, next) => (req.usuario ? next() : limiteAutocadastroBase(req, res, next));

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

// ==============================================================================
// HELPERS
// ==============================================================================
function bindCommonInputs(req, d, nomeSetor, nomeFuncao, idSetor, idFuncao, idLotacao, at) {
    req.input('n', sql.VarChar, d.nome_completo)
       .input('c', sql.VarChar, d.cpf)
       .input('dt', sql.Date, d.data_nascimento || null)
       .input('dadm', sql.Date, d.data_admissao || null)
       .input('s', sql.VarChar, d.sexo)
       .input('cel', sql.VarChar, d.celular)
       .input('cw', sql.Bit, d.celular_whatsapp ? 1 : 0)
       .input('em', sql.VarChar(100), d.email || null)
       .input('m', sql.VarChar, d.matricula)
       .input('ids', sql.Int, idSetor)
       .input('idf', sql.Int, idFuncao)
       .input('idl', sql.Int, idLotacao)
       .input('txtSetor', sql.VarChar, nomeSetor)
       .input('txtFuncao', sql.VarChar, nomeFuncao)
       .input('u', sql.VarChar, d.usuario)
       .input('p', sql.VarChar, d.perfil_acesso)
       .input('a', sql.Bit, at);
}

/* Celular (11 dígitos, DDD + 9) confirmado como WhatsApp + e-mail opcional.
 * Retorna { celular, email } normalizados ou { erro }. */
function validarContato(d) {
    const celular = String(d.celular || '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '');
    if (!celular) return { erro: 'Informe o celular com WhatsApp (obrigatório).' };
    if (!formatarNumeroBR(celular)) return { erro: 'Celular inválido: informe DDD + número com 9 dígitos (ex.: 21 98765-4321).' };
    const email = String(d.email || '').trim().toLowerCase();
    if (email && (email.length > 100 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email))) return { erro: 'E-mail inválido.' };
    return { celular, email: email || null };
}

// Verifica se o SOLICITANTE (dono do token) é o login "admin".
// Só ele pode atribuir/editar o perfil Administrador.
async function ehUsuarioAdmin(req, pool) {
    const loginToken =
        (req.usuario && (req.usuario.usuario || req.usuario.login)) ||
        (req.escopo && req.escopo.usuario) ||
        null;

    if (loginToken) {
        return String(loginToken).trim().toLowerCase() === 'admin';
    }

    // Fallback: resolve pelo id do solicitante, caso o token não traga o login.
    const idReq =
        (req.usuario && (req.usuario.id_usuario || req.usuario.id)) ||
        (req.escopo && req.escopo.id_usuario) ||
        null;

    if (idReq) {
        const r = await pool.request()
            .input('id', sql.Int, idReq)
            .query("SELECT usuario FROM tab_usuarios WHERE id_usuario = @id");
        if (r.recordset.length > 0) {
            return String(r.recordset[0].usuario || '').trim().toLowerCase() === 'admin';
        }
    }
    return false;
}

// ==============================================================================
// LISTAR USUÁRIOS DA LOTAÇÃO (Antigo Listar Implantadores)
// Visibilidade definida pela FUNÇÃO do usuário logado (módulo IMPLANTAÇÃO).
// No submenu OPERAÇÕES > PROJETOS (param id_projeto/lotacao), fica isolado
// estritamente pela lotação escolhida.
// ==============================================================================
const _normFuncao = (s) => (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase();
// Funções que enxergam SOMENTE implantadores ativos (qualquer lotação)
const FUNC_SO_IMPLANTADORES = ['IMPLANTADOR', 'COORDENADOR DE IMPLANTACAO'];

// Filtro ESTRITO por lotação do usuário logado (home + extras), ignorando a
// visão global. Garante que funções globais (ex.: Gerente) também fiquem
// restritas à sua lotação neste dropdown - mesma regra dos Projetos.
function filtroLotacaoEstrita(reqSql, escopo, coluna) {
    if (!escopo || !escopo.lotacoes || escopo.lotacoes.length === 0) return ' AND 1=0 ';
    const base = '__estrita_' + coluna.replace(/[^a-zA-Z0-9]/g, '_');
    const marks = escopo.lotacoes.map((id, i) => {
        const nome = `${base}_${i}`;
        reqSql.input(nome, sql.Int, id);
        return '@' + nome;
    });
    return ` AND ${coluna} IN (${marks.join(',')}) `;
}

router.get('/implantadores', autenticar, asyncHandler(async (req, res) => {
    // Permite filtro forçado vindo da tela de operações > projetos
    const { id_projeto, lotacao, escala_inicio, escala_fim } = req.query; 
    const pool = await connectToDb();
    const request = pool.request();
    
    let filtroCustom = "";

    // VIGÊNCIA NA ESCALA: quando a tela de escalas informa a janela da semana,
    // retorna quem esteve vigente nela - aparece a partir da data de ativação
    // e permanece até a data de inativação (registros anteriores preservados).
    // Sem janela, mantém o comportamento original (somente ativos).
    let filtroVigencia = " AND u.ativo = 1 ";
    if (escala_inicio && escala_fim) {
        request.input('escIni', sql.Date, escala_inicio).input('escFim', sql.Date, escala_fim);
        filtroVigencia = `
            AND COALESCE(u.data_ativacao, u.data_admissao, '1900-01-01') <= @escFim
            AND ( (u.ativo = 1 AND u.data_inativacao IS NULL) OR u.data_inativacao >= @escIni )
        `;
    }
    const paramProjeto = id_projeto || lotacao;

    if (paramProjeto && paramProjeto !== 'Todos') {
        // Submenu Projetos: lotação escolhida + lotações associadas (N:N).
        // Garante que o Líder de Projeto (e demais usuários com lotação extra)
        // apareça no seletor de TODAS as lotações às quais está vinculado.
        filtroCustom = ` AND ( u.id_lotacao = @pLotacao
            OR EXISTS (SELECT 1 FROM tab_usuario_lotacoes ul WHERE ul.id_usuario = u.id_usuario AND ul.id_projeto = @pLotacao) ) `;
        request.input('pLotacao', sql.Int, parseIntSafe(paramProjeto));

        // Gerador de Escalas: na escala aparecem SOMENTE operadores e analistas
        // do projeto (exclui Líder de Projeto, coordenação, etc.).
        if (req.query.escala === '1' || req.query.escala === 'true') {
            filtroCustom += " AND UPPER(LTRIM(RTRIM(f.nome_funcao))) IN ('OPERADOR', 'ANALISTA') ";
        }
    } else {
        // Módulo Implantação: regra por FUNÇÃO do usuário logado.
        const funcao = _normFuncao(req.escopo && req.escopo.nome_funcao);
        const ehAdmin = (req.escopo && req.escopo.perfil_acesso) === 'Administrador';

        if (ehAdmin) {
            // Administrador -> todos os usuários ativos.
            filtroCustom = "";
        } else if (FUNC_SO_IMPLANTADORES.includes(funcao)) {
            // Coordenador de Implantação / Implantador -> só implantadores ativos, qualquer lotação.
            filtroCustom = " AND UPPER(LTRIM(RTRIM(f.nome_funcao))) = 'IMPLANTADOR' ";
        } else {
            // Demais funções (Analista, Líder de Projeto, Operador, Assistente
            // Administrativo, Gerente, etc.) -> usuários da própria lotação,
            // independentemente de visão global.
            filtroCustom = filtroLotacaoEstrita(request, req.escopo, 'u.id_lotacao');
        }
    }

    const r = await request.query(`
        SELECT u.* FROM tab_usuarios u
        LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
        WHERE 1=1 ${filtroVigencia} ${filtroCustom}
        ORDER BY u.nome_completo
    `);
    // Nunca devolve a senha
    res.json(r.recordset.map(({ senha_hash, ...u }) => u));
}));

// ==============================================================================
// BUSCAR USUÁRIOS
// ==============================================================================
router.get('/usuarios/buscar', autenticar, asyncHandler(async (req, res) => {
    const { termo, id_projeto, lotacao } = req.query;
    const pool = await connectToDb();
    const request = pool.request()
        .input('t', sql.VarChar, `%${termo || ''}%`);
    
    let filtroLot = "";
    const paramProjeto = id_projeto || lotacao;

    if (paramProjeto && paramProjeto !== 'Todos') {
        // Lotação informada precisa estar no escopo de quem consulta.
        if (!lotacaoNoEscopo(req.escopo, paramProjeto)) {
            return res.status(403).json({ erro: 'Lotação fora do seu escopo.' });
        }
        filtroLot = " AND u.id_lotacao = @pLotacaoBusca ";
        request.input('pLotacaoBusca', sql.Int, parseIntSafe(paramProjeto));
    } else {
        filtroLot = filtroPorProjeto(request, req.escopo, 'u.id_lotacao');
    }

    const r = await request
        .query(`
            SELECT u.*, s.nome_setor, f.nome_funcao 
            FROM tab_usuarios u
            LEFT JOIN tab_setores s ON u.id_setor = s.id_setor
            LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
            WHERE (u.nome_completo LIKE @t OR u.cpf LIKE @t) ${filtroLot}
            ORDER BY u.nome_completo
        `);
    
    // Remove senha_hash dos resultados
    const usuarios = r.recordset.map(({ senha_hash, ...u }) => u);
    res.json(usuarios);
}));

// ==============================================================================
// PRODUTOS DO USUÁRIO
// ==============================================================================
router.get('/usuarios/:id/produtos', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request()
        .input('id', sql.Int, req.params.id)
        .query("SELECT id_produto FROM tab_usuario_produtos WHERE id_usuario = @id");
    res.json(r.recordset.map(item => item.id_produto));
}));

// ==============================================================================
// SALVAR USUÁRIO (NOVO / EDITAR)
// ==============================================================================
router.post('/usuarios/salvar', limiteAutocadastro, asyncHandler(async (req, res) => {
    const d = { ...(req.body || {}) };
    const pool = await connectToDb();

    // Tamanho/forma dos campos de texto (evita lixo/ataques de volume no cadastro)
    for (const campo of ['nome_completo', 'cpf', 'matricula', 'usuario', 'celular', 'sexo', 'perfil_acesso']) {
        if (d[campo] != null && (typeof d[campo] !== 'string' && typeof d[campo] !== 'number')) {
            return res.status(400).json({ erro: `Campo ${campo} inválido.` });
        }
        if (d[campo] != null && String(d[campo]).length > 150) {
            return res.status(400).json({ erro: `Campo ${campo} muito longo.` });
        }
    }
    // Formato do login validado em cadastros novos (logins antigos seguem editáveis)
    if (!d.id_usuario && d.usuario != null && !/^[A-Za-z0-9._@-]{3,60}$/.test(String(d.usuario).trim())) {
        return res.status(400).json({ erro: 'Login inválido: use de 3 a 60 caracteres (letras, números, ponto, hífen, _ ou @).' });
    }
    if (d.usuario != null) d.usuario = String(d.usuario).trim();

    // Celular com WhatsApp OBRIGATÓRIO (escala, férias e código de senha saem por ele)
    const contato = validarContato(d);
    if (contato.erro) return res.status(400).json({ erro: contato.erro });
    d.celular = contato.celular;
    d.celular_whatsapp = true;
    d.email = contato.email;

    // ------------------------------------------------------------------
    // AUTOCADASTRO (sem token): só pode CRIAR um usuário INATIVO,
    // perfil "Solicitante", senha padrão e sem lotações extras.
    // ------------------------------------------------------------------
    if (!req.usuario) {
        if (d.id_usuario) return res.status(401).json({ erro: 'Não autenticado.' });
        if (!d.nome_completo || !d.cpf || !d.matricula || !d.usuario) {
            return res.status(400).json({ erro: 'Preencha os campos obrigatórios.' });
        }
        d.ativo = false;
        d.perfil_acesso = 'Solicitante';
        d.senha_hash = 'Eco123';
        d.lotacoes = [];
        d.produtos = [];
    } else {
        const acao = d.id_usuario ? 'editar' : 'novo';
        if (!(await temPermissao(req, 'usuarios', acao))) {
            return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
        }
        // Quem não tem visão global só cria/edita usuários das próprias lotações.
        if (!req.escopo || !req.escopo.global) {
            const lotNova = parseIntSafe(d.id_lotacao);
            if (lotNova && !lotacaoNoEscopo(req.escopo, lotNova)) {
                return res.status(403).json({ erro: 'Lotação fora do seu escopo.' });
            }
            if (Array.isArray(d.lotacoes) && d.lotacoes.some(l => parseIntSafe(l) && !lotacaoNoEscopo(req.escopo, l))) {
                return res.status(403).json({ erro: 'Lotação extra fora do seu escopo.' });
            }
            if (d.id_usuario) {
                const rLot = await pool.request().input('id', sql.Int, parseInt(d.id_usuario))
                    .query("SELECT id_lotacao FROM tab_usuarios WHERE id_usuario = @id");
                if (rLot.recordset.length && !lotacaoNoEscopo(req.escopo, rLot.recordset[0].id_lotacao)) {
                    return res.status(403).json({ erro: 'Usuário fora do seu escopo.' });
                }
            }
        }
        // Senha definida por um gestor também precisa ser forte (exceto a padrão, que força troca no 1º acesso)
        if (d.senha_hash && d.senha_hash !== 'Eco123' && (String(d.senha_hash).length > 72 || !validarForcaSenha(String(d.senha_hash)))) {
            return res.status(400).json({ erro: 'A senha não atende aos requisitos de segurança (mín 7 chars, maiúscula, minúscula, número, especial).' });
        }
    }

    // Login duplicado
    if (d.usuario) {
        const rLogin = await pool.request().input('u', sql.VarChar, d.usuario).input('id', sql.Int, parseIntSafe(d.id_usuario) || 0)
            .query("SELECT 1 AS x FROM tab_usuarios WHERE usuario = @u AND id_usuario <> @id");
        if (rLogin.recordset.length > 0) return res.status(409).json({ erro: 'Este login já está em uso.' });
    }

    // ------------------------------------------------------------------
    // GUARDA: o perfil "Administrador" é exclusivo do login "admin".
    // Vale mesmo que o front seja contornado (chamada direta à API).
    // ------------------------------------------------------------------
    const solicitanteEhAdmin = await ehUsuarioAdmin(req, pool);

    // (a) Ninguém além do "admin" pode ATRIBUIR o perfil Administrador.
    if (d.perfil_acesso === 'Administrador' && !solicitanteEhAdmin) {
        return res.status(403).json({ erro: 'Apenas o usuário "admin" pode atribuir o perfil Administrador.' });
    }

    // (b) Ninguém além do "admin" pode EDITAR um usuário que já é Administrador
    //     (impede que um Gestor rebaixe ou altere contas de administrador).
    if (d.id_usuario && !solicitanteEhAdmin) {
        const rPerfilAtual = await pool.request()
            .input('id', sql.Int, parseInt(d.id_usuario))
            .query("SELECT perfil_acesso FROM tab_usuarios WHERE id_usuario = @id");
        if (rPerfilAtual.recordset.length > 0 && rPerfilAtual.recordset[0].perfil_acesso === 'Administrador') {
            return res.status(403).json({ erro: 'Apenas o usuário "admin" pode editar um usuário com perfil Administrador.' });
        }
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        if (!d.id_usuario) {
            const checkDup = await new sql.Request(transaction)
                .input('cpf', sql.VarChar, d.cpf)
                .input('mat', sql.VarChar, d.matricula)
                .query("SELECT id_usuario FROM tab_usuarios WHERE cpf = @cpf OR matricula = @mat");
            
            if (checkDup.recordset.length > 0) {
                await transaction.rollback();
                return res.status(409).json({ erro: 'CPF ou Matrícula já cadastrados.' });
            }
        }

        let nomeSetor = null, nomeFuncao = null;

        if (d.id_setor) {
            const rSetor = await new sql.Request(transaction)
                .input('ids', sql.Int, d.id_setor)
                .query("SELECT nome_setor FROM tab_setores WHERE id_setor = @ids");
            if (rSetor.recordset.length > 0) nomeSetor = rSetor.recordset[0].nome_setor;
        }

        if (d.id_funcao) {
            const rFuncao = await new sql.Request(transaction)
                .input('idf', sql.Int, d.id_funcao)
                .query("SELECT nome_funcao FROM tab_funcoes WHERE id_funcao = @idf");
            if (rFuncao.recordset.length > 0) nomeFuncao = rFuncao.recordset[0].nome_funcao;
        }

        const reqUser = new sql.Request(transaction);
        const at = d.ativo === true ? 1 : 0;
        let idUsuario = d.id_usuario ? parseInt(d.id_usuario) : null;
        const idSetor = parseIntSafe(d.id_setor);
        const idFuncao = parseIntSafe(d.id_funcao);
        const idLotacao = (d.id_lotacao && d.id_lotacao != '0' && d.id_lotacao != '') ? parseInt(d.id_lotacao) : null;

        if (idUsuario) {
            // Vigência na escala: ao inativar, marca a data de inativação
            // (mantém os registros até ela). Ao (re)ativar, limpa a inativação
            // e garante a data de ativação.
            const rAtual = await new sql.Request(transaction).input('id', sql.Int, idUsuario)
                .query("SELECT ativo, data_ativacao FROM tab_usuarios WHERE id_usuario=@id");
            const eraAtivo = rAtual.recordset[0] && rAtual.recordset[0].ativo;
            const jaTinhaAtivacao = rAtual.recordset[0] && rAtual.recordset[0].data_ativacao;

            let q = `UPDATE tab_usuarios SET 
                        nome_completo=@n, cpf=@c, data_nascimento=@dt, data_admissao=@dadm, sexo=@s, celular=@cel,
                        celular_whatsapp=@cw, email=@em,
                        matricula=@m, 
                        id_setor=@ids, setor=@txtSetor, 
                        id_funcao=@idf, funcao=@txtFuncao, 
                        id_lotacao=@idl, 
                        usuario=@u, perfil_acesso=@p, ativo=@a`;

            if (at === 1) {
                q += ", data_inativacao=NULL";
                if (!jaTinhaAtivacao) q += ", data_ativacao=CAST(GETDATE() AS DATE)";
            } else if (eraAtivo) {
                q += ", data_inativacao=CAST(GETDATE() AS DATE)";
            }
            
            if (d.senha_hash) {
                const hash = await bcrypt.hash(d.senha_hash, SALT_ROUNDS);
                q += ", senha_hash=@pwd";
                reqUser.input('pwd', sql.VarChar, hash);
            }
            q += " WHERE id_usuario=@id";

            reqUser.input('id', sql.Int, idUsuario);
            bindCommonInputs(reqUser, d, nomeSetor, nomeFuncao, idSetor, idFuncao, idLotacao, at);
            await reqUser.query(q);

            await new sql.Request(transaction).input('id', sql.Int, idUsuario)
                .query("DELETE FROM tab_usuario_produtos WHERE id_usuario=@id");

        } else {
            const senhaParaSalvar = d.senha_hash || 'Eco123';
            const hash = await bcrypt.hash(senhaParaSalvar, SALT_ROUNDS);

            const qInsert = `
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
            `;

            bindCommonInputs(reqUser, d, nomeSetor, nomeFuncao, idSetor, idFuncao, idLotacao, at);
            reqUser.input('pwd', sql.VarChar, hash);

            const result = await reqUser.query(qInsert);
            if (result.recordset && result.recordset.length > 0) {
                idUsuario = result.recordset[0].id_usuario;
            }
        }

        if (d.produtos && d.produtos.length > 0 && idUsuario) {
            for (const idProd of d.produtos) {
                if (idProd) {
                    await new sql.Request(transaction)
                        .input('idu', sql.Int, idUsuario)
                        .input('idp', sql.Int, idProd)
                        .query("INSERT INTO tab_usuario_produtos (id_usuario, id_produto) VALUES (@idu, @idp)");
                }
            }
        }

        if (idUsuario) {
            await new sql.Request(transaction).input('idu', sql.Int, idUsuario)
                .query("DELETE FROM tab_usuario_lotacoes WHERE id_usuario = @idu");

            if (Array.isArray(d.lotacoes)) {
                for (const idLot of d.lotacoes) {
                    const idLotInt = parseIntSafe(idLot);
                    if (idLotInt && idLotInt !== idLotacao) {
                        await new sql.Request(transaction)
                            .input('idu', sql.Int, idUsuario)
                            .input('idl', sql.Int, idLotInt)
                            .query("INSERT INTO tab_usuario_lotacoes (id_usuario, id_projeto) VALUES (@idu, @idl)");
                    }
                }
            }
        }

        await transaction.commit();
        res.json({ mensagem: 'Salvo com sucesso' });

    } catch (err) {
        await transaction.rollback();
        throw err;
    }
}));

// ==============================================================================
// ATIVAR USUÁRIO (APROVAÇÃO DE ACESSO)
// ==============================================================================
router.post('/usuarios/ativar', autenticar, asyncHandler(async (req, res) => {
    const { id_usuario, perfil } = req.body;
    const idFinal = id_usuario || req.body.id;

    if (!idFinal || !perfil || typeof perfil !== 'string') {
        return res.status(400).json({ erro: 'ID e perfil são obrigatórios.' });
    }

    // Aprovar acesso exige o módulo; perfil Administrador só pelo login "admin".
    if (!(await temPermissao(req, ['notificacoes_acesso', 'usuarios'], 'editar'))) {
        return res.status(403).json({ erro: 'Sem permissão para aprovar acessos.' });
    }

    const pool = await connectToDb();

    if (perfil === 'Administrador' && !(await ehUsuarioAdmin(req, pool))) {
        return res.status(403).json({ erro: 'Apenas o usuário "admin" pode atribuir o perfil Administrador.' });
    }
    const rPerfil = await pool.request().input('p', sql.VarChar, perfil)
        .query("SELECT 1 AS x FROM tab_perfis WHERE nome_perfil = @p");
    if (rPerfil.recordset.length === 0) {
        return res.status(400).json({ erro: 'Perfil inexistente.' });
    }

    const rAlvo = await pool.request()
        .input('id', sql.Int, idFinal)
        .query("SELECT id_lotacao, perfil_acesso FROM tab_usuarios WHERE id_usuario = @id");

    if (rAlvo.recordset.length === 0) {
        return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }
    if (parseInt(idFinal) === parseInt(req.usuario.id_usuario)) {
        return res.status(403).json({ erro: 'Não é possível aprovar/alterar o próprio acesso.' });
    }
    if (rAlvo.recordset[0].perfil_acesso === 'Administrador' && !(await ehUsuarioAdmin(req, pool))) {
        return res.status(403).json({ erro: 'Apenas o usuário "admin" pode alterar um Administrador.' });
    }

    const lotacaoAlvo = rAlvo.recordset[0].id_lotacao;
    if (!req.escopo || (!req.escopo.global && !lotacaoNoEscopo(req.escopo, lotacaoAlvo))) {
        return res.status(403).json({ erro: 'Sem permissão para aprovar acessos desta lotação.' });
    }

    await pool.request()
        .input('id', sql.Int, idFinal)
        .input('p', sql.VarChar, perfil)
        .query("UPDATE tab_usuarios SET ativo = 1, perfil_acesso = @p, data_ativacao = CAST(GETDATE() AS DATE), data_inativacao = NULL WHERE id_usuario = @id");

    res.json({ mensagem: 'Ativado' });
}));

// ==============================================================================
// EXCLUIR USUÁRIO
// ==============================================================================
router.delete('/usuarios/:id', autenticar, autorizarModulo('usuarios', 'editar'), asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ erro: 'ID inválido.' });
    if (id === parseInt(req.usuario.id_usuario)) return res.status(403).json({ erro: 'Não é possível excluir o próprio usuário.' });

    // Mesmas travas da edição: Administrador só pelo "admin"; demais só dentro do escopo.
    const rAlvo = await pool.request().input('id', sql.Int, id)
        .query("SELECT id_lotacao, perfil_acesso FROM tab_usuarios WHERE id_usuario = @id");
    if (rAlvo.recordset.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    const alvo = rAlvo.recordset[0];
    if (alvo.perfil_acesso === 'Administrador' && !(await ehUsuarioAdmin(req, pool))) {
        return res.status(403).json({ erro: 'Apenas o usuário "admin" pode excluir um Administrador.' });
    }
    if (!req.escopo || (!req.escopo.global && !lotacaoNoEscopo(req.escopo, alvo.id_lotacao))) {
        return res.status(403).json({ erro: 'Usuário fora do seu escopo.' });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        await new sql.Request(transaction).input('id', sql.Int, id)
            .query("DELETE FROM tab_usuario_produtos WHERE id_usuario = @id");
        await new sql.Request(transaction).input('id', sql.Int, id)
            .query("DELETE FROM tab_usuarios WHERE id_usuario = @id");
        await transaction.commit();
        res.json({ mensagem: 'Usuário excluído com sucesso.' });
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
}));

// ==============================================================================
// LISTAS AUXILIARES
// ==============================================================================
router.get('/perfis', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT id_perfil, nome_perfil FROM tab_perfis ORDER BY nome_perfil");
    res.json(r.recordset);
}));

router.get('/setores', asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT * FROM tab_setores ORDER BY nome_setor");
    res.json(r.recordset);
}));

router.get('/funcoes', asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT * FROM tab_funcoes ORDER BY nome_funcao");
    res.json(r.recordset);
}));

// ==============================================================================
// LOTAÇÕES EXTRAS DO USUÁRIO (N:N) - para Líder de Projeto que cobre várias
// ==============================================================================
// ==============================================================================
// MEU CONTATO - o próprio usuário completa celular (WhatsApp) e e-mail.
// O Dashboard pede isso após o login de quem ainda não tem WhatsApp confirmado.
// ==============================================================================
router.get('/meu-cadastro/contato', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().input('id', sql.Int, req.usuario.id_usuario)
        .query('SELECT celular, celular_whatsapp, email FROM tab_usuarios WHERE id_usuario = @id');
    const u = r.recordset[0] || {};
    res.json({ celular: u.celular || '', celular_whatsapp: !!u.celular_whatsapp, email: u.email || '', completo: !!formatarNumeroBR(u.celular) });
}));

router.put('/meu-cadastro/contato', autenticar, asyncHandler(async (req, res) => {
    const contato = validarContato(req.body || {});
    if (contato.erro) return res.status(400).json({ erro: contato.erro });
    const pool = await connectToDb();
    await pool.request().input('id', sql.Int, req.usuario.id_usuario)
        .input('cel', sql.VarChar(20), contato.celular).input('em', sql.VarChar(100), contato.email)
        .query('UPDATE tab_usuarios SET celular = @cel, celular_whatsapp = 1, email = @em WHERE id_usuario = @id');
    res.json({ mensagem: 'Contato atualizado.', celular: contato.celular, celular_whatsapp: true, email: contato.email || '' });
}));

router.get('/usuarios/:id/lotacoes', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request()
        .input('id', sql.Int, req.params.id)
        .query("SELECT id_projeto FROM tab_usuario_lotacoes WHERE id_usuario = @id");
    res.json(r.recordset.map(x => x.id_projeto));
}));

module.exports = router;