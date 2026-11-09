/* Testes de caracterização: dispara rotas com um banco falso e compara com a base gravada o status, a resposta,
 * as consultas SQL (texto e parâmetros) e os envios externos. Nada toca o banco real, o WhatsApp ou o e-mail.
 *
 *   npm test                       compara com a base
 *   ATUALIZAR_BASE=1 npm test      regrava a base (só quando a mudança de comportamento for intencional)
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
process.env.CORS_ORIGINS = 'http://localhost';
process.env.RATE_LIMIT_IP_MIN = '100000';
process.env.RATE_LIMIT_USUARIO_MIN = '100000';
process.env.TZ = 'America/Sao_Paulo';

const PASTA_BASE = path.join(__dirname, '..', 'caracterizacao', 'base');
const FONTE = path.join(__dirname, '..', '..', 'src');

const registro = { consultas: [], externos: [] };
let respostasDoCaso = [];
let perfilDoCaso = 'Administrador';

/* A barreira carrega o usuário e as lotações em toda rota: responde aqui, sem entrar no registro. */
const ehConsultaDaSessao = (texto) => /FROM tab_usuarios u LEFT JOIN tab_funcoes f/.test(texto) || /^SELECT id_projeto FROM tab_usuario_lotacoes WHERE id_usuario = @id$/.test(texto);
const linhasDaSessao = (texto) => (/tab_funcoes/.test(texto) ? [{ id_lotacao: 2, perfil_acesso: perfilDoCaso, ativo: true, usuario: 'teste', nome_funcao: 'Teste', funcao_global: false }] : []);
const comoResultado = (linhas) => ({ recordset: linhas, recordsets: [linhas], rowsAffected: [linhas.length], output: {} });

/** Linha padrão: qualquer coluna lida vale 1. Quem precisa de valor próprio usa `respostas` no caso. */
const linhaPadrao = () => new Proxy({}, {
    get: (alvo, prop) => {
        if (prop === 'toJSON') return () => ({ linha: 'padrao' });
        if (typeof prop === 'symbol') return undefined;
        return prop in alvo ? alvo[prop] : 1;
    },
    set: (alvo, prop, valor) => { alvo[prop] = valor; return true; },
    has: () => true,
    ownKeys: () => [],
    getOwnPropertyDescriptor: () => undefined
});

const normalizarTexto = (texto) => String(texto).replace(/\s+/g, ' ').trim();

function normalizarValor(valor) {
    if (valor instanceof Date) return '<data>';
    if (Buffer.isBuffer(valor)) return '<binario>';
    if (typeof valor === 'string') return valor.replace(/\d{13}/g, '<carimbo>').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<data>').replace(/\$2[aby]\$\d+\$[./A-Za-z0-9]{53}/g, '<hash>').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>');
    return valor === undefined ? null : valor;
}

function resultadoFalso(texto) {
    const achada = respostasDoCaso.find(([padrao]) => padrao.test(texto));
    return comoResultado(achada ? achada[1] : [linhaPadrao()]);
}

class PedidoFalso {
    constructor() { this.entradas = {}; }

    input(nome, tipo, valor) {
        this.entradas[nome] = normalizarValor(arguments.length === 2 ? tipo : valor);
        return this;
    }

    output() { return this; }

    query(texto) {
        const consulta = normalizarTexto(texto);
        if (ehConsultaDaSessao(consulta)) return Promise.resolve(comoResultado(linhasDaSessao(consulta)));
        registro.consultas.push({ texto: consulta, entradas: this.entradas });
        return Promise.resolve(resultadoFalso(consulta));
    }

    execute(nome) { return this.query(`EXEC ${nome}`); }

    batch(texto) { return this.query(texto); }
}

class TransacaoFalsa {
    request() { return new PedidoFalso(); }

    begin() { registro.consultas.push({ texto: 'BEGIN' }); return Promise.resolve(this); }

    commit() { registro.consultas.push({ texto: 'COMMIT' }); return Promise.resolve(); }

    rollback() { registro.consultas.push({ texto: 'ROLLBACK' }); return Promise.resolve(); }
}

const tipoFalso = new Proxy(function tipo() { return 'tipo'; }, { get: () => tipoFalso });
const sqlFalso = new Proxy({ Request: PedidoFalso, Transaction: TransacaoFalsa, Table: class { constructor() { this.columns = { add() {} }; this.rows = { add() {} }; } } }, {
    get: (alvo, prop) => (prop in alvo ? alvo[prop] : tipoFalso)
});
const poolFalso = { request: () => new PedidoFalso(), transaction: () => new TransacaoFalsa(), connected: true };

