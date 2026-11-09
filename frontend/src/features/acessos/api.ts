import api from '@/shared/api';

export interface Notificacao {
    tipo: 'acesso' | 'ferias';
    id_usuario: number;
    nome_completo: string;
    titulo: string;
    mensagem?: string;
    data_criacao?: string;
}

export interface SolicitanteAcesso {
    id_usuario: number;
    nome_completo: string;
    data_criacao?: string;
    cpf?: string;
    matricula?: string;
    setor?: string;
    nome_setor?: string;
    funcao?: string;
    nome_funcao?: string;
}

export interface PerfilAcesso {
    id_perfil?: number;
    id?: number;
    nome_perfil?: string;
    nome?: string;
}

export async function buscarNotificacoes(idUsuario: number): Promise<Notificacao[]> {
    const { data } = await api.get(`/dashboard/notificacoes?id_usuario=${idUsuario}`);
    return Array.isArray(data) ? (data as Notificacao[]) : [];
}

export async function buscarSolicitante(notificacao: Notificacao): Promise<SolicitanteAcesso> {
    const { data } = await api.get<SolicitanteAcesso[]>(`/usuarios/buscar?termo=${encodeURIComponent(notificacao.nome_completo)}`);
    return data?.find((usuario) => usuario.id_usuario === notificacao.id_usuario) ?? notificacao;
}

export async function buscarPerfis(): Promise<PerfilAcesso[]> {
    const { data } = await api.get<PerfilAcesso[]>('/perfis');
    return data || [];
}

export async function ativarAcesso(idUsuario: number, perfil: string): Promise<void> {
    await api.post('/usuarios/ativar', { id_usuario: idUsuario, perfil });
}

export async function recusarAcesso(idUsuario: number): Promise<void> {
    await api.delete(`/usuarios/${idUsuario}`);
}
