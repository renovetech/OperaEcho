/* Chamadas da tela de entrada: login, recuperação de senha e solicitação de acesso. */
import api from '@/shared/api';
import type { Usuario } from '@/shared/auth/session';

export type RespostaLogin =
    | { trocar_senha: true; id_usuario: number; token_reset?: string }
    | { trocar_senha?: false; token: string; usuario: Usuario };

export interface CanalRecuperacao { canal: string; destino: string }
export interface OpcaoSetor { id_setor: number; nome_setor: string }
export interface OpcaoFuncao { id_funcao: number; nome_funcao: string }
export interface OpcaoLotacao { id_projeto: number; nome_projeto: string; ativo: boolean; gera_lotacao: boolean }

export interface Identificacao { usuario: string; matricula: string }

export async function entrar(usuario: string, senha: string): Promise<RespostaLogin> {
    const { data } = await api.post<RespostaLogin>('/login', { usuario, senha });
    return data;
}

export async function listarCanais(identificacao: Identificacao): Promise<CanalRecuperacao[]> {
    const { data } = await api.post<{ canais?: CanalRecuperacao[] }>('/recuperar-senha/canais', identificacao);
    return data.canais ?? [];
}

export async function enviarCodigo(identificacao: Identificacao, canal: string): Promise<string> {
    const { data } = await api.post<{ destino: string }>('/recuperar-senha/solicitar', { ...identificacao, canal });
    return data.destino;
}

export async function verificarCodigo(identificacao: Identificacao, codigo: string): Promise<{ id_usuario: number; token_reset?: string }> {
    const { data } = await api.post<{ id_usuario: number; token_reset?: string }>('/recuperar-senha/verificar', { ...identificacao, codigo });
    return data;
}

export const confirmarNovaSenha = (tokenReset: string | null, novaSenha: string) =>
    api.post('/recuperar-senha/confirmar', { token_reset: tokenReset, nova_senha: novaSenha });

export async function listarOpcoesDeCadastro() {
    const [setores, funcoes, projetos] = await Promise.all([
        api.get<OpcaoSetor[]>('/setores'),
        api.get<OpcaoFuncao[]>('/funcoes'),
        api.get<OpcaoLotacao[]>('/projetos')
    ]);
    return {
        setores: setores.data,
        funcoes: funcoes.data,
        lotacoes: projetos.data.filter((projeto) => projeto.ativo && projeto.gera_lotacao)
    };
}

export const solicitarAcesso = (cadastro: Record<string, unknown>) => api.post('/usuarios/salvar', cadastro);
