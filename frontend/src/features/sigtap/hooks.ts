import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as sigtapApi from '@/features/sigtap/api';
import type {
    Competencia, FichaProcedimentoDados, FiltroHistorico, Importacao, MetaFiltros, Pagina, PaginaTabela,
    ProcedimentoLista, RegraCompatibilidade, ResumoImportacao, TabelaAuxiliar, TipoCompatibilidade
} from '@/features/sigtap/api';
import { fmtComp, fmtNum } from '@/features/sigtap/formatos';
import { aviso, confirmar, erro, mensagemDeErro, resultadoComDetalhes, sucesso } from '@/shared/feedback';
import { useParametrosUrl } from '@/shared/hooks';
import { logErro } from '@/shared/lib';

const TAMANHO_BUSCA = 20;
const TAMANHO_TABELA = 25;
const ESPERA_DIGITACAO_MS = 450;
const MINIMO_CARACTERES = 3;
const INTERVALO_IMPORTACAO_MS = 2000;
const BYTES_POR_MB = 1048576;

export const FILTROS_BUSCA = ['q', 'grupo', 'subgrupo', 'forma', 'financiamento', 'complexidade', 'registro', 'modalidade', 'sexo', 'ordem', 'vinculo', 'codigo'] as const;
export type FiltroBusca = (typeof FILTROS_BUSCA)[number];

const paginaVazia = <T,>(tamanho: number): Pagina<T> => ({ itens: [], total: 0, tamanho });
const limparTudo = () => Object.fromEntries([...FILTROS_BUSCA, 'rotulo', 'todos', 'pagina'].map((chave) => [chave, null]));
export const totalPaginas = (pagina: Pagina<unknown>): number => Math.max(1, Math.ceil((pagina.total || 0) / (pagina.tamanho || 1)));

