/* Contrato das rotas: o mobile segue na raiz e o resto da API só existe em /api/v1. Roda sem banco: testa só a barreira. */
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
process.env.CORS_ORIGINS = 'http://localhost';

const { criarApp, PREFIXO_API } = require('../src/app');
const { estaNoContrato } = require('../src/legacy-mobile/contrato');

let servidor;
let base;

before(async () => {
    await new Promise((pronto) => { servidor = criarApp().listen(0, '127.0.0.1', pronto); });
    base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor.close());

const chamar = (caminho, metodo = 'GET') => fetch(`${base}${caminho}`, { method: metodo, headers: { Accept: 'application/json' } });

/* Toda rota protegida do contrato: sem sessão responde 401 em JSON, nunca a página do site. */
const PROTEGIDAS = [
    ['GET', '/regras/Administrador'], ['GET', '/parametros'], ['GET', '/motivos'], ['GET', '/projetos/minhas-lotacoes'],
    ['GET', '/implantadores'], ['GET', '/unidades/buscar'], ['GET', '/unidades/1/produtos'], ['GET', '/ferias/historico/1'],
    ['POST', '/ferias/salvar'], ['POST', '/rastreio-background'],
    ['GET', '/atividades/buscar'], ['POST', '/atividades/salvar'], ['DELETE', '/atividades/1'], ['GET', '/escalas'],
    ['GET', '/hora-extra/buscar'], ['GET', '/hora-extra/detalhes/1'], ['POST', '/hora-extra/salvar'], ['DELETE', '/hora-extra/1'],
    ['GET', '/projetos/atividades/buscar'], ['POST', '/projetos/atividades/salvar'], ['DELETE', '/projetos/atividades/1'], ['GET', '/projetos/escalas'],
    ['GET', '/projetos/hora-extra/buscar'], ['GET', '/projetos/hora-extra/detalhes/1'], ['POST', '/projetos/hora-extra/salvar'], ['DELETE', '/projetos/hora-extra/1']
];

for (const [metodo, caminho] of PROTEGIDAS) {
    test(`mobile ${metodo} ${caminho} exige sessão na raiz e em /api/v1`, async () => {
        for (const url of [caminho, `${PREFIXO_API}${caminho}`]) {
            const resposta = await chamar(url, metodo);
            assert.equal(resposta.status, 401, url);
            assert.equal(typeof (await resposta.json()).erro, 'string');
        }
    });
}

test('rotas públicas do contrato estão no filtro', () => {
    [['POST', '/login'], ['POST', '/recuperar-senha/canais'], ['POST', '/recuperar-senha/confirmar'], ['GET', '/app-version'], ['GET', '/projetos'], ['GET', '/sigtap/competencias'], ['GET', '/sigtap/procedimentos'], ['GET', '/sigtap/procedimentos/0101010010']]
        .forEach(([metodo, caminho]) => assert.ok(estaNoContrato(metodo, caminho), caminho));
});

test('app-version responde na raiz, sem sessão', async () => {
    const resposta = await chamar('/app-version');
    assert.equal(resposta.status, 200);
    assert.match(resposta.headers.get('content-type'), /json/);
});

test('o que não é do mobile saiu da raiz, mas existe em /api/v1', async () => {
    const naoMobile = ['/usuarios/buscar', '/relatorios/projetos-ativos', '/faturamento/lancamentos', '/plano-acao'];
    for (const caminho of naoMobile) {
        assert.equal(estaNoContrato('GET', caminho), false, caminho);
        const raiz = await chamar(caminho);
        assert.notEqual(raiz.status, 401, `${caminho} ainda responde como API na raiz`);
        assert.equal((await chamar(`${PREFIXO_API}${caminho}`)).status, 401, caminho);
    }
});

test('rota inexistente em /api/v1 responde 401 sem sessão, nunca a página do site', async () => {
    const resposta = await chamar(`${PREFIXO_API}/nao-existe`);
    assert.equal(resposta.status, 401);
    assert.match(resposta.headers.get('content-type'), /json/);
});

test('abrir uma URL do contrato no navegador não vira chamada de API', async () => {
    const resposta = await fetch(`${base}/hora-extra/buscar`, { headers: { Accept: 'text/html' } });
    assert.notEqual(resposta.status, 401);
});

test('cabeçalhos de segurança presentes', async () => {
    const resposta = await chamar('/app-version');
    assert.equal(resposta.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(resposta.headers.get('x-powered-by'), null);
});
