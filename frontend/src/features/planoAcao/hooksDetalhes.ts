import { useCallback, useEffect, useMemo, useState } from 'react';
import { etapasUnidadePorModulos } from '@/features/planoAcao/templates';
import * as planoApi from '@/features/planoAcao/api';
import type { CabecalhoPlano, DadosPlano, IndicadoresPlano, ItemPlano, NovaAcaoItem, PessoaEquipe, PlanoCompleto, UnidadeDoPlano } from '@/features/planoAcao/api';
import { decidirSaida, erroHtml, excluirComConfirmacao, gerenciarPublicacao } from '@/features/planoAcao/dialogos';
import { escaparHtml, soData } from '@/features/planoAcao/formatos';
import { useAuth } from '@/shared/auth/AuthContext';
import { listarUnidadesDoProjeto, type UnidadeResumo } from '@/shared/catalogos';
import { aviso, avisoRapido, confirmar, resultadoComDetalhes } from '@/shared/feedback';
import { useVoltar } from '@/shared/hooks';
import { hojeLocal, logErro } from '@/shared/lib';

const CAMPOS_ENVIO = ['id_item', 'descricao', 'responsavel', 'cliente', 'observacao', 'data_inicio', 'data_fim', 'data_inicio_real', 'data_fim_real', 'percentual', 'tempo_previsto', 'prioridade', 'status'] as const;
const CAMPOS_DATA = ['data_inicio', 'data_fim', 'data_inicio_real', 'data_fim_real'] as const;
const STATUS_FECHADOS = ['Fechado', 'Concluído'];
const MAXIMO_AJUSTES_EXIBIDOS = 10;
const CHAVE_SEM_MODULO = '__base__';

export interface FiltroGrade {
    busca: string;
    status: string;
    responsavel: string;
    atrasados: boolean;
    meus: boolean;
}

export const FILTRO_VAZIO: FiltroGrade = { busca: '', status: '', responsavel: '', atrasados: false, meus: false };

export interface EtapaPendente { modulo: string | null; nome: string }

export interface BlocoPlano {
    modulo: string | null;
    subgrupos: [string, ItemPlano[]][];
    porUnidade: [string, { id: number; itens: ItemPlano[] }][];
    total: number;
    fechados: number;
    progresso: number;
}

export interface ContextoAcao {
    grupo?: string | null;
    modulo?: string | null;
    id_unidade?: number | null;
    apos_id_item?: number | null;
    rotulo?: string | null;
}

export type JanelaAberta =
    | { tipo: 'equipe' | 'horas'; item: ItemPlano }
    | { tipo: 'acao'; ctx: ContextoAcao }
    | { tipo: 'cabecalho' }
    | null;

export const estaAtrasado = (item: ItemPlano, hoje: string) =>
    item.status === 'Atrasado' || (item.status !== 'Fechado' && Boolean(soData(item.data_fim)) && soData(item.data_fim) < hoje);

