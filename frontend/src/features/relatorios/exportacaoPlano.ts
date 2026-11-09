/* PDF e Excel do relatório Plano de Ação - Status e Execução. */
import { COR_SAUDE, COR_STATUS_ITEM, dataBR, fmtMin, minParaHHMM } from '@/features/planoAcao/formatos';
import type { DadosPlano, GrupoPlano, ItemRelatorioPlano } from '@/features/relatorios/api';
import { ajustarColunas, gerarExcel, gerarPdf, VERMELHO_PDF, type Celula, type DocumentoPdf } from '@/features/relatorios/exportacao';
import { hexParaRgb } from '@/shared/pdfRelatorio';

export const COR_PRAZO: Record<string, string> = {
    'NO PRAZO': '#2E7D32', 'FORA DO PRAZO': '#8F332F', VENCIDO: '#A23B36',
    'VENCE EM 7 DIAS': '#8A5212', 'A VENCER': '#5A625B', 'SEM PRAZO': '#8A8F88'
};
const rgb = (hex?: string) => hexParaRgb(hex ?? '#333333');
const METODOLOGIA = 'Metodologia: Execução = média do % de execução das ações (fechada = 100%). Esperado = % de ações cujo prazo previsto já venceu. Aderência = ações fechadas dentro do prazo previsto ÷ ações fechadas com prazo. Saúde: CRÍTICO (>20% atrasado, término do plano vencido ou desvio ≤ −25 p.p.), ATENÇÃO (atrasos, desvio ≤ −10 p.p. ou entregas em 7 dias), NO PRAZO (demais).';

function tabelaGrupo(pdf: DocumentoPdf, titulo: string, lista: GrupoPlano[]) {
    if (!lista.length) return;
    pdf.bloco(titulo, pdf.colors.blue);
    pdf.tabela(ajustarColunas(pdf, [{ h: 'Nome', w: 110, a: 'l' }, { h: 'Ações', w: 22, a: 'c' }, { h: 'Fechadas', w: 22, a: 'c' }, { h: 'Andamento', w: 22, a: 'c' }, { h: 'Atrasadas', w: 22, a: 'c' }, { h: '% Exec.', w: 22, a: 'c' }]),
        lista.map((item) => [item.nome, String(item.total), String(item.fechados), String(item.andamento ?? 0), String(item.atrasados), `${item.progresso}%`]));
}

function tabelaPrazos(pdf: DocumentoPdf, itens: ItemRelatorioPlano[], rotulo: string, ultima: (item: ItemRelatorioPlano) => Celula) {
    pdf.tabela(ajustarColunas(pdf, [{ h: 'Plano', w: 60, a: 'l' }, { h: 'Ação', w: 110, a: 'l' }, { h: 'Unidade', w: 50, a: 'l' }, { h: 'Responsável', w: 40, a: 'l' }, { h: 'Prazo', w: 24, a: 'c' }, { h: rotulo, w: 16, a: 'c' }]),
        itens.map((item) => [item.plano, item.descricao, item.unidade || item.grupo || '-', item.responsavel || '-', dataBR(item.data_fim), ultima(item)]));
}

function tabelaDetalhe(pdf: DocumentoPdf, lista: ItemRelatorioPlano[], comObservacoes: boolean) {
    pdf.tabela(ajustarColunas(pdf, [
        { h: 'Ação', w: 84, a: 'l' }, { h: 'Cliente', w: 36, a: 'l' }, { h: 'Etapa/Unidade', w: 38, a: 'l' }, { h: 'Resp.', w: 30, a: 'l' }, { h: 'Equipe', w: 36, a: 'l' },
        { h: 'Prev. ini/fim', w: 30, a: 'c' }, { h: 'Real ini/fim', w: 30, a: 'c' }, { h: '%', w: 11, a: 'c' }, { h: 'Situação', w: 22, a: 'c' }, { h: 'Prazo', w: 24, a: 'c' }, { h: 'Horas', w: 16, a: 'c' },
        ...(comObservacoes ? [{ h: 'Observação', w: 50, a: 'l' as const }] : [])
    ]), lista.map((item): Celula[] => [
        item.descricao, item.cliente || '-', [item.modulo, item.unidade || item.grupo].filter(Boolean).join(' · ') || '-', item.responsavel || '-', item.equipe || '-',
        `${dataBR(item.data_inicio)}\n${dataBR(item.data_fim)}`, `${dataBR(item.data_inicio_real)}\n${dataBR(item.data_fim_real)}`, `${item.percentual}%`,
        { t: item.status, bold: true, color: rgb(COR_STATUS_ITEM[item.status]) },
        { t: item.situacao_prazo, color: rgb(COR_PRAZO[item.situacao_prazo]) },
        minParaHHMM(item.horas_trabalhadas) || '-',
        ...(comObservacoes ? [item.observacao ?? ''] : [])
    ]));
}

