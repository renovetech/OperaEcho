/* Constantes, normalização de situações, nomes e datas do Plano de Ação (funções puras, sem banco). */

/* ============================== CONSTANTES =============================== */
const ST = {
    A_INICIAR: 'A Iniciar',
    ANDAMENTO: 'Em andamento',
    ATRASADO: 'Atrasado',
    FECHADO: 'Fechado'
};
const STATUS_VALIDOS = [ST.A_INICIAR, ST.ANDAMENTO, ST.ATRASADO, ST.FECHADO];
const PRIORIDADES = ['Alta', 'Média', 'Baixa'];
const PLANO = { ANDAMENTO: 'EM ANDAMENTO', CONCLUIDO: 'CONCLUÍDO', ENCERRADO: 'ENCERRADO' };

// Normaliza status legados ("Concluído", "Pendente", "Em Andamento"...)
const normStatus = (s) => {
    const v = String(s || '').trim().toLowerCase();
    if (['fechado', 'concluído', 'concluido'].includes(v)) return ST.FECHADO;
    if (v === 'em andamento') return ST.ANDAMENTO;
    if (v === 'atrasado') return ST.ATRASADO;
    return ST.A_INICIAR;
};
const ehFechado = (s) => normStatus(s) === ST.FECHADO;

/* "Fulano de Tal da Silva" -> "Fulano Silva" (exibição padrão de pessoas) */
const nomeCurto = (nome) => {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '';
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return p.length === 1 ? cap(p[0]) : `${cap(p[0])} ${cap(p[p.length - 1])}`;
};

/* Cliente efetivo: o da ação; senão o do plano; senão o projeto (máscara original). */
const clienteDoPlano = (p) => (p && (p.cliente || p.nome_projeto)) || null;
const clienteEfetivo = (i, p) => (i && i.cliente) || clienteDoPlano(p);

/* ================================ DATAS =================================== */
// "Agora" em hora de parede de Brasília (UTC-3), codificada nos campos UTC.
const agoraBR = () => new Date(Date.now() - 3 * 60 * 60 * 1000);
const hojeISO = () => agoraBR().toISOString().slice(0, 10);
const iso = (d) => {
    if (!d) return null;
    if (d instanceof Date) return isNaN(d) ? null : d.toISOString().slice(0, 10);
    const s = String(d);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const addDias = (isoData, n) => new Date(Date.parse(isoData) + n * 86400000).toISOString().slice(0, 10);
const inicioSemana = (isoData) => { // segunda-feira
    const d = new Date(Date.parse(isoData));
    const dow = (d.getUTCDay() + 6) % 7;
    return addDias(isoData, -dow);
};

/* Minutos de expediente (seg-sex, 08-19) entre dois Date (campos UTC = hora BR). */
const EXP_INI_MIN = 8 * 60, EXP_FIM_MIN = 19 * 60;
const minutosUteis = (ini, fim) => {
    if (!ini || !fim || fim <= ini) return 0;
    let total = 0;
    let dia = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth(), ini.getUTCDate()));
    const fimMs = fim.getTime();
    while (dia.getTime() < fimMs) {
        const dow = dia.getUTCDay();
        if (dow >= 1 && dow <= 5) {
            const a = Math.max(ini.getTime(), dia.getTime() + EXP_INI_MIN * 60000);
            const b = Math.min(fim.getTime(), dia.getTime() + EXP_FIM_MIN * 60000);
            if (b > a) total += Math.round((b - a) / 60000);
        }
        dia = new Date(dia.getTime() + 86400000);
    }
    return total;
};

module.exports = {
    ST, STATUS_VALIDOS, PRIORIDADES, PLANO,
    normStatus, ehFechado, nomeCurto, clienteEfetivo, clienteDoPlano, agoraBR, hojeISO, iso, diasEntre, addDias, inicioSemana, minutosUteis
};
