/* Formatação e domínios da Tabela Unificada SIGTAP. */
type Valor = string | number | null | undefined;

const SEM_LIMITE = 9999;
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 0401010015 -> 04.01.01.001-5 */
export function fmtProc(codigo: Valor): string {
    const s = String(codigo ?? '');
    return s.length === 10 ? `${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4, 6)}.${s.slice(6, 9)}-${s.slice(9)}` : s;
}

/** E101 -> E10.1 */
export function fmtCid(codigo: Valor): string {
    const s = String(codigo ?? '');
    return s.length === 4 ? `${s.slice(0, 3)}.${s.slice(3)}` : s;
}

/** 202609 -> 09/2026 */
export function fmtComp(competencia: Valor): string {
    const s = String(competencia ?? '');
    return /^\d{6}$/.test(s) ? `${s.slice(4)}/${s.slice(0, 4)}` : (s || '-');
}

export const fmtMoeda = (valor: Valor): string => brl.format(Number(valor) || 0);
export const fmtNum = (valor: Valor): string => (valor === null || valor === undefined ? '-' : Number(valor).toLocaleString('pt-BR'));
export const fmtPerc = (valor: Valor): string =>
    `${(Number(valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Idade em meses (9999 = não se aplica), em anos completos, como no DATASUS. */
export function fmtIdade(meses: number | null | undefined): string {
    if (meses === null || meses === undefined) return '-';
    if (meses >= SEM_LIMITE) return 'Não se aplica';
    if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
    const anos = Math.floor(meses / 12);
    return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
}

/** Dias e quantidades em que 9999 significa "não se aplica". */
export const fmtQtd = (valor: number | null | undefined, sufixo = ''): string =>
    (valor === null || valor === undefined || valor >= SEM_LIMITE ? '-' : `${fmtNum(valor)}${sufixo}`);

export function fmtDuracao(segundos: number | null | undefined): string {
    if (segundos === null || segundos === undefined) return '-';
    if (segundos < 60) return `${segundos}s`;
    return `${Math.floor(segundos / 60)}min ${String(segundos % 60).padStart(2, '0')}s`;
}

export const COMPLEXIDADE: Record<string, string> = { 0: 'Não se aplica', 1: 'Atenção Básica', 2: 'Média Complexidade', 3: 'Alta Complexidade' };
export const SEXO: Record<string, string> = { M: 'Masculino', F: 'Feminino', I: 'Ambos', N: 'Não se aplica' };
export const SIA_SIH_TIPO: Record<string, string> = { A: 'Ambulatorial (SIA)', H: 'Hospitalar (SIH)' };

/** Siglas curtas dos instrumentos de registro. */
export const REGISTRO_SIGLA: Record<string, string> = {
    '01': 'BPA-C', '02': 'BPA-I', '03': 'AIH-P', '04': 'AIH-E', '05': 'AIH-S',
    '06': 'APAC-P', '07': 'APAC-S', '08': 'RAAS-AD', '09': 'RAAS-PS', 10: 'e-SUS'
};

type TomCompatibilidade = 'ok' | 'perigo' | 'ouro' | 'marca';

export const COMPATIBILIDADE: Record<string, { rotulo: string; tom: TomCompatibilidade; ajuda: string }> = {
    1: { rotulo: 'Compatível', tom: 'ok', ajuda: 'Pode ser registrado junto com o procedimento principal, até a quantidade permitida.' },
    2: { rotulo: 'Excludente', tom: 'perigo', ajuda: 'Não pode ser registrado junto com o procedimento principal (um exclui o outro).' },
    3: { rotulo: 'Concomitante', tom: 'ouro', ajuda: 'Pode ser registrado em APAC/RAAS diferentes para o mesmo paciente na mesma competência.' },
    4: { rotulo: 'Compatível sequencial', tom: 'ok', ajuda: 'Cirurgias sequenciais: podem ser registradas na mesma AIH, em sequência.' },
    5: { rotulo: 'Obrigatória', tom: 'marca', ajuda: 'Deve obrigatoriamente ser registrado junto com o procedimento principal.' }
};

export const rotuloCompat = (tipo: number | string): string => COMPATIBILIDADE[String(tipo)]?.rotulo ?? `Tipo ${tipo}`;
