import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import * as feriasApi from '@/features/ferias/api';
import type { ColaboradorFerias, ConflitoFerias, SolicitacaoFerias } from '@/features/ferias/api';
import type { DocumentoFerias } from '@/features/ferias/documentos';
import { salvarRelatorioPdf, salvarReciboJpg } from '@/features/ferias/exportacao';
import {
    alertaDoPrazo, alternarOpcao, calcularFim, diasConsumidos, feriasConcluidas, formatarData, opcaoDoTipo, OPCOES_FERIAS,
    podeAprovarFuncao, saldoDoPeriodo, soData, type IdOpcaoFerias, type SelecaoFerias
} from '@/features/ferias/regras';
import { useAuth } from '@/shared/auth/AuthContext';
import { listarMinhasLotacoes, type LotacaoResumo } from '@/shared/catalogos';
import { aviso, confirmar, erro, fecharMensagem, mensagemDeErro, mostrarCarregando, sucesso } from '@/shared/feedback';
import { useParametrosUrl } from '@/shared/hooks';
import { hojeLocal, logErro } from '@/shared/lib';

const anoLimitePeriodo = () => new Date().getFullYear() - 1;
const MENSAGEM_PERIODO = (limite: number) => `O período aquisitivo só pode ser solicitado após sua conclusão. Ano máximo permitido atualmente: ${limite}.`;

export function useSolicitacaoFerias(modulo: string, lotacao?: string) {
    const { podeAcao, podeAcessar } = useAuth();
    // Implantação libera também para quem só tem acesso à tela; Projetos exige a ação "novo".
    const podeNovo = podeAcao(modulo, 'pode_novo') || (!lotacao && podeAcessar(modulo));
    const limite = anoLimitePeriodo();
    const [colaboradores, setColaboradores] = useState<ColaboradorFerias[]>([]);
    const [idColaborador, setIdColaborador] = useState('');
    const [periodo, setPeriodo] = useState(String(limite));
    const [selecao, setSelecao] = useState<SelecaoFerias>({});
    const [historico, setHistorico] = useState<{ chave: string; lista: SolicitacaoFerias[] }>({ chave: '', lista: [] });
    const [versao, setVersao] = useState(0);
    const [enviando, setEnviando] = useState(false);
    const chave = idColaborador ? `${idColaborador}-${versao}` : '';

    useEffect(() => {
        let ativo = true;
        feriasApi.listarColaboradores(lotacao ? 'projetos' : 'implantacao', lotacao)
            .then((lista) => {
                if (!ativo) return;
                setColaboradores(lista);
                // Quem só enxerga a si mesmo já entra selecionado.
                setIdColaborador(lista.length === 1 ? String(lista[0]?.id_usuario) : '');
            })
            .catch((falha: unknown) => {
                if (ativo) erro(mensagemDeErro(falha, 'Não foi possível carregar os colaboradores.'));
            });
        return () => { ativo = false; };
    }, [lotacao]);

    useEffect(() => {
        if (!chave) return undefined;
        let ativo = true;
        feriasApi.listarHistorico(idColaborador)
            .then((lista) => { if (ativo) setHistorico({ chave, lista }); })
            .catch((falha: unknown) => {
                logErro('Erro ao carregar o histórico de férias', falha);
                if (ativo) setHistorico({ chave, lista: [] });
            });
        return () => { ativo = false; };
    }, [chave, idColaborador]);

    const carregandoHistorico = Boolean(chave) && historico.chave !== chave;
    const lista = useMemo(() => (idColaborador && !carregandoHistorico ? historico.lista : []), [idColaborador, carregandoHistorico, historico.lista]);
    const saldo = saldoDoPeriodo(lista, periodo);
    const colaborador = colaboradores.find((item) => String(item.id_usuario) === idColaborador);
    const selecionadas = OPCOES_FERIAS.filter((opcao) => opcao.id in selecao);
    const excessoDaOpcao = (opcao: (typeof OPCOES_FERIAS)[number]) => {
        const inicio = selecao[opcao.id];
        return inicio ? alertaDoPrazo(colaborador?.data_admissao, periodo, calcularFim(inicio, opcao.dias)) : null;
    };
    const alertaClt = selecionadas.map(excessoDaOpcao).find(Boolean) ?? null;

    const problema = (): string | null => {
        if (!idColaborador) return 'Selecione o colaborador.';
        if (!podeNovo) return 'Você não tem permissão para criar solicitações.';
        if (!selecionadas.length) return 'Selecione um tipo.';
        if (selecionadas.some((opcao) => !selecao[opcao.id])) return 'Preencha as datas.';
        if (!periodo) return 'Informe o período aquisitivo.';
        if (Number(periodo) > limite) return MENSAGEM_PERIODO(limite);
        const custo = selecionadas.reduce((soma, opcao) => {
            const inicio = selecao[opcao.id] ?? '';
            return soma + diasConsumidos(opcao.rotulo, inicio, calcularFim(inicio, opcao.dias));
        }, 0);
        if (custo > saldo) return `Esta opção consome ${custo} dias do saldo. O colaborador possui apenas ${saldo} dias restantes para o período de ${periodo}.`;
        const excedida = selecionadas.find(excessoDaOpcao);
        if (excedida) return `A solicitação ${excedida.rotulo} ultrapassa o prazo de 1 ano e 11 meses do período aquisitivo de ${periodo} (CLT Art. 134). Data limite legal: ${formatarData(alertaClt?.limite)}.`;
        return null;
    };

    return {
        colaboradores, idColaborador, periodo, selecao, saldo, alertaClt, limite, podeNovo, enviando, carregandoHistorico,
        historico: lista,
        selecionarColaborador: setIdColaborador,
        alternar: (id: IdOpcaoFerias) => setSelecao((atual) => alternarOpcao(atual, id)),
        alterarData: (id: IdOpcaoFerias, data: string) => setSelecao((atual) => ({ ...atual, [id]: data })),
        alterarPeriodo: (valor: string) => {
            if (valor && Number(valor) > limite) {
                aviso(MENSAGEM_PERIODO(limite), 'Período aquisitivo inválido');
                return;
            }
            setPeriodo(valor);
        },
        enviar: async () => {
            const encontrado = problema();
            if (encontrado) {
                aviso(encontrado);
                return;
            }
            setEnviando(true);
            try {
                for (const opcao of selecionadas) {
                    const inicio = selecao[opcao.id] ?? '';
                    await feriasApi.solicitarFerias({
                        id_usuario: Number(idColaborador),
                        periodo_aquisitivo: periodo,
                        tipo_solicitacao: opcao.rotulo,
                        data_inicio: inicio,
                        data_fim: calcularFim(inicio, opcao.dias),
                        dias_restantes: saldo
                    });
                }
                sucesso('Solicitação enviada');
                setSelecao({});
            } catch (falha) {
                erro(mensagemDeErro(falha, 'Falha ao salvar.'));
            } finally {
                setEnviando(false);
                setVersao((atual) => atual + 1);
            }
        }
    };
}