interface OpcoesPdf {
    periodo: string;
    usuario: string;
    detalhe: boolean;
    observacoes: boolean;
    itensPorPlano: [string, ItemRelatorioPlano[]][];
}

export function pdfPlano(dados: DadosPlano, { periodo, usuario, detalhe, observacoes, itensPorPlano }: OpcoesPdf) {
    const { resumo: r } = dados;
    return gerarPdf({
        titulo: 'Plano de Ação - Status e Execução', periodo, usuario, arquivo: 'Relatorio_Plano_Acao',
        preencher: (pdf) => {
            pdf.bloco('Indicadores gerais', pdf.colors.green);
            pdf.tabela(ajustarColunas(pdf, [{ h: 'Indicador', w: 110, a: 'l' }, { h: 'Valor', w: 60, a: 'c' }, { h: 'Indicador', w: 110, a: 'l' }, { h: 'Valor', w: 60, a: 'c' }]), [
                ['Planos no recorte', String(r.planos), 'Ações', `${r.fechados}/${r.total} fechadas`],
                ['Execução realizada', `${r.progresso}%`, 'Execução esperada até hoje', `${r.esperado}% (${r.desvio > 0 ? '+' : ''}${r.desvio} p.p.)`],
                ['Ações atrasadas', { t: String(r.atrasados), color: r.atrasados ? VERMELHO_PDF : undefined, bold: true }, 'Vencem em 7 dias', String(r.vencendo_7d)],
                ['Aderência ao prazo', r.aderencia === null ? '-' : `${r.aderencia}%`, 'Horas trabalhadas / previstas', `${fmtMin(r.trabalhado_min)} / ${fmtMin(r.previsto_min)}`],
                ['A iniciar', String(r.a_iniciar), 'Em andamento', String(r.andamento)]
            ]);
            pdf.bloco('Resumo por plano', pdf.colors.green);
            pdf.tabela(ajustarColunas(pdf, [
                { h: 'Plano', w: 90, a: 'l' }, { h: 'Cliente', w: 50, a: 'l' }, { h: 'Saúde', w: 26, a: 'c' }, { h: 'Exec.', w: 18, a: 'c' },
                { h: 'Esper.', w: 18, a: 'c' }, { h: 'Ações', w: 20, a: 'c' }, { h: 'Atras.', w: 18, a: 'c' }, { h: 'Próx. prazo', w: 24, a: 'c' }, { h: 'Término', w: 24, a: 'c' }
            ]), dados.planos.map((plano) => [plano.titulo, plano.cliente || '-', { t: plano.saude, bold: true, color: rgb(COR_SAUDE[plano.saude]?.fg) }, `${plano.progresso}%`, `${plano.esperado}%`, `${plano.fechados}/${plano.total}`, String(plano.atrasados), dataBR(plano.proximo_prazo), dataBR(plano.data_fim_prevista)]));
            if (dados.por_cliente.length > 1) tabelaGrupo(pdf, 'Por cliente', dados.por_cliente);
            tabelaGrupo(pdf, 'Por etapa', dados.por_etapa);
            tabelaGrupo(pdf, 'Por responsável', dados.por_responsavel);
            tabelaGrupo(pdf, 'Por unidade', dados.por_unidade);
            if (dados.por_modulo.length > 1) tabelaGrupo(pdf, 'Por módulo', dados.por_modulo);
            if (dados.por_pessoa.length) {
                pdf.bloco('Equipe - alocação e horas trabalhadas', pdf.colors.blue);
                pdf.tabela(ajustarColunas(pdf, [{ h: 'Pessoa', w: 100, a: 'l' }, { h: 'Ações', w: 22, a: 'c' }, { h: 'Abertas', w: 22, a: 'c' }, { h: 'Atrasadas', w: 22, a: 'c' }, { h: 'Apont.', w: 22, a: 'c' }, { h: 'Horas', w: 30, a: 'c' }]),
                    dados.por_pessoa.map((pessoa) => [pessoa.nome, String(pessoa.itens), String(pessoa.abertos), String(pessoa.atrasados), String(pessoa.apontamentos), fmtMin(pessoa.trabalhado_min)]));
            }
            if (dados.atrasados.length) {
                pdf.bloco(`Ações atrasadas (${dados.atrasados.length})`, VERMELHO_PDF);
                tabelaPrazos(pdf, dados.atrasados, 'Dias', (item) => ({ t: String(item.dias_atraso ?? '-'), bold: true, color: VERMELHO_PDF }));
            }
            if (dados.proximos_prazos.length) {
                pdf.bloco(`Próximos prazos - 15 dias (${dados.proximos_prazos.length})`, pdf.colors.blue);
                tabelaPrazos(pdf, dados.proximos_prazos, 'Faltam', (item) => `${item.dias_restantes}d`);
            }
            if (detalhe) {
                itensPorPlano.forEach(([plano, lista]) => {
                    pdf.bloco(`Detalhamento - ${plano} (${lista.length} ações)`, pdf.colors.green);
                    tabelaDetalhe(pdf, lista, observacoes);
                });
            }
            pdf.texto(METODOLOGIA, { italic: true });
        }
    });
}

