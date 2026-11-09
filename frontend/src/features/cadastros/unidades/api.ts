import api from '@/shared/api';
import type { Macro } from '@/features/cadastros/regioes/api';
import type { Produto } from '@/features/cadastros/produtos/api';
import type { Projeto } from '@/features/cadastros/projetos/api';

export interface Unidade {
    id_unidade: number;
    nome_unidade: string;
    cnes?: string | null;
    id_projeto: number;
    nome_projeto?: string;
    uf?: string | null;
    estado_sigla?: string | null;
    id_cidade?: number | null;
    nome_cidade?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    id_macro?: number | null;
    id_micro?: number | null;
    id_tipo_unidade?: number | null;
    nome_tipo?: string | null;
    sigla_tipo?: string | null;
    ativo: boolean;
}

export interface FormUnidade {
    id_unidade: number | '';
    nome_unidade: string;
    cnes: string;
    id_projeto: number | string;
    uf: string;
    id_cidade: number | string;
    latitude: string;
    longitude: string;
    id_macro: number | string;
    id_micro: number | string;
    id_tipo_unidade: number | string;
    ativo: boolean;
}

export interface Cidade {
    id_cidade: number;
    nome_cidade: string;
    latitude?: number | string | null;
    longitude?: number | string | null;
}

export interface TipoUnidade {
    id_tipo_unidade: number;
    nome_tipo: string;
    sigla: string;
    ativo: boolean;
}

export interface FiltrosUnidade {
    termo: string;
    projeto: string;
    uf: string;
    id_cidade: string;
    status: string;
    pagina: number;
}

export interface LinhaCoordenada {
    cnes: string;
    latitude: string;
    longitude: string;
}

export interface ResultadoImportacao {
    atualizadas: number;
    resultado: { status: string; linha: number; cnes?: string; motivo?: string }[];
}

export const LIMITE_PAGINA = 10;

export async function buscarUnidades(filtros: FiltrosUnidade) {
    const query = new URLSearchParams({
        termo: filtros.termo,
        projeto: filtros.projeto,
        status: filtros.status,
        uf: filtros.uf,
        id_cidade: filtros.id_cidade,
        pagina: String(filtros.pagina),
        limite: String(LIMITE_PAGINA)
    });
    const { data } = await api.get<{ dados: Unidade[]; total: number; totalPaginas: number }>(`/unidades/buscar?${query.toString()}`);
    return data;
}

export async function buscarUnidadePorId(id: number): Promise<Unidade | undefined> {
    const { data } = await api.get<{ dados: Unidade[] }>(`/unidades/buscar?id=${id}&limite=1&status=Todos`);
    return data.dados?.[0];
}

export async function listarProdutosDaUnidade(id: number): Promise<number[]> {
    const { data } = await api.get<{ id_produto: number }[]>(`/unidades/${id}/produtos`);
    return data.map((produto) => produto.id_produto);
}

export async function listarProjetosAtivos(): Promise<Projeto[]> {
    const { data } = await api.get<Projeto[]>('/projetos');
    return data.filter((projeto) => projeto.ativo);
}

export async function listarProdutosAtivos(): Promise<Produto[]> {
    const { data } = await api.get<Produto[]>('/produtos');
    return data.filter((produto) => produto.ativo);
}

export async function listarTiposDeUnidade(): Promise<TipoUnidade[]> {
    const { data } = await api.get<TipoUnidade[]>('/tipos-unidade');
    return Array.isArray(data) ? data : [];
}

export async function listarCidades(uf: string): Promise<Cidade[]> {
    const { data } = await api.get<Cidade[]>(`/cidades/${uf}`);
    return data;
}

export async function listarRegioes(idProjeto: number | string): Promise<Macro[]> {
    const { data } = await api.get<Macro[]>(`/regioes/projeto/${idProjeto}`);
    return Array.isArray(data) ? data : [];
}

export async function salvarUnidade(payload: Record<string, unknown>): Promise<void> {
    await api.post('/unidades/salvar', payload);
}

export async function importarCoordenadas(idProjeto: string, linhas: LinhaCoordenada[]): Promise<ResultadoImportacao> {
    const { data } = await api.post<ResultadoImportacao>('/unidades/coordenadas/importar', { id_projeto: idProjeto || null, linhas });
    return data;
}
