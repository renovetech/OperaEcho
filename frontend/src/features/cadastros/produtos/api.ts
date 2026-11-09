import api from '@/shared/api';

export interface Produto {
    id_produto: number;
    nome_produto: string;
    ativo: boolean;
}

export interface FormProduto {
    id_produto: number | '';
    nome_produto: string;
    ativo: boolean;
}

export async function listarProdutos(): Promise<Produto[]> {
    const { data } = await api.get<Produto[]>('/produtos');
    return data;
}

export async function salvarProduto(form: FormProduto, responsavel: string): Promise<void> {
    await api.post('/produtos/salvar', { ...form, responsavel_acao: responsavel });
}
