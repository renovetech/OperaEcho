/* Complementos do apoio de caracterização para Atividades e Escalas. Sem alterar o apoio comum, permite:
 *  - variar a sessão pelo id do token (função, lotações, usuário inativo);
 *  - variar permissões e parâmetros por caso (os caches são limpos antes de cada teste);
 *  - enviar arquivos pelo campo `anexos` do `formulario`, gravando numa pasta temporária;
 *  - ver no registro as notificações de escala: o `lerConfig` real faz esta consulta, e é a resposta dela
 *    que decide se a alteração vira linha em tab_whatsapp_envios (onde fica o módulo de cada envio). */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { beforeEach } = require('node:test');
const { caracterizar } = require('./caracterizacao');

const FONTE = path.join(__dirname, '..', '..', 'src');
const moduloDaFonte = (relativo) => require(path.join(FONTE, relativo));
const arquivoDaFonte = (relativo) => require.resolve(path.join(FONTE, relativo));

/* ---------------------------------------------------------------- sessão por id do token */
const SESSAO = {
    ANALISTA: 201, LIDER: 202, OPERADOR: 203, FUNCAO_GLOBAL: 204, SEM_LOTACAO: 205, DUAS_LOTACOES: 206, SEM_LOGIN: 207, INATIVO: 208
};
const SOBREPOSICOES_DA_SESSAO = {
    [SESSAO.ANALISTA]: { nome_funcao: 'Analista' },
    [SESSAO.LIDER]: { nome_funcao: 'Líder de Projeto' },
    [SESSAO.OPERADOR]: { nome_funcao: ' operador ' },
    [SESSAO.FUNCAO_GLOBAL]: { funcao_global: true },
    [SESSAO.SEM_LOTACAO]: { id_lotacao: null },
    [SESSAO.SEM_LOGIN]: { usuario: null },
    [SESSAO.INATIVO]: { ativo: false }
};
const LOTACOES_EXTRAS = { [SESSAO.DUAS_LOTACOES]: [{ id_projeto: 9 }] };

const ehSessaoDoUsuario = (texto) => /FROM tab_usuarios u LEFT JOIN tab_funcoes f/.test(texto);
const ehSessaoDasLotacoes = (texto) => /^SELECT id_projeto FROM tab_usuario_lotacoes WHERE id_usuario = @id$/.test(texto);

function comSessaoPorId(pedido) {
    const consultar = pedido.query.bind(pedido);
    pedido.query = async (texto) => {
        const consulta = String(texto).replace(/\s+/g, ' ').trim();
        const resultado = await consultar(texto);
        const id = pedido.entradas.id;
        if (ehSessaoDoUsuario(consulta) && SOBREPOSICOES_DA_SESSAO[id]) return { ...resultado, recordset: [{ ...resultado.recordset[0], ...SOBREPOSICOES_DA_SESSAO[id] }] };
        if (ehSessaoDasLotacoes(consulta) && LOTACOES_EXTRAS[id]) return { ...resultado, recordset: LOTACOES_EXTRAS[id] };
        return resultado;
    };
    return pedido;
}

const banco = moduloDaFonte('config/database.js');
const conectarOriginal = banco.connectToDb;
let poolDecorado = null;
banco.connectToDb = async () => {
    if (poolDecorado) return poolDecorado;
    const pool = await conectarOriginal();
    poolDecorado = { ...pool, request: () => comSessaoPorId(pool.request()) };
    return poolDecorado;
};

/* ---------------------------------------------------------------- WhatsApp */
const evolutionFalso = moduloDaFonte('modules/whatsapp/evolution.js');
async function lerConfigRegistrado(pool) {
    evolutionFalso.lerConfig(pool);
    const resultado = await pool.request().query('SELECT * FROM tab_whatsapp_config WHERE id = 1');
    return resultado.recordset[0] || null;
}
require.cache[arquivoDaFonte('modules/whatsapp/evolution.js')].exports = new Proxy({}, {
    get: (alvo, prop) => (prop === 'lerConfig' ? lerConfigRegistrado : evolutionFalso[prop])
});

/* ---------------------------------------------------------------- caches */
const auth = moduloDaFonte('middlewares/auth.js');
const limparRegrasOriginal = auth.limparCacheRegras;
/* O registro de externos é a forma de a base provar que gravar regras limpa o cache de permissões. */
auth.limparCacheRegras = () => {
    evolutionFalso.cacheDeRegrasLimpo();
    limparRegrasOriginal();
};
const { limparCacheParametros } = moduloDaFonte('modules/parametros/parametros.service.js');
beforeEach(() => {
    limparRegrasOriginal();
    limparCacheParametros();
});

/* ---------------------------------------------------------------- anexos */
const PASTA_ANEXOS = fs.mkdtempSync(path.join(os.tmpdir(), 'caracterizacao-anexos-'));
process.on('exit', () => fs.rmSync(PASTA_ANEXOS, { recursive: true, force: true }));

function uploadDeTeste() {
    const multer = require('multer');
    const armazenamento = multer.diskStorage({
        destination: (req, arquivo, pronto) => pronto(null, PASTA_ANEXOS),
        filename: (req, arquivo, pronto) => pronto(null, arquivo.originalname)
    });
    return multer({
        storage: armazenamento,
        limits: { fileSize: 1024 * 1024, files: 20, fields: 60, fieldSize: 1024 * 1024 },
        fileFilter: (req, arquivo, pronto) => {
            if (/\.pdf$/i.test(arquivo.originalname)) return pronto(null, true);
            return pronto(Object.assign(new Error('Tipo de arquivo não permitido.'), { status: 400 }), false);
        }
    });
}
const arquivoUpload = arquivoDaFonte('config/upload.js');
require.cache[arquivoUpload] = { id: arquivoUpload, filename: arquivoUpload, loaded: true, exports: uploadDeTeste() };

/* `formulario: { anexos: 'a.pdf,b.pdf' }` envia arquivos de verdade com esses nomes. */
const FormDataOriginal = globalThis.FormData;
globalThis.FormData = class extends FormDataOriginal {
    append(chave, valor) {
        if (chave !== 'anexos') return super.append(chave, valor);
        return String(valor).split(',').forEach((nome) => super.append(chave, new Blob(['conteudo']), nome));
    }
};

const anexosNoDisco = () => fs.readdirSync(PASTA_ANEXOS).sort();

/* ---------------------------------------------------------------- respostas de banco */
const regra = (modulo, { acessar = true, novo = true, editar = true } = {}) => ({ nome_modulo: modulo, pode_acessar: acessar, pode_novo: novo, pode_editar: editar });
const comRegras = (...regras) => [/tab_regras_acesso WHERE nome_perfil = @p/, regras];
const comParametros = (valores) => [/FROM tab_parametros/, Object.entries(valores).map(([chave, valor]) => ({ chave, valor }))];

module.exports = { caracterizar, SESSAO, regra, comRegras, comParametros, anexosNoDisco };
