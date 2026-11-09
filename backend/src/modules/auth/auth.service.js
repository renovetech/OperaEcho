/* Regras do login e da recuperação de senha: senhas legadas, token de troca, código por WhatsApp ou e-mail. */
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validarForcaSenha } = require('../../shared/validators');
const email = require('../../shared/email');
const evo = require('../whatsapp/evolution');
const notificacoes = require('../whatsapp/notificacoes');
const repositorio = require('./auth.repository');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
const SENHAS_PADRAO = ['123', 'Eco123'];
const TAMANHO_MAXIMO_LOGIN = 100;
const TAMANHO_MAXIMO_SENHA_LOGIN = 200;
const TAMANHO_MAXIMO_SENHA_NOVA = 72;
const TAMANHO_MAXIMO_MATRICULA = 50;
const VALIDADE_TOKEN_TROCA = '15m';
const CODIGO_VALIDADE_MIN = 10;
const CODIGO_MAX_TENTATIVAS = 5;
const CODIGO_INTERVALO_SEG = 60;
const CODIGO_LIMITE_SUPERIOR = 1000000;
const CODIGO_DIGITOS = 6;
const CUSTO_HASH_FICTICIO = 10;

// Hash fictício: quando o login não existe, ainda roda um bcrypt para o tempo de
// resposta não revelar quais logins existem.
const HASH_FICTICIO = bcrypt.hashSync('nao-existe-' + Date.now(), CUSTO_HASH_FICTICIO);

// "Impressão digital" da senha atual: o token de troca deixa de valer assim que
// a senha muda (uso único).
const digitalSenha = (hash) => crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 16);

// Token curto, de finalidade única, para troca de senha (primeiro acesso / recuperação).
const gerarTokenReset = (idUsuario, senhaHash) =>
    jwt.sign({ id_usuario: idUsuario, finalidade: 'reset_senha', fp: digitalSenha(senhaHash) }, process.env.JWT_SECRET, { expiresIn: VALIDADE_TOKEN_TROCA });

