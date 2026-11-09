import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import * as regioesApi from '@/features/cadastros/regioes/api';
import type { FormMacro, FormMicro, Macro, UnidadeRegiao, Vinculo } from '@/features/cadastros/regioes/api';
import { listarProjetos, type Projeto } from '@/features/cadastros/projetos/api';
import { useAuth } from '@/shared/auth/AuthContext';
import { aviso, confirmar, erro, mensagemDeErro, sucesso } from '@/shared/feedback';
import { logErro } from '@/shared/lib';

export const PALETA = ['#2E7D32', '#1565C0', '#C62828', '#EF6C00', '#6A1B9A', '#00838F', '#AD1457', '#5D4037', '#9C7A3C', '#283593'];
export const MACRO_VAZIA: FormMacro = { id_macro: '', nome_macro: '', sigla: '', cor: PALETA[0] ?? '#2E7D32', ativo: true };
export const MICRO_VAZIA: FormMicro = { id_micro: '', nome_micro: '', sigla: '', cor: '', ativo: true };

const MODULO = 'regioes';
const FALHA_SALVAR = 'Não foi possível salvar.';
const FALHA_EXCLUIR = 'Não foi possível excluir.';

export function usePermissoesRegioes() {
    const { podeAcao } = useAuth();
    return { podeNovo: podeAcao(MODULO, 'pode_novo'), podeEditar: podeAcao(MODULO, 'pode_editar') };
}

export function useProjetosAtivos() {
    const [projetos, setProjetos] = useState<Projeto[]>([]);
    useEffect(() => {
        listarProjetos()
            .then((lista) => setProjetos(lista.filter((projeto) => projeto.ativo)))
            .catch((falha: unknown) => logErro('Erro ao listar projetos', falha));
    }, []);
    return projetos;
}

/** Macros e unidades do projeto; recarregar é pedir de novo (ao salvar ou excluir). */
export function useDadosDoProjeto(idProjeto: string) {
    const [macros, setMacros] = useState<Macro[]>([]);
    const [unidades, setUnidades] = useState<UnidadeRegiao[]>([]);
    const [versao, setVersao] = useState(0);

    useEffect(() => {
        if (!idProjeto) return undefined;
        let ativo = true;
        Promise.all([regioesApi.listarMacros(idProjeto), regioesApi.listarUnidadesDoProjeto(idProjeto)])
            .then(([listaMacros, listaUnidades]) => {
                if (!ativo) return;
                setMacros(listaMacros);
                setUnidades(listaUnidades);
            })
            .catch((falha: unknown) => logErro('Erro ao carregar regiões', falha));
        return () => { ativo = false; };
    }, [idProjeto, versao]);

    const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);
    return { macros: idProjeto ? macros : [], unidades: idProjeto ? unidades : [], recarregar };
}

export function useEdicaoRegioes(idProjeto: string, macros: Macro[], recarregar: () => void) {
    const [idMacroSelecionada, setIdMacroSelecionada] = useState<number | null>(null);
    const [formMacro, setFormMacro] = useState<FormMacro>(MACRO_VAZIA);
    const [formMicro, setFormMicro] = useState<FormMicro>(MICRO_VAZIA);
    const macroAtual = macros.find((macro) => macro.id_macro === idMacroSelecionada) ?? null;

    const gravarMacro = async (evento: FormEvent) => {
        evento.preventDefault();
        if (!formMacro.nome_macro.trim()) { aviso('Informe o nome da macro região.'); return; }
        try {
            await regioesApi.salvarMacro({ ...formMacro, id_projeto: idProjeto, ordem: formMacro.ordem ?? macros.length });
            setFormMacro({ ...MACRO_VAZIA, cor: PALETA[(macros.length + 1) % PALETA.length] ?? MACRO_VAZIA.cor });
            recarregar();
        } catch (falha) {
            erro(mensagemDeErro(falha, FALHA_SALVAR));
        }
    };

    const removerMacro = async (macro: Macro) => {
        if (!await confirmar(`Excluir "${macro.nome_macro}"?`, { rotulo: 'Excluir' })) return;
        try {
            await regioesApi.excluirMacro(macro.id_macro);
            if (idMacroSelecionada === macro.id_macro) setIdMacroSelecionada(null);
            recarregar();
        } catch (falha) {
            aviso(mensagemDeErro(falha, FALHA_EXCLUIR));
        }
    };

    const gravarMicro = async (evento: FormEvent) => {
        evento.preventDefault();
        if (!macroAtual) return;
        if (!formMicro.nome_micro.trim()) { aviso('Informe o nome da micro região.'); return; }
        try {
            await regioesApi.salvarMicro({
                ...formMicro,
                id_macro: formMicro.id_macro || macroAtual.id_macro,
                cor: formMicro.cor || null,
                ordem: formMicro.ordem ?? macroAtual.micros.length
            });
            setFormMicro(MICRO_VAZIA);
            recarregar();
        } catch (falha) {
            erro(mensagemDeErro(falha, FALHA_SALVAR));
        }
    };

    const removerMicro = async (id: number, nome: string) => {
        if (!await confirmar(`Excluir "${nome}"?`, { rotulo: 'Excluir' })) return;
        try {
            await regioesApi.excluirMicro(id);
            recarregar();
        } catch (falha) {
            aviso(mensagemDeErro(falha, FALHA_EXCLUIR));
        }
    };

    const selecionarMacro = (id: number) => {
        setIdMacroSelecionada(id);
        setFormMicro(MICRO_VAZIA);
    };

    return { macroAtual, formMacro, setFormMacro, formMicro, setFormMicro, gravarMacro, removerMacro, gravarMicro, removerMicro, selecionarMacro };
}

