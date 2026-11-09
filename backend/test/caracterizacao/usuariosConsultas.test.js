/* Consultas de GET /implantadores e GET /usuarios/:id/lotacoes. O SQL delas é igual ao da consulta de sessão que o
 * apoio de caracterização não registra; por isso montam-se só estas rotas, com um banco falso que registra tudo.
 *   ATUALIZAR_BASE=1 node --test test/caracterizacao/usuariosConsultas.test.js   regrava a base */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const express = require('express');

process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';

const ARQUIVO_BASE = path.join(__dirname, 'base', 'usuariosConsultas.json');
const FONTE = path.join(__dirname, '..', '..', 'src');
const registro = { consultas: [] };
let linhasDoCaso = [];

class PedidoFalso {
    constructor() { this.entradas = {}; }

    input(nome, tipo, valor) {
        this.entradas[nome] = arguments.length === 2 ? tipo : valor;
        return this;
    }

    query(texto) {
        registro.consultas.push({ texto: String(texto).replace(/\s+/g, ' ').trim(), entradas: this.entradas });
        return Promise.resolve({ recordset: linhasDoCaso });
    }
}

const tipoFalso = new Proxy(function tipo() { return 'tipo'; }, { get: () => tipoFalso });
const sqlFalso = new Proxy({ Request: PedidoFalso }, { get: (alvo, prop) => (prop in alvo ? alvo[prop] : tipoFalso) });
const poolFalso = { request: () => new PedidoFalso() };
const arquivoBanco = require.resolve(path.join(FONTE, 'config', 'database.js'));
require.cache[arquivoBanco] = { id: arquivoBanco, filename: arquivoBanco, loaded: true, exports: { connectToDb: () => Promise.resolve(poolFalso), sql: sqlFalso } };

const escopo = (extra) => ({ global: false, lotacoes: [2, 4], id_lotacao_home: 2, nome_funcao: 'Analista', perfil_acesso: 'Gestor', ...extra });
const linhas = [{ id_usuario: 1, nome_completo: 'Ana', senha_hash: 'segredo' }, { id_usuario: 2, nome_completo: 'Beto', senha_hash: 'segredo' }];

const casos = [
    { nome: 'implantadores: administrador vê todos', url: '/implantadores', escopo: escopo({ global: true, perfil_acesso: 'Administrador' }) },
    { nome: 'implantadores: lotação escolhida', url: '/implantadores?id_projeto=3', escopo: escopo() },
    { nome: 'implantadores: lotação pelo parâmetro lotacao', url: '/implantadores?lotacao=4', escopo: escopo() },
    { nome: 'implantadores: escala só operadores e analistas', url: '/implantadores?id_projeto=3&escala=1', escopo: escopo() },
    { nome: 'implantadores: escala com a opção true', url: '/implantadores?lotacao=3&escala=true', escopo: escopo() },
    { nome: 'implantadores: vigência na semana da escala', url: '/implantadores?id_projeto=3&escala_inicio=2026-10-05&escala_fim=2026-10-11', escopo: escopo() },
    { nome: 'implantadores: Todos com vigência', url: '/implantadores?lotacao=Todos&escala_inicio=2026-10-05&escala_fim=2026-10-11', escopo: escopo({ nome_funcao: 'Gerente' }) },
    { nome: 'implantadores: só uma ponta da vigência é ignorada', url: '/implantadores?escala_inicio=2026-10-05', escopo: escopo({ nome_funcao: 'Gerente' }) },
    { nome: 'implantadores: implantador vê só implantadores', url: '/implantadores', escopo: escopo({ nome_funcao: 'Implantador' }) },
    { nome: 'implantadores: coordenador de implantação com acento', url: '/implantadores', escopo: escopo({ nome_funcao: ' Coordenador de Implantação ' }) },
    { nome: 'implantadores: demais funções ficam nas suas lotações', url: '/implantadores', escopo: escopo() },
    { nome: 'implantadores: sem lotação não vê ninguém', url: '/implantadores', escopo: escopo({ lotacoes: [] }) },
    { nome: 'implantadores: sem escopo', url: '/implantadores', escopo: null },
    { nome: 'lotações extras do usuário', url: '/usuarios/9/lotacoes', escopo: escopo({ global: true, perfil_acesso: 'Administrador' }), linhas: [{ id_projeto: 3 }, { id_projeto: 5 }] }
];

let servidor;
let endereco;
const novaBase = {};
const atualizar = process.env.ATUALIZAR_BASE === '1';
const base = !atualizar && fs.existsSync(ARQUIVO_BASE) ? JSON.parse(fs.readFileSync(ARQUIVO_BASE, 'utf8')) : {};

before(async () => {
    const app = express();
    app.use((req, res, next) => {
        req.usuario = { id_usuario: 1 };
        req.escopo = JSON.parse(decodeURIComponent(req.headers['x-escopo']));
        next();
    });
    app.use(require(path.join(FONTE, 'modules', 'usuarios', 'usuarios.routes.js')));
    app.use((erro, req, res, next) => res.status(erro.status || 500).json({ erro: erro.message }));
    await new Promise((pronto) => { servidor = app.listen(0, '127.0.0.1', pronto); });
    endereco = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => {
    servidor.close();
    if (atualizar) fs.writeFileSync(ARQUIVO_BASE, `${JSON.stringify(novaBase, null, 2)}\n`);
});

for (const caso of casos) {
    test(`usuariosConsultas: ${caso.nome}`, async () => {
        registro.consultas = [];
        linhasDoCaso = caso.linhas ?? linhas;
        const resposta = await fetch(`${endereco}${caso.url}`, { headers: { 'x-escopo': encodeURIComponent(JSON.stringify(caso.escopo)) } });
        const obtido = JSON.parse(JSON.stringify({ status: resposta.status, corpo: await resposta.json(), consultas: registro.consultas }));
        if (atualizar) {
            novaBase[caso.nome] = obtido;
            return;
        }
        assert.ok(base[caso.nome], `Sem base para "${caso.nome}": rode ATUALIZAR_BASE=1 no código anterior à mudança.`);
        assert.deepEqual(obtido, base[caso.nome]);
    });
}
