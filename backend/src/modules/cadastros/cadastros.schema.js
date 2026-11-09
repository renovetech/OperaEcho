/* Entrada das rotas de escrita dos cadastros (projetos, produtos, unidades e importação de coordenadas).
 * A web (frontend/src/features/cadastros) envia ids e textos como número ou texto (a lista de seleção devolve texto),
 * vazios como '' e as coordenadas como texto; campos a mais são mantidos. O app mobile não usa estas rotas.
 * Os campos obrigatórios (nome, categoria, projeto, coordenadas, linhas da planilha) não são recusados aqui: os handlers
 * já respondem a eles com mensagem própria, e essa mensagem continua sendo a resposta. */
const { z } = require('zod');

const escalar = z.union([z.string(), z.number(), z.boolean()]).nullable().optional();
const comoObjeto = (esquema) => z.preprocess((corpo) => (corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {}), esquema);

const ehObjeto = (item) => item !== null && typeof item === 'object' && !Array.isArray(item);

/** Lista da planilha: qualquer coisa que não seja lista é recusada pelo handler ('Planilha vazia.'); itens que não são objetos quebrariam o handler. */
const linhasDaPlanilha = z.unknown().superRefine((valor, contexto) => {
    if (Array.isArray(valor) && !valor.every(ehObjeto)) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, message: 'Cada linha da planilha deve ser um objeto { cnes, latitude, longitude }.' });
    }
});

const salvarProjeto = comoObjeto(z.object({
    id_projeto: escalar,
    nome_projeto: escalar,
    categoria: escalar,
    ativo: escalar,
    gera_lotacao: escalar,
    painel_publico: escalar,
    slug_publico: escalar
}).passthrough());

const salvarProduto = comoObjeto(z.object({
    id_produto: escalar,
    nome_produto: escalar,
    ativo: escalar
}).passthrough());

const salvarUnidade = comoObjeto(z.object({
    id_unidade: escalar,
    nome_unidade: escalar,
    cnes: escalar,
    id_projeto: escalar,
    id_cidade: escalar,
    id_macro: escalar,
    id_micro: escalar,
    id_tipo_unidade: escalar,
    latitude: escalar,
    longitude: escalar,
    ativo: escalar,
    produtos: z.array(escalar).nullable().optional()
}).passthrough());

const importarCoordenadas = comoObjeto(z.object({
    id_projeto: escalar,
    linhas: linhasDaPlanilha.optional()
}).passthrough());

module.exports = { salvarProjeto, salvarProduto, salvarUnidade, importarCoordenadas };
