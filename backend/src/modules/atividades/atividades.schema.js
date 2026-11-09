/* Entrada da gravação de atividade, conferida depois do multer e das regras com mensagem própria: os campos chegam
 * em texto (web e app enviam multipart) e o obrigatório já foi cobrado. Aqui fica só o formato do que vai ao SQL.
 * Nada é convertido, para o valor gravado continuar o mesmo; campos a mais são mantidos. */
const { z } = require('zod');

const escalar = z.union([z.string(), z.number()]).nullable().optional();
const idOuVazio = z.union([z.number().int(), z.string().regex(/^\d*$/, 'Use apenas números.')]).nullable().optional();
const dataOuVazia = z.string().regex(/^(\d{4}-\d{2}-\d{2}.*)?$/, 'Use o formato AAAA-MM-DD.').nullable().optional();

const salvarAtividade = z.object({
    id_atividade: idOuVazio,
    id_projeto: idOuVazio,
    id_unidade: idOuVazio,
    data_inicio: dataOuVazia,
    data_fim: dataOuVazia,
    motivos: escalar,
    redmine: escalar,
    profissionais_env: escalar,
    tempo_gasto: escalar,
    produtos_trabalhados: escalar,
    arquivos_antigos_mantidos: escalar,
    nome_usuario_upload: escalar
}).passthrough();

module.exports = { salvarAtividade };