// Comparação em tempo constante (senhas legadas em texto puro)
function iguaisSeguro(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const hashCodigo = (idUsuario, codigo) =>
    crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${idUsuario}:${codigo}`).digest('hex');

const sortearCodigo = () => String(crypto.randomInt(0, CODIGO_LIMITE_SUPERIOR)).padStart(CODIGO_DIGITOS, '0');

const emailValido = (e) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
const mascararEmail = (e) => {
    const [u, d] = String(e).trim().split('@');
    return `${u.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`;
};

// ---------------------------------------------------------------- login
const camposDoLoginValidos = (usuario, senha) => !!usuario && !!senha && typeof usuario === 'string' && typeof senha === 'string';
// bcrypt só considera 72 bytes; senhas enormes são só custo de CPU (DoS)
const camposDoLoginGrandesDemais = (usuario, senha) => usuario.length > TAMANHO_MAXIMO_LOGIN || senha.length > TAMANHO_MAXIMO_SENHA_LOGIN;

/** Gasta o mesmo tempo de uma conferência real. */
const gastarTempoDeConferencia = (senha) => bcrypt.compare(senha, HASH_FICTICIO);

/** Suporta senhas legadas (texto puro) e bcrypt; a legada correta migra para bcrypt, exceto as padrão. */
async function conferirSenha(pool, user, senha) {
    const ehBcrypt = !!user.senha_hash && /^\$2[aby]\$/.test(user.senha_hash);
    if (ehBcrypt) return { valida: await bcrypt.compare(senha, user.senha_hash), ehBcrypt };

    const valida = !!user.senha_hash && iguaisSeguro(user.senha_hash, senha);
    if (valida && !SENHAS_PADRAO.includes(senha)) {
        const hash = await bcrypt.hash(senha, SALT_ROUNDS);
        await repositorio.gravarHashDoLogin(pool, user.id_usuario, hash);
    }
    return { valida, ehBcrypt };
}

const exigeTrocaDeSenha = (user, senha, ehBcrypt) => SENHAS_PADRAO.includes(senha) || (!ehBcrypt && SENHAS_PADRAO.includes(user.senha_hash));

// ---------------------------------------------------------------- recuperação
async function usuarioDaRecuperacao(pool, body) {
    const { matricula, usuario } = body || {};
    if (!matricula || !usuario || typeof usuario !== 'string') return null;
    return repositorio.buscarParaRecuperacao(pool, String(matricula).trim().slice(0, TAMANHO_MAXIMO_MATRICULA), String(usuario).trim().slice(0, TAMANHO_MAXIMO_LOGIN));
}

async function canaisDoUsuario(pool, u) {
    const lista = [];
    const numero = await notificacoes.whatsappParaCodigo(pool, u.id_usuario);
    if (numero) lista.push({ canal: 'WHATSAPP', destino: evo.mascararCelular(numero) });
    if (email.configurado() && emailValido(u.email)) lista.push({ canal: 'EMAIL', destino: mascararEmail(u.email) });
    return lista;
}

/** Entrega o código pelo canal escolhido. Falha de e-mail devolve false; a de WhatsApp sobe como erro. */
async function entregarCodigo(pool, u, canal, codigo) {
    if (canal === 'WHATSAPP') {
        await notificacoes.codigoSenha(pool, u.id_usuario, codigo, CODIGO_VALIDADE_MIN);
        return true;
    }
    try {
        await email.enviarCodigoSenha({ para: String(u.email).trim(), nome: u.nome_completo, codigo, validadeMin: CODIGO_VALIDADE_MIN });
        return true;
    } catch (e) {
        console.error('[E-mail] Falha ao enviar código:', e.message);
        return false;
    }
}

const codigoConfere = (hashGravado, idUsuario, codigo) => iguaisSeguro(hashGravado.trim(), hashCodigo(idUsuario, codigo));

function mensagemDeCodigoIncorreto(tentativas) {
    const restam = CODIGO_MAX_TENTATIVAS - tentativas;
    return restam > 0 ? `Código incorreto. Restam ${restam} tentativa(s).` : 'Código bloqueado por excesso de tentativas. Peça um novo código.';
}

// ---------------------------------------------------------------- troca de senha
/** Quem pode trocar: portador de token_reset ou, sem ele, a sessão válida (troca da própria senha). Token inválido lança erro. */
function titularDaTroca(authorization, tokenReset) {
    let idUsuario = null;
    let digitalEsperada = null;
    if (tokenReset) {
        const d = jwt.verify(String(tokenReset), process.env.JWT_SECRET);
        if (d.finalidade === 'reset_senha') { idUsuario = d.id_usuario; digitalEsperada = d.fp || ''; }
    } else if ((authorization || '').startsWith('Bearer ')) {
        const d = jwt.verify(authorization.split(' ')[1], process.env.JWT_SECRET);
        if (!d.finalidade) idUsuario = d.id_usuario;
    }
    return { idUsuario, digitalEsperada };
}

const senhaNovaAceita = (senha) => senha.length <= TAMANHO_MAXIMO_SENHA_NOVA && validarForcaSenha(senha) && !SENHAS_PADRAO.includes(senha);

/** Conta ativa e, no caso do token de troca, ainda com a mesma senha de quando foi emitido (uso único). */
const trocaAutorizada = (atual, digitalEsperada) =>
    !!atual && !!atual.ativo && (digitalEsperada === null || digitalEsperada === digitalSenha(atual.senha_hash));

const gerarHashDaSenha = (senha) => bcrypt.hash(senha, SALT_ROUNDS);

module.exports = {
    CODIGO_VALIDADE_MIN, CODIGO_MAX_TENTATIVAS, CODIGO_INTERVALO_SEG,
    gerarTokenReset, hashCodigo, sortearCodigo, camposDoLoginValidos, camposDoLoginGrandesDemais, gastarTempoDeConferencia, conferirSenha,
    exigeTrocaDeSenha, usuarioDaRecuperacao, canaisDoUsuario, entregarCodigo, codigoConfere, mensagemDeCodigoIncorreto, titularDaTroca,
    senhaNovaAceita, trocaAutorizada, gerarHashDaSenha
};
