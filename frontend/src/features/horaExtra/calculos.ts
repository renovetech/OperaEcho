/* Regras da Hora Extra: jornada, adicionais e estimativa CLT. Só funções puras, sem tela nem servidor. */

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DOMINGO = 0;
const SEXTA = 5;
const SABADO = 6;
const MINUTOS_DIA = 1440;
/** 22h, e 5h do dia seguinte em minutos corridos. */
const INICIO_NOTURNO = 1320;
const FIM_NOTURNO = 1740;
const FIM_MADRUGADA = 300;
const TAMANHO_HORA = 5;

const CARGA_HORARIA_PADRAO = 220;
const DIAS_UTEIS_PADRAO = 25;
const DIAS_DSR_PADRAO = 5;
const MULTIPLICADOR_50 = 1.5;
const MULTIPLICADOR_100 = 2;
const ADICIONAL_NOTURNO = 0.3;

/* Tabelas de 2026 (estimativa): ajuste aqui quando mudarem.
   INSS progressivo: Portaria Interministerial MPS/MF nº 13/2026; cada faixa incide só sobre a parcela dentro dela. */
const INSS_FAIXAS = [
    { ate: 1621, aliquota: 0.075 },
    { ate: 2902.84, aliquota: 0.09 },
    { ate: 4354.27, aliquota: 0.12 },
    { ate: 8475.55, aliquota: 0.14 }
];
/* IRRF mensal: Lei 15.191/2025, não alterada pela 15.270. */
const IRRF_FAIXAS = [
    { ate: 2428.8, aliquota: 0, deduz: 0 },
    { ate: 2826.65, aliquota: 0.075, deduz: 182.16 },
    { ate: 3751.05, aliquota: 0.15, deduz: 394.16 },
    { ate: 4664.68, aliquota: 0.225, deduz: 675.49 },
    { ate: Infinity, aliquota: 0.275, deduz: 908.73 }
];
const IRRF_DEDUCAO_DEPENDENTE = 189.59;
const IRRF_DESCONTO_SIMPLIFICADO = 607.2;
const VT_ALIQUOTA = 0.06;
/* Redutor da Lei 15.270/2025: isenta até R$ 5.000 e reduz gradualmente até R$ 7.350. */
const REDUTOR_LIMITE = 7350;
const REDUTOR_MAXIMO = 312.89;
const REDUTOR_BASE = 978.62;
const REDUTOR_FATOR = 0.133145;

export interface Jornada { entrada: string; saida: string; intervalo: string }

export const JORNADA_PADRAO: Jornada = { entrada: '08:00', saida: '17:00', intervalo: '01:00' };

export interface CalculoDia { horasEfetivas: number; he50: number; he100: number; adNoturno: number; displayEfetivas: string }

/** Os nomes dos campos são os que o servidor grava no detalhe do lançamento. */
export interface LinhaDia extends CalculoDia {
    dia: number;
    dataObj: Date;
    diaSemanaStr: string;
    isFeriado: boolean;
    isFolga: boolean;
    isFDS: boolean;
    entrada: string;
    saida: string;
    intervalo: string;
    id_unidade: number | null;
    id_projeto: number | null;
}

export interface TotaisHoras { he50: number; he100: number; adNoturno: number; horasEfetivas: number }
export interface TotalUnidade { id_unidade: number | null; id_projeto: number | null; he50: number; he100: number; adNoturno: number }

export interface DetalheSalvo {
    dia_numero: number;
    entrada: string | null;
    saida: string | null;
    intervalo: string | null;
    is_feriado: boolean;
    is_folga: boolean;
    id_unidade: number | null;
    id_projeto: number | null;
}

export const horaParaMinutos = (hora: string): number => {
    if (!hora) return 0;
    const [horas = 0, minutos = 0] = hora.split(':').map(Number);
    return horas * 60 + minutos;
};

export const minutosParaHora = (minutos: number): string =>
    `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(Math.round(minutos % 60)).padStart(2, '0')}`;

export const horaOuVazio = (minutos: number): string => (minutos > 0 ? minutosParaHora(minutos) : '');

