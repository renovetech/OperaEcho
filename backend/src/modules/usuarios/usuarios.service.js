/* Regras do cadastro de usuários: autocadastro, escopo por lotação, perfil Administrador exclusivo do "admin" e contato.
 * As verificações devolvem `{ status, erro }` quando algo impede a ação (a rota responde com isso) ou nulo quando passa. */
const bcrypt = require('bcrypt');
const { lotacaoNoEscopo } = require('../../middlewares/lotacao');
const { parseIntSafe, validarForcaSenha } = require('../../shared/validators');
const { formatarNumeroBR } = require('../whatsapp/evolution');
const repositorio = require('./usuarios.repository');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
const SENHA_PADRAO = 'Eco123';
const PERFIL_ADMINISTRADOR = 'Administrador';
const PERFIL_SOLICITANTE = 'Solicitante';
const LOGIN_DO_ADMIN = 'admin';
const TAMANHO_MAXIMO_CAMPO = 150;
const TAMANHO_MAXIMO_SENHA = 72;
const TAMANHO_MAXIMO_EMAIL = 100;
const CAMPOS_DE_TEXTO = ['nome_completo', 'cpf', 'matricula', 'usuario', 'celular', 'sexo', 'perfil_acesso'];
const FORMATO_LOGIN = /^[A-Za-z0-9._@-]{3,60}$/;
const FORMATO_EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

const falha = (status, erro) => ({ status, erro });

/** Nunca devolve a senha. */
const semSenha = ({ senha_hash: _senha, ...usuario }) => usuario;

