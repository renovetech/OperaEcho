/* Regras das rotas públicas: versões publicadas, informações do sistema, rastreio GPS e validação de CNES. */
const repositorio = require('./publicas.repository');

// Lidas pelo app e pelo PWA ao abrir: versão diferente => atualização automática.
const VERSAO_APP = '2026.12.01';
const VERSAO_PWA = '2026.12.01';
const VERSAO_API = require('../../../package.json').version;

const LINK_DOWNLOAD_APP = 'https://operaecho.com/download/opera-echo-mobile.apk';
const MENSAGEM_ATUALIZACAO = 'Uma nova versão obrigatória do Opera Echo está disponível. Por favor, atualize para continuar.';
const LIMITE_LATITUDE = 90;
const LIMITE_LONGITUDE = 180;
const TIPO_PADRAO = 'SEGUNDO_PLANO';
const TAMANHO_TIPO = 50;
const TAMANHO_DETALHES = 2000;
const TAMANHO_CNES = 7;
const PRODUTO_VALIDO = 1;

const versaoDoApp = () => ({
    versao_atual: VERSAO_APP,
    versao_pwa: VERSAO_PWA,
    link_download: LINK_DOWNLOAD_APP,
    obrigatorio: true,
    mensagem: MENSAGEM_ATUALIZACAO
});

/** IP da máquina do usuário como o servidor a vê. */
function infoDoSistema(ipBruto) {
    let ip = String(ipBruto || '').replace(/^::ffff:/, '');
    if (ip === '::1') ip = '127.0.0.1';
    return { ip, versao_api: VERSAO_API };
}

/** Lê as coordenadas do corpo; nulo se faltarem ou estiverem fora da faixa. */
function lerCoordenadas({ latitude, longitude }) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    const ausente = latitude == null || longitude == null;
    if (ausente || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > LIMITE_LATITUDE || Math.abs(lng) > LIMITE_LONGITUDE) return null;
    return { latitude: lat, longitude: lng };
}

/**
 * Grava o rastreio. O nome gravado é o nome completo do dono do token (o relatório de auditoria filtra por esse
 * nome exato); o campo usuario do corpo é ignorado. Devolve false se as coordenadas forem inválidas.
 */
async function registrarRastreio(usuario, corpo) {
    const coordenadas = lerCoordenadas(corpo);
    if (!coordenadas) return false;
    const nome = await repositorio.nomeDoUsuario(usuario.id_usuario);
    const autor = nome || usuario.usuario;
    await repositorio.registrarRastreio({
        autor: String(autor).slice(0, repositorio.TAMANHO_USUARIO),
        ...coordenadas,
        tipo: String(corpo.tipo_registro || TIPO_PADRAO).slice(0, TAMANHO_TIPO),
        detalhes: String(corpo.detalhes_registro || '').slice(0, TAMANHO_DETALHES)
    });
    return true;
}

/** Situação pública do CNES: não enumera a base, só diz se está cadastrado e tem o produto. */
async function validarCnes(cnesInformado) {
    const cnes = String(cnesInformado || '').replace(/\D/g, '');
    if (!cnes || cnes.length > TAMANHO_CNES) return { cadastrado: false, produtoValido: false };
    const unidade = await repositorio.unidadeDoCnes(cnes);
    if (!unidade) return { cadastrado: false, produtoValido: false };
    return { cadastrado: true, produtoValido: unidade.possui_produto === PRODUTO_VALIDO, nomeUnidade: unidade.nome_unidade };
}

module.exports = { versaoDoApp, infoDoSistema, registrarRastreio, validarCnes };
