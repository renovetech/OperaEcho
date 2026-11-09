/* Estado do formulário de lançamento: mês, colaborador, unidades por dia e totais. */
import { useEffect, useMemo, useState } from 'react';
import { buscarDetalhes, listarColaboradores, salvarLancamento, type Colaborador, type LancamentoResumo } from '@/features/horaExtra/api';
import {
    alterarDia, criarGradeDoMes, haDiaSemUnidade, JORNADA_PADRAO, linhasDoLancamento, somarTotais, totalizarPorUnidade,
    type CampoDia, type Jornada, type LinhaDia
} from '@/features/horaExtra/calculos';
import { useAuth } from '@/shared/auth/AuthContext';
import { listarProjetosAtivos, listarUnidadesDoProjeto, type ProjetoResumo, type UnidadeResumo } from '@/shared/catalogos';
import { aviso, confirmar, erro, fecharMensagem, mensagemDeErro, mostrarCarregando, sucesso } from '@/shared/feedback';
import { logErro } from '@/shared/lib';

const CHAVE_JORNADA = 'configJornada';
const PERFIS_GESTAO = ['Administrador', 'Gestor'];

export interface UnidadeCatalogo { nome_unidade: string; id_projeto: number | null }
export interface IntervaloUnidade { de: string; ate: string; id: string }

const paraId = (valor: string): number | null => (valor ? Number(valor) : null);
const mesAtual = () => new Date().toISOString().slice(0, 7);

function lerJornada(): Jornada {
    try {
        const salva = JSON.parse(localStorage.getItem(CHAVE_JORNADA) ?? 'null') as Partial<Jornada> | null;
        return salva?.entrada && salva.saida && salva.intervalo ? { entrada: salva.entrada, saida: salva.saida, intervalo: salva.intervalo } : JORNADA_PADRAO;
    } catch {
        return JORNADA_PADRAO;
    }
}

function guardarJornada(jornada: Jornada): void {
    try {
        localStorage.setItem(CHAVE_JORNADA, JSON.stringify(jornada));
    } catch (falha) {
        logErro('Não foi possível guardar a jornada padrão', falha);
    }
}

