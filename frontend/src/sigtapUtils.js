/* ARQUIVO: src/sigtapUtils.js
   Formatação e domínios da Tabela Unificada SIGTAP (Consulta e Importação). */

/** 0401010015 -> 04.01.01.001-5 */
export const fmtProc = (c) => {
    const s = String(c || '');
    return s.length === 10 ? `${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4, 6)}.${s.slice(6, 9)}-${s.slice(9)}` : s;
};

/** E101 -> E10.1 */
export const fmtCid = (c) => {
    const s = String(c || '');
    return s.length === 4 ? `${s.slice(0, 3)}.${s.slice(3)}` : s;
};

/** 202609 -> 09/2026 */
export const fmtComp = (c) => {
    const s = String(c || '');
    return /^\d{6}$/.test(s) ? `${s.slice(4)}/${s.slice(0, 4)}` : (s || '-');
};

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtMoeda = (v) => brl.format(Number(v) || 0);
export const fmtNum = (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString('pt-BR'));
export const fmtPerc = (v) => `${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Idade em meses (SIGTAP). 9999 = não se aplica. */
export const fmtIdade = (m) => {
    if (m === null || m === undefined) return '-';
    if (m >= 9999) return 'Não se aplica';
    if (m < 12) return `${m} ${m === 1 ? 'mês' : 'meses'}`;
    // Mesmo critério do DATASUS: anos completos (o total em meses fica no title da tela).
    const anos = Math.floor(m / 12);
    return `${anos} ${anos === 1 ? 'ano' : 'anos'}`;
};

/** Dias / quantidades onde 9999 significa "não se aplica". */
export const fmtQtd = (v, sufixo = '') => (v === null || v === undefined || v >= 9999 ? '-' : `${fmtNum(v)}${sufixo}`);

export const fmtDuracao = (seg) => {
    if (seg === null || seg === undefined) return '-';
    if (seg < 60) return `${seg}s`;
    return `${Math.floor(seg / 60)}min ${String(seg % 60).padStart(2, '0')}s`;
};

export const COMPLEXIDADE = { 0: 'Não se aplica', 1: 'Atenção Básica', 2: 'Média Complexidade', 3: 'Alta Complexidade' };
export const SEXO = { M: 'Masculino', F: 'Feminino', I: 'Ambos', N: 'Não se aplica' };

/** Siglas curtas dos instrumentos de registro para os selos da listagem. */
export const REGISTRO_SIGLA = {
    '01': 'BPA-C', '02': 'BPA-I', '03': 'AIH-P', '04': 'AIH-E', '05': 'AIH-S',
    '06': 'APAC-P', '07': 'APAC-S', '08': 'RAAS-AD', '09': 'RAAS-PS', '10': 'e-SUS'
};

/** Tipos de compatibilidade (rl_procedimento_compativel.TP_COMPATIBILIDADE). */
export const COMPATIBILIDADE = {
    1: { rotulo: 'Compatível', cor: 'ok', ajuda: 'Pode ser registrado junto com o procedimento principal, até a quantidade permitida.' },
    2: { rotulo: 'Excludente', cor: 'danger', ajuda: 'Não pode ser registrado junto com o procedimento principal (um exclui o outro).' },
    3: { rotulo: 'Concomitante', cor: 'brass', ajuda: 'Pode ser registrado em APAC/RAAS diferentes para o mesmo paciente na mesma competência.' },
    4: { rotulo: 'Compatível sequencial', cor: 'ok', ajuda: 'Cirurgias sequenciais: podem ser registradas na mesma AIH, em sequência.' },
    5: { rotulo: 'Obrigatória', cor: 'pine', ajuda: 'Deve obrigatoriamente ser registrado junto com o procedimento principal.' }
};
export const rotuloCompat = (tp) => COMPATIBILIDADE[tp]?.rotulo || `Tipo ${tp}`;

export const SIA_SIH_TIPO = { A: 'Ambulatorial (SIA)', H: 'Hospitalar (SIH)' };

export const usuarioLogado = () => {
    try { return JSON.parse(sessionStorage.getItem('usuario_opera')) || {}; } catch (e) { return {}; }
};