export function useConsultaSigtap() {
    const [parametros, alterarUrl] = useParametrosUrl();
    const navigate = useNavigate();
    const [competencias, setCompetencias] = useState<Competencia[] | null>(null);

    useEffect(() => {
        sigtapApi.listarCompetencias()
            .then(setCompetencias)
            .catch((falha: unknown) => {
                setCompetencias([]);
                erro(mensagemDeErro(falha, 'Não foi possível carregar o SIGTAP.'));
            });
    }, []);

    const competencia = parametros.get('comp') ?? competencias?.[0]?.competencia ?? '';
    const proc = parametros.get('proc');
    const aba = parametros.get('aba') ?? 'proc';

    const abrirFicha = useCallback((codigo: string) => {
        alterarUrl({ proc: codigo }, { empilhar: true });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [alterarUrl]);

    /** Hierarquia vai para os seletores; os demais vínculos viram uma etiqueta de filtro. */
    const filtrarPor = useCallback((vinculo: string, codigo: string, rotulo: string) => {
        const base = { ...limparTudo(), aba: null, proc: null };
        if (vinculo === 'grupo') alterarUrl({ ...base, grupo: codigo }, { empilhar: true });
        else if (vinculo === 'subgrupo') alterarUrl({ ...base, grupo: codigo.slice(0, 2), subgrupo: codigo }, { empilhar: true });
        else if (vinculo === 'forma') alterarUrl({ ...base, grupo: codigo.slice(0, 2), subgrupo: codigo.slice(0, 4), forma: codigo }, { empilhar: true });
        else alterarUrl({ ...base, vinculo, codigo, rotulo }, { empilhar: true });
    }, [alterarUrl]);

    const voltarDaFicha = () => {
        const posicao = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (posicao > 0) navigate(-1);
        else alterarUrl({ proc: null });
    };

    return {
        competencias, competencia, aba, proc, abrirFicha, filtrarPor, voltarDaFicha,
        info: competencias?.find((item) => item.competencia === competencia),
        trocarCompetencia: (nova: string) => alterarUrl({ comp: nova }),
        irParaAba: (nova: string) => alterarUrl({ aba: nova === 'proc' ? null : nova, proc: null, pagina: null }, { empilhar: true })
    };
}

export function useBuscaProcedimentos(competencia: string) {
    const [parametros, alterarUrl] = useParametrosUrl();
    const q = parametros.get('q') ?? '';
    const [meta, setMeta] = useState<MetaFiltros | null>(null);
    const [texto, setTexto] = useState(q);
    const [qAnterior, setQAnterior] = useState(q);
    const [resultado, setResultado] = useState({ chave: '', dados: paginaVazia<ProcedimentoLista>(TAMANHO_BUSCA) });

    // Filtro aplicado de fora (ficha, tabelas, limpar): o campo acompanha a URL.
    if (q !== qAnterior) {
        setQAnterior(q);
        setTexto(q);
    }

    const pagina = Number(parametros.get('pagina') ?? 1);
    const filtros = useMemo(
        () => Object.fromEntries(FILTROS_BUSCA.map((chave) => [chave, parametros.get(chave) ?? ''])) as Record<FiltroBusca, string>,
        [parametros]
    );
    const rotuloVinculo = parametros.get('rotulo') ?? '';
    const consultou = parametros.has('todos') || FILTROS_BUSCA.some((chave) => filtros[chave]);
    const chave = consultou ? JSON.stringify({ filtros, pagina, competencia }) : '';

    useEffect(() => {
        if (!competencia) return;
        sigtapApi.buscarFiltros(competencia).then(setMeta).catch((falha: unknown) => logErro('Erro ao carregar filtros do SIGTAP', falha));
    }, [competencia]);

    useEffect(() => {
        if (texto === q) return undefined;
        const espera = setTimeout(() => {
            const limpo = texto.trim();
            if (!limpo || limpo.length >= MINIMO_CARACTERES) alterarUrl({ q: texto, pagina: null });
        }, ESPERA_DIGITACAO_MS);
        return () => clearTimeout(espera);
    }, [texto, q, alterarUrl]);

    useEffect(() => {
        if (!chave || !competencia) return undefined;
        let ativo = true;
        const params = { ...filtros, ordem: filtros.ordem || 'codigo', competencia, pagina, tamanho: TAMANHO_BUSCA };
        sigtapApi.buscarProcedimentos(params)
            .then((dados) => { if (ativo) setResultado({ chave, dados }); })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setResultado({ chave, dados: paginaVazia(TAMANHO_BUSCA) });
                erro(mensagemDeErro(falha, 'Falha na busca.'));
            });
        return () => { ativo = false; };
    }, [chave, filtros, pagina, competencia]);

    const alterar = (campo: FiltroBusca, valor: string) => {
        alterarUrl({
            [campo]: valor,
            pagina: null,
            ...(campo === 'grupo' && { subgrupo: null, forma: null }),
            ...(campo === 'subgrupo' && { forma: null })
        });
    };

    return {
        meta, texto, setTexto, filtros, rotuloVinculo, consultou, pagina,
        resultado: resultado.dados,
        carregando: Boolean(chave) && resultado.chave !== chave,
        alterar,
        removerVinculo: () => alterarUrl({ vinculo: null, codigo: null, rotulo: null, pagina: null }),
        enviar: () => alterarUrl({ q: texto, todos: texto ? null : '1', pagina: null }),
        limpar: () => alterarUrl(limparTudo()),
        verTodos: () => alterarUrl({ todos: '1', pagina: null }),
        irParaPagina: (nova: number) => alterarUrl({ pagina: nova > 1 ? String(nova) : null })
    };
}

export function useFichaProcedimento(codigo: string, competencia: string) {
    const [dados, setDados] = useState<FichaProcedimentoDados | null>(null);
    const [falhou, setFalhou] = useState('');

    useEffect(() => {
        let ativo = true;
        sigtapApi.buscarFicha(codigo, competencia)
            .then((resposta) => { if (ativo) setDados(resposta); })
            .catch((falha: unknown) => { if (ativo) setFalhou(mensagemDeErro(falha, 'Não foi possível carregar o procedimento.')); });
        return () => { ativo = false; };
    }, [codigo, competencia]);

    return { dados, falhou };
}

