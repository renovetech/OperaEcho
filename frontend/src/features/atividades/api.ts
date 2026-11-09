import api, { ORIGEM_SERVIDOR } from '@/shared/api';
import { logErro } from '@/shared/lib';

export const MOTIVO_APOIO = 'Apoio ao Projeto';
export const MOTIVO_VISITA = 'Visita Técnica';
const MOTIVOS_PADRAO = ['Implantação', 'Treinamento', MOTIVO_VISITA, MOTIVO_APOIO];
const TAMANHO_PAGINA = 50;

export interface Pessoa { id_usuario: number; nome_completo: string }
export interface ProdutoDaUnidade { id_produto: number; nome_produto: string }

export interface Atividade {
    id_atividade: number;
    data_inicio?: string | null;
    data_fim?: string | null;
    redmine?: string | number | null;
    profissionais_env?: string | number | null;
    tempo_gasto?: string | null;
    motivos?: string | null;
    id_projeto?: number | null;
    id_unidade?: number | null;
    id_implantador?: number | null;
    nome_implantador?: string | null;
    nome_projeto?: string | null;
    nome_unidade?: string | null;
    produtos_trabalhados?: string | null;
    caminho_arquivo?: string | string[] | null;
    lista_implantadores?: Pessoa[];
    lista_equipe_projeto?: Pessoa[];
}

export interface FiltrosAtividade {
    dataInicio: string;
    dataFim: string;
    id_implantador: string;
    id_projeto: string;
    id_unidade: string;
    motivo: string;
    termo: string;
}

export interface FormAtividade {
    id_atividade: number | null;
    data_inicio: string;
    data_fim: string;
    redmine: string;
    profissionais_env: string;
    tempo_gasto: string;
    implantadores_ids: number[];
    equipe_projeto_ids: number[];
    motivos: string[];
    id_projeto: string;
    id_unidade: string;
    produtos: string[];
    arquivos: File[];
    anexosMantidos: string[];
}

export interface RegrasRegistro {
    anexo: boolean;
    horas: boolean;
    equipeApoio: boolean;
}

export async function buscarAtividades(base: string, filtros: FiltrosAtividade, pagina: number) {
    const { data } = await api.get<{ dados?: Atividade[]; total?: number; totalPaginas?: number }>(`${base}/atividades/buscar`, {
        params: { ...filtros, pagina, limite: TAMANHO_PAGINA }
    });
    return { dados: data.dados ?? [], total: data.total ?? 0, totalPaginas: data.totalPaginas ?? 1 };
}

export async function buscarAtividade(base: string, id: string): Promise<Atividade | null> {
    const { data } = await api.get<{ dados?: Atividade[] }>(`${base}/atividades/buscar`, { params: { id, limite: 1 } });
    return data.dados?.[0] ?? null;
}

/** Equipe ativa; com projeto, só os profissionais daquela lotação. */
export async function listarEquipe(idProjeto?: string): Promise<Pessoa[]> {
    const { data } = await api.get<(Pessoa & { ativo: boolean })[]>('/implantadores', { params: idProjeto ? { id_projeto: idProjeto } : {} });
    return data.filter((pessoa) => pessoa.ativo);
}

export async function listarMotivos(): Promise<string[]> {
    try {
        const { data } = await api.get<{ descricao: string }[]>('/motivos');
        return data.map((motivo) => motivo.descricao);
    } catch (falha) {
        logErro('Erro ao listar motivos; usando a lista padrão', falha);
        return MOTIVOS_PADRAO;
    }
}

export async function listarProdutosDaUnidade(idUnidade: string): Promise<ProdutoDaUnidade[]> {
    const { data } = await api.get<(ProdutoDaUnidade & { ativo: boolean })[]>(`/unidades/${idUnidade}/produtos`);
    return data.filter((produto) => produto.ativo);
}

/** Regras do módulo em Parâmetros. Sem resposta, vale o padrão: obrigatório. */
export async function buscarRegras(modulo: 'implantacao' | 'projetos'): Promise<RegrasRegistro> {
    const { data } = await api.get<Record<string, string | undefined>>('/parametros');
    const ligado = (chave: string) => {
        const valor = data[`${chave}_${modulo}`];
        return valor === undefined || valor === '1' || valor === 'true';
    };
    return { anexo: ligado('anexo_obrigatorio'), horas: ligado('horas_obrigatorias'), equipeApoio: ligado('equipe_apoio_obrigatoria') };
}

export async function salvarAtividade(base: string, form: FormAtividade, tempo: string, nomeUsuario: string): Promise<void> {
    const dados = new FormData();
    if (form.id_atividade) dados.append('id_atividade', String(form.id_atividade));
    dados.append('data_inicio', form.data_inicio);
    dados.append('data_fim', form.data_fim || form.data_inicio);
    dados.append('redmine', form.redmine);
    dados.append('profissionais_env', form.profissionais_env);
    dados.append('tempo_gasto', tempo);
    dados.append('implantadores_ids', JSON.stringify(form.implantadores_ids));
    dados.append('equipe_projeto_ids', JSON.stringify(form.motivos.includes(MOTIVO_APOIO) ? form.equipe_projeto_ids : []));
    dados.append('motivos', form.motivos.join(', '));
    dados.append('id_projeto', form.id_projeto);
    dados.append('id_unidade', form.id_unidade);
    dados.append('produtos_trabalhados', form.produtos.join(', '));
    dados.append('arquivos_antigos_mantidos', form.anexosMantidos.join(','));
    dados.append('nome_usuario_upload', nomeUsuario);
    form.arquivos.forEach((arquivo) => dados.append('anexos', arquivo));
    await api.post(`${base}/atividades/salvar`, dados);
}

/** Registra o rastro antes de excluir; se o rastro falhar, a exclusão continua. */
export async function excluirAtividade(base: string, atividade: Atividade, periodo: string, nomeUsuario: string): Promise<void> {
    const detalhes = `[EXCLUÍDO] Data: ${periodo} | Proj: ${atividade.nome_projeto} | Uni: ${atividade.nome_unidade} | Motivo: ${atividade.motivos}`;
    try {
        await api.post('/rastreio-background', { usuario: nomeUsuario, latitude: null, longitude: null, tipo_registro: 'EXCLUSAO_ATIVIDADE', detalhes_registro: detalhes });
    } catch (falha) {
        logErro('Rastreio da exclusão falhou', falha);
    }
    await api.delete(`${base}/atividades/${atividade.id_atividade}`);
}

/** Endereço de download de um anexo salvo. */
export function linkDoAnexo(caminho: string): string {
    if (caminho.startsWith('http')) return caminho;
    return `${ORIGEM_SERVIDOR}/${caminho}`;
}
