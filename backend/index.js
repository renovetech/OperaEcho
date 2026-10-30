/* index.js - Opera Echo API v2.1 (Modular) */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const jwt = require('jsonwebtoken');
const { connectToDb } = require('./config/database');
const { errorHandler } = require('./middlewares/errorHandler');
const { autenticar, exigirAutenticacao } = require('./middlewares/auth');
const { carregarEscopo } = require('./middlewares/lotacao');
const { limitar } = require('./utils/rateLimit');
const { protegerUploads } = require('./utils/arquivos');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET ausente ou fraco (mín. 32 caracteres). Abortando.');
    process.exit(1);
}

// Importa rotas
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const cadastrosRoutes = require('./routes/cadastros');
const dashboardRoutes = require('./routes/dashboard');
const atividadesRoutes = require('./routes/atividades');
const planoAcaoRoutes = require('./routes/planoAcao');
const planoAcaoPublicoRoutes = require('./routes/planoAcaoPublico');
const escalasRoutes = require('./routes/escalas');
const feriasRoutes = require('./routes/ferias');
const horaExtraRoutes = require('./routes/horaExtra');
const relatoriosRoutes = require('./routes/relatorios');
const publicasRoutes = require('./routes/publicas');
const geradorNotasRoutes = require('./routes/geradorNotas');
const projetosRoutes = require('./routes/projetos');

const app = express();
app.disable('x-powered-by');
// Nº de proxies reversos à frente da API (nginx/IIS/Cloudflare). Com valor errado,
// o IP do cliente pode ser forjado via X-Forwarded-For e burlar os limites por IP.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY || '1', 10));

// ==============================================================================
// MIDDLEWARES GLOBAIS
// ==============================================================================
// Limite global por IP contra enxurrada de requisições (flood / scraping).
// Valor alto de propósito: vários usuários de uma mesma unidade saem pelo mesmo IP.
app.use(limitar({
    janelaMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_IP_MIN || '1500', 10),
    mensagem: 'Muitas requisições a partir do seu endereço. Aguarde um instante.'
}));

// CORS: restrinja em produção via CORS_ORIGINS="https://operaecho.com,https://www.operaecho.com"
// (o app mobile não usa CORS; o web é servido pela mesma origem)
const origens = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (!origens.length) console.warn('CORS_ORIGINS não definido: qualquer site pode chamar esta API pelo navegador.');
app.use(cors(origens.length ? { origin: origens } : undefined));

// Cabeçalhos de segurança básicos (sem dependência extra)
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// Corpo JSON: anônimo (login, autocadastro, rotas públicas) só até 200 KB;
// com sessão válida, até JSON_LIMIT.
const jsonAnonimo = express.json({ limit: '200kb' });
const jsonSessao = express.json({ limit: process.env.JSON_LIMIT || '25mb' });
app.use((req, res, next) => {
    const h = req.headers.authorization || '';
    let valido = false;
    if (h.startsWith('Bearer ')) { try { valido = !jwt.verify(h.slice(7), process.env.JWT_SECRET).finalidade; } catch (e) { /* inválido */ } }
    return (valido ? jsonSessao : jsonAnonimo)(req, res, next);
});

// Anexos: exigem sessão ou link assinado
app.use('/uploads', protegerUploads, express.static(path.join(__dirname, 'uploads'), {
    dotfiles: 'deny', index: false,
    setHeaders: (res) => { res.setHeader('Cache-Control', 'private, no-store'); }
}));

// ==============================================================================
// FRONTEND ESTÁTICO (BUILD DO REACT) - servido antes da barreira de JWT
// ==============================================================================
const buildPath = process.env.FRONT_BUILD_PATH || path.join(__dirname, '../opera-echo-front/build');
const spaIndex = path.join(buildPath, 'index.html');
app.use(express.static(buildPath, { index: false }));

// ==============================================================================
// ROTAS PÚBLICAS (sem JWT)
// ==============================================================================
app.use('/', publicasRoutes);
app.use('/', authRoutes);
app.use('/', require('./routes/painelProjetoPublico')); // painel público do projeto (operaecho.com/<slug>)
app.use('/', planoAcaoPublicoRoutes); // painéis públicos do Plano de Ação (somente leitura)