function minutosNoturnos(entrada: number, saida: number): number {
    const inicio = Math.max(entrada, INICIO_NOTURNO);
    const fim = Math.min(saida, FIM_NOTURNO);
    const naNoite = inicio < fim ? fim - inicio : 0;
    const fimMadrugada = Math.min(saida, FIM_MADRUGADA);
    return naNoite + (entrada < FIM_MADRUGADA && entrada < fimMadrugada ? fimMadrugada - entrada : 0);
}

/** Na virada da noite, o intervalo sai do maior período, para não quebrar as horas. */
function dividirVirada(entrada: number, saida: number, intervalo: number): { dia1: number; dia2: number } {
    const bruto1 = MINUTOS_DIA - entrada;
    const bruto2 = saida - MINUTOS_DIA;
    const dia1 = bruto1 >= bruto2 ? bruto1 - intervalo : bruto1;
    const dia2 = bruto1 >= bruto2 ? bruto2 : bruto2 - intervalo;
    if (dia1 < 0) return { dia1: 0, dia2: dia2 + dia1 };
    if (dia2 < 0) return { dia1: dia1 + dia2, dia2: 0 };
    return { dia1, dia2 };
}

export function calcularDia(data: Date, entrada: string, saida: string, intervalo: string, isFeriado: boolean, isFolga: boolean, jornada: Jornada): CalculoDia {
    if (isFolga) return { horasEfetivas: 0, he50: 0, he100: 0, adNoturno: 0, displayEfetivas: 'FOLGA' };
    if (entrada.length < TAMANHO_HORA || saida.length < TAMANHO_HORA) return { horasEfetivas: 0, he50: 0, he100: 0, adNoturno: 0, displayEfetivas: '' };

    const minEntrada = horaParaMinutos(entrada);
    const saidaInformada = horaParaMinutos(saida);
    const minSaida = saidaInformada < minEntrada ? saidaInformada + MINUTOS_DIA : saidaInformada;
    const minIntervalo = horaParaMinutos(intervalo);
    const total = Math.max(0, minSaida - minEntrada - minIntervalo);
    const virada = minSaida > MINUTOS_DIA;
    const diaSemana = data.getDay();
    const diaSeguinte = (diaSemana + 1) % 7;
    const { dia1, dia2 } = virada ? dividirVirada(minEntrada, minSaida, minIntervalo) : { dia1: total, dia2: 0 };

    let he50 = 0;
    let he100 = 0;
    const somar = (minutos: number, dia: number, feriado: boolean) => {
        if (dia === DOMINGO || feriado) he100 += minutos;
        else he50 += minutos;
    };

    if (diaSemana === DOMINGO || diaSemana === SABADO || isFeriado) {
        somar(dia1, diaSemana, isFeriado);
        if (dia2 > 0) somar(dia2, diaSeguinte, false);
    } else {
        const padrao = horaParaMinutos(jornada.saida) - horaParaMinutos(jornada.entrada) - horaParaMinutos(jornada.intervalo);
        const excedente = total - padrao;
        if (excedente > 0 && virada && diaSemana === SEXTA) {
            const noSabado = Math.min(excedente, dia2);
            somar(excedente - noSabado, diaSemana, isFeriado);
            somar(noSabado, diaSeguinte, false);
        } else if (excedente > 0) {
            somar(excedente, diaSemana, isFeriado);
        }
    }

    return { horasEfetivas: total, he50, he100, adNoturno: minutosNoturnos(minEntrada, minSaida), displayEfetivas: minutosParaHora(total) };
}

function diaDoMes(mes: string, dia: number): { dataObj: Date; diaSemanaStr: string; isFDS: boolean } {
    const [ano = 0, numeroMes = 1] = mes.split('-').map(Number);
    const dataObj = new Date(ano, numeroMes - 1, dia);
    const diaSemana = dataObj.getDay();
    return { dataObj, diaSemanaStr: DIAS_SEMANA[diaSemana] ?? '', isFDS: diaSemana === DOMINGO || diaSemana === SABADO };
}