/** Agrupa por módulo; dentro dele, etapas gerais e ações por unidade. */
function agrupar(itens: ItemPlano[], unidades: UnidadeDoPlano[], pendentes: EtapaPendente[]): BlocoPlano[] {
    const nomes = new Map(unidades.map((unidade) => [unidade.id_unidade, unidade.nome_unidade]));
    const chaves = [...new Set([
        ...itens.map((item) => item.modulo ?? CHAVE_SEM_MODULO),
        ...pendentes.map((etapa) => etapa.modulo ?? CHAVE_SEM_MODULO)
    ])];
    return (chaves.length ? chaves : [CHAVE_SEM_MODULO]).map((chave) => {
        const lista = itens.filter((item) => (item.modulo ?? CHAVE_SEM_MODULO) === chave);
        const subgrupos = new Map<string, ItemPlano[]>();
        lista.filter((item) => !item.id_unidade).forEach((item) => {
            const grupo = item.titulo ?? 'GERAL';
            subgrupos.set(grupo, [...(subgrupos.get(grupo) ?? []), item]);
        });
        pendentes.filter((etapa) => (etapa.modulo ?? CHAVE_SEM_MODULO) === chave && !subgrupos.has(etapa.nome)).forEach((etapa) => subgrupos.set(etapa.nome, []));
        const porUnidade = new Map<string, { id: number; itens: ItemPlano[] }>();
        lista.filter((item) => item.id_unidade).forEach((item) => {
            const id = item.id_unidade as number;
            const nome = nomes.get(id) ?? `Unidade ${id}`;
            porUnidade.set(nome, { id, itens: [...(porUnidade.get(nome)?.itens ?? []), item] });
        });
        const fechados = lista.filter((item) => STATUS_FECHADOS.includes(item.status ?? '')).length;
        return {
            modulo: chave === CHAVE_SEM_MODULO ? null : chave,
            subgrupos: [...subgrupos.entries()],
            porUnidade: [...porUnidade.entries()].sort(([a], [b]) => a.localeCompare(b)),
            total: lista.length,
            fechados,
            progresso: lista.length ? Math.round((fechados / lista.length) * 100) : 0
        };
    });
}

function paraEnvio(item: ItemPlano): Record<string, unknown> {
    const registro: Record<string, unknown> = Object.fromEntries(CAMPOS_ENVIO.map((campo) => [campo, item[campo] ?? null]));
    CAMPOS_DATA.forEach((campo) => { registro[campo] = soData(item[campo]) || null; });
    return { ...registro, equipe: (item.equipe ?? []).map((pessoa) => pessoa.id_usuario) };
}

const carregarCompleto = async (id: string) => {
    const plano = await planoApi.buscarPlano(id);
    const idProjeto = plano.cabecalho?.id_projeto;
    const [unidades, equipe] = idProjeto
        ? await Promise.all([
            listarUnidadesDoProjeto(String(idProjeto)).catch(() => [] as UnidadeResumo[]),
            planoApi.listarEquipeDisponivel(id).catch(() => [] as PessoaEquipe[])
        ])
        : [[] as UnidadeResumo[], [] as PessoaEquipe[]];
    return { plano, unidades, equipe };
};