// ---------------------------------------------------------------- contato
/* Celular (11 dígitos, DDD + 9) confirmado como WhatsApp + e-mail opcional. Retorna { celular, email } normalizados ou { erro }. */
function validarContato(d) {
    const celular = String(d.celular || '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '');
    if (!celular) return { erro: 'Informe o celular com WhatsApp (obrigatório).' };
    if (!formatarNumeroBR(celular)) return { erro: 'Celular inválido: informe DDD + número com 9 dígitos (ex.: 21 98765-4321).' };
    const email = String(d.email || '').trim().toLowerCase();
    if (email && (email.length > TAMANHO_MAXIMO_EMAIL || !FORMATO_EMAIL.test(email))) return { erro: 'E-mail inválido.' };
    return { celular, email: email || null };
}

const celularCompleto = (celular) => !!formatarNumeroBR(celular);

// ---------------------------------------------------------------- implantadores
const _normalizarFuncao = (s) => (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toUpperCase();
// Funções que enxergam SOMENTE implantadores ativos (qualquer lotação)
const FUNCOES_SO_IMPLANTADORES = ['IMPLANTADOR', 'COORDENADOR DE IMPLANTACAO'];

/* Módulo Implantação: a visão depende da FUNÇÃO do usuário logado. Administrador vê todos; Coordenador de Implantação e
 * Implantador, só implantadores; as demais funções (Analista, Líder, Operador, Gerente...) ficam na própria lotação,
 * independentemente de visão global. */
function visaoDosImplantadores(escopo) {
    const funcao = _normalizarFuncao(escopo && escopo.nome_funcao);
    if ((escopo && escopo.perfil_acesso) === PERFIL_ADMINISTRADOR) return repositorio.VISAO_TODOS;
    if (FUNCOES_SO_IMPLANTADORES.includes(funcao)) return repositorio.VISAO_SO_IMPLANTADORES;
    return repositorio.VISAO_LOTACOES_DO_LOGADO;
}

const ehEscalaDeProjeto = (escala) => escala === '1' || escala === 'true';

/** Quando a tela de escalas informa a janela da semana, vale quem esteve vigente nela; sem janela, só os ativos. */
const vigenciaDaEscala = (inicio, fim) => (inicio && fim ? { inicio, fim } : null);

async function listarImplantadores(pool, consulta, escopo) {
    const { idProjeto, lotacao, escalaInicio, escalaFim, escala } = consulta;
    const paramProjeto = idProjeto || lotacao;
    const filtros = { vigencia: vigenciaDaEscala(escalaInicio, escalaFim), escopo };
    if (paramProjeto && paramProjeto !== 'Todos') {
        // Submenu Projetos: lotação escolhida + lotações associadas (N:N), para o Líder aparecer em todas as suas.
        // No Gerador de Escalas aparecem SOMENTE operadores e analistas do projeto.
        filtros.idLotacao = parseIntSafe(paramProjeto);
        filtros.soOperadoresEAnalistas = ehEscalaDeProjeto(escala);
    } else {
        filtros.visao = visaoDosImplantadores(escopo);
    }
    return (await repositorio.listarImplantadores(pool, filtros)).map(semSenha);
}

// ---------------------------------------------------------------- administrador
// Verifica se o SOLICITANTE (dono do token) é o login "admin". Só ele pode atribuir/editar o perfil Administrador.
async function ehUsuarioAdmin(req, pool) {
    const loginToken =
        (req.usuario && (req.usuario.usuario || req.usuario.login)) ||
        (req.escopo && req.escopo.usuario) ||
        null;

    if (loginToken) {
        return String(loginToken).trim().toLowerCase() === LOGIN_DO_ADMIN;
    }

    // Fallback: resolve pelo id do solicitante, caso o token não traga o login.
    const idReq =
        (req.usuario && (req.usuario.id_usuario || req.usuario.id)) ||
        (req.escopo && req.escopo.id_usuario) ||
        null;

    if (idReq) {
        const linha = await repositorio.buscarLoginPorId(pool, idReq);
        if (linha) return String(linha.usuario || '').trim().toLowerCase() === LOGIN_DO_ADMIN;
    }
    return false;
}

// ---------------------------------------------------------------- salvar
/** Forma e tamanho dos campos de texto, login e contato. Devolve { falha } ou { dados } já normalizados. */
function conferirEntrada(corpo) {
    const d = { ...corpo };
    // Tamanho/forma dos campos de texto (evita lixo/ataques de volume no cadastro)
    for (const campo of CAMPOS_DE_TEXTO) {
        if (d[campo] != null && (typeof d[campo] !== 'string' && typeof d[campo] !== 'number')) {
            return { falha: falha(400, `Campo ${campo} inválido.`) };
        }
        if (d[campo] != null && String(d[campo]).length > TAMANHO_MAXIMO_CAMPO) {
            return { falha: falha(400, `Campo ${campo} muito longo.`) };
        }
    }
    // Formato do login validado em cadastros novos (logins antigos seguem editáveis)
    if (!d.id_usuario && d.usuario != null && !FORMATO_LOGIN.test(String(d.usuario).trim())) {
        return { falha: falha(400, 'Login inválido: use de 3 a 60 caracteres (letras, números, ponto, hífen, _ ou @).') };
    }
    if (d.usuario != null) d.usuario = String(d.usuario).trim();

    // Celular com WhatsApp OBRIGATÓRIO (escala, férias e código de senha saem por ele)
    const contato = validarContato(d);
    if (contato.erro) return { falha: falha(400, contato.erro) };
    return { dados: { ...d, celular: contato.celular, celular_whatsapp: true, email: contato.email } };
}

/* AUTOCADASTRO (sem token): só pode CRIAR um usuário INATIVO, perfil "Solicitante", senha padrão e sem lotações extras. */
function prepararAutocadastro(d) {
    if (d.id_usuario) return { falha: falha(401, 'Não autenticado.') };
    if (!d.nome_completo || !d.cpf || !d.matricula || !d.usuario) {
        return { falha: falha(400, 'Preencha os campos obrigatórios.') };
    }
    return { dados: { ...d, ativo: false, perfil_acesso: PERFIL_SOLICITANTE, senha_hash: SENHA_PADRAO, lotacoes: [], produtos: [] } };
}

/** Quem não tem visão global só cria/edita usuários das próprias lotações. */
async function conferirEscopoDoCadastro(req, pool, d) {
    if (req.escopo && req.escopo.global) return null;

    const lotacaoNova = parseIntSafe(d.id_lotacao);
    if (lotacaoNova && !lotacaoNoEscopo(req.escopo, lotacaoNova)) return falha(403, 'Lotação fora do seu escopo.');
    if (Array.isArray(d.lotacoes) && d.lotacoes.some((l) => parseIntSafe(l) && !lotacaoNoEscopo(req.escopo, l))) {
        return falha(403, 'Lotação extra fora do seu escopo.');
    }
    if (d.id_usuario) {
        const atual = await repositorio.buscarLotacaoDoUsuario(pool, parseInt(d.id_usuario));
        if (atual && !lotacaoNoEscopo(req.escopo, atual.id_lotacao)) return falha(403, 'Usuário fora do seu escopo.');
    }
    return null;
}

/** Senha definida por um gestor também precisa ser forte (exceto a padrão, que força troca no 1º acesso). */
function conferirSenhaDefinida(d) {
    if (d.senha_hash && d.senha_hash !== SENHA_PADRAO && (String(d.senha_hash).length > TAMANHO_MAXIMO_SENHA || !validarForcaSenha(String(d.senha_hash)))) {
        return falha(400, 'A senha não atende aos requisitos de segurança (mín 7 chars, maiúscula, minúscula, número, especial).');
    }
    return null;
}

/* Login duplicado e GUARDA do perfil "Administrador", exclusivo do login "admin" (vale mesmo que o front seja contornado):
 * (a) ninguém além do "admin" atribui o perfil; (b) ninguém além dele edita um usuário que já é Administrador. */
async function conferirLoginEPerfil(req, pool, d) {
    if (d.usuario && await repositorio.loginEmUso(pool, d.usuario, parseIntSafe(d.id_usuario) || 0)) {
        return falha(409, 'Este login já está em uso.');
    }

    const solicitanteEhAdmin = await ehUsuarioAdmin(req, pool);
    if (d.perfil_acesso === PERFIL_ADMINISTRADOR && !solicitanteEhAdmin) {
        return falha(403, 'Apenas o usuário "admin" pode atribuir o perfil Administrador.');
    }
    if (d.id_usuario && !solicitanteEhAdmin) {
        const atual = await repositorio.buscarPerfilDoUsuario(pool, parseInt(d.id_usuario));
        if (atual && atual.perfil_acesso === PERFIL_ADMINISTRADOR) {
            return falha(403, 'Apenas o usuário "admin" pode editar um usuário com perfil Administrador.');
        }
    }
    return null;
}

async function gravarProdutos(transacao, idUsuario, produtos) {
    if (!produtos || produtos.length === 0 || !idUsuario) return;
    for (const idProduto of produtos) {
        if (idProduto) await repositorio.inserirProduto(transacao, idUsuario, idProduto);
    }
}

async function gravarLotacoesExtras(transacao, idUsuario, lotacoes, idLotacaoHome) {
    if (!idUsuario) return;
    await repositorio.removerLotacoesExtras(transacao, idUsuario);
    if (!Array.isArray(lotacoes)) return;
    for (const idLotacao of lotacoes) {
        const idLotacaoInt = parseIntSafe(idLotacao);
        if (idLotacaoInt && idLotacaoInt !== idLotacaoHome) await repositorio.inserirLotacaoExtra(transacao, idUsuario, idLotacaoInt);
    }
}

async function nomesDeSetorEFuncao(transacao, d) {
    const nomeSetor = d.id_setor ? await repositorio.buscarNomeDoSetor(transacao, d.id_setor) : null;
    const nomeFuncao = d.id_funcao ? await repositorio.buscarNomeDaFuncao(transacao, d.id_funcao) : null;
    return { nomeSetor, nomeFuncao };
}

const lotacaoPrincipal = (d) => (d.id_lotacao && d.id_lotacao != '0' && d.id_lotacao != '' ? parseInt(d.id_lotacao) : null);

/** Dentro da transação: devolve { falha } se CPF ou matrícula já existem, senão grava e devolve {}. */
async function gravarDentroDaTransacao(transacao, d) {
    if (!d.id_usuario && await repositorio.existeCpfOuMatricula(transacao, d.cpf, d.matricula)) {
        return { falha: falha(409, 'CPF ou Matrícula já cadastrados.') };
    }

    const { nomeSetor, nomeFuncao } = await nomesDeSetorEFuncao(transacao, d);
    const valores = {
        nomeSetor,
        nomeFuncao,
        ativo: d.ativo === true ? 1 : 0,
        idSetor: parseIntSafe(d.id_setor),
        idFuncao: parseIntSafe(d.id_funcao),
        idLotacao: lotacaoPrincipal(d)
    };
    let idUsuario = d.id_usuario ? parseInt(d.id_usuario) : null;

    if (idUsuario) {
        const situacaoAnterior = await repositorio.buscarAtivacaoAtual(transacao, idUsuario);
        const hashSenha = d.senha_hash ? await bcrypt.hash(d.senha_hash, SALT_ROUNDS) : null;
        await repositorio.atualizarUsuario(transacao, idUsuario, d, { ...valores, situacaoAnterior, hashSenha });
        await repositorio.removerProdutos(transacao, idUsuario);
    } else {
        const hashSenha = await bcrypt.hash(d.senha_hash || SENHA_PADRAO, SALT_ROUNDS);
        idUsuario = await repositorio.inserirUsuario(transacao, d, { ...valores, hashSenha }) || idUsuario;
    }

    await gravarProdutos(transacao, idUsuario, d.produtos);
    await gravarLotacoesExtras(transacao, idUsuario, d.lotacoes, valores.idLotacao);
    return {};
}

/** Grava o usuário, os produtos e as lotações extras numa transação. Devolve { falha } ou {}. */
async function gravarUsuario(pool, d) {
    const transacao = await repositorio.abrirTransacao(pool);
    try {
        const resultado = await gravarDentroDaTransacao(transacao, d);
        if (resultado.falha) {
            await transacao.rollback().catch(() => undefined);
            return resultado;
        }
        await transacao.commit();
        return resultado;
    } catch (err) {
        await transacao.rollback().catch(() => undefined);
        throw err;
    }
}

// ---------------------------------------------------------------- ativar e excluir
/** Mesmas travas da edição: Administrador só pelo "admin"; os demais, só dentro do escopo. */
async function conferirAtivacao(req, pool, idUsuario, perfil) {
    if (perfil === PERFIL_ADMINISTRADOR && !(await ehUsuarioAdmin(req, pool))) {
        return falha(403, 'Apenas o usuário "admin" pode atribuir o perfil Administrador.');
    }
    if (!await repositorio.perfilExiste(pool, perfil)) return falha(400, 'Perfil inexistente.');

    const alvo = await repositorio.buscarAlvo(pool, idUsuario);
    if (!alvo) return falha(404, 'Usuário não encontrado.');
    if (parseInt(idUsuario) === parseInt(req.usuario.id_usuario)) return falha(403, 'Não é possível aprovar/alterar o próprio acesso.');
    if (alvo.perfil_acesso === PERFIL_ADMINISTRADOR && !(await ehUsuarioAdmin(req, pool))) {
        return falha(403, 'Apenas o usuário "admin" pode alterar um Administrador.');
    }
    if (!req.escopo || (!req.escopo.global && !lotacaoNoEscopo(req.escopo, alvo.id_lotacao))) {
        return falha(403, 'Sem permissão para aprovar acessos desta lotação.');
    }
    return null;
}

async function conferirExclusao(req, pool, idUsuario) {
    const alvo = await repositorio.buscarAlvo(pool, idUsuario);
    if (!alvo) return falha(404, 'Usuário não encontrado.');
    if (alvo.perfil_acesso === PERFIL_ADMINISTRADOR && !(await ehUsuarioAdmin(req, pool))) {
        return falha(403, 'Apenas o usuário "admin" pode excluir um Administrador.');
    }
    if (!req.escopo || (!req.escopo.global && !lotacaoNoEscopo(req.escopo, alvo.id_lotacao))) {
        return falha(403, 'Usuário fora do seu escopo.');
    }
    return null;
}

async function excluirUsuario(pool, idUsuario) {
    const transacao = await repositorio.abrirTransacao(pool);
    try {
        await repositorio.excluirUsuario(transacao, idUsuario);
        await transacao.commit();
    } catch (err) {
        await transacao.rollback().catch(() => undefined);
        throw err;
    }
}

module.exports = {
    semSenha, validarContato, celularCompleto, listarImplantadores, conferirEntrada, prepararAutocadastro, conferirEscopoDoCadastro,
    conferirSenhaDefinida, conferirLoginEPerfil, gravarUsuario, conferirAtivacao, conferirExclusao, excluirUsuario
};
