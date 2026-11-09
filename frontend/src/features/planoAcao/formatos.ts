/* Formatação e domínios do Plano de Ação (grade, listagem, painel e relatório). */
import { escaparHtml } from '@/shared/lib';

export const STATUS_ITEM = ['A Iniciar', 'Em andamento', 'Atrasado', 'Fechado'];
export const STATUS_PLANO = ['EM ANDAMENTO', 'CONCLUÍDO', 'ENCERRADO'];

export const COR_STATUS_ITEM: Record<string, string> = {
    'A Iniciar': '#8A8F88',
    'Em andamento': '#B06A2C',
    Atrasado: '#A23B36',
    Fechado: '#3E7C5A'
};

export const COR_SAUDE: Record<string, { bg: string; fg: string; bd: string }> = {
    'NO PRAZO': { bg: '#E8F5E9', fg: '#2E7D32', bd: '#A5D6A7' },
    ATENÇÃO: { bg: '#FFF4E0', fg: '#8A5212', bd: '#F0C987' },
    CRÍTICO: { bg: '#F6E9E7', fg: '#8F2F2A', bd: '#E3A9A4' },
    CONCLUÍDO: { bg: '#E4EEF8', fg: '#1D4E80', bd: '#A9C6E6' },
    ENCERRADO: { bg: '#EEEEEA', fg: '#5A625B', bd: '#D3D3CC' }
};

const MINUTOS_POR_HORA = 60;

/** minutos -> "2h 05min" */
export function fmtMin(minutos: number | string | null | undefined): string {
    const total = Math.round(Number(minutos) || 0);
    if (total <= 0) return '-';
    const horas = Math.floor(total / MINUTOS_POR_HORA);
    const resto = total % MINUTOS_POR_HORA;
    if (horas && resto) return `${horas}h ${String(resto).padStart(2, '0')}min`;
    return horas ? `${horas}h` : `${resto}min`;
}

/** minutos -> "02:05" */
export function minParaHHMM(minutos: number | string | null | undefined): string {
    const total = Number.parseInt(String(minutos ?? ''), 10);
    if (Number.isNaN(total) || total <= 0) return '';
    return `${String(Math.floor(total / MINUTOS_POR_HORA)).padStart(2, '0')}:${String(total % MINUTOS_POR_HORA).padStart(2, '0')}`;
}

export function mascararHora(valor: string): string {
    const digitos = valor.replace(/\D/g, '').slice(0, 4);
    return digitos.length <= 2 ? digitos : `${digitos.slice(0, -2)}:${digitos.slice(-2)}`;
}

export function hhmmParaMin(texto: string): number | null {
    if (!texto) return null;
    const [horas = 0, minutos = 0] = texto.split(':').map((parte) => Number.parseInt(parte, 10) || 0);
    const total = horas * MINUTOS_POR_HORA + Math.min(minutos, 59);
    return total > 0 ? total : null;
}

export const soData = (valor?: string | null): string => (valor ? String(valor).split('T')[0] ?? '' : '');

export function dataBR(valor?: string | null): string {
    const iso = soData(valor);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '-';
}

export const linkPublicoPlano = (token: string) => `${window.location.origin}/painel-plano-acao/${token}`;
export const linkPublicoCarteira = () => `${window.location.origin}/painel-plano-acao`;

/** A área de transferência moderna só existe em HTTPS; em HTTP usa o método antigo. */
export async function copiarTexto(texto: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(texto);
        return true;
    } catch {
        const campo = document.createElement('textarea');
        campo.value = texto;
        document.body.appendChild(campo);
        campo.select();
        const copiou = document.execCommand('copy');
        campo.remove();
        return copiou;
    }
}

export { escaparHtml };

interface RespostaDeErro {
    response?: { status: number; data?: { erro?: string; erros?: { descricao?: string; erro?: string }[] } };
}

/** Mensagem amigável da API, já escapada para exibir como HTML no Swal. */
export function mensagemHtml(falha: unknown, padrao = 'Não foi possível concluir a operação.'): string {
    const { response } = (falha ?? {}) as RespostaDeErro;
    if (!response) return 'Sem resposta do servidor. Verifique a conexão.';
    const dados = response.data;
    if (dados?.erros?.length) {
        const itens = dados.erros.slice(0, 8).map((item) => `<li><b>${escaparHtml((item.descricao ?? '').slice(0, 60))}</b>: ${escaparHtml(item.erro)}</li>`).join('');
        return `${escaparHtml(dados.erro ?? padrao)}<ul style="text-align:left;margin:10px 0 0;padding-left:18px;font-size:.88rem">${itens}</ul>`;
    }
    if (dados?.erro) return escaparHtml(dados.erro);
    if (response.status === 401) return 'Sessão expirada. Faça login novamente.';
    if (response.status === 403) return 'Você não tem permissão para esta ação.';
    return escaparHtml(`${padrao} (HTTP ${response.status})`);
}

/** "Fulano de Tal da Silva" -> "Fulano Silva" */
export function nomeCurto(nome?: string | null): string {
    const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
    const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
    if (!partes.length) return '';
    const primeira = partes[0] ?? '';
    const ultima = partes[partes.length - 1] ?? '';
    return partes.length === 1 ? capitalizar(primeira) : `${capitalizar(primeira)} ${capitalizar(ultima)}`;
}

export function iniciais(nome?: string | null): string {
    const partes = String(nome ?? '?').trim().split(/\s+/).filter(Boolean);
    const extremos = partes.length > 1 ? [partes[0], partes[partes.length - 1]] : partes;
    return extremos.map((parte) => parte?.[0] ?? '').join('').toUpperCase().slice(0, 2);
}
