/* Cliente HTTP do sistema: envia o token da sessão e trata a sessão expirada. */
import axios, { type AxiosError } from 'axios';
import { encerrarSessao, lerToken } from '@/shared/auth/session';
import { aviso } from '@/shared/feedback';

const NAO_AUTENTICADO = 401;
const ROTAS_SEM_SESSAO = ['/login', '/recuperar-senha'];

/** Endereço do servidor, de onde também vêm os anexos (/uploads). */
export const ORIGEM_SERVIDOR: string = import.meta.env.PROD ? window.location.origin : (import.meta.env.VITE_API_URL ?? 'http://localhost:3001');

const api = axios.create({ baseURL: `${ORIGEM_SERVIDOR}/api/v1` });

api.interceptors.request.use((config) => {
    const token = lerToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (resposta) => resposta,
    (falha: AxiosError) => {
        const url = falha.config?.url ?? '';
        const rotaSemSessao = ROTAS_SEM_SESSAO.some((rota) => url.includes(rota));
        // Sem sessão (ex.: consulta SIGTAP pública) não há o que expirar: não redireciona ao login.
        if (falha.response?.status === NAO_AUTENTICADO && !rotaSemSessao && lerToken()) {
            encerrarSessao();
            void aviso('Sua sessão foi encerrada. Faça login novamente.', 'Sessão expirada').then(() => {
                window.location.href = '/';
            });
        }
        return Promise.reject(falha);
    }
);

export default api;
