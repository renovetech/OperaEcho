import api from '@/shared/api';

export interface UsuarioCadastro {
    id_usuario: number;
    nome_completo: string;
    cpf: string;
    data_nascimento?: string | null;
    data_admissao?: string | null;
    sexo?: string | null;
    celular?: string | null;
    celular_whatsapp?: boolean;
    email?: string | null;
    matricula: string;
    usuario: string;
    perfil_acesso: string;
    ativo: boolean;
    id_setor?: number | null;
    id_funcao?: number | null;
    id_lotacao?: number | null;
    nome_setor?: string;
    setor?: string;
    nome_funcao?: string;
    funcao?: string;
}

export interface FormUsuario {
    id_usuario: number | '';
    nome_completo: string;
    cpf: string;
    data_nascimento: string;
    data_admissao: string;
    sexo: string;
    celular: string;
    celular_whatsapp: boolean;
    email: string;
    matricula: string;
    usuario: string;
    perfil_acesso: string;
    ativo: boolean;
    id_setor: number | string;
    id_funcao: number | string;
    id_lotacao: number | string;
}

export interface OpcoesUsuario {
    perfis: string[];
    produtos: { id: number; nome: string }[];
    lotacoes: { id: number; nome: string }[];
    setores: { id: number; nome: string }[];
    funcoes: { id: number; nome: string }[];
}

export async function buscarUsuarios(termo: string): Promise<UsuarioCadastro[]> {
    const { data } = await api.get<UsuarioCadastro[]>(`/usuarios/buscar?termo=${encodeURIComponent(termo)}`);
    return data || [];
}

export async function buscarUsuarioPorId(id: number): Promise<UsuarioCadastro | undefined> {
    const { data } = await api.get<UsuarioCadastro[]>(`/usuarios/buscar?id=${id}`);
    return data?.[0];
}

export async function buscarVinculosDoUsuario(id: number): Promise<{ produtos: number[]; lotacoes: number[] }> {
    const [produtos, lotacoes] = await Promise.all([
        api.get<number[]>(`/usuarios/${id}/produtos`),
        api.get<number[]>(`/usuarios/${id}/lotacoes`)
    ]);
    return { produtos: produtos.data || [], lotacoes: lotacoes.data || [] };
}

export async function carregarOpcoes(): Promise<OpcoesUsuario> {
    const [perfis, produtos, projetos, setores, funcoes] = await Promise.all([
        api.get<{ nome_perfil: string }[]>('/perfis'),
        api.get<{ id_produto: number; nome_produto: string; ativo: boolean }[]>('/produtos'),
        api.get<{ id_projeto: number; nome_projeto: string; ativo: boolean; gera_lotacao: boolean }[]>('/projetos'),
        api.get<{ id_setor: number; nome_setor: string }[]>('/setores'),
        api.get<{ id_funcao: number; nome_funcao: string }[]>('/funcoes')
    ]);
    return {
        perfis: perfis.data.map((perfil) => perfil.nome_perfil),
        produtos: produtos.data.filter((produto) => produto.ativo).map((produto) => ({ id: produto.id_produto, nome: produto.nome_produto })),
        lotacoes: projetos.data.filter((projeto) => projeto.ativo && projeto.gera_lotacao).map((projeto) => ({ id: projeto.id_projeto, nome: projeto.nome_projeto })),
        setores: setores.data.map((setor) => ({ id: setor.id_setor, nome: setor.nome_setor })),
        funcoes: funcoes.data.map((funcao) => ({ id: funcao.id_funcao, nome: funcao.nome_funcao }))
    };
}

export async function salvarUsuario(payload: Record<string, unknown>): Promise<void> {
    await api.post('/usuarios/salvar', payload);
}