export function useVinculos(idProjeto: string, unidades: UnidadeRegiao[], recarregar: () => void) {
    const [alteracoes, setAlteracoes] = useState<Record<number, Vinculo>>({});
    const [filtro, setFiltro] = useState({ termo: '', situacao: 'todas' });
    const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
    const [massa, setMassa] = useState<Vinculo>({ id_macro: '', id_micro: '' });

    const valorDe = useCallback((unidade: UnidadeRegiao): Vinculo =>
        alteracoes[unidade.id_unidade] ?? { id_macro: unidade.id_macro || '', id_micro: unidade.id_micro || '' }, [alteracoes]);

    const filtradas = useMemo(() => {
        const termo = filtro.termo.trim().toLowerCase();
        return unidades.filter((unidade) => {
            const { id_macro: idMacro } = valorDe(unidade);
            if (filtro.situacao === 'sem' && idMacro) return false;
            if (filtro.situacao === 'com' && !idMacro) return false;
            return !termo || `${unidade.nome_unidade} ${unidade.cnes || ''} ${unidade.nome_cidade || ''}`.toLowerCase().includes(termo);
        });
    }, [unidades, filtro, valorDe]);

    const alterarUnidade = (unidade: UnidadeRegiao, campo: keyof Vinculo, valor: string) => {
        const atual = valorDe(unidade);
        const novo = campo === 'id_macro' ? { id_macro: valor, id_micro: '' } : { ...atual, id_micro: valor };
        setAlteracoes((anteriores) => ({ ...anteriores, [unidade.id_unidade]: novo }));
    };

    const alternarSelecao = (id: number, marcada: boolean) => {
        setSelecionadas((anteriores) => {
            const proximas = new Set(anteriores);
            if (marcada) proximas.add(id);
            else proximas.delete(id);
            return proximas;
        });
    };

    const alternarTodas = (marcada: boolean) => setSelecionadas(new Set(marcada ? filtradas.map((unidade) => unidade.id_unidade) : []));

    const aplicarEmMassa = () => {
        if (!massa.id_macro) { aviso('Escolha a macro região.'); return; }
        if (!selecionadas.size) { aviso('Marque as unidades na lista.'); return; }
        setAlteracoes((anteriores) => {
            const proximas = { ...anteriores };
            selecionadas.forEach((id) => { proximas[id] = massa; });
            return proximas;
        });
        setSelecionadas(new Set());
    };

    const salvar = async () => {
        if (!Object.keys(alteracoes).length) return;
        try {
            const mensagem = await regioesApi.salvarVinculos(idProjeto, alteracoes);
            sucesso('Salvo!', mensagem);
            setAlteracoes({});
            setSelecionadas(new Set());
            recarregar();
        } catch (falha) {
            erro(mensagemDeErro(falha, FALHA_SALVAR));
        }
    };

    return {
        alteracoes, setAlteracoes, filtro, setFiltro, selecionadas, massa, setMassa, valorDe, filtradas,
        alterarUnidade, alternarSelecao, alternarTodas, aplicarEmMassa, salvar,
        semRegiao: unidades.filter((unidade) => !valorDe(unidade).id_macro).length,
        todasMarcadas: filtradas.length > 0 && filtradas.every((unidade) => selecionadas.has(unidade.id_unidade))
    };
}
