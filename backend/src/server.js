/* Sobe a API: ambiente, porta, conexão inicial e fila do WhatsApp. */
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
// Hora local do sistema = Brasília, qualquer que seja o fuso do servidor (a VPS fica em UTC). Vale para "agora" no Node:
// janela de envio do WhatsApp, escala semanal, "hoje". O banco grava GETDATE() em UTC e a conversão é feita nas consultas.
// Colunas DATE chegam do driver em UTC: leia com getUTC*().
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

const TAMANHO_MINIMO_SEGREDO = 32;
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < TAMANHO_MINIMO_SEGREDO) {
    console.error('JWT_SECRET ausente ou fraco (mín. 32 caracteres). Abortando.');
    process.exit(1);
}

const { criarApp } = require('./app');
const { connectToDb } = require('./config/database');

const PORTA = process.env.PORT || 3001;
const LIMITE_CABECALHOS_MS = 20 * 1000;
const LIMITE_REQUISICAO_MS = 10 * 60 * 1000;
const LIMITE_OCIOSA_MS = 10 * 1000;

// API_HOST, e não HOST: no Linux, HOST pode vir preenchida pelo ambiente com o nome da máquina.
const servidor = criarApp().listen(PORTA, process.env.API_HOST || '0.0.0.0', async () => {
    console.log(`\nOpera Echo API rodando na porta ${PORTA}`);
    try {
        const pool = await connectToDb();
        // Fora da requisição: a consulta pública do SIGTAP não dispara criação de estrutura nem cai se ela falhar.
        await require('./modules/sigtap/sigtap.importacao').garantirEstrutura(pool);
    } catch (falha) {
        console.error('Falha na conexão inicial com o banco:', falha.message);
    }
    require('./modules/whatsapp/fila').iniciar();
});

// Anti "slowloris": conexões que enviam cabeçalhos ou corpo a conta-gotas são derrubadas. Uploads grandes têm até 10 min.
servidor.headersTimeout = LIMITE_CABECALHOS_MS;
servidor.requestTimeout = LIMITE_REQUISICAO_MS;
servidor.keepAliveTimeout = LIMITE_OCIOSA_MS;
servidor.maxConnections = parseInt(process.env.MAX_CONEXOES || '2000', 10);
