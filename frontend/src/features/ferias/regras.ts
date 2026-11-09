/* Regras de férias: tipos, saldo do período aquisitivo e prazo legal (CLT Art. 134). */
import type { Usuario } from '@/shared/auth/session';

export type IdOpcaoFerias = '30_DIAS' | '1_PERIODO_15' | '2_PERIODO_15' | '20_DIAS_VENDIDO';

export const OPCOES_FERIAS: { id: IdOpcaoFerias; rotulo: string; dias: number }[] = [
    { id: '30_DIAS', rotulo: '30 Dias Corridos', dias: 30 },
    { id: '1_PERIODO_15', rotulo: '1º Período (15 Dias)', dias: 15 },
    { id: '2_PERIODO_15', rotulo: '2º Período (15 Dias)', dias: 15 },
    { id: '20_DIAS_VENDIDO', rotulo: '20 Dias (c/ 10 Vendidos)', dias: 20 }
];

export const AJUDA_FERIAS = {
    tela: 'Escolha o colaborador, o período aquisitivo e as datas de gozo. Depois de enviada, a solicitação fica Em Análise até a aprovação em Gestão.',
    periodo: (limite: number) => `O período aquisitivo é o ano de referência das férias e dá direito a 30 dias.\nSó pode ser solicitado depois de concluído: o ano máximo é o ano atual menos 1 (hoje, ${limite}).\nPrazo legal (CLT Art. 134): o gozo precisa terminar em até 1 ano e 11 meses, contados da data de admissão no ano do período. Depois disso, a solicitação é bloqueada.`,
    saldo: '30 dias menos o que já foi solicitado no período. Solicitações Em Análise e aprovadas contam; recusadas devolvem os dias.\nQuem vende 10 dias consome os 30. O envio é bloqueado se a opção consumir mais que o saldo.',
    gozo: '30 dias corridos e 20 dias com 10 vendidos usam o período inteiro e não combinam com outras opções.\nOs dois períodos de 15 dias podem ser pedidos juntos ou separados.\nO dia de início já conta: a data final é calculada a partir dele.',
    aprovacao: 'Administrador e Gerente aprovam qualquer função. Coordenador de Implantação aprova Implantador. Líder de Projeto aprova Analista e Operador.\nFérias já aprovadas só podem ser alteradas por quem pode aprová-las. Recusar devolve os dias ao saldo do colaborador.\nCom o evento ligado em Parâmetros > WhatsApp, o colaborador é avisado da decisão.'
};

const OPCOES_EXCLUSIVAS: IdOpcaoFerias[] = ['30_DIAS', '20_DIAS_VENDIDO'];
const DIAS_NO_PERIODO = 30;
const MESES_PRAZO_LEGAL = 23;
const MS_POR_DIA = 86400000;

const partes = (iso: string) => {
    const [ano = 0, mes = 1, dia = 1] = iso.split('T')[0]?.split('-').map(Number) ?? [];
    return { ano, mes, dia };
};

const paraIso = (data: Date) =>
    `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;

export const soData = (valor?: string | null) => (valor ? valor.split('T')[0] ?? '' : '');

export function formatarData(valor?: string | null): string {
    const iso = soData(valor);
    return iso ? iso.split('-').reverse().join('/') : '';
}

export function somarDias(iso: string, dias: number): string {
    const { ano, mes, dia } = partes(iso);
    return paraIso(new Date(ano, mes - 1, dia + dias));
}

/** Data final do gozo: o dia de início já conta. */
export const calcularFim = (inicio: string, dias: number) => somarDias(inicio, dias - 1);

export function opcaoDoTipo(tipo: string): IdOpcaoFerias {
    if (tipo.includes('1º Período')) return '1_PERIODO_15';
    if (tipo.includes('2º Período')) return '2_PERIODO_15';
    if (tipo.includes('20 Dias')) return '20_DIAS_VENDIDO';
    return '30_DIAS';
}

const vendeDias = (tipo: string) => tipo.includes('10 Vendidos') || tipo.includes('20 Dias (c/ 10');

/** Dias que a solicitação consome do saldo: quem vende 10 dias consome os 30. */
export function diasConsumidos(tipo: string, inicio: string, fim: string): number {
    if (vendeDias(tipo)) return DIAS_NO_PERIODO;
    const de = partes(inicio);
    const ate = partes(fim);
    return Math.round((Date.UTC(ate.ano, ate.mes - 1, ate.dia) - Date.UTC(de.ano, de.mes - 1, de.dia)) / MS_POR_DIA) + 1;
}

interface SolicitacaoParaSaldo {
    periodo_aquisitivo: number | string;
    status: string;
    tipo_solicitacao: string;
    data_inicio: string;
    data_fim: string;
}

export function saldoDoPeriodo(historico: SolicitacaoParaSaldo[], periodo: string): number {
    const usados = historico
        .filter((item) => String(item.periodo_aquisitivo) === periodo && item.status !== 'RECUSADO')
        .reduce((soma, item) => soma + diasConsumidos(item.tipo_solicitacao, item.data_inicio, item.data_fim), 0);
    return Math.max(0, DIAS_NO_PERIODO - usados);
}

export interface AlertaClt {
    periodo: string;
    inicio: string;
    limite: string;
}

/** Sem data de admissão não há como calcular: quem decide é o servidor. */
export function limiteClt(admissao: string | null | undefined, periodo: string): AlertaClt | null {
    const ano = Number(periodo);
    if (!admissao || !ano) return null;
    const { mes, dia } = partes(admissao);
    const limite = new Date(ano, mes - 1 + MESES_PRAZO_LEGAL, dia - 1);
    return { periodo, inicio: paraIso(new Date(ano, mes - 1, dia)), limite: paraIso(limite) };
}

export function alertaDoPrazo(admissao: string | null | undefined, periodo: string, fim: string): AlertaClt | null {
    const calculo = limiteClt(admissao, periodo);
    return calculo && fim && fim > calculo.limite ? calculo : null;
}

export type SelecaoFerias = Partial<Record<IdOpcaoFerias, string>>;

/** Marca ou desmarca um tipo. 30 dias e 20 dias excluem os demais; os dois períodos de 15 podem andar juntos. */
export function alternarOpcao(selecao: SelecaoFerias, id: IdOpcaoFerias): SelecaoFerias {
    if (id in selecao) return Object.fromEntries(Object.entries(selecao).filter(([chave]) => chave !== id));
    if (OPCOES_EXCLUSIVAS.includes(id)) return { [id]: '' };
    const semExclusivas = Object.fromEntries(Object.entries(selecao).filter(([chave]) => !OPCOES_EXCLUSIVAS.includes(chave as IdOpcaoFerias)));
    return { ...semExclusivas, [id]: '' };
}

const normalizar = (texto?: string | null) => (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

/** Quem pode aprovar cada função. Só decide o que aparece; o servidor valida de novo. */
export function podeAprovarFuncao(aprovador: Usuario, funcaoSolicitante?: string | null): boolean {
    const funcao = normalizar(aprovador.funcao);
    const alvo = normalizar(funcaoSolicitante);
    if (aprovador.perfil_acesso === 'Administrador' || funcao === 'GERENTE') return true;
    if (funcao === 'COORDENADOR DE IMPLANTACAO') return alvo === 'IMPLANTADOR';
    if (funcao === 'LIDER DE PROJETO') return alvo === 'ANALISTA' || alvo === 'OPERADOR';
    return false;
}

export const rotuloStatus = (status: string) => (status === 'PENDENTE' ? 'Em Análise' : status);

export function feriasConcluidas(fim: string, hoje: string): boolean {
    return soData(fim) < hoje;
}
