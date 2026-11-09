/* Limite de período das consultas de relatórios (mesma regra da API em middlewares/validarDatas.js). */
import { resultadoComDetalhes } from '@/shared/feedback';

export const PERIODO_MAXIMO_DIAS = 365;
const MS_POR_DIA = 86400000;

function dia(valor: unknown): number | null {
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? ''));
    return partes ? Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])) : null;
}

/** Dias entre as duas datas; null se faltar alguma. */
export function diasDoPeriodo(inicio: unknown, fim: unknown): number | null {
    const a = dia(inicio);
    const b = dia(fim);
    return a === null || b === null ? null : Math.round((b - a) / MS_POR_DIA);
}

/** Mostra o alerta e devolve true quando o período passa do limite (bloqueia a consulta). */
export function periodoBloqueado(inicio: unknown, fim: unknown): boolean {
    const dias = diasDoPeriodo(inicio, fim);
    if (dias === null || dias <= PERIODO_MAXIMO_DIAS) return false;
    void resultadoComDetalhes('warning', 'Período acima do permitido', `O período selecionado tem <b>${dias} dias</b>. O máximo para consulta é de <b>${PERIODO_MAXIMO_DIAS} dias</b>.`);
    return true;
}
