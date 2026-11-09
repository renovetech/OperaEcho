/* scripts/aplicarPatch.js
 * Executa um script .sql do backend/sql (separado por GO) no banco do .env.
 * Uso (na pasta backend): node scripts/aplicarPatch.js sql/patch_whatsapp_mensageria.sql
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { connectToDb } = require('../src/config/database');

(async () => {
    const arquivo = process.argv[2];
    if (!arquivo) { console.error('Informe o arquivo .sql'); process.exit(1); }
    const texto = fs.readFileSync(path.resolve(arquivo), 'utf8');
    const lotes = texto.split(/^\s*GO\s*$/im).map(s => s.trim()).filter(s => s && !/^(--[^\n]*\n?\s*)+$/.test(s));
    const pool = await connectToDb();
    console.log(`Banco: ${process.env.DB_DATABASE} - ${lotes.length} lote(s)`);
    for (let i = 0; i < lotes.length; i++) {
        // Índices filtrados exigem estas opções na sessão (cada lote pode usar outra conexão do pool)
        await pool.request().batch('SET ANSI_NULLS ON; SET QUOTED_IDENTIFIER ON;\n' + lotes[i]);
        console.log(`  lote ${i + 1}/${lotes.length} OK`);
    }
    console.log('Patch aplicado.');
    process.exit(0);
})().catch(e => { console.error('Falha:', e.message); process.exit(1); });
