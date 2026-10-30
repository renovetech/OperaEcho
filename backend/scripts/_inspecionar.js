// Script temporário de inspeção (somente leitura): endereço Evolution usado pelo Renove (sem token)
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { connectToDb } = require('../config/database');
(async () => {
    const pool = await connectToDb();
    const q = async (t) => (await pool.request().query(t)).recordset;
    console.log(JSON.stringify(await q("SELECT name FROM sys.databases WHERE name LIKE '%RENOVE%'")));
    try {
        console.log(JSON.stringify(await q("SELECT IdUnidade, Ativo, UrlApi, InstanciaWhatsapp FROM SRV_RENOVESAUDE.dbo.Configuracoes_Integracoes WHERE TipoIntegracao='WHATSAPP'")));
    } catch (e) { console.log('sem acesso:', e.message); }
    process.exit(0);
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
