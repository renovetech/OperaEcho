/* Entrada das rotas de escrita do Plano de Ação. Os esquemas só conferem o formato (texto, número, lista de objetos):
 * campos obrigatórios, datas e limites continuam sendo conferidos pelas regras, que respondem com mensagem própria.
 * Nada é convertido nem removido: campos a mais passam, e quem não é objeto vira {} (como `req.body || {}` fazia). */
const { z } = require('zod');

/** Valor simples vindo da tela: texto, número, booleano ou vazio. Objetos e listas não são aceitos. */
const simples = z.union([z.string(), z.number(), z.boolean(), z.null()]).optional();

const comoObjeto = (valor) => (valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {});
const corpo = (campos) => z.preprocess(comoObjeto, z.object(campos).passthrough());
const listaDe = (item) => z.array(item).optional();
const listaSimples = listaDe(simples);

/** Ação com texto, módulo, responsável, prioridade e prazos (usada nas etapas do plano e do modelo de unidade). */
const etapa = z.object({
    acao: simples, modulo: simples, grupo: simples, responsavel: simples, prioridade: simples, data_inicio: simples, data_fim: simples
}).passthrough();

const criarPlano = corpo({
    titulo: simples, id_projeto: simples, id_produto: simples, sub_tipo: simples, cliente: simples, descricao: simples,
    data_inicio_prevista: simples, data_fim_prevista: simples, publico: simples,
    unidades_ids: listaSimples, etapas_padrao: listaDe(etapa), etapas_unidade: listaDe(etapa)
});

const atualizarPlano = corpo({
    titulo: simples, cliente: simples, descricao: simples, data_inicio_prevista: simples, data_fim_prevista: simples
});

const publicarPlano = corpo({ publico: simples, regenerar: simples });

const encerrarPlano = corpo({ justificativa: simples });

const apontarHoras = corpo({ id_usuario: simples, data_execucao: simples, minutos: simples, descricao: simples });

const moverItem = corpo({ direcao: simples });

const incluirItem = corpo({
    descricao: simples, responsavel: simples, cliente: simples, data_inicio: simples, data_fim: simples, prioridade: simples,
    grupo: simples, modulo: simples, id_unidade: simples, apos_id_item: simples
});

const linhaDaGrade = z.object({
    id_item: simples, descricao: simples, responsavel: simples, cliente: simples, observacao: simples, prioridade: simples, status: simples,
    percentual: simples, tempo_previsto: simples, data_inicio: simples, data_fim: simples, data_inicio_real: simples, data_fim_real: simples,
    equipe: listaSimples
}).passthrough();

const salvarGrade = corpo({ id_plano: simples, etapas: listaDe(linhaDaGrade) });

const adicionarUnidade = corpo({ id_plano: simples, id_unidade: simples, etapas_template: listaDe(etapa) });

const renomearEtapa = corpo({ modulo: simples, de: simples, para: simples });

module.exports = {
    criarPlano, atualizarPlano, publicarPlano, encerrarPlano, apontarHoras, moverItem, incluirItem, salvarGrade, adicionarUnidade, renomearEtapa
};
