/* Regras de filtro da consulta SIGTAP: tratamento dos parâmetros, vínculos com procedimentos e tabelas auxiliares.
 * Só monta pedaços de SQL; quem executa é sigtap.repository.js. */
const { sql } = require('../../config/database');

const P = 'tab_sigtap_';
const limpar = (v, max = 12) => String(v || '').replace(/[^0-9A-Za-z.]/g, '').slice(0, max);
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const inteiro = (v, padrao, min, max) => { const n = parseInt(v, 10); return isNaN(n) ? padrao : Math.min(max, Math.max(min, n)); };

/** Filtro de texto: código (com ou sem pontuação) ou palavras do nome, em qualquer ordem, sem acento. */
function filtroTexto(req, termo, colCodigo, colNome, prefixo) {
    const t = String(termo || '').trim().slice(0, 120);
    if (!t) return '';
    const dig = soDigitos(t);
    if (dig.length >= 2 && /^[\d.\s-]+$/.test(t)) {
        req.input(`${prefixo}c`, sql.VarChar(12), `${dig}%`);
        return ` AND ${colCodigo} LIKE @${prefixo}c`;
    }
    const palavras = t.split(/\s+/).filter(Boolean).slice(0, 6);
    return palavras.map((w, i) => {
        req.input(`${prefixo}${i}`, sql.NVarChar(130), `%${w}%`);
        return ` AND ((${colNome}) COLLATE Latin1_General_CI_AI LIKE @${prefixo}${i} OR ${colCodigo} LIKE @${prefixo}${i})`;
    }).join('');
}

/* Vínculos usados para filtrar procedimentos (p = tab_sigtap_tb_procedimento). `x` é a expressão do código. */
const EXISTE = (tabela, cond) => `EXISTS (SELECT 1 FROM ${P}${tabela} v WHERE v.competencia = p.competencia AND v.co_procedimento = p.co_procedimento AND ${cond})`;
const VINCULOS = {
    grupo: (x) => `LEFT(p.co_procedimento, 2) = ${x}`,
    subgrupo: (x) => `LEFT(p.co_procedimento, 4) = ${x}`,
    forma: (x) => `LEFT(p.co_procedimento, 6) = ${x}`,
    financiamento: (x) => `p.co_financiamento = ${x}`,
    rubrica: (x) => `p.co_rubrica = ${x}`,
    modalidade: (x) => EXISTE('rl_procedimento_modalidade', `v.co_modalidade = ${x}`),
    registro: (x) => EXISTE('rl_procedimento_registro', `v.co_registro = ${x}`),
    leito: (x) => EXISTE('rl_procedimento_leito', `v.co_tipo_leito = ${x}`),
    detalhe: (x) => EXISTE('rl_procedimento_detalhe', `v.co_detalhe = ${x}`),
    servico: (x) => EXISTE('rl_procedimento_servico', `v.co_servico + '.' + v.co_classificacao = ${x}`),
    habilitacao: (x) => EXISTE('rl_procedimento_habilitacao', `v.co_habilitacao = ${x}`),
    grupo_habilitacao: (x) => EXISTE('rl_procedimento_habilitacao', `v.nu_grupo_habilitacao = ${x}`),
    ocupacao: (x) => EXISTE('rl_procedimento_ocupacao', `v.co_ocupacao = ${x}`),
    cid: (x) => EXISTE('rl_procedimento_cid', `v.co_cid = ${x}`),
    regra: (x) => EXISTE('rl_procedimento_regra_cond', `v.co_regra_condicionada = ${x}`),
    renases: (x) => EXISTE('rl_procedimento_renases', `v.co_renases = ${x}`),
    tuss: (x) => EXISTE('rl_procedimento_tuss', `v.co_tuss = ${x}`),
    rede: (x) => EXISTE('rl_procedimento_comp_rede', `v.co_componente_rede = ${x}`),
    sia_sih: (x) => EXISTE('rl_procedimento_sia_sih', `v.co_procedimento_sia_sih = ${x}`)
};

