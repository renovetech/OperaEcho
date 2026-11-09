/* Evolução mês a mês da produção lançada (BPA, APAC e AIH valorizados pela SIGTAP).
   Todo o painel alterna entre valor e quantidade: a Atenção Primária não tem valor na SIGTAP
   (é financiada por PAB/Previne), então nela o painel abre em quantidade. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/shared/ui/Icon';
import * as faturamentoApi from '@/features/faturamento/api';
import type { DadosPainel, OpcoesFaturamento } from '@/features/faturamento/api';
import { AnaliseProcedimento, CategoriasProfissionais, OndeTrabalhar, RankingProcedimentos, UnidadesPorCompetencia } from '@/features/faturamento/ConsolidadoAnalises';
import { GraficosEvolucao, GraficosGrupos, Indicadores, type FormatosMetrica } from '@/features/faturamento/ConsolidadoGraficos';
import { consolidar, metricaSugerida, moedaCurta, numCurto, rotComp, type Metrica } from '@/features/faturamento/consolidacao';
import { exportarExcel, exportarPdf } from '@/features/faturamento/exportacaoConsolidado';
import { regrasCalculo } from '@/features/faturamento/regrasCalculo';
import { fmtMoeda, fmtNum } from '@/features/sigtap/formatos';
import { useAuth } from '@/shared/auth/AuthContext';
import { erro, fecharMensagem, mensagemDeErro, mostrarCarregando } from '@/shared/feedback';
import { useParametrosUrl, useVoltar } from '@/shared/hooks';
import { cn, logErro } from '@/shared/lib';
import { Abas } from '@/shared/ui/Abas';
import { Button } from '@/shared/ui/Button';
import { Field, Select } from '@/shared/ui/Campos';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { Card, PageHeader } from '@/shared/ui/Pagina';

const METRICAS = [{ id: 'vl', rotulo: 'Valor SIGTAP (R$)', icone: 'trend' }, { id: 'qt', rotulo: 'Quantidade produzida', icone: 'bar-chart' }] as const;
const ESTRUTURAS = [
    { valor: 'aps', rotulo: 'Atenção Primária' },
    { valor: 'esp', rotulo: 'Atenção Especializada' },
    { valor: 'hosp', rotulo: 'Hospitalar e Urgência' }
];
const TIPOS = ['BPA', 'APAC', 'AIH'];
const CAMPOS = ['projeto', 'unidade', 'estrutura', 'produto', 'tipo', 'de', 'ate'] as const;
type CampoFiltro = (typeof CAMPOS)[number];

function useConsolidado() {
    const [parametros, alterarUrl] = useParametrosUrl();
    const [opcoes, setOpcoes] = useState<OpcoesFaturamento | null>(null);
    const [resultado, setResultado] = useState<{ chave: string; dados: DadosPainel | null }>({ chave: '', dados: null });
    const [metrica, setMetrica] = useState<Metrica>('vl');
    const filtro = useMemo(() => Object.fromEntries(CAMPOS.map((campo) => [campo, parametros.get(campo) ?? ''])) as Record<CampoFiltro, string>, [parametros]);
    const chave = JSON.stringify(filtro);
    // A estrutura vira lista de produtos, então depende das opções já carregadas.
    const aguardaOpcoes = Boolean(filtro.estrutura) && !opcoes;

    useEffect(() => {
        faturamentoApi.buscarOpcoes().then(setOpcoes).catch((falha: unknown) => logErro('Erro ao carregar os cadastros', falha));
    }, []);

    useEffect(() => {
        if (aguardaOpcoes) return undefined;
        let ativo = true;
        const { estrutura, ...params } = filtro;
        const produtos = estrutura && !filtro.produto ? (opcoes?.produtos.filter((item) => item.estrutura === estrutura).map((item) => item.id_produto).join(',') || '0') : '';
        faturamentoApi.buscarPainel({ ...params, produtos })
            .then((dados) => {
                if (!ativo) return;
                setResultado({ chave, dados });
                setMetrica(metricaSugerida(dados));
            })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setResultado({ chave, dados: null });
                erro(mensagemDeErro(falha, 'Não foi possível carregar o painel.'));
            });
        return () => { ativo = false; };
        // "filtro" muda junto com a chave.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chave, aguardaOpcoes, opcoes]);

    return {
        opcoes, filtro, metrica, setMetrica,
        dados: resultado.dados,
        carregando: resultado.chave !== chave,
        aplicar: (campo: CampoFiltro, valor: string) => alterarUrl({
            [campo]: valor,
            ...(campo === 'projeto' && { unidade: null }),
            ...(campo === 'estrutura' && { produto: null }),
            ...((campo === 'projeto' || campo === 'unidade') && { de: null, ate: null })
        })
    };
}

function Filtros({ c, competencias }: { c: ReturnType<typeof useConsolidado>; competencias: string[] }) {
    const { filtro, opcoes, aplicar } = c;
    const unidades = (opcoes?.unidades ?? []).filter((item) => !filtro.projeto || String(item.id_projeto) === filtro.projeto);
    const produtos = (opcoes?.produtos ?? []).filter((item) => !filtro.estrutura || item.estrutura === filtro.estrutura);

    return (
        <Card className="mb-3.5 grid grid-cols-[1.5fr_1.5fr_1fr_1fr_90px_100px_100px] gap-3 px-4 py-3.5">
            <Field rotulo="Projeto" htmlFor="fc-projeto">
                <Select id="fc-projeto" value={filtro.projeto} onChange={(e) => aplicar('projeto', e.target.value)}>
                    <option value="">Todos os projetos</option>
                    {(opcoes?.projetos ?? []).map((item) => <option key={item.id_projeto} value={item.id_projeto}>{item.nome_projeto}</option>)}
                </Select>
            </Field>
            <Field rotulo="Unidade" htmlFor="fc-unidade">
                <Select id="fc-unidade" value={filtro.unidade} onChange={(e) => aplicar('unidade', e.target.value)}>
                    <option value="">Todas as unidades</option>
                    {unidades.map((item) => <option key={item.id_unidade} value={item.id_unidade}>{item.nome_unidade}</option>)}
                </Select>
            </Field>
            <Field rotulo="Estrutura" htmlFor="fc-estrutura">
                <Select id="fc-estrutura" value={filtro.estrutura} onChange={(e) => aplicar('estrutura', e.target.value)}>
                    <option value="">Todas</option>
                    {ESTRUTURAS.map((item) => <option key={item.valor} value={item.valor}>{item.rotulo}</option>)}
                </Select>
            </Field>
            <Field rotulo="Produto" htmlFor="fc-produto">
                <Select id="fc-produto" value={filtro.produto} onChange={(e) => aplicar('produto', e.target.value)}>
                    <option value="">Todos</option>
                    {produtos.map((item) => <option key={item.id_produto} value={item.id_produto}>{item.nome_produto}</option>)}
                </Select>
            </Field>
            <Field rotulo="Tipo" htmlFor="fc-tipo">
                <Select id="fc-tipo" value={filtro.tipo} onChange={(e) => aplicar('tipo', e.target.value)}>
                    <option value="">Todos</option>
                    {TIPOS.map((tipo) => <option key={tipo}>{tipo}</option>)}
                </Select>
            </Field>
            <Field rotulo="Competência de" htmlFor="fc-de">
                <Select id="fc-de" value={filtro.de} onChange={(e) => aplicar('de', e.target.value)}>
                    <option value="">Início</option>
                    {competencias.map((item) => <option key={item} value={item}>{rotComp(item)}</option>)}
                </Select>
            </Field>
            <Field rotulo="até" htmlFor="fc-ate">
                <Select id="fc-ate" value={filtro.ate} onChange={(e) => aplicar('ate', e.target.value)}>
                    <option value="">Última</option>
                    {competencias.filter((item) => !filtro.de || item >= filtro.de).map((item) => <option key={item} value={item}>{rotComp(item)}</option>)}
                </Select>
            </Field>
        </Card>
    );
}

export function ConsolidadoPage() {
    const voltar = useVoltar();
    const navigate = useNavigate();
    const { usuario, nomeExibicao, podeAcessar } = useAuth();
    const c = useConsolidado();
    const { dados, metrica, filtro, opcoes } = c;
    const [selecionado, setSelecionado] = useState('');
    const analise = useRef<HTMLDivElement>(null);
    const m = useMemo(() => (dados ? consolidar(dados, metrica) : null), [dados, metrica]);
    const ehValor = metrica === 'vl';

    const formatos = useMemo<FormatosMetrica>(() => ({
        ehValor,
        // Quantidade sempre inteira: a média mensal pode vir fracionada.
        fmtM: ehValor ? fmtMoeda : (valor) => fmtNum(Math.round(valor)),
        fmtEixo: ehValor ? moedaCurta : numCurto,
        regras: regrasCalculo(ehValor ? 'vl' : 'qt')
    }), [ehValor]);

    const procedimento = useMemo(() => {
        if (!m) return undefined;
        return m.listaProcs.find((item) => item.cod === selecionado) ?? [...m.listaProcs].sort((a, b) => b.total - a.total)[0];
    }, [m, selecionado]);

    const selecionar = (cod: string) => {
        setSelecionado(cod);
        requestAnimationFrame(() => analise.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    const irParaLancamento = () => navigate('/system/faturamento/lancamento');
    const podeLancar = podeAcessar('faturamento_lancar');

    const gerarPdf = async () => {
        if (!m) return;
        const nomeDe = (lista: Record<string, unknown>[] | undefined, campo: string, id: string, rotulo: string) => lista?.find((item) => String(item[campo]) === id)?.[rotulo] as string | undefined;
        const filtros = [
            nomeDe(opcoes?.projetos as unknown as Record<string, unknown>[], 'id_projeto', filtro.projeto, 'nome_projeto'),
            nomeDe(opcoes?.unidades as unknown as Record<string, unknown>[], 'id_unidade', filtro.unidade, 'nome_unidade'),
            ESTRUTURAS.find((item) => item.valor === filtro.estrutura)?.rotulo,
            nomeDe(opcoes?.produtos as unknown as Record<string, unknown>[], 'id_produto', filtro.produto, 'nome_produto'),
            filtro.tipo
        ].filter(Boolean).join(' · ') || 'Todos os projetos e unidades';
        mostrarCarregando('Gerando PDF...');
        try {
            await exportarPdf(m, { ehValor, filtros, usuario: usuario.nome_completo || nomeExibicao, fmtM: formatos.fmtM, fmtEixo: formatos.fmtEixo });
            fecharMensagem();
        } catch (falha) {
            logErro('Erro ao gerar o PDF do faturamento', falha);
            erro('Falha ao gerar o PDF.');
        }
    };

    const gerarExcel = async () => {
        if (!m || !dados) return;
        try {
            await exportarExcel(m, dados);
        } catch (falha) {
            logErro('Erro ao gerar o Excel do faturamento', falha);
            erro('Falha ao gerar o Excel.');
        }
    };

    return (
        <>
            <PageHeader
                titulo="Faturamento Consolidado"
                acoes={(
                    <>
                        {m && <Button variant="secondary" onClick={gerarPdf}><Icon n="printer" /> Exportar PDF</Button>}
                        {m && <Button variant="secondary" onClick={gerarExcel}><Icon n="download" /> Exportar Excel</Button>}
                        {podeLancar && <Button variant="secondary" onClick={irParaLancamento}><Icon n="upload" /> Lançar Faturamento</Button>}
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                    </>
                )}
            />
            <Filtros c={c} competencias={dados?.competencias_disponiveis ?? []} />
            {c.carregando && !m && <Carregando />}
            {!c.carregando && !m && (
                <Aviso titulo="Nenhum faturamento lançado para este filtro" acao={podeLancar ? <Button onClick={irParaLancamento}><Icon n="upload" /> Lançar Faturamento</Button> : undefined}>
                    Envie os arquivos de BPA, APAC ou AIH em Operações &gt; Lançar Faturamento.
                </Aviso>
            )}
            {m && dados && (
                <div className={cn('transition-opacity', c.carregando && 'opacity-50')}>
                    <div className="mb-3.5 flex items-center gap-3">
                        <Abas rotulo="Métrica do painel" className="shrink-0" itens={METRICAS} ativa={ehValor ? 'vl' : 'qt'} aoMudar={c.setMetrica} />
                    </div>
                    <Indicadores m={m} f={formatos} />
                    <GraficosEvolucao m={m} f={formatos} />
                    <OndeTrabalhar m={m} f={formatos} aoSelecionar={selecionar} />
                    <GraficosGrupos m={m} f={formatos} />
                    {procedimento && <AnaliseProcedimento m={m} f={formatos} procedimento={procedimento} nomeGrupo={dados.subgrupos[procedimento.grupo]} aoSelecionar={setSelecionado} referencia={analise} />}
                    <RankingProcedimentos m={m} f={formatos} selecionado={procedimento?.cod} aoSelecionar={selecionar} />
                    <UnidadesPorCompetencia m={m} f={formatos} />
                    <CategoriasProfissionais m={m} f={formatos} />
                </div>
            )}
        </>
    );
}
