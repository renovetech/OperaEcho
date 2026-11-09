import api from '@/shared/api';

export type TipoEscala =
    | 'APOIO' | 'ATESTADO' | 'FALTA' | 'FERIADO' | 'FERIAS' | 'FOLGA' | 'HOME_OFFICE' | 'SEDE' | 'SEDE_TREINAMENTO' | 'TRABALHO';
export type TurnoEscala = 'NORMAL' | 'DIURNO' | 'NOTURNO';

export interface Colaborador {
    id_usuario: number;
    nome_completo: string;
    data_ativacao?: string | null;
    data_inativacao?: string | null;
}

export interface ItemEscala {
    id_usuario: number;
    data_escala: string;
    tipo: TipoEscala;
    id_projeto?: number | null;
    id_unidade?: number | null;
    ids_produtos?: (number | string)[];
    turno?: TurnoEscala | null;
    redmine?: string | null;
    nome_projeto?: string | null;
    nome_unidade?: string | null;
    nomes_produtos?: string | null;
}

export interface FormEscala {
    tipo: TipoEscala;
    id_projeto: string;
    id_unidade: string;
    produtos: number[];
    turno: TurnoEscala;
    redmine: string;
}

export interface ProdutoEscala { id_produto: number; nome_produto: string; ativo: boolean | number }

/** Registro enviado à API: só o tipo Trabalho guarda unidade, produtos, turno e Redmine. */
function montarRegistro(form: FormEscala, idUsuario: number, data: string) {
    const trabalho = form.tipo === 'TRABALHO';
    return {
        tipo: form.tipo,
        id_usuario: idUsuario,
        data_escala: data,
        id_projeto: trabalho || form.tipo === 'APOIO' ? form.id_projeto : null,
        id_unidade: trabalho ? form.id_unidade : null,
        produtos: trabalho ? form.produtos : [],
        turno: trabalho ? form.turno : 'NORMAL',
        redmine: trabalho ? form.redmine : ''
    };
}

export async function listarColaboradores(inicio: string, fim: string, lotacao?: string): Promise<Colaborador[]> {
    // escala=1: no submenu Projetos, a escala lista apenas operadores e analistas.
    const filtroLotacao = lotacao ? { id_projeto: lotacao, escala: 1 } : {};
    const { data } = await api.get<Colaborador[]>('/implantadores', { params: { ...filtroLotacao, escala_inicio: inicio, escala_fim: fim } });
    return data;
}

export async function listarEscala(base: string, inicio: string, fim: string): Promise<ItemEscala[]> {
    const { data } = await api.get<ItemEscala[]>(`${base}/escalas`, { params: { inicio, fim } });
    return data;
}

export async function listarProdutosDaUnidade(idUnidade: string): Promise<ProdutoEscala[]> {
    const [vinculos, produtos] = await Promise.all([
        api.get<{ id_produto: number }[]>(`/unidades/${idUnidade}/produtos`),
        api.get<ProdutoEscala[]>('/produtos')
    ]);
    const vinculados = new Set(vinculos.data.map((item) => Number(item.id_produto)));
    return produtos.data.filter((produto) => vinculados.has(Number(produto.id_produto)) && Boolean(produto.ativo));
}

export const salvarDia = (base: string, form: FormEscala, idUsuario: number, data: string) =>
    api.post(`${base}/escalas/salvar`, montarRegistro(form, idUsuario, data));

export const limparDia = (base: string, idUsuario: number, data: string) =>
    api.post(`${base}/escalas/salvar`, { id_usuario: idUsuario, data_escala: data, tipo: null });

export const salvarLote = (base: string, form: FormEscala, destinos: { idUsuario: number; data: string }[]) =>
    api.post(`${base}/escalas/salvar-lote`, destinos.map(({ idUsuario, data }) => montarRegistro(form, idUsuario, data)));
