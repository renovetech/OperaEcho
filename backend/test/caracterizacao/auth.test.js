/* Auth: login e recuperação de senha. Cada rota continua gerando as mesmas consultas, respostas e envios.
 * Os limitadores de tentativa são contados por processo; por isso cada fluxo usa poucos casos e logins distintos. */
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { caracterizar } = require('../apoio/caracterizacao');

const SEGREDO = process.env.JWT_SECRET;
const CODIGO_FIXO = 123456;

// O código de 6 dígitos é sorteado: fixa o valor para que o hash gravado seja repetível.
crypto.randomInt = () => CODIGO_FIXO;

// O e-mail do módulo é substituído pelo apoio; aqui só se faz o envio para 'falha@' recusar, para cobrir o erro 502.
const caminhoEmail = require.resolve('../../src/shared/email.js');
const emailRegistrado = require.cache[caminhoEmail].exports;
require.cache[caminhoEmail].exports = new Proxy({}, {
    get: (alvo, prop) => {
        if (prop !== 'enviarCodigoSenha') return emailRegistrado[prop];
        return (dados) => (dados.para === 'falha@exemplo.com'
            ? Promise.reject(new Error('SMTP fora do ar'))
            : emailRegistrado.enviarCodigoSenha(dados));
    }
});

const SENHA = 'Senha@123';
const hashBcrypt = (senha) => bcrypt.hashSync(senha, 4);
const digitalDe = (hash) => crypto.createHash('sha256').update(String(hash)).digest('hex').slice(0, 16);
const hashDoCodigo = (idUsuario, codigo) => crypto.createHmac('sha256', SEGREDO).update(`${idUsuario}:${codigo}`).digest('hex');
const tokenReset = (idUsuario, hashAtual) => jwt.sign({ id_usuario: idUsuario, finalidade: 'reset_senha', fp: digitalDe(hashAtual) }, SEGREDO, { expiresIn: '15m' });

const CONSULTA_LOGIN = /FROM tab_usuarios WHERE usuario=@u AND ativo=1/;
const CONSULTA_RECUPERACAO = /FROM tab_usuarios WHERE matricula = @m AND usuario = @u AND ativo = 1/;
const CONSULTA_INTERVALO = /FROM tab_codigos_senha WHERE id_usuario = @u AND data_criacao/;
const CONSULTA_CODIGO_VALIDO = /SELECT TOP 1 id_codigo, codigo_hash, tentativas FROM tab_codigos_senha/;
const CONSULTA_SENHA_ATUAL = /SELECT senha_hash, ativo FROM tab_usuarios WHERE id_usuario = @id/;

const usuarioBanco = (extra) => ({ id_usuario: 7, usuario: 'ana', nome_completo: 'Ana Teste', perfil_acesso: 'Gestor', id_lotacao: 2, ativo: true, senha_hash: hashBcrypt(SENHA), ...extra });
const usuarioRecuperacao = (extra) => ({ id_usuario: 7, nome_completo: 'Ana Teste', email: 'ana@exemplo.com', senha_hash: 'hash-atual', ...extra });
const comLogin = (usuario, senha) => ({ metodo: 'POST', url: '/login', anonimo: true, corpo: { usuario, senha } });

const casosLogin = [
    { nome: 'login: sem corpo', metodo: 'POST', url: '/login', anonimo: true },
    { nome: 'login: usuário que não é texto', ...comLogin(123, SENHA) },
    { nome: 'login: senha vazia', ...comLogin('semsenha', '') },
    { nome: 'login: usuário comprido demais', ...comLogin('u'.repeat(101), SENHA) },
    { nome: 'login: senha comprida demais', ...comLogin('senhalonga', 's'.repeat(201)) },
    { nome: 'login: usuário inexistente', ...comLogin('fantasma', SENHA), respostas: [[CONSULTA_LOGIN, []]] },
    { nome: 'login: senha bcrypt incorreta', ...comLogin('errada', 'Outra@123'), respostas: [[CONSULTA_LOGIN, [usuarioBanco({ usuario: 'errada' })]]] },
    { nome: 'login: senha bcrypt correta', ...comLogin('ana', SENHA), respostas: [[CONSULTA_LOGIN, [usuarioBanco()]]] },
    { nome: 'login: senha padrão em bcrypt exige troca', ...comLogin('padrao', 'Eco123'), respostas: [[CONSULTA_LOGIN, [usuarioBanco({ usuario: 'padrao', senha_hash: hashBcrypt('Eco123') })]]] },
    { nome: 'login: senha legada correta migra para bcrypt', ...comLogin('legado', 'Legado@1'), respostas: [[CONSULTA_LOGIN, [usuarioBanco({ usuario: 'legado', senha_hash: 'Legado@1' })]]] },
    { nome: 'login: senha legada incorreta', ...comLogin('legado2', 'Errada@1'), respostas: [[CONSULTA_LOGIN, [usuarioBanco({ usuario: 'legado2', senha_hash: 'Legado@1' })]]] },
    { nome: 'login: senha legada padrão exige troca sem migrar', ...comLogin('legado3', '123'), respostas: [[CONSULTA_LOGIN, [usuarioBanco({ usuario: 'legado3', senha_hash: '123' })]]] },
    { nome: 'login: usuário sem senha cadastrada', ...comLogin('semhash', SENHA), respostas: [[CONSULTA_LOGIN, [usuarioBanco({ usuario: 'semhash', senha_hash: null })]]] }
];

const identificacao = { matricula: ' 1234 ', usuario: 'ana' };
const recuperar = (rota, corpo, respostas) => ({ metodo: 'POST', url: `/recuperar-senha/${rota}`, anonimo: true, corpo, respostas });
const achaUsuario = [CONSULTA_RECUPERACAO, [usuarioRecuperacao()]];

