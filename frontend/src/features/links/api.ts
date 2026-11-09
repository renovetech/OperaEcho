import api from '@/shared/api';

export interface LinkExterno {
    id_link: number;
    id_produto: number;
    nome_produto?: string;
    url: string;
}

export interface ProdutoDoLink {
    id_produto: number;
    nome_produto: string;
}

export async function listarLinks(): Promise<LinkExterno[]> {
    const { data } = await api.get('/links-externos');
    return Array.isArray(data) ? (data as LinkExterno[]) : [];
}

export async function listarProdutos(): Promise<ProdutoDoLink[]> {
    const { data } = await api.get('/produtos');
    return Array.isArray(data) ? (data as ProdutoDoLink[]) : [];
}

export async function salvarLink(idLink: number | null, idProduto: number, url: string): Promise<void> {
    const payload = { id_produto: idProduto, url };
    if (idLink) await api.put(`/links-externos/${idLink}`, payload);
    else await api.post('/links-externos', payload);
}

export async function excluirLink(idLink: number): Promise<void> {
    await api.delete(`/links-externos/${idLink}`);
}
