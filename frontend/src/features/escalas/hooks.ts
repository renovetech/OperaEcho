import { useCallback, useEffect, useMemo, useState } from 'react';
import * as escalasApi from '@/features/escalas/api';
import type { Colaborador, FormEscala, ItemEscala, ProdutoEscala } from '@/features/escalas/api';
import { listarProjetosAtivos, listarUnidadesDoProjeto, type ProjetoResumo, type UnidadeResumo } from '@/shared/catalogos';
import { aviso, avisoRapido, confirmar, erro, mensagemDeErro, sucesso } from '@/shared/feedback';
import { useListaPorCodigo, useParametrosUrl } from '@/shared/hooks';
import { logErro } from '@/shared/lib';

const DIAS_DA_SEMANA = 7;
const SEMANA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
export const SIGLAS_DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
export const NOMES_DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const FORM_VAZIO: FormEscala = { tipo: 'TRABALHO', id_projeto: '', id_unidade: '', produtos: [], turno: 'NORMAL', redmine: '' };

function paraIso(data: Date): string {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function somarDias(iso: string, dias: number): string {
    const [ano = 0, mes = 1, dia = 1] = iso.split('-').map(Number);
    return paraIso(new Date(ano, mes - 1, dia + dias));
}

function segundaDaSemana(iso: string): string {
    const [ano = 0, mes = 1, dia = 1] = iso.split('-').map(Number);
    const diaDaSemana = new Date(ano, mes - 1, dia).getDay();
    return somarDias(iso, diaDaSemana === 0 ? -6 : 1 - diaDaSemana);
}

const soData = (valor?: string | null) => (valor ? String(valor).split('T')[0] ?? null : null);

/** O colaborador aparece da ativação até a inativação; fora disso, o dia fica bloqueado. */
export function foraDaVigencia(colaborador: Colaborador, dia: string): boolean {
    const inicio = soData(colaborador.data_ativacao);
    const fim = soData(colaborador.data_inativacao);
    return Boolean((inicio && dia < inicio) || (fim && dia > fim));
}

interface OrigemEscala {
    apiBase: string;
    lotacao?: string;
}

export function useEscalas({ apiBase, lotacao }: OrigemEscala) {
    const [parametros, alterarUrl] = useParametrosUrl();
    const semana = parametros.get('semana');
    const inicio = segundaDaSemana(semana && SEMANA_VALIDA.test(semana) ? semana : paraIso(new Date()));
    const fim = somarDias(inicio, DIAS_DA_SEMANA - 1);
    const dias = useMemo(() => Array.from({ length: DIAS_DA_SEMANA }, (_, indice) => somarDias(inicio, indice)), [inicio]);
    const [colaboradores, setColaboradores] = useState<Colaborador[] | null>(null);
    const [itens, setItens] = useState<ItemEscala[]>([]);
    const [versao, setVersao] = useState(0);

    useEffect(() => {
        let ativo = true;
        escalasApi.listarColaboradores(inicio, fim, lotacao)
            .then((lista) => { if (ativo) setColaboradores(lista); })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setColaboradores([]);
                erro(mensagemDeErro(falha, 'Não foi possível carregar os colaboradores.'));
            });
        return () => { ativo = false; };
    }, [inicio, fim, lotacao]);

    useEffect(() => {
        let ativo = true;
        escalasApi.listarEscala(apiBase, inicio, fim)
            .then((lista) => { if (ativo) setItens(lista); })
            .catch((falha: unknown) => { if (ativo) erro(mensagemDeErro(falha, 'Não foi possível carregar a escala.')); });
        return () => { ativo = false; };
    }, [apiBase, inicio, fim, versao]);

    const itensPorDia = useMemo(
        () => new Map(itens.map((item) => [`${Number(item.id_usuario)}|${soData(item.data_escala)}`, item])),
        [itens]
    );
    const itemDe = useCallback((idUsuario: number, dia: string) => itensPorDia.get(`${idUsuario}|${dia}`), [itensPorDia]);

    return {
        inicio, fim, dias, colaboradores, itemDe,
        recarregar: useCallback(() => setVersao((atual) => atual + 1), []),
        mudarSemana: (semanas: number) => alterarUrl({ semana: somarDias(inicio, semanas * DIAS_DA_SEMANA) })
    };
}

function formDoItem(item?: ItemEscala): FormEscala {
    if (!item) return FORM_VAZIO;
    return {
        tipo: item.tipo,
        id_projeto: item.id_projeto ? String(item.id_projeto) : '',
        id_unidade: item.id_unidade ? String(item.id_unidade) : '',
        produtos: Array.isArray(item.ids_produtos) ? item.ids_produtos.map(Number) : [],
        turno: item.turno ?? 'NORMAL',
        redmine: item.redmine ?? ''
    };
}