export function useDetalhesPlano(id: string) {
    const { usuario } = useAuth();
    const voltarTela = useVoltar();
    const hoje = hojeLocal();
    const [cabecalho, setCabecalho] = useState<CabecalhoPlano | null>(null);
    const [itens, setItens] = useState<ItemPlano[]>([]);
    const [sujos, setSujos] = useState<ReadonlySet<number>>(() => new Set());
    const [indicadores, setIndicadores] = useState<IndicadoresPlano>({});
    const [permissoes, setPermissoes] = useState({ editar: false, novo: false });
    const [unidades, setUnidades] = useState<UnidadeDoPlano[]>([]);
    const [unidadesExtras, setUnidadesExtras] = useState<UnidadeResumo[]>([]);
    const [equipe, setEquipe] = useState<PessoaEquipe[]>([]);
    const [pendentes, setPendentes] = useState<EtapaPendente[]>([]);
    const [filtro, setFiltro] = useState(FILTRO_VAZIO);
    const [janela, setJanela] = useState<JanelaAberta>(null);
    const [salvando, setSalvando] = useState(false);

    const aplicar = useCallback(({ plano, unidades: todas, equipe: pessoas }: { plano: PlanoCompleto; unidades: UnidadeResumo[]; equipe: PessoaEquipe[] }) => {
        const doPlano = plano.detalhes ?? [];
        setCabecalho(plano.cabecalho);
        setItens(plano.etapas ?? []);
        setSujos(new Set());
        setIndicadores(plano.indicadores ?? {});
        setPermissoes(plano.permissoes ?? { editar: false, novo: false });
        setUnidades(doPlano);
        setUnidadesExtras(todas.filter((unidade) => !doPlano.some((item) => item.id_unidade === unidade.id_unidade)));
        setEquipe(pessoas);
    }, []);

    const recarregar = useCallback(async () => {
        try {
            aplicar(await carregarCompleto(id));
        } catch (falha) {
            erroHtml(falha, 'Erro ao carregar o plano.');
        }
    }, [aplicar, id]);

    useEffect(() => {
        let ativo = true;
        carregarCompleto(id)
            .then((dados) => { if (ativo) aplicar(dados); })
            .catch((falha: unknown) => {
                if (!ativo) return;
                erroHtml(falha, 'Erro ao carregar o plano.');
                const status = (falha as { response?: { status?: number } }).response?.status;
                if (status === 403 || status === 404) voltarTela();
            });
        return () => { ativo = false; };
    }, [aplicar, id, voltarTela]);

    useEffect(() => {
        if (!sujos.size) return undefined;
        const avisarSaida = (evento: BeforeUnloadEvent) => evento.preventDefault();
        window.addEventListener('beforeunload', avisarSaida);
        return () => window.removeEventListener('beforeunload', avisarSaida);
    }, [sujos]);

    const alterar = useCallback((idItem: number, mudancas: Partial<ItemPlano>) => {
        setItens((atuais) => atuais.map((item) => (item.id_item === idItem ? { ...item, ...mudancas } : item)));
        setSujos((atuais) => new Set(atuais).add(idItem));
    }, []);

    const salvar = async (silencioso = false): Promise<boolean> => {
        if (!sujos.size) {
            if (!silencioso) avisoRapido('Nada para salvar');
            return true;
        }
        setSalvando(true);
        try {
            const ajustes = await planoApi.salvarItens(id, itens.filter((item) => sujos.has(item.id_item)).map(paraEnvio));
            const descricoes = new Map(itens.map((item) => [item.id_item, item.descricao ?? '']));
            await recarregar();
            if (!silencioso && ajustes.length) {
                const lista = ajustes.slice(0, MAXIMO_AJUSTES_EXIBIDOS).map((ajuste) => `<li><b>${escaparHtml((descricoes.get(ajuste.id_item) ?? '').slice(0, 60))}</b>: ${escaparHtml(ajuste.msg)}</li>`).join('');
                resultadoComDetalhes('success', 'Salvo com ajustes automáticos', `<ul style="text-align:left;font-size:.86rem;padding-left:18px">${lista}</ul>`);
            } else if (!silencioso) {
                avisoRapido('Salvo');
            }
            return true;
        } catch (falha) {
            erroHtml(falha, 'Falha ao salvar.', 'Não foi possível salvar');
            return false;
        } finally {
            setSalvando(false);
        }
    };

    // Operações na estrutura recarregam a grade: antes, grava o que estiver pendente.
    const garantirSalvo = () => salvar(true);

    const executarEstrutural = async (acao: () => Promise<unknown>) => {
        if (!await garantirSalvo()) return false;
        try {
            await acao();
            await recarregar();
            return true;
        } catch (falha) {
            erroHtml(falha);
            return false;
        }
    };

    const gravarAcao = async (ctx: ContextoAcao, dados: Partial<NovaAcaoItem> & { descricao: string }) => {
        const gravou = await executarEstrutural(() => planoApi.criarItem(id, {
            ...dados, grupo: ctx.grupo ?? null, modulo: ctx.modulo ?? null, id_unidade: ctx.id_unidade ?? null, apos_id_item: ctx.apos_id_item ?? null
        }));
        // A etapa pendente passa a existir de fato.
        if (gravou && ctx.grupo) setPendentes((atuais) => atuais.filter((etapa) => !(etapa.nome === ctx.grupo && etapa.modulo === (ctx.modulo ?? null))));
        return gravou;
    };

    const adicionarUnidade = (idUnidade: number) => {
        const modulos = [...new Set(itens.map((item) => item.modulo ?? null))];
        const modelo = etapasUnidadePorModulos(modulos, cabecalho?.sub_tipo ?? '');
        // Plano montado do zero: replica as ações da primeira unidade existente.
        const referencia = itens.find((item) => item.id_unidade)?.id_unidade;
        const copia = itens.filter((item) => item.id_unidade === referencia && referencia).map((item) => ({ acao: item.descricao, responsavel: item.responsavel, prioridade: item.prioridade, modulo: item.modulo }));
        return executarEstrutural(async () => {
            await planoApi.adicionarUnidade(id, idUnidade, modelo.length ? modelo : copia);
            avisoRapido('Unidade adicionada');
        });
    };

    const removerUnidade = async (idUnidade: number, nome: string) => {
        if (!await confirmar(`Remover a unidade ${nome}?`, { texto: 'Todas as ações desta unidade serão excluídas do plano.', rotulo: 'Remover' })) return;
        if (!await garantirSalvo()) return;
        if (await excluirComConfirmacao((forcar) => planoApi.removerUnidade(id, idUnidade, forcar), 'Remover mesmo assim')) await recarregar();
    };

    const criarEtapa = (modulo: string | null, nome: string) => {
        const novo = nome.trim().toUpperCase();
        if (!novo) return;
        const existe = itens.some((item) => !item.id_unidade && (item.modulo ?? null) === modulo && (item.titulo ?? 'GERAL') === novo)
            || pendentes.some((etapa) => etapa.nome === novo && etapa.modulo === modulo);
        if (existe) {
            aviso('Já existe uma etapa com esse nome.');
            return;
        }
        setPendentes((atuais) => [...atuais, { modulo, nome: novo }]);
    };

    const renomearEtapa = (modulo: string | null, de: string, para: string) => {
        const novo = para.trim().toUpperCase();
        if (!novo || novo === de) return undefined;
        if (pendentes.some((etapa) => etapa.nome === de && etapa.modulo === modulo)) {
            setPendentes((atuais) => atuais.map((etapa) => (etapa.nome === de && etapa.modulo === modulo ? { ...etapa, nome: novo } : etapa)));
            return undefined;
        }
        return executarEstrutural(() => planoApi.renomearEtapa(id, modulo, de, novo));
    };

    const excluirEtapa = async (modulo: string | null, nome: string, qtd: number) => {
        if (!qtd) {
            setPendentes((atuais) => atuais.filter((etapa) => !(etapa.nome === nome && etapa.modulo === modulo)));
            return;
        }
        if (!await confirmar(`Excluir a etapa ${nome}?`, { texto: `As ${qtd} ação(ões) desta etapa serão excluídas.`, rotulo: 'Excluir etapa' })) return;
        if (!await garantirSalvo()) return;
        if (await excluirComConfirmacao((forcar) => planoApi.excluirEtapa(id, nome, modulo, forcar), 'Excluir mesmo assim')) await recarregar();
    };

    const excluirItem = async (item: ItemPlano) => {
        if (!await confirmar('Excluir ação?', { texto: item.descricao ?? '', rotulo: 'Excluir' })) return;
        if (!await garantirSalvo()) return;
        if (await excluirComConfirmacao((forcar) => planoApi.excluirItem(item.id_item, forcar), 'Excluir tudo', /apontamento/i)) await recarregar();
    };

    /** Depois de apontar horas: com edições pendentes, atualiza só o item, sem perder o que foi digitado. */
    const aposApontar = async (idItem: number) => {
        if (!sujos.size) {
            await recarregar();
            return;
        }
        try {
            const plano = await planoApi.buscarPlano(id);
            const novo = plano.etapas?.find((item) => item.id_item === idItem);
            if (novo) {
                setItens((atuais) => atuais.map((item) => {
                    if (item.id_item !== idItem) return item;
                    const horas = { ...item, horas_trabalhadas: novo.horas_trabalhadas };
                    return sujos.has(idItem) ? horas : { ...horas, equipe: novo.equipe, status: novo.status, data_inicio_real: novo.data_inicio_real };
                }));
            }
            setIndicadores(plano.indicadores ?? {});
        } catch (falha) {
            logErro('Erro ao atualizar horas do item', falha);
        }
    };

    const blocos = useMemo(() => agrupar(itens, unidades, pendentes), [itens, unidades, pendentes]);
    const unidadesVazias = useMemo(() => unidades.filter((unidade) => !itens.some((item) => item.id_unidade === unidade.id_unidade)), [itens, unidades]);
    const responsaveis = useMemo(() => [...new Set(itens.map((item) => item.responsavel).filter(Boolean) as string[])].sort(), [itens]);
    const modulos = useMemo(() => [...new Set(itens.map((item) => item.modulo).filter(Boolean) as string[])], [itens]);

    const visivel = useCallback((item: ItemPlano) => {
        if (filtro.status && item.status !== filtro.status) return false;
        if (filtro.responsavel && (item.responsavel ?? '') !== filtro.responsavel) return false;
        if (filtro.atrasados && !estaAtrasado(item, hoje)) return false;
        if (filtro.meus && !(item.equipe ?? []).some((pessoa) => pessoa.id_usuario === usuario.id_usuario)) return false;
        if (!filtro.busca) return true;
        const busca = filtro.busca.toLowerCase();
        return [item.descricao, item.observacao, item.cliente, item.responsavel].some((texto) => (texto ?? '').toLowerCase().includes(busca));
    }, [filtro, hoje, usuario.id_usuario]);

    const encerrado = cabecalho?.status === 'ENCERRADO';

    return {
        cabecalho, itens, sujos, indicadores, permissoes, unidades, unidadesExtras, equipe, pendentes, filtro, janela, salvando, hoje, blocos, unidadesVazias, responsaveis, modulos, encerrado, visivel, usuario,
        editavel: permissoes.editar && !encerrado,
        filtroAtivo: Boolean(filtro.busca || filtro.status || filtro.responsavel || filtro.atrasados || filtro.meus),
        qtdVisiveis: itens.filter(visivel).length,
        setFiltro, setJanela, alterar, salvar, gravarAcao, adicionarUnidade, removerUnidade, criarEtapa, renomearEtapa, excluirEtapa, excluirItem, recarregar, aposApontar,
        moverItem: (item: ItemPlano, direcao: 'cima' | 'baixo') => executarEstrutural(() => planoApi.moverItem(item.id_item, direcao)),
        descartar: async () => {
            if (sujos.size && await confirmar('Descartar alterações?', { texto: `${sujos.size} linha(s) alteradas serão perdidas.`, rotulo: 'Descartar' })) await recarregar();
        },
        voltar: async () => {
            if (!sujos.size) {
                voltarTela();
                return;
            }
            const decisao = await decidirSaida(sujos.size);
            if (decisao === 'sair' || (decisao === 'salvar' && await salvar(true))) voltarTela();
        },
        publicar: () => {
            if (!cabecalho) return undefined;
            return gerenciarPublicacao({
                publico: cabecalho.publico,
                token: cabecalho.token_publico,
                podeEditar: permissoes.editar,
                permiteNovoLink: true,
                alterar: (publico, regenerar) => planoApi.alterarPublicacao(cabecalho.id_plano, publico, regenerar),
                aoMudar: (publico, token) => setCabecalho((atual) => (atual ? { ...atual, publico, token_publico: token ?? atual.token_publico } : atual))
            });
        },
        salvarDados: async (dados: DadosPlano) => {
            if (!cabecalho) return false;
            try {
                await planoApi.atualizarDadosPlano(cabecalho.id_plano, dados);
                await recarregar();
                return true;
            } catch (falha) {
                erroHtml(falha);
                return false;
            }
        }
    };
}

export type DetalhesPlano = ReturnType<typeof useDetalhesPlano>;