const casosCanais = [
    { nome: 'canais: sem identificação', ...recuperar('canais', {}) },
    { nome: 'canais: usuário que não é texto', ...recuperar('canais', { matricula: '1', usuario: 5 }) },
    { nome: 'canais: usuário não encontrado', ...recuperar('canais', identificacao, [[CONSULTA_RECUPERACAO, []]]) },
    { nome: 'canais: devolve o e-mail mascarado', ...recuperar('canais', identificacao, [achaUsuario]) },
    { nome: 'canais: sem canal cadastrado', ...recuperar('canais', identificacao, [[CONSULTA_RECUPERACAO, [usuarioRecuperacao({ email: '' })]]]) }
];

const casosSolicitar = [
    { nome: 'solicitar: usuário não encontrado', ...recuperar('solicitar', { ...identificacao, usuario: 'naoexiste', canal: 'email' }, [[CONSULTA_RECUPERACAO, []]]) },
    { nome: 'solicitar: canal WhatsApp indisponível', ...recuperar('solicitar', { ...identificacao, canal: 'WHATSAPP' }, [achaUsuario]) },
    { nome: 'solicitar: sem canal', ...recuperar('solicitar', identificacao, [achaUsuario]) },
    { nome: 'solicitar: pedido recente', ...recuperar('solicitar', { ...identificacao, canal: 'email' }, [achaUsuario, [CONSULTA_INTERVALO, [{ x: 1 }]]]) },
    { nome: 'solicitar: envia o código por e-mail', ...recuperar('solicitar', { ...identificacao, canal: 'email' }, [achaUsuario, [CONSULTA_INTERVALO, []]]) },
    {
        nome: 'solicitar: falha no envio do e-mail',
        ...recuperar('solicitar', { matricula: '1234', usuario: 'falha', canal: 'EMAIL' }, [[CONSULTA_RECUPERACAO, [usuarioRecuperacao({ email: 'falha@exemplo.com' })]], [CONSULTA_INTERVALO, []]])
    }
];

const codigoGravado = (extra) => [CONSULTA_CODIGO_VALIDO, [{ id_codigo: 5, codigo_hash: hashDoCodigo(7, CODIGO_FIXO), tentativas: 0, ...extra }]];
const casosVerificar = [
    { nome: 'verificar: código incompleto', ...recuperar('verificar', { ...identificacao, codigo: '12345' }) },
    { nome: 'verificar: sem código', ...recuperar('verificar', identificacao) },
    { nome: 'verificar: usuário não encontrado', ...recuperar('verificar', { ...identificacao, codigo: '123456' }, [[CONSULTA_RECUPERACAO, []]]) },
    { nome: 'verificar: código expirado', ...recuperar('verificar', { ...identificacao, codigo: '123456' }, [achaUsuario, [CONSULTA_CODIGO_VALIDO, []]]) },
    { nome: 'verificar: código incorreto', ...recuperar('verificar', { ...identificacao, codigo: '000000' }, [achaUsuario, codigoGravado({ tentativas: 1 })]) },
    { nome: 'verificar: código bloqueado na quinta tentativa', ...recuperar('verificar', { ...identificacao, codigo: '000000' }, [achaUsuario, codigoGravado({ tentativas: 4 })]) },
    { nome: 'verificar: código correto com separador', ...recuperar('verificar', { ...identificacao, codigo: '123 456' }, [achaUsuario, codigoGravado()]) }
];

const SENHA_NOVA = 'Nova@1234';
const atual = (extra) => [CONSULTA_SENHA_ATUAL, [{ senha_hash: 'hash-atual', ativo: true, ...extra }]];
const casosConfirmar = [
    { nome: 'confirmar: sem token nem sessão', ...recuperar('confirmar', { nova_senha: SENHA_NOVA }) },
    { nome: 'confirmar: token inválido', ...recuperar('confirmar', { token_reset: 'lixo', nova_senha: SENHA_NOVA }) },
    { nome: 'confirmar: sem nova senha', ...recuperar('confirmar', { token_reset: tokenReset(7, 'hash-atual') }) },
    { nome: 'confirmar: senha fraca', ...recuperar('confirmar', { token_reset: tokenReset(7, 'hash-atual'), nova_senha: 'fraca' }) },
    { nome: 'confirmar: senha padrão', ...recuperar('confirmar', { token_reset: tokenReset(7, 'hash-atual'), nova_senha: 'Eco123' }) },
    { nome: 'confirmar: senha comprida demais', ...recuperar('confirmar', { token_reset: tokenReset(7, 'hash-atual'), nova_senha: `Aa1!${'x'.repeat(70)}` }) },
    { nome: 'confirmar: conta inativa', ...recuperar('confirmar', { token_reset: tokenReset(7, 'hash-atual'), nova_senha: SENHA_NOVA }, [atual({ ativo: false })]) },
    { nome: 'confirmar: token já usado', ...recuperar('confirmar', { token_reset: tokenReset(7, 'hash-antigo'), nova_senha: SENHA_NOVA }, [atual()]) },
    { nome: 'confirmar: troca com token de reset', ...recuperar('confirmar', { token_reset: tokenReset(7, 'hash-atual'), nova_senha: SENHA_NOVA }, [atual()]) },
    { nome: 'confirmar: troca da própria senha com sessão', metodo: 'POST', url: '/recuperar-senha/confirmar', corpo: { nova_senha: SENHA_NOVA }, id: 4, respostas: [atual()] }
];

caracterizar('auth', [
    ...casosLogin,
    ...casosCanais,
    ...casosSolicitar,
    ...casosVerificar,
    ...casosConfirmar
]);