export function useCompatibilidades(competencia: string) {
    const [parametros, alterarUrl] = useParametrosUrl();
    const aplicado = useMemo(() => ({
        tipo: parametros.get('tipo') ?? '',
        principal: parametros.get('principal') ?? '',
        secundario: parametros.get('secundario') ?? ''
    }), [parametros]);
    const consultou = parametros.has('consulta');
    const pagina = Number(parametros.get('pagina') ?? 1);
    const [rascunho, setRascunho] = useState(aplicado);
    const [tipos, setTipos] = useState<TipoCompatibilidade[]>([]);
    const [resultado, setResultado] = useState({ chave: '', dados: paginaVazia<RegraCompatibilidade>(TAMANHO_TABELA) });
    const chave = consultou ? JSON.stringify({ aplicado, pagina, competencia }) : '';

    useEffect(() => {
        sigtapApi.listarTiposCompatibilidade(competencia).then(setTipos).catch((falha: unknown) => logErro('Erro ao listar tipos', falha));
    }, [competencia]);

    useEffect(() => {
        if (!chave) return undefined;
        let ativo = true;
        sigtapApi.buscarCompatibilidades({ ...aplicado, competencia, pagina, tamanho: TAMANHO_TABELA })
            .then((dados) => { if (ativo) setResultado({ chave, dados }); })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setResultado({ chave, dados: paginaVazia(TAMANHO_TABELA) });
                erro(mensagemDeErro(falha, 'Falha na consulta.'));
            });
        return () => { ativo = false; };
    }, [chave, aplicado, pagina, competencia]);

    const aplicar = (filtro: typeof aplicado) => {
        setRascunho(filtro);
        alterarUrl({ ...filtro, consulta: '1', pagina: null });
    };

    return {
        tipos, rascunho, setRascunho, consultou, pagina, aplicar,
        resultado: resultado.dados,
        carregando: Boolean(chave) && resultado.chave !== chave,
        limpar: () => {
            setRascunho({ tipo: '', principal: '', secundario: '' });
            alterarUrl({ tipo: null, principal: null, secundario: null, consulta: null, pagina: null });
        },
        irParaPagina: (nova: number) => alterarUrl({ pagina: nova > 1 ? String(nova) : null })
    };
}

export function useTabelasAuxiliares(competencia: string) {
    const [parametros, alterarUrl] = useParametrosUrl();
    const tabela = parametros.get('tabela') ?? 'ocupacao';
    const q = parametros.get('tq') ?? '';
    const pagina = Number(parametros.get('pagina') ?? 1);
    const [lista, setLista] = useState<TabelaAuxiliar[]>([]);
    const [texto, setTexto] = useState(q);
    const [resultado, setResultado] = useState<{ chave: string; dados: PaginaTabela }>({ chave: '', dados: paginaVazia(TAMANHO_TABELA) });
    const chave = JSON.stringify({ tabela, q, pagina, competencia });

    useEffect(() => {
        sigtapApi.listarTabelas().then(setLista).catch((falha: unknown) => logErro('Erro ao listar tabelas', falha));
    }, []);

    useEffect(() => {
        if (texto === q) return undefined;
        const espera = setTimeout(() => alterarUrl({ tq: texto, pagina: null }), ESPERA_DIGITACAO_MS);
        return () => clearTimeout(espera);
    }, [texto, q, alterarUrl]);

    useEffect(() => {
        let ativo = true;
        sigtapApi.buscarTabela(tabela, { competencia, q, pagina, tamanho: TAMANHO_TABELA })
            .then((dados) => { if (ativo) setResultado({ chave, dados }); })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setResultado({ chave, dados: paginaVazia(TAMANHO_TABELA) });
                erro(mensagemDeErro(falha, 'Falha na consulta.'));
            });
        return () => { ativo = false; };
    }, [chave, tabela, q, pagina, competencia]);

    return {
        lista, tabela, texto, setTexto, pagina,
        resultado: resultado.dados,
        carregando: resultado.chave !== chave,
        selecionarTabela: (nova: string) => alterarUrl({ tabela: nova, pagina: null }),
        irParaPagina: (nova: number) => alterarUrl({ pagina: nova > 1 ? String(nova) : null })
    };
}

const FILTRO_VAZIO: FiltroHistorico = { competencia: '', situacao: '' };
export const tamanhoEmMb = (arquivo: File): string => (arquivo.size / BYTES_POR_MB).toFixed(1);