// ==============================================================================
// ROTAS PROTEGIDAS (com JWT)
// Exige JWT, salvo as exceções necessárias à tela de login/autocadastro.
// ==============================================================================
const ROTAS_LIVRES = [
    ['GET', /^\/projetos\/?$/],          // autocadastro (lista de lotações)
    ['GET', /^\/setores\/?$/],
    ['GET', /^\/funcoes\/?$/],
    ['GET', /^\/cidades\/[^/]+\/?$/],
    ['POST', /^\/usuarios\/salvar\/?$/],  // autocadastro: rota restringe o anônimo a INSERT inativo
    // Consulta SIGTAP pública (operaecho.com/sigtap) - somente leitura do catálogo; importação segue protegida
    ['GET', /^\/sigtap\/(competencias|filtros|procedimentos|compatibilidades|tabelas)(\/[^/]+)?\/?$/]
];
app.use(autenticar, exigirAutenticacao({ livres: ROTAS_LIVRES, spaIndex }), carregarEscopo);
// Limite por USUÁRIO autenticado (um token roubado/abusado não monopoliza o servidor)
app.use(limitar({
    janelaMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_USUARIO_MIN || '600', 10),
    chave: (req) => `u:${req.usuario ? req.usuario.id_usuario : req.ip}`,
    mensagem: 'Muitas requisições em pouco tempo. Aguarde um instante.'
}));
// Respostas da API não ficam em cache de navegador/proxy (dados pessoais)
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(require('./middlewares/validarDatas').validarDatasQuery);
app.use(require('./middlewares/validarDatas').limitarPeriodoRelatorios);

app.use('/', usuariosRoutes);
app.use('/', cadastrosRoutes);
app.use('/', dashboardRoutes);
app.use('/', atividadesRoutes);
app.use('/', planoAcaoRoutes);
app.use('/', escalasRoutes);
app.use('/', feriasRoutes);
app.use('/', horaExtraRoutes);
app.use('/', relatoriosRoutes);
app.use('/', geradorNotasRoutes);
app.use('/', projetosRoutes);
app.use(require('./routes/projAtividades'));
app.use(require('./routes/projHoraExtra'));
app.use(require('./routes/projEscalas'));
app.use(require('./routes/linksExternos'));
app.use(require('./routes/parametros'));
app.use(require('./routes/regioes'));
app.use(require('./routes/sigtap'));
app.use(require('./routes/whatsapp'));

// Fallback do SPA (rotas do React) para usuários autenticados / rotas livres
app.get(/.*/, function (req, res) {
    res.sendFile(spaIndex, (err) => { if (err) res.status(404).json({ erro: 'Recurso não encontrado.' }); });
});

// ==============================================================================
// HANDLER GLOBAL DE ERROS (deve ser o último middleware)
// ==============================================================================
app.use(errorHandler);

// ==============================================================================
// START
// ==============================================================================
const PORT = process.env.PORT || 3001;
// API_HOST (e não HOST): no Linux, HOST pode vir preenchida pelo ambiente com o nome da máquina.
const server = app.listen(PORT, process.env.API_HOST || '0.0.0.0', async () => {
    console.log(`\nOpera Echo API v2.1 rodando na porta ${PORT}`);
    try {
        await connectToDb();
    } catch (e) {
        console.error("Falha na conexão inicial com o banco:", e.message);
    }
    // Fila do WhatsApp (escala, férias, código de senha) - ver services/whatsapp/fila.js
    require('./services/whatsapp/fila').iniciar();
});

// Anti "slowloris": conexões que enviam cabeçalhos/corpo a conta-gotas para
// segurar sockets abertos são derrubadas. Uploads grandes têm até 10 min.
server.headersTimeout = 20 * 1000;
server.requestTimeout = 10 * 60 * 1000;
server.keepAliveTimeout = 10 * 1000;
server.maxConnections = parseInt(process.env.MAX_CONEXOES || '2000', 10);