export interface CelulaEscala {
    colaborador: Colaborador;
    dia: string;
    item?: ItemEscala;
}

interface EditorProps extends OrigemEscala {
    celula: CelulaEscala;
    colaboradores: Colaborador[];
    aoConcluir: () => void;
    copiado: FormEscala | null;
    aoCopiar: (form: FormEscala) => void;
}

export function useEditorEscala({ apiBase, lotacao, celula, colaboradores, aoConcluir, copiado, aoCopiar }: EditorProps) {
    const [form, setForm] = useState<FormEscala>(() => formDoItem(celula.item));
    const [projetos, setProjetos] = useState<ProjetoResumo[]>([]);
    const [replicando, setReplicando] = useState(false);
    const [usuariosDestino, setUsuariosDestino] = useState<number[]>([]);
    const [diasDestino, setDiasDestino] = useState<string[]>([]);
    const [salvando, setSalvando] = useState(false);
    const unidades = useListaPorCodigo<UnidadeResumo>(form.id_projeto, listarUnidadesDoProjeto, 'Erro ao listar unidades');
    const produtos = useListaPorCodigo<ProdutoEscala>(form.id_unidade, escalasApi.listarProdutosDaUnidade, 'Erro ao listar produtos');

    useEffect(() => {
        listarProjetosAtivos(lotacao).then(setProjetos).catch((falha: unknown) => logErro('Erro ao listar projetos', falha));
    }, [lotacao]);

    const executar = async (acao: () => Promise<unknown>, mensagemFalha: string, aoTerminar: () => void) => {
        setSalvando(true);
        try {
            await acao();
            aoConcluir();
            aoTerminar();
        } catch (falha) {
            erro(mensagemDeErro(falha, mensagemFalha));
        } finally {
            setSalvando(false);
        }
    };

    const salvar = () => {
        if (form.tipo === 'TRABALHO' && (!form.id_projeto || !form.id_unidade)) return aviso('Selecione Projeto e Unidade.');
        if (form.tipo === 'APOIO' && !form.id_projeto) return aviso('Selecione o Projeto.');
        return executar(() => escalasApi.salvarDia(apiBase, form, celula.colaborador.id_usuario, celula.dia), 'Erro ao salvar.', () => avisoRapido('Escala salva'));
    };

    const limpar = () => executar(() => escalasApi.limparDia(apiBase, celula.colaborador.id_usuario, celula.dia), 'Erro ao limpar.', () => avisoRapido('Dia limpo'));

    const replicar = async () => {
        if (!usuariosDestino.length || !diasDestino.length) return aviso('Selecione pelo menos 1 colaborador e 1 dia.');
        const destinos = colaboradores
            .filter((colaborador) => usuariosDestino.includes(colaborador.id_usuario))
            .flatMap((colaborador) => diasDestino
                .filter((dia) => !foraDaVigencia(colaborador, dia))
                .map((dia) => ({ idUsuario: colaborador.id_usuario, data: dia })));
        if (!destinos.length) return aviso('Os colaboradores e dias selecionados estão fora do período de atividade.');
        const texto = `Replicar para ${usuariosDestino.length} colaborador(es) em ${diasDestino.length} dia(s)? O que já estiver lançado nesses dias será substituído.`;
        if (!await confirmar('Confirmar replicação?', { texto, rotulo: 'Sim, replicar' })) return undefined;
        return executar(() => escalasApi.salvarLote(apiBase, form, destinos), 'Erro ao replicar escalas.', () => sucesso('Replicação concluída!'));
    };

    return {
        form, projetos, unidades, produtos, salvando, salvar, limpar,
        replicando, usuariosDestino, diasDestino, replicar,
        alterar: (mudancas: Partial<FormEscala>) => setForm((atual) => ({ ...atual, ...mudancas })),
        alterarProjeto: (id_projeto: string) => setForm((atual) => ({ ...atual, id_projeto, id_unidade: '', produtos: [] })),
        alterarUnidade: (id_unidade: string) => setForm((atual) => ({ ...atual, id_unidade, produtos: [] })),
        alternarProduto: (id: number) => setForm((atual) => ({
            ...atual,
            produtos: atual.produtos.includes(id) ? atual.produtos.filter((item) => item !== id) : [...atual.produtos, id]
        })),
        copiar: () => {
            aoCopiar(form);
            avisoRapido('Informações copiadas');
        },
        colar: () => { if (copiado) setForm(copiado); },
        alternarReplicacao: () => {
            setUsuariosDestino([]);
            setDiasDestino([]);
            setReplicando((atual) => !atual);
        },
        alternarUsuario: (id: number) => setUsuariosDestino((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id])),
        alternarDia: (dia: string) => setDiasDestino((atual) => (atual.includes(dia) ? atual.filter((item) => item !== dia) : [...atual, dia]))
    };
}
