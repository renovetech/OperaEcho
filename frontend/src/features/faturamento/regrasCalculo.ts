/* Textos dos balões do Faturamento Consolidado. Cada regra descreve o que está em consolidacao.ts: mudou lá, muda aqui. */
import type { Metrica } from '@/features/faturamento/consolidacao';

const OBS_SIGTAP = 'Valor de tabela da produção apresentada (BPA/APAC: serviço ambulatorial; AIH: hospitalar + profissional). Não é o valor aprovado ou pago.';

export function regrasCalculo(metrica: Metrica) {
    const ehValor = metrica === 'vl';
    const medida = ehValor ? 'valor SIGTAP' : 'quantidade de procedimentos';

    return {
        periodo: ehValor
            ? `Soma do valor SIGTAP de todos os lançamentos que atendem aos filtros, no período selecionado.\n${OBS_SIGTAP}`
            : 'Soma da quantidade de procedimentos de todos os lançamentos que atendem aos filtros, no período selecionado.\nO valor SIGTAP do mesmo período aparece logo abaixo.\nA Atenção Primária não tem valor na SIGTAP (é financiada por PAB/Previne Brasil): por isso, nela o painel abre em quantidade.',
        ultima: `Total de ${medida} da competência mais recente do período.\nA variação compara com a competência imediatamente anterior: (atual − anterior) ÷ anterior. Mês anterior sem lançamento conta como zero e a variação fica "-".`,
        media: 'Total do período ÷ número de competências com lançamento. Meses sem lançamento ficam de fora.\n"Último mês vs média 3m" compara a última competência com a média de até 3 competências com lançamento imediatamente anteriores a ela.',
        crescimento: `Compara a última competência com a primeira do período: (última − primeira) ÷ primeira, usando ${medida}.\nSe a primeira for zero, não há como calcular e aparece "-".`,
        melhorPior: `Competências com o maior e o menor ${medida} do período, considerando só as que têm lançamento.`,
        internacoes: 'Soma do número de AIHs dos lançamentos do tipo AIH no período.\nA variação compara a última competência com a anterior.',
        pacientes: 'Soma dos pacientes distintos de cada lançamento BPA-I, identificados pelo CNS.\nÉ uma soma mensal: quem foi atendido em mais de um mês ou unidade é contado de novo em cada um.',
        procedimentos: 'Quantidade de códigos de procedimento diferentes com produção no período. O total realizado soma a quantidade de todos eles.',

        evolucao: `Mensal: ${medida} de cada competência. Meses sem lançamento aparecem zerados.\nAcumulado: soma das competências desde o início do período até cada mês.\nA barra mais escura é o melhor mês.`,
        variacao: `Diferença de ${medida} entre cada competência e a anterior: atual − anterior.\nVerde: cresceu. Vermelho: caiu. A primeira competência não aparece, pois não tem mês anterior para comparar.`,
        ondeTrabalhar: 'Compara a última competência com a anterior, procedimento a procedimento. Clique em um deles para analisar.\nQuedas e altas: as 6 maiores diferenças em cada sentido.\nDeixaram de ser apresentados: tiveram produção no mês anterior e nenhuma no último.\nNovos: não tiveram produção no mês anterior e tiveram no último.\nUnidades sem envio: têm lançamento no período, mas não na última competência.',
        grupos: `Soma de ${medida} por competência, agrupando os procedimentos pelos 4 primeiros dígitos do código (subgrupo SIGTAP).\nCom mais de 8 subgrupos, mostra os 7 maiores e junta o restante em "Outros grupos".`,
        participacao: `Total do subgrupo no período ÷ total geral do período, usando ${medida}. Mostra os 10 maiores.\nA variação compara a última competência com a anterior.`,
        analise: `Evolução do procedimento selecionado.\nVar.: competência − anterior. Var. %: (competência − anterior) ÷ anterior; "NOVO" quando a anterior é zero.\nAcumulado: soma desde o início do período.\nParticipação: total do procedimento ÷ total geral do período. Var. e acumulado usam ${medida}.`,
        ranking: `Procedimentos pelo total de ${medida} no período.\nPart.: total do procedimento ÷ total geral.\nColuna entre meses: diferença entre a última competência e a anterior.\nPeríodo: (última − primeira) ÷ primeira; "NOVO" quando começou zerado e terminou com produção.\n"N/M meses": em quantas competências do período houve produção.`,
        unidades: `Total de ${medida} por unidade em cada competência.\nA cor é proporcional ao maior valor da tabela, em escala de raiz quadrada, para as unidades menores também aparecerem.\n"-" indica unidade sem lançamento naquela competência.`,
        cbos: `Soma da produção por ocupação (CBO) informada nos arquivos, nas 12 maiores do período por ${medida}. A barra é proporcional à maior ocupação.\nA variação compara a última competência com a anterior.`
    };
}

export type RegrasCalculo = ReturnType<typeof regrasCalculo>;