/** Grade nova do mês: fim de semana começa como folga, os demais com a jornada padrão. */
export function criarGradeDoMes(mes: string, jornada: Jornada, idUnidade: number | null, idProjeto: number | null): LinhaDia[] {
    const [ano = 0, numeroMes = 1] = mes.split('-').map(Number);
    const diasNoMes = new Date(ano, numeroMes, 0).getDate();
    return Array.from({ length: diasNoMes }, (_, indice) => {
        const dia = indice + 1;
        const base = diaDoMes(mes, dia);
        const horario = base.isFDS ? { entrada: '', saida: '', intervalo: '' } : jornada;
        return {
            ...base,
            dia,
            isFeriado: false,
            isFolga: base.isFDS,
            entrada: horario.entrada,
            saida: horario.saida,
            intervalo: horario.intervalo,
            id_unidade: idUnidade,
            id_projeto: idProjeto,
            ...calcularDia(base.dataObj, horario.entrada, horario.saida, horario.intervalo, false, base.isFDS, jornada)
        };
    });
}

export function linhasDoLancamento(mes: string, detalhes: DetalheSalvo[], idProjetoCabecalho: number | null, jornada: Jornada): LinhaDia[] {
    return detalhes.map((detalhe) => {
        const base = diaDoMes(mes, detalhe.dia_numero);
        const entrada = detalhe.entrada ?? '';
        const saida = detalhe.saida ?? '';
        const intervalo = detalhe.intervalo ?? '';
        return {
            ...base,
            dia: detalhe.dia_numero,
            isFeriado: detalhe.is_feriado,
            isFolga: detalhe.is_folga,
            entrada,
            saida,
            intervalo,
            id_unidade: detalhe.id_unidade ?? null,
            id_projeto: detalhe.id_projeto ?? idProjetoCabecalho,
            ...calcularDia(base.dataObj, entrada, saida, intervalo, detalhe.is_feriado, detalhe.is_folga, jornada)
        };
    });
}

export type CampoDia = 'entrada' | 'saida' | 'intervalo' | 'isFeriado' | 'isFolga';

export function alterarDia(linha: LinhaDia, campo: CampoDia, valor: string | boolean, jornada: Jornada): LinhaDia {
    const alterada = { ...linha, [campo]: valor };
    const final = campo === 'isFolga' && valor === true ? { ...alterada, entrada: '', saida: '', intervalo: '' } : alterada;
    return { ...final, ...calcularDia(final.dataObj, final.entrada, final.saida, final.intervalo, final.isFeriado, final.isFolga, jornada) };
}

export const somarTotais = (linhas: LinhaDia[]): TotaisHoras => linhas.reduce(
    (soma, linha) => ({
        he50: soma.he50 + linha.he50,
        he100: soma.he100 + linha.he100,
        adNoturno: soma.adNoturno + linha.adNoturno,
        horasEfetivas: soma.horasEfetivas + linha.horasEfetivas
    }),
    { he50: 0, he100: 0, adNoturno: 0, horasEfetivas: 0 }
);

const temExtra = (item: { he50: number; he100: number; adNoturno: number }) => Boolean(item.he50 || item.he100 || item.adNoturno);
const totalExtras = (item: TotalUnidade) => item.he50 + item.he100 + item.adNoturno;

/** Quebra por unidade, da que tem mais horas para a que tem menos. Só entram dias que geraram extra. */
export function totalizarPorUnidade(linhas: LinhaDia[]): TotalUnidade[] {
    const porUnidade = new Map<number | null, TotalUnidade>();
    linhas.filter(temExtra).forEach((linha) => {
        const atual = porUnidade.get(linha.id_unidade) ?? { id_unidade: linha.id_unidade, id_projeto: linha.id_projeto, he50: 0, he100: 0, adNoturno: 0 };
        porUnidade.set(linha.id_unidade, { ...atual, he50: atual.he50 + linha.he50, he100: atual.he100 + linha.he100, adNoturno: atual.adNoturno + linha.adNoturno });
    });
    return [...porUnidade.values()].sort((a, b) => totalExtras(b) - totalExtras(a));
}

export const haDiaSemUnidade = (linhas: LinhaDia[]): boolean => linhas.some((linha) => temExtra(linha) && !linha.id_unidade);

