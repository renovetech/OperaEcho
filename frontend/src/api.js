/* ARQUIVO: src/api.js */
import axios from 'axios';
import Swal from 'sweetalert2';

const api = axios.create({
    baseURL: import.meta.env.PROD ? '' : (import.meta.env.VITE_API_URL || 'http://localhost:3001')
});

// ============================================================
// INTERCEPTOR DE REQUEST: Injeta token JWT em toda requisição
// ============================================================
api.interceptors.request.use((config) => {
    try {
        const token = sessionStorage.getItem('token_opera');
        if (token && token !== 'undefined') {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
    } catch (error) {
        // Silencioso
    }
    return config;
});

// ============================================================
// INTERCEPTOR DE RESPONSE: Trata 401 (token expirado/inválido)
// ============================================================
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            const url = error.config.url || '';
            const isRotaLivre = url.includes('/login') || 
                                url.includes('/recuperar-senha') ||
                                url.includes('/gerador/');
            
            // Sem sessão (ex.: Consulta SIGTAP pública) não há o que "expirar": não redireciona ao login.
            const tinhaSessao = !!sessionStorage.getItem('token_opera');
            if (!isRotaLivre && tinhaSessao) {
                sessionStorage.removeItem('token_opera');
                sessionStorage.removeItem('usuario_opera');
                
                Swal.fire({
                    icon: 'warning',
                    title: 'Sessão expirada',
                    text: 'Sua sessão foi encerrada. Faça login novamente.',
                    confirmButtonColor: '#2e7d32'
                }).then(() => {
                    window.location.href = '/';
                });
            }
        }
        return Promise.reject(error);
    }
);

export default api;