export function useImportacaoSigtap() {
    const [resumo, setResumo] = useState<ResumoImportacao | null>(null);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [progressoEnvio, setProgressoEnvio] = useState(0);
    const [andamento, setAndamento] = useState<Importacao | null>(null);
    const [rascunho, setRascunho] = useState<FiltroHistorico>(FILTRO_VAZIO);
    const [consulta, setConsulta] = useState({ filtro: FILTRO_VAZIO, pagina: 1 });
    const [historico, setHistorico] = useState({ chave: '', dados: paginaVazia<Importacao>(10) });
    const [versao, setVersao] = useState(0);
    const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);
    const chaveHistorico = JSON.stringify({ consulta, versao });
    const idAndamento = andamento?.id_importacao;

    useEffect(() => {
        sigtapApi.buscarResumo()
            .then((dados) => {
                setResumo(dados);
                if (dados.emAndamento) setAndamento(dados.emAndamento);
            })
            .catch((falha: unknown) => {
                setResumo(null);
                erro(mensagemDeErro(falha, 'Não foi possível carregar o SIGTAP.'));
            });
    }, [versao]);

    useEffect(() => {
        let ativo = true;
        sigtapApi.listarImportacoes(consulta.filtro, consulta.pagina)
            .then((dados) => { if (ativo) setHistorico({ chave: chaveHistorico, dados }); })
            .catch((falha: unknown) => {
                logErro('Erro ao listar importações', falha);
                if (ativo) setHistorico({ chave: chaveHistorico, dados: paginaVazia(10) });
            });
        return () => { ativo = false; };
    }, [chaveHistorico, consulta]);

    // Acompanha a importação em segundo plano até terminar.
    useEffect(() => {
        if (!idAndamento) return undefined;
        const verificacao = setInterval(() => {
            sigtapApi.buscarImportacao(idAndamento)
                .then((dados) => {
                    if (dados.situacao === 'PROCESSANDO') { setAndamento(dados); return; }
                    setAndamento(null);
                    if (dados.situacao === 'CONCLUIDA') {
                        resultadoComDetalhes('success', 'SIGTAP atualizado!', `Competência <b>${fmtComp(dados.competencia)}</b> importada:<br>${fmtNum(dados.qt_procedimentos)} procedimentos · ${fmtNum(dados.qt_compatibilidades)} compatibilidades`);
                    } else {
                        erro(dados.mensagem || 'Veja o histórico.', 'A importação falhou');
                    }
                    setConsulta((atual) => ({ ...atual, pagina: 1 }));
                    recarregar();
                })
                .catch((falha: unknown) => {
                    logErro('Erro ao acompanhar importação', falha);
                    setAndamento(null);
                });
        }, INTERVALO_IMPORTACAO_MS);
        return () => clearInterval(verificacao);
    }, [idAndamento, recarregar]);

    const escolherArquivo = (selecionado?: File | null) => {
        if (!selecionado) return;
        if (!/\.zip$/i.test(selecionado.name)) {
            aviso('Envie o arquivo .zip original baixado do SIGTAP, sem descompactar.', 'Arquivo inválido');
            return;
        }
        setArquivo(selecionado);
    };

    const enviar = async () => {
        if (!arquivo) return;
        const consequencia = resumo?.competencias?.length
            ? 'Se a competência do arquivo já existir na base, os dados dela serão substituídos.'
            : 'Esta será a primeira competência da base.';
        if (!await confirmar('Importar pacote SIGTAP?', { texto: `${arquivo.name} (${tamanhoEmMb(arquivo)} MB). ${consequencia}`, rotulo: 'Importar' })) return;
        setProgressoEnvio(1);
        try {
            setAndamento(await sigtapApi.enviarPacote(arquivo, setProgressoEnvio));
            setArquivo(null);
            setConsulta((atual) => ({ ...atual, pagina: 1 }));
            recarregar();
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha ao enviar o arquivo.'), 'Não foi possível importar');
        } finally {
            setProgressoEnvio(0);
        }
    };

    const remover = async (competencia: Competencia) => {
        const texto = 'Os dados desta competência deixam de aparecer na Consulta SIGTAP. O histórico de importações é mantido e a competência pode ser importada novamente.';
        if (!await confirmar(`Remover a competência ${fmtComp(competencia.competencia)}?`, { texto, rotulo: 'Sim, remover' })) return;
        try {
            await sigtapApi.removerCompetencia(competencia.competencia);
            sucesso('Competência removida');
            setConsulta((atual) => ({ ...atual, pagina: 1 }));
            recarregar();
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Não foi possível remover.'));
        }
    };

    return {
        resumo, arquivo, progressoEnvio, andamento, rascunho, setRascunho, escolherArquivo, enviar, remover,
        historico: historico.dados,
        pagina: consulta.pagina,
        carregandoHistorico: historico.chave !== chaveHistorico,
        filtrarHistorico: () => setConsulta({ filtro: rascunho, pagina: 1 }),
        limparHistorico: () => {
            setRascunho(FILTRO_VAZIO);
            setConsulta({ filtro: FILTRO_VAZIO, pagina: 1 });
        },
        irParaPagina: (pagina: number) => setConsulta((atual) => ({ ...atual, pagina }))
    };
}
