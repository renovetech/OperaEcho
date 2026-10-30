/* ARQUIVO: src/planoAcaoUtils.js
 * Utilidades compartilhadas do Plano de Ação (grade, listagem, painel, relatório).
 * ------------------------------------------------------------------------ */

export const STATUS_ITEM = ['A Iniciar', 'Em andamento', 'Atrasado', 'Fechado'];

export const COR_STATUS_ITEM = {
    'A Iniciar':    '#8A8F88',
    'Em andamento': '#B06A2C',
    'Atrasado':     '#A23B36',
    'Fechado':      '#3E7C5A'
};

export const COR_SAUDE = {
    'NO PRAZO':  { bg: '#E8F5E9', fg: '#2E7D32', bd: '#A5D6A7' },
    'ATENÇÃO':   { bg: '#FFF4E0', fg: '#8A5212', bd: '#F0C987' },
    'CRÍTICO':   { bg: '#F6E9E7', fg: '#8F2F2A', bd: '#E3A9A4' },
    'CONCLUÍDO': { bg: '#E4EEF8', fg: '#1D4E80', bd: '#A9C6E6' },
    'ENCERRADO': { bg: '#EEEEEA', fg: '#5A625B', bd: '#D3D3CC' }
};

export const STATUS_PLANO = ['EM ANDAMENTO', 'CONCLUÍDO', 'ENCERRADO'];

/* minutos -> "HHh MMmin" */
export const fmtMin = (m) => {
    const t = Math.round(Number(m) || 0);
    if (t <= 0) return '-';
    const h = Math.floor(t / 60), mm = t % 60;
    if (h && mm) return `${h}h ${String(mm).padStart(2, '0')}min`;
    if (h) return `${h}h`;
    return `${mm}min`;
};

/* minutos -> "HH:MM" */
export const minParaHHMM = (m) => {
    if (m == null || m === '') return '';
    const t = parseInt(m, 10);
    if (isNaN(t) || t <= 0) return '';
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export const mascararHora = (v) => {
    const d = String(v).replace(/\D/g, '').slice(0, 4);
    if (d.length <= 2) return d;
    return d.slice(0, -2) + ':' + d.slice(-2);
};

export const hhmmParaMin = (s) => {
    if (!s) return null;
    const [h, m] = String(s).split(':').map(n => parseInt(n, 10) || 0);
    const total = h * 60 + Math.min(m, 59);
    return total > 0 ? total : null;
};

export const soData = (dt) => (dt ? String(dt).split('T')[0] : '');

export const dataBR = (v) => {
    const s = soData(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '-';
};

/* Data de hoje no fuso local (YYYY-MM-DD) */
export const hojeLocal = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export const linkPublicoPlano = (token) => `${window.location.origin}/painel-plano-acao/${token}`;
export const linkPublicoCarteira = () => `${window.location.origin}/painel-plano-acao`;

export const copiarTexto = async (texto) => {
    try { await navigator.clipboard.writeText(texto); return true; }
    catch (e) {
        const ta = document.createElement('textarea');
        ta.value = texto; document.body.appendChild(ta); ta.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
        document.body.removeChild(ta); return ok;
    }
};

/* Mensagem de erro amigável a partir de uma resposta do axios */
export const msgErro = (e, padrao = 'Não foi possível concluir a operação.') => {
    const d = e && e.response && e.response.data;
    if (d && Array.isArray(d.erros) && d.erros.length) {
        return `${d.erro || padrao}<ul style="text-align:left;margin:10px 0 0;padding-left:18px;font-size:.88rem">${
            d.erros.slice(0, 8).map(x => `<li><b>${escaparHtml((x.descricao || '').slice(0, 60))}</b>: ${escaparHtml(x.erro)}</li>`).join('')
        }</ul>`;
    }
    if (e && e.response && !(d && d.erro)) {
        const st = e.response.status;
        if (st === 404) return 'Recurso não encontrado no servidor (HTTP 404). Verifique se o backend foi atualizado para a versão atual.';
        if (st === 401) return 'Sessão expirada. Faça login novamente.';
        if (st === 403) return 'Você não tem permissão para esta ação.';
        return escaparHtml(`${padrao} (HTTP ${st})`);
    }
    if (e && !e.response) return 'Sem resposta do servidor. Verifique a conexão.';
    return escaparHtml((d && d.erro) || padrao);
};

export const escaparHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* "Fulano de Tal da Silva" -> "Fulano Silva" */
export const nomeCurto = (nome) => {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '';
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return p.length === 1 ? cap(p[0]) : `${cap(p[0])} ${cap(p[p.length - 1])}`;
};

/* Cliente exibido: o da ação; senão o do plano; senão o projeto (máscara original). */
export const clienteDoPlano = (cab) => (cab && (cab.cliente || cab.nome_projeto)) || '';

export const iniciais = (nome) => String(nome || '?').trim().split(/\s+/).filter(Boolean)
    .reduce((acc, p, i, arr) => (i === 0 || i === arr.length - 1 ? acc + p[0] : acc), '').toUpperCase().slice(0, 2);