function substituirModulo(relativo, exportacoes) {
    const arquivo = require.resolve(path.join(FONTE, relativo));
    require.cache[arquivo] = { id: arquivo, filename: arquivo, loaded: true, exports: exportacoes };
}

const envioRegistrado = (nome) => (...argumentos) => {
    registro.externos.push({ nome, argumentos: JSON.parse(JSON.stringify(argumentos, (chave, valor) => normalizarValor(valor))) });
    return Promise.resolve({ ok: true, enviado: true });
};
const envioFalso = (rotulo) => new Proxy({}, { get: (alvo, prop) => (typeof prop === 'symbol' ? undefined : envioRegistrado(`${rotulo}.${prop}`)) });

substituirModulo('config/database.js', { connectToDb: () => Promise.resolve(poolFalso), sql: sqlFalso });
substituirModulo('modules/whatsapp/evolution.js', envioFalso('whatsapp'));
substituirModulo('shared/email.js', envioFalso('email'));
substituirModulo('shared/limiteBanco.js', { registrar: () => Promise.resolve(null), zerar: () => Promise.resolve() });

function tokenDe({ perfil = 'Administrador', id = 1 } = {}) {
    return jwt.sign({ id_usuario: id, perfil_acesso: perfil, nome_completo: 'Teste' }, process.env.JWT_SECRET);
}

function montarPedido({ metodo = 'GET', corpo, formulario, perfil, id, anonimo }) {
    const headers = { Accept: 'application/json' };
    if (!anonimo) headers.Authorization = `Bearer ${tokenDe({ perfil, id })}`;
    if (formulario) {
        const dados = new FormData();
        Object.entries(formulario).forEach(([chave, valor]) => dados.append(chave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor)));
        return { method: metodo, headers, body: dados };
    }
    if (corpo === undefined) return { method: metodo, headers };
    return { method: metodo, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) };
}

/* Depende da hora em que o teste roda: não entra na base. */
const CAMPOS_DO_RELOGIO = ['dentroDoHorario'];
const limparResposta = (texto) => JSON.parse(JSON.stringify(texto, (chave, valor) => (CAMPOS_DO_RELOGIO.includes(chave) ? '<relogio>' : normalizarValor(valor))));

/**
 * @param {string} nome arquivo da base
 * @param {{nome:string, metodo?:string, url:string, corpo?:object, formulario?:object, perfil?:string, id?:number, anonimo?:boolean, respostas?:[RegExp, object[]][]}[]} casos
 */
function caracterizar(nome, casos) {
    const arquivoBase = path.join(PASTA_BASE, `${nome}.json`);
    const atualizar = process.env.ATUALIZAR_BASE === '1';
    const base = !atualizar && fs.existsSync(arquivoBase) ? JSON.parse(fs.readFileSync(arquivoBase, 'utf8')) : {};
    const novaBase = {};
    let servidor;
    let endereco;

    before(async () => {
        const { criarApp } = require(path.join(FONTE, 'app.js'));
        await new Promise((pronto) => { servidor = criarApp().listen(0, '127.0.0.1', pronto); });
        endereco = `http://127.0.0.1:${servidor.address().port}/api/v1`;
    });

    after(() => {
        servidor.close();
        if (atualizar) {
            fs.mkdirSync(PASTA_BASE, { recursive: true });
            fs.writeFileSync(arquivoBase, `${JSON.stringify(novaBase, null, 2)}\n`);
        }
    });

    for (const caso of casos) {
        test(`${nome}: ${caso.nome}`, async () => {
            registro.consultas = [];
            registro.externos = [];
            respostasDoCaso = caso.respostas ?? [];
            perfilDoCaso = caso.perfil ?? 'Administrador';
            const resposta = await fetch(`${endereco}${caso.url}`, montarPedido(caso));
            const texto = await resposta.text();
            let corpo;
            try { corpo = limparResposta(JSON.parse(texto)); } catch { corpo = '<nao-json>'; }
            // Os envios saem em segundo plano depois da resposta.
            await new Promise((pronto) => { setTimeout(pronto, 30); });
            const obtido = { status: resposta.status, corpo, consultas: registro.consultas, externos: registro.externos };
            if (atualizar) {
                novaBase[caso.nome] = obtido;
                return;
            }
            assert.ok(base[caso.nome], `Sem base para "${caso.nome}": rode ATUALIZAR_BASE=1 no código anterior à mudança.`);
            assert.deepEqual(JSON.parse(JSON.stringify(obtido)), base[caso.nome]);
        });
    }
}

module.exports = { caracterizar };