/* Tabelas auxiliares navegáveis (menu "Tabelas" do DATASUS). t = tabela principal. */
const J = (tabela, alias, on) => `LEFT JOIN ${P}${tabela} ${alias} ON ${alias}.competencia = t.competencia AND ${on}`;
const REFERENCIAS = {
    grupo: { titulo: 'Grupos', from: `${P}tb_grupo t`, cod: 't.co_grupo', nome: 't.no_grupo', vinculo: 'grupo' },
    sub_grupo: { titulo: 'Subgrupos', from: `${P}tb_sub_grupo t ${J('tb_grupo', 'g', 'g.co_grupo = t.co_grupo')}`, cod: 't.co_grupo + t.co_sub_grupo', nome: 't.no_sub_grupo', extra: { grupo: 'g.no_grupo' }, vinculo: 'subgrupo' },
    forma_organizacao: { titulo: 'Formas de Organização', from: `${P}tb_forma_organizacao t ${J('tb_sub_grupo', 's', 's.co_grupo = t.co_grupo AND s.co_sub_grupo = t.co_sub_grupo')}`, cod: 't.co_grupo + t.co_sub_grupo + t.co_forma_organizacao', nome: 't.no_forma_organizacao', extra: { sub_grupo: 's.no_sub_grupo' }, vinculo: 'forma' },
    financiamento: { titulo: 'Financiamentos', from: `${P}tb_financiamento t`, cod: 't.co_financiamento', nome: 't.no_financiamento', vinculo: 'financiamento' },
    rubrica: { titulo: 'Rubricas', from: `${P}tb_rubrica t`, cod: 't.co_rubrica', nome: 't.no_rubrica', vinculo: 'rubrica' },
    modalidade: { titulo: 'Modalidades de Atendimento', from: `${P}tb_modalidade t`, cod: 't.co_modalidade', nome: 't.no_modalidade', vinculo: 'modalidade' },
    registro: { titulo: 'Instrumentos de Registro', from: `${P}tb_registro t`, cod: 't.co_registro', nome: 't.no_registro', vinculo: 'registro' },
    ocupacao: { titulo: 'CBO - Ocupações', from: `${P}tb_ocupacao t`, cod: 't.co_ocupacao', nome: 't.no_ocupacao', vinculo: 'ocupacao' },
    cid: { titulo: 'CID-10', from: `${P}tb_cid t`, cod: 't.co_cid', nome: 't.no_cid', extra: { agravo: 't.tp_agravo', sexo: 't.tp_sexo', estadio: 't.tp_estadio', campos_irradiados: 't.vl_campos_irradiados' }, vinculo: 'cid' },
    habilitacao: { titulo: 'Habilitações', from: `${P}tb_habilitacao t`, cod: 't.co_habilitacao', nome: 't.no_habilitacao', vinculo: 'habilitacao' },
    grupo_habilitacao: { titulo: 'Grupos de Habilitação', from: `${P}tb_grupo_habilitacao t`, cod: 't.nu_grupo_habilitacao', nome: "t.no_grupo_habilitacao + ISNULL(' - ' + t.ds_grupo_habilitacao, '')", vinculo: 'grupo_habilitacao' },
    servico: { titulo: 'Serviços / Classificações', from: `${P}tb_servico_classificacao t ${J('tb_servico', 's', 's.co_servico = t.co_servico')}`, cod: "t.co_servico + '.' + t.co_classificacao", nome: 't.no_classificacao', extra: { servico: 's.no_servico' }, vinculo: 'servico' },
    tipo_leito: { titulo: 'Tipos de Leito', from: `${P}tb_tipo_leito t`, cod: 't.co_tipo_leito', nome: 't.no_tipo_leito', vinculo: 'leito' },
    detalhe: { titulo: 'Atributos Complementares (Detalhes)', from: `${P}tb_detalhe t ${J('tb_descricao_detalhe', 'd', 'd.co_detalhe = t.co_detalhe')}`, cod: 't.co_detalhe', nome: 't.no_detalhe', extra: { descricao: 'd.ds_detalhe' }, vinculo: 'detalhe' },
    rede: { titulo: 'Redes de Atenção', from: `${P}tb_componente_rede t ${J('tb_rede_atencao', 'r', 'r.co_rede_atencao = t.co_rede_atencao')}`, cod: 't.co_componente_rede', nome: 't.no_componente_rede', extra: { rede: 'r.no_rede_atencao' }, vinculo: 'rede' },
    regra: { titulo: 'Regras Condicionadas', from: `${P}tb_regra_condicionada t`, cod: 't.co_regra_condicionada', nome: 't.no_regra_condicionada', extra: { descricao: 't.ds_regra_condicionada' }, vinculo: 'regra' },
    renases: { titulo: 'RENASES', from: `${P}tb_renases t`, cod: 't.co_renases', nome: 't.no_renases', vinculo: 'renases' },
    tuss: { titulo: 'TUSS', from: `${P}tb_tuss t`, cod: 't.co_tuss', nome: 't.no_tuss', vinculo: 'tuss' },
    sia_sih: { titulo: 'Procedimentos SIA/SIH (tabela antiga)', from: `${P}tb_sia_sih t`, cod: 't.co_procedimento_sia_sih', nome: 't.no_procedimento_sia_sih', extra: { tipo: 't.tp_procedimento' }, vinculo: 'sia_sih' }
};

module.exports = { P, limpar, soDigitos, inteiro, filtroTexto, VINCULOS, REFERENCIAS };
