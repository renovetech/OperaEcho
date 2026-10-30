/* ARQUIVO: src/periodo.js
   Limite de período das consultas de relatórios (mesma regra da API em
   middlewares/validarDatas.js). */
import Swal from 'sweetalert2';

export const PERIODO_MAXIMO_DIAS = 365;

const dia = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };

/* Dias entre as duas datas (inclusive o primeiro); null se faltar alguma. */
export function diasDoPeriodo(inicio, fim) {
    const a = dia(inicio), b = dia(fim);
    return a === null || b === null ? null : Math.round((b - a) / 86400000);
}

/* Mostra o alerta e devolve true quando o período passa do limite (bloqueia a consulta). */
export function periodoBloqueado(inicio, fim) {
    const d = diasDoPeriodo(inicio, fim);
    if (d === null || d <= PERIODO_MAXIMO_DIAS) return false;
    Swal.fire({
        icon: 'warning',
        title: 'Período acima do permitido',
        html: `O período selecionado tem <b>${d} dias</b>. O máximo para consulta é de <b>${PERIODO_MAXIMO_DIAS} dias</b>.`,
        confirmButtonText: 'Ajustar período'
    });
    return true;
}