type EmitirDocumento = (documento: DocumentoFerias, salvar: (elemento: HTMLElement) => Promise<void>, titulo: string) => Promise<void>;

/** O documento só existe na tela durante a exportação: traz dados pessoais e não precisa ficar na página. */
export function useDocumentoFerias() {
    const [documento, setDocumento] = useState<DocumentoFerias | null>(null);
    const referencia = useRef<HTMLDivElement>(null);

    const emitir = useCallback<EmitirDocumento>(async (novo, salvar, titulo) => {
        mostrarCarregando(titulo);
        flushSync(() => setDocumento(novo));
        try {
            if (!referencia.current) throw new Error('Documento não montado.');
            await salvar(referencia.current);
            fecharMensagem();
        } catch (falha) {
            logErro('Erro ao gerar documento de férias', falha);
            erro('Não foi possível gerar o documento.');
        } finally {
            setDocumento(null);
        }
    }, []);

    return { documento, referencia, emitir };
}

/** Separa as solicitações do relatório e calcula o saldo acumulado de cada colaborador no período. */
function classificarParaRelatorio(solicitacoes: SolicitacaoFerias[]) {
    const saldos = new Map<string, number>();
    const hoje = hojeLocal();
    const categorias = { concluidas: [] as LinhaRelatorio[], aprovadas: [] as LinhaRelatorio[], pendentes: [] as LinhaRelatorio[] };
    solicitacoes.forEach((item) => {
        const chave = `${item.id_usuario}_${item.periodo_aquisitivo}`;
        const saldo = (saldos.get(chave) ?? 30) - diasConsumidos(item.tipo_solicitacao, item.data_inicio, item.data_fim);
        saldos.set(chave, saldo);
        const linha = { ...item, saldo: Math.max(0, saldo) };
        if (item.status === 'PENDENTE') categorias.pendentes.push(linha);
        else if (feriasConcluidas(item.data_fim, hoje)) categorias.concluidas.push(linha);
        else categorias.aprovadas.push(linha);
    });
    return categorias;
}