export function useLancamento(apiBase: string, lotacaoFixa: string | undefined) {
    const { usuario } = useAuth();
    const ehGestao = PERFIS_GESTAO.includes(usuario.perfil_acesso);
    const proprioUsuario = String(usuario.id_usuario);

    const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
    const [projetos, setProjetos] = useState<ProjetoResumo[]>([]);
    const [unidades, setUnidades] = useState<UnidadeResumo[]>([]);
    /** Acumula as unidades dos projetos visitados: trocar o projeto no topo não apaga os dias já marcados de outro. */
    const [catalogo, setCatalogo] = useState<Record<number, UnidadeCatalogo>>({});
    const [jornada, setJornadaEstado] = useState<Jornada>(lerJornada);

    const [idLancamento, setIdLancamento] = useState<number | null>(null);
    const [mes, setMes] = useState(mesAtual);
    const [idUsuario, setIdUsuario] = useState('');
    const [idProjeto, setIdProjeto] = useState('');
    const [idUnidade, setIdUnidade] = useState('');
    const [linhas, setLinhas] = useState<LinhaDia[]>([]);
    const [intervalo, setIntervalo] = useState<IntervaloUnidade>({ de: '', ate: '', id: '' });

    useEffect(() => {
        let ativo = true;
        Promise.all([listarProjetosAtivos(lotacaoFixa), listarColaboradores(lotacaoFixa)])
            .then(([listaProjetos, listaColaboradores]) => {
                if (!ativo) return;
                setProjetos(listaProjetos);
                setColaboradores(listaColaboradores);
            })
            .catch((falha: unknown) => logErro('Erro ao carregar as listas da hora extra', falha));
        return () => { ativo = false; };
    }, [lotacaoFixa]);

    const totais = useMemo(() => somarTotais(linhas), [linhas]);
    const porUnidade = useMemo(() => totalizarPorUnidade(linhas), [linhas]);

    const incluirNoCatalogo = (lista: UnidadeResumo[], projeto: number) => {
        setCatalogo((atual) => ({ ...atual, ...Object.fromEntries(lista.map((unidade) => [unidade.id_unidade, { nome_unidade: unidade.nome_unidade, id_projeto: projeto }])) }));
    };

    const carregarUnidades = async (projeto: string): Promise<UnidadeResumo[]> => {
        const lista = await listarUnidadesDoProjeto(projeto);
        incluirNoCatalogo(lista, Number(projeto));
        return lista;
    };

    const selecionarProjeto = async (projeto: string) => {
        setIdProjeto(projeto);
        setIdUnidade('');
        setIntervalo((atual) => ({ ...atual, id: '' }));
        if (!projeto) {
            setUnidades([]);
            return;
        }
        try {
            setUnidades(await carregarUnidades(projeto));
        } catch (falha) {
            logErro('Erro ao carregar as unidades do projeto', falha);
            setUnidades([]);
        }
    };

    const novaGrade = (mesGrade: string, usuarioGrade: string, unidade: string, projeto: string) =>
        (usuarioGrade ? criarGradeDoMes(mesGrade, jornada, paraId(unidade), paraId(projeto)) : []);

    const iniciarNovo = () => {
        const colaborador = ehGestao ? '' : proprioUsuario;
        const mesNovo = mesAtual();
        setIdLancamento(null);
        setMes(mesNovo);
        setIdUsuario(colaborador);
        setLinhas(novaGrade(mesNovo, colaborador, '', lotacaoFixa ?? ''));
        void selecionarProjeto(lotacaoFixa ?? '');
    };

    const alterarMes = (novo: string) => {
        setMes(novo);
        if (!idLancamento) setLinhas(novaGrade(novo, idUsuario, idUnidade, idProjeto));
    };

    const alterarColaborador = (novo: string) => {
        setIdUsuario(novo);
        if (!idLancamento) setLinhas(novaGrade(mes, novo, idUnidade, idProjeto));
    };

    const abrir = async (lancamento: LancamentoResumo): Promise<boolean> => {
        mostrarCarregando('Carregando...');
        try {
            const detalhes = await buscarDetalhes(apiBase, lancamento.id_lancamento);
            const noCabecalho = lancamento.id_projeto ? [lancamento.id_projeto] : [];
            const doMes = new Set([...noCabecalho, ...detalhes.flatMap((detalhe) => (detalhe.id_projeto ? [detalhe.id_projeto] : []))]);
            const resultados = await Promise.allSettled([...doMes].map(async (projeto) => ({ projeto, lista: await carregarUnidades(String(projeto)) })));
            const principal = resultados.flatMap((item) => (item.status === 'fulfilled' && item.value.projeto === lancamento.id_projeto ? [item.value.lista] : []))[0];

            setIdLancamento(lancamento.id_lancamento);
            setMes(lancamento.mes_referencia);
            setIdUsuario(String(lancamento.id_usuario));
            setIdProjeto(lancamento.id_projeto ? String(lancamento.id_projeto) : '');
            setIdUnidade(lancamento.id_projeto && lancamento.id_unidade ? String(lancamento.id_unidade) : '');
            setUnidades(principal ?? []);
            setLinhas(detalhes.length > 0
                ? linhasDoLancamento(lancamento.mes_referencia, detalhes, lancamento.id_projeto, jornada)
                : criarGradeDoMes(lancamento.mes_referencia, jornada, lancamento.id_unidade, lancamento.id_projeto));
            fecharMensagem();
            return true;
        } catch (falha) {
            logErro('Erro ao abrir o lançamento', falha);
            erro('Não foi possível carregar os detalhes.');
            return false;
        }
    };

    const alterarLinha = (indice: number, campo: CampoDia, valor: string | boolean) => {
        setLinhas((atuais) => atuais.map((linha, posicao) => (posicao === indice ? alterarDia(linha, campo, valor, jornada) : linha)));
    };

    const alterarUnidadeDaLinha = (indice: number, valor: string) => {
        const unidade = paraId(valor);
        const projeto = unidade ? catalogo[unidade]?.id_projeto ?? null : null;
        setLinhas((atuais) => atuais.map((linha, posicao) => (posicao === indice ? { ...linha, id_unidade: unidade, id_projeto: projeto } : linha)));
    };

    /** A unidade padrão só preenche dias úteis ainda sem unidade: não sobrescreve escolha manual. */
    const aplicarUnidadePadrao = (valor: string) => {
        setIdUnidade(valor);
        setLinhas((atuais) => atuais.map((linha) => (linha.isFolga || linha.id_unidade ? linha : { ...linha, id_unidade: paraId(valor), id_projeto: paraId(idProjeto) })));
    };

    const aplicarPadraoEmTodos = () => {
        setLinhas((atuais) => atuais.map((linha) => (linha.isFolga ? linha : { ...linha, id_unidade: paraId(idUnidade), id_projeto: paraId(idProjeto) })));
    };

    const aplicarNoIntervalo = () => {
        const de = Number.parseInt(intervalo.de, 10);
        const ate = Number.parseInt(intervalo.ate, 10);
        if (!de || !ate || de > ate) {
            aviso('Informe um intervalo de dias válido (De ≤ Até).');
            return;
        }
        if (!intervalo.id) {
            aviso('Selecione a unidade para aplicar no período.');
            return;
        }
        setLinhas((atuais) => atuais.map((linha) => (linha.dia >= de && linha.dia <= ate && !linha.isFolga ? { ...linha, id_unidade: paraId(intervalo.id), id_projeto: paraId(idProjeto) } : linha)));
    };

    const alterarJornada = (nova: Jornada) => {
        setJornadaEstado(nova);
        guardarJornada(nova);
    };

    const aplicarJornadaNaTabela = () => setLinhas(novaGrade(mes, idUsuario, idUnidade, idProjeto));

    /** Devolve true quando gravou. O cabeçalho guarda o projeto e a unidade de mais horas, como referência. */
    const salvar = async (): Promise<boolean> => {
        if (!idUsuario || !idProjeto) {
            aviso('Selecione o Colaborador e o Projeto.');
            return false;
        }
        if (haDiaSemUnidade(linhas)) {
            const seguir = await confirmar('Dias sem unidade', { texto: 'Há dias com hora extra sem unidade atribuída. Deseja salvar mesmo assim?', rotulo: 'Salvar assim mesmo' });
            if (!seguir) return false;
        }
        const principal = porUnidade[0];
        const unidadePrincipal = principal?.id_unidade ?? paraId(idUnidade);
        if (!unidadePrincipal) {
            aviso('Selecione a unidade padrão ou atribua uma unidade aos dias.');
            return false;
        }
        mostrarCarregando('Salvando...');
        try {
            await salvarLancamento(apiBase, {
                id_lancamento: idLancamento,
                id_usuario: Number(idUsuario),
                id_projeto: principal?.id_projeto ?? paraId(idProjeto),
                id_unidade: unidadePrincipal,
                mes_referencia: mes,
                detalhes_dias: linhas,
                totais
            });
            sucesso('Lançamento salvo.');
            return true;
        } catch (falha) {
            logErro('Erro ao salvar a hora extra', falha);
            erro(mensagemDeErro(falha, 'Erro ao salvar.'));
            return false;
        }
    };

    const nomeUnidade = (id: number | null): string => {
        if (!id) return 'Sem unidade';
        return catalogo[id]?.nome_unidade ?? unidades.find((unidade) => unidade.id_unidade === id)?.nome_unidade ?? `Unidade ${id}`;
    };

    const nomeProjeto = (id: number | null): string => {
        if (!id) return 'Sem projeto';
        return projetos.find((projeto) => projeto.id_projeto === id)?.nome_projeto ?? `Projeto ${id}`;
    };

    return {
        ehGestao, colaboradores, projetos, unidades, catalogo, jornada, idLancamento, mes, idUsuario, idProjeto, idUnidade, linhas, intervalo, totais, porUnidade,
        setIntervalo, iniciarNovo, abrir, alterarMes, alterarColaborador, selecionarProjeto, alterarLinha, alterarUnidadeDaLinha, aplicarUnidadePadrao,
        aplicarPadraoEmTodos, aplicarNoIntervalo, alterarJornada, aplicarJornadaNaTabela, salvar, nomeUnidade, nomeProjeto
    };
}

export type EstadoLancamento = ReturnType<typeof useLancamento>;