/** O pendente é dado como pago a partir do dia 5 do segundo mês seguinte. */
export function statusVisual(status: string, mesReferencia: string, hoje = new Date()): string {
    if (status !== 'PENDENTE') return status;
    const [ano = 0, mes = 1] = mesReferencia.split('-').map(Number);
    const pagamento = new Date(ano, mes + 1, 5);
    const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    return dia >= pagamento ? 'PAGO' : status;
}

export function calcularINSS(base: number): number {
    let inss = 0;
    let anterior = 0;
    for (const faixa of INSS_FAIXAS) {
        if (base <= anterior) break;
        inss += (Math.min(base, faixa.ate) - anterior) * faixa.aliquota;
        anterior = faixa.ate;
    }
    return inss;
}

const redutorIrrf = (rendimentos: number) => (rendimentos > REDUTOR_LIMITE ? 0 : Math.min(REDUTOR_MAXIMO, Math.max(0, REDUTOR_BASE - REDUTOR_FATOR * rendimentos)));

/** Imposto da tabela menos o redutor; a base usa a maior dedução entre a legal e a simplificada. */
export function calcularIRRF(rendimentos: number, inss: number, dependentes: number): number {
    if (rendimentos <= 0) return 0;
    const deducaoLegal = inss + dependentes * IRRF_DEDUCAO_DEPENDENTE;
    const base = Math.max(0, rendimentos - Math.max(deducaoLegal, IRRF_DESCONTO_SIMPLIFICADO));
    const faixa = IRRF_FAIXAS.find((item) => base <= item.ate) ?? { aliquota: 0, deduz: 0 };
    const imposto = Math.max(0, base * faixa.aliquota - faixa.deduz);
    return Math.max(0, imposto - Math.min(imposto, redutorIrrf(rendimentos)));
}

export interface EntradaCalculadora {
    salario: string;
    cargaHoraria: string;
    horas50: string;
    horas100: string;
    horasNoturnas: string;
    diasUteis: string;
    diasDsr: string;
    dependentes: string;
}

const horaParaDecimal = (hora: string): number => {
    const [horas = 0, minutos = 0] = hora.split(':').map((parte) => Number(parte) || 0);
    return horas + minutos / 60;
};

export const salarioParaNumero = (salario: string): number => Number.parseFloat(salario.replace(/\./g, '').replace(',', '.')) || 0;

export function calcularCalculadora(entrada: EntradaCalculadora) {
    const salario = salarioParaNumero(entrada.salario);
    const carga = Number.parseFloat(entrada.cargaHoraria) || CARGA_HORARIA_PADRAO;
    const diasUteis = Number.parseFloat(entrada.diasUteis) || DIAS_UTEIS_PADRAO;
    const diasDsr = Number.parseFloat(entrada.diasDsr) || DIAS_DSR_PADRAO;
    const horaBase = salario / carga;
    const valorHE50 = horaBase * MULTIPLICADOR_50 * horaParaDecimal(entrada.horas50);
    const valorHE100 = horaBase * MULTIPLICADOR_100 * horaParaDecimal(entrada.horas100);
    const valorNoturno = horaBase * MULTIPLICADOR_50 * ADICIONAL_NOTURNO * horaParaDecimal(entrada.horasNoturnas);
    const extras = valorHE50 + valorHE100 + valorNoturno;
    const valorDSR = (extras / diasUteis) * diasDsr;
    const totalBruto = salario + extras + valorDSR;
    const inss = calcularINSS(totalBruto);
    const vt = salario * VT_ALIQUOTA;
    const irrf = calcularIRRF(totalBruto, inss, Number.parseInt(entrada.dependentes, 10) || 0);
    const totalDescontos = inss + vt + irrf;
    return { horaBase, valorHE50, valorHE100, valorNoturno, valorDSR, totalBruto, inss, vt, irrf, totalDescontos, liquido: totalBruto - totalDescontos };
}

/** Máscaras dos campos da calculadora. */
export function mascararHora(valor: string): string {
    const digitos = valor.replace(/\D/g, '').slice(0, 5);
    return digitos.length > 2 ? `${digitos.slice(0, -2)}:${digitos.slice(-2)}` : digitos;
}

export function mascararMoeda(valor: string): string {
    const digitos = valor.replace(/\D/g, '');
    if (!digitos) return '';
    return (Number.parseInt(digitos, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