export type LinhaRelatorio = SolicitacaoFerias & { saldo: number };

export function useAprovacaoFerias() {
    const { usuario, nomeExibicao, podeAcao } = useAuth();
    const [parametros, alterarUrl] = useParametrosUrl();
    const lotacao = parametros.get('lotacao') ?? '';
    const mostrarConcluidas = parametros.has('concluidas');
    const [lotacoes, setLotacoes] = useState<LotacaoResumo[]>([]);
    const [global, setGlobal] = useState(false);
    const [resultado, setResultado] = useState<{ chave: string; lista: SolicitacaoFerias[] }>({ chave: '', lista: [] });
    const [versao, setVersao] = useState(0);
    const [emGestao, setEmGestao] = useState<SolicitacaoFerias | null>(null);
    const docs = useDocumentoFerias();
    const chave = `${lotacao}-${versao}`;
    const geradoPor = usuario.nome_completo || nomeExibicao;

    useEffect(() => {
        listarMinhasLotacoes()
            .then((resposta) => {
                setLotacoes(resposta.lotacoes);
                setGlobal(resposta.global);
            })
            .catch((falha: unknown) => logErro('Erro ao listar lotações', falha));
    }, []);

    useEffect(() => {
        let ativo = true;
        feriasApi.listarSolicitacoes(lotacao)
            .then((lista) => { if (ativo) setResultado({ chave, lista }); })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setResultado({ chave, lista: [] });
                erro(mensagemDeErro(falha, 'Não foi possível carregar as solicitações.'));
            });
        return () => { ativo = false; };
    }, [chave, lotacao]);

    const hoje = hojeLocal();
    const visiveis = resultado.lista.filter((item) => {
        if (mostrarConcluidas) return true;
        if (item.status === 'RECUSADO') return false;
        return item.status !== 'APROVADO' || !feriasConcluidas(item.data_fim, hoje);
    });

    return {
        lotacoes, global, lotacao, mostrarConcluidas, visiveis, emGestao, geradoPor,
        documento: docs.documento,
        referenciaDocumento: docs.referencia,
        carregando: resultado.chave !== chave,
        podeEditar: podeAcao('ferias_gestao', 'pode_editar'),
        podeAprovar: (funcao?: string | null) => podeAprovarFuncao(usuario, funcao),
        emitirDocumento: docs.emitir,
        filtrarLotacao: (valor: string) => alterarUrl({ lotacao: valor }),
        alternarConcluidas: () => alterarUrl({ concluidas: mostrarConcluidas ? null : '1' }),
        recarregar: () => setVersao((atual) => atual + 1),
        gerenciar: setEmGestao,
        relatorioGeral: async () => {
            const anoAtual = new Date().getFullYear();
            const periodos = [anoAtual - 1, anoAtual];
            try {
                const todas = await feriasApi.listarSolicitacoes(lotacao);
                const doPeriodo = todas.filter((item) => ['APROVADO', 'PENDENTE'].includes(item.status) && periodos.includes(Number(item.periodo_aquisitivo)));
                if (!doPeriodo.length) {
                    aviso(`Não há solicitações para os períodos aquisitivos de ${periodos.join(' e ')}.`, 'Aviso');
                    return;
                }
                await docs.emitir(
                    { tipo: 'geral', categorias: classificarParaRelatorio(doPeriodo), periodos, geradoPor, geradoEm: new Date().toLocaleString('pt-BR') },
                    (elemento) => salvarRelatorioPdf(elemento, 'p', `Relatorio_Ferias_${periodos.join('-')}`),
                    'Gerando relatório...'
                );
            } catch (falha) {
                erro(mensagemDeErro(falha, 'Erro ao gerar o relatório.'));
            }
        },
        relatorioPrazos: async () => {
            try {
                const prazos = await feriasApi.listarPrazos();
                if (!prazos.length) {
                    aviso('Nenhum implantador ativo com período aquisitivo em aberto.', 'Aviso');
                    return;
                }
                await docs.emitir(
                    { tipo: 'prazos', prazos, geradoPor, geradoEm: new Date().toLocaleString('pt-BR') },
                    (elemento) => salvarRelatorioPdf(elemento, 'l', `Relatorio_Prazos_Ferias_${hojeLocal()}`),
                    'Gerando relatório...'
                );
            } catch (falha) {
                erro(mensagemDeErro(falha, 'Erro ao gerar o relatório de prazos.'));
            }
        }
    };
}