const linhasGrupo = (lista: GrupoPlano[]) => lista.map((item) => ({ Nome: item.nome, Ações: item.total, Fechadas: item.fechados, 'Em andamento': item.andamento ?? 0, Atrasadas: item.atrasados, 'Execução %': item.progresso }));

export function excelPlano(dados: DadosPlano, periodo: string, usuario: string, hoje: string) {
    const { resumo: r } = dados;
    return gerarExcel([
        {
            nome: 'Resumo',
            linhas: [
                ['Relatório', 'Plano de Ação - Status e Execução'], ['Período', periodo], ['Emitido por', usuario],
                ['Planos', r.planos], ['Ações', r.total], ['Fechadas', r.fechados], ['Em andamento', r.andamento], ['A iniciar', r.a_iniciar],
                ['Atrasadas', r.atrasados], ['Vencem em 7 dias', r.vencendo_7d], ['Execução realizada (%)', r.progresso], ['Execução esperada (%)', r.esperado],
                ['Desvio (p.p.)', r.desvio], ['Aderência ao prazo (%)', r.aderencia ?? ''], ['Horas trabalhadas', minParaHHMM(r.trabalhado_min)], ['Tempo previsto', minParaHHMM(r.previsto_min)]
            ].map(([indicador, valor]) => ({ Indicador: indicador, Valor: valor }))
        },
        {
            nome: 'Planos',
            linhas: dados.planos.map((plano) => ({
                Plano: plano.titulo, Cliente: plano.cliente ?? '', Projeto: plano.nome_projeto ?? '', Situação: plano.status, Saúde: plano.saude,
                'Execução %': plano.progresso, 'Esperado %': plano.esperado, 'Desvio p.p.': plano.desvio, Ações: plano.total, Fechadas: plano.fechados,
                'Em andamento': plano.andamento, Atrasadas: plano.atrasados, 'Próximo prazo': dataBR(plano.proximo_prazo), 'Término previsto': dataBR(plano.data_fim_prevista),
                'Horas trabalhadas': minParaHHMM(plano.trabalhado_min)
            }))
        },
        {
            nome: 'Ações',
            linhas: dados.itens.map((item) => ({
                Plano: item.plano, Cliente: item.cliente ?? '', Projeto: item.nome_projeto ?? '', Módulo: item.modulo ?? '', Etapa: item.grupo ?? '', Unidade: item.unidade ?? '',
                Ação: item.descricao, Responsável: item.responsavel ?? '', Equipe: item.equipe ?? '', Prioridade: item.prioridade, Situação: item.status, '% Execução': item.percentual,
                'Início previsto': dataBR(item.data_inicio), 'Fim previsto': dataBR(item.data_fim), 'Início realizado': dataBR(item.data_inicio_real), 'Fim realizado': dataBR(item.data_fim_real),
                'Situação do prazo': item.situacao_prazo, 'Dias de atraso': item.dias_atraso ?? 0, 'Tempo previsto': minParaHHMM(item.tempo_previsto),
                'Tempo gasto': minParaHHMM(item.tempo_gasto), 'Horas trabalhadas': minParaHHMM(item.horas_trabalhadas), Observação: item.observacao ?? ''
            }))
        },
        { nome: 'Por cliente', linhas: linhasGrupo(dados.por_cliente) },
        { nome: 'Por etapa', linhas: linhasGrupo(dados.por_etapa) },
        { nome: 'Por responsável', linhas: linhasGrupo(dados.por_responsavel) },
        { nome: 'Por unidade', linhas: linhasGrupo(dados.por_unidade) },
        ...(dados.por_pessoa.length ? [{
            nome: 'Equipe',
            linhas: dados.por_pessoa.map((pessoa) => ({ Pessoa: pessoa.nome, 'Ações alocadas': pessoa.itens, Abertas: pessoa.abertos, Atrasadas: pessoa.atrasados, Apontamentos: pessoa.apontamentos, 'Horas trabalhadas': minParaHHMM(pessoa.trabalhado_min) }))
        }] : [])
    ], `Relatorio_Plano_Acao_${hoje}.xlsx`);
}