interface GestaoProps {
    solicitacao: SolicitacaoFerias;
    podeAprovar: boolean;
    geradoPor: string;
    emitirDocumento: EmitirDocumento;
    aoAtualizar: () => void;
}

export function useGestaoFerias({ solicitacao, podeAprovar, geradoPor, emitirDocumento, aoAtualizar }: GestaoProps) {
    const [periodo, setPeriodo] = useState(String(solicitacao.periodo_aquisitivo));
    const [idOpcao, setIdOpcao] = useState<IdOpcaoFerias>(() => opcaoDoTipo(solicitacao.tipo_solicitacao));
    const [inicio, setInicio] = useState(soData(solicitacao.data_inicio));
    const [status, setStatus] = useState(solicitacao.status);
    const [conflitos, setConflitos] = useState<ConflitoFerias[]>([]);
    const [salvando, setSalvando] = useState(false);
    const opcao = OPCOES_FERIAS.find((item) => item.id === idOpcao) ?? OPCOES_FERIAS[0];
    const dias = opcao?.dias ?? 30;
    const rotulo = opcao?.rotulo ?? solicitacao.tipo_solicitacao;
    const fim = inicio ? calcularFim(inicio, dias) : '';
    const alertaClt = alertaDoPrazo(solicitacao.data_admissao, periodo, fim);

    useEffect(() => {
        if (!inicio || !fim) return undefined;
        let ativo = true;
        feriasApi.verificarConflitos(solicitacao.id_ferias, inicio, fim)
            .then((lista) => { if (ativo) setConflitos(lista); })
            .catch((falha: unknown) => logErro('Erro ao verificar conflitos', falha));
        return () => { ativo = false; };
    }, [solicitacao.id_ferias, inicio, fim]);

    const executar = async (acao: () => Promise<void>, mensagemFalha: string) => {
        setSalvando(true);
        try {
            await acao();
            aoAtualizar();
        } catch (falha) {
            erro(mensagemDeErro(falha, mensagemFalha));
        } finally {
            setSalvando(false);
        }
    };

    return {
        periodo, idOpcao, inicio, fim, status, conflitos, alertaClt, salvando,
        setPeriodo, setIdOpcao, setInicio,
        salvar: () => {
            if (!inicio || !periodo) return aviso('Informe o período aquisitivo e o início do gozo.');
            return executar(async () => {
                await feriasApi.editarFerias(solicitacao.id_ferias, { periodo_aquisitivo: periodo, tipo_solicitacao: rotulo, data_inicio: inicio, data_fim: fim });
                if (status === 'APROVADO') await feriasApi.alterarStatus(solicitacao.id_ferias, 'APROVADO');
                sucesso('Dados alterados');
            }, 'Erro ao atualizar.');
        },
        decidir: async (novo: 'APROVADO' | 'RECUSADO') => {
            const aprovar = novo === 'APROVADO';
            if (!podeAprovar) {
                aviso(`Sua função não pode ${aprovar ? 'aprovar' : 'recusar'} férias de ${solicitacao.funcao ?? 'colaborador'}.`, 'Ação não permitida');
                return;
            }
            if (!await confirmar(aprovar ? 'Aprovar férias?' : 'Rejeitar férias?', { texto: 'Essa ação atualizará o status da solicitação e avisará o colaborador.', rotulo: 'Sim, confirmar' })) return;
            await executar(async () => {
                await feriasApi.alterarStatus(solicitacao.id_ferias, novo);
                setStatus(novo);
                sucesso('Status alterado');
            }, 'Erro ao alterar o status.');
        },
        gerarRecibo: () => emitirDocumento(
            { tipo: 'recibo', solicitacao: { ...solicitacao, periodo_aquisitivo: Number(periodo), tipo_solicitacao: rotulo, data_inicio: inicio, data_fim: fim, status }, geradoPor, geradoEm: new Date().toLocaleString('pt-BR') },
            (elemento) => salvarReciboJpg(elemento, `Recibo_Ferias_${solicitacao.nome_completo}`),
            'Gerando imagem...'
        )
    };
}
