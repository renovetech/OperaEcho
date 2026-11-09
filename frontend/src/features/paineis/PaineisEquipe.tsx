/* Painéis de produtividade individual, métricas e produtividade por unidade. */
import { useEffect, useMemo, useState } from 'react';
import Icon from '@/shared/ui/Icon';
import * as paineisApi from '@/features/paineis/api';
import type { DadosProdutos, DetalheProduto, DetalheProdutividade, LinhaMetrica, LinhaProdutividade, Periodo } from '@/features/paineis/api';
import { erro, mensagemDeErro } from '@/shared/feedback';
import { cn, logErro } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Carregando } from '@/shared/ui/Estados';
import { Card, CardTitulo } from '@/shared/ui/Pagina';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

const dataBR = (valor: string) => new Date(valor).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

/** Primeiro e último nome. */
function nomeCurto(nome: string): string {
    const partes = nome.trim().split(' ');
    return partes.length === 1 ? (partes[0] ?? '') : `${partes[0]} ${partes[partes.length - 1]}`;
}

/** Só quem está ativo aparece nos painéis, como sempre foi. */
function useNomesAtivos() {
    const [nomes, setNomes] = useState<Set<string> | null>(null);
    useEffect(() => {
        paineisApi.listarNomesAtivos().then(setNomes).catch((falha: unknown) => {
            logErro('Erro ao listar implantadores', falha);
            setNomes(new Set());
        });
    }, []);
    return nomes;
}

function useDados<T>(buscar: () => Promise<T>, chave: string, inicial: T) {
    const [resultado, setResultado] = useState<{ chave: string; dados: T }>({ chave: '', dados: inicial });
    useEffect(() => {
        let ativo = true;
        buscar()
            .then((dados) => { if (ativo) setResultado({ chave, dados }); })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setResultado({ chave, dados: inicial });
                erro(mensagemDeErro(falha, 'Não foi possível carregar o painel.'));
            });
        return () => { ativo = false; };
        // "buscar" e "inicial" são refeitos a cada render: quem decide quando recarregar é a chave.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chave]);
    return { dados: resultado.dados, carregando: resultado.chave !== chave };
}

const Avatar = ({ nome }: { nome: string }) => <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-pine text-[15px] font-bold text-white">{nome.charAt(0)}</span>;

const totalAtividades = (linha: LinhaProdutividade) => linha.total_atividades_real ?? (linha.qtd_implantacao + linha.qtd_treinamento + linha.qtd_visita + (linha.qtd_apoio ?? 0));

export function PainelProdutividade({ periodo }: { periodo: Periodo }) {
    const nomes = useNomesAtivos();
    const { dados, carregando } = useDados<LinhaProdutividade[]>(() => paineisApi.buscarProdutividade(periodo), JSON.stringify(periodo), []);
    const [selecionado, setSelecionado] = useState('');
    const [detalhe, setDetalhe] = useState<{ chave: string; lista: DetalheProdutividade[] }>({ chave: '', lista: [] });
    const chaveDetalhe = selecionado ? JSON.stringify({ selecionado, periodo }) : '';

    useEffect(() => {
        if (!selecionado) return undefined;
        let ativo = true;
        paineisApi.buscarDetalheProdutividade(selecionado, periodo)
            .then((lista) => { if (ativo) setDetalhe({ chave: chaveDetalhe, lista }); })
            .catch((falha: unknown) => {
                logErro('Erro ao buscar o histórico', falha);
                if (ativo) setDetalhe({ chave: chaveDetalhe, lista: [] });
            });
        return () => { ativo = false; };
    }, [chaveDetalhe, selecionado, periodo]);

    const ordenados = useMemo(() => dados
        .filter((linha) => nomes?.has(linha.implantador?.toUpperCase()) && totalAtividades(linha) > 0)
        .sort((a, b) => totalAtividades(b) - totalAtividades(a)), [dados, nomes]);

    if (carregando || !nomes) return <Carregando />;

    const estatisticas = (linha: LinhaProdutividade): [string, number, string][] => [
        ['Implantação', linha.qtd_implantacao, 'text-pine'],
        ['Treinamento', linha.qtd_treinamento, 'text-pine-700'],
        ['Visita', linha.qtd_visita, 'text-brass'],
        ['Apoio', linha.qtd_apoio ?? 0, 'text-text-2']
    ];

    return (
        <div className="grid grid-cols-[1fr_360px] items-start gap-3.5">
            <div className="grid grid-cols-2 gap-3.5">
                {!ordenados.length && <p className="col-span-2 m-0 p-8 text-center text-sm text-text-2">Nenhum registro encontrado.</p>}
                {ordenados.map((linha) => (
                    <button key={linha.implantador} type="button" onClick={() => setSelecionado(linha.implantador)} className={cn('cursor-pointer rounded-[10px] border border-solid bg-white p-4 text-left font-sans shadow-card transition-colors hover:border-pine', selecionado === linha.implantador ? 'border-pine ring-1 ring-pine' : 'border-line')}>
                        <span className="mb-3 flex items-center gap-3">
                            <Avatar nome={linha.implantador} />
                            <span className="min-w-0">
                                <b className="block truncate text-sm font-semibold text-ink">{nomeCurto(linha.implantador)}</b>
                                <small className="text-xs text-text-2">{totalAtividades(linha)} atividades</small>
                            </span>
                        </span>
                        <span className="grid grid-cols-4 gap-1 text-center">
                            {estatisticas(linha).map(([rotulo, valor, cor]) => (
                                <span key={rotulo}>
                                    <small className={cn('block text-[10.5px] font-semibold uppercase', cor)}>{rotulo}</small>
                                    <b className="text-[17px] font-bold text-ink tabular-nums">{valor}</b>
                                </span>
                            ))}
                        </span>
                    </button>
                ))}
            </div>
            <Card className="sticky top-3">
                <CardTitulo titulo="Histórico recente" />
                <p className="m-0 border-b border-line-2 px-[18px] py-2 text-[13px] text-text-2">{selecionado ? selecionado : 'Clique em um card para ver detalhes'}</p>
                <div className="max-h-[520px] overflow-y-auto">
                    {selecionado && detalhe.chave !== chaveDetalhe && <p className="m-0 p-5 text-center text-[13px] text-text-2">Carregando...</p>}
                    {selecionado && detalhe.chave === chaveDetalhe && !detalhe.lista.length && <p className="m-0 p-5 text-center text-[13px] text-text-2">Sem atividades no período.</p>}
                    {detalhe.chave === chaveDetalhe && detalhe.lista.map((item, indice) => (
                        <div key={`${item.data}-${indice}`} className="flex gap-3 border-0 border-b border-solid border-line-2 px-[18px] py-2 text-[13px] last:border-b-0">
                            <span className="shrink-0 text-text-2 tabular-nums">{dataBR(item.data)}</span>
                            <span className="min-w-0"><b className="block font-semibold text-ink">{item.unidade}</b><small className="text-xs text-text-2">{item.projeto}</small></span>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}

interface MetricaAgrupada {
    nome: string;
    total: number;
    implantacao: { nome: string; qtd: number }[];
    treinamento: { nome: string; qtd: number }[];
}

function agruparMetricas(linhas: LinhaMetrica[]): MetricaAgrupada[] {
    const grupos = new Map<string, MetricaAgrupada>();
    linhas.forEach((linha) => {
        const atual = grupos.get(linha.implantador) ?? { nome: linha.implantador, total: linha.total_real_implantador ?? 0, implantacao: [], treinamento: [] };
        grupos.set(linha.implantador, {
            ...atual,
            implantacao: linha.qtd_implantacao > 0 ? [...atual.implantacao, { nome: linha.produto, qtd: linha.qtd_implantacao }] : atual.implantacao,
            treinamento: linha.qtd_treinamento > 0 ? [...atual.treinamento, { nome: linha.produto, qtd: linha.qtd_treinamento }] : atual.treinamento
        });
    });
    return [...grupos.values()].sort((a, b) => b.total - a.total);
}

function ColunaMetrica({ titulo, itens, corTitulo, corTag }: { titulo: string; itens: { nome: string; qtd: number }[]; corTitulo: string; corTag: string }) {
    return (
        <div>
            <h3 className={cn('m-0 mb-2 border-0 border-b-2 border-solid pb-1 text-xs font-bold', corTitulo)}>{titulo} <small className="font-medium">({itens.reduce((soma, item) => soma + item.qtd, 0)})</small></h3>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12.5px]">
                {itens.map((item) => <li key={item.nome} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate" title={item.nome}>{item.nome}</span><span className={cn('rounded-full px-2 py-px text-[11.5px] font-bold', corTag)}>{item.qtd}</span></li>)}
                {!itens.length && <li className="text-text-2">Nenhum</li>}
            </ul>
        </div>
    );
}

export function PainelMetricas({ periodo }: { periodo: Periodo }) {
    const nomes = useNomesAtivos();
    const { dados, carregando } = useDados<LinhaMetrica[]>(() => paineisApi.buscarMetricas(periodo), JSON.stringify(periodo), []);
    const grupos = useMemo(() => agruparMetricas(dados).filter((grupo) => nomes?.has(grupo.nome?.toUpperCase())), [dados, nomes]);

    if (carregando || !nomes) return <Carregando />;
    if (!grupos.length) return <p className="m-0 p-8 text-center text-sm text-text-2"><Icon n="folder" /> Nenhum registro encontrado.</p>;

    return (
        <div className="grid grid-cols-3 gap-3.5">
            {grupos.map((grupo) => (
                <Card key={grupo.nome} className="p-4">
                    <div className="mb-3 flex items-center gap-3">
                        <Avatar nome={grupo.nome} />
                        <div className="min-w-0">
                            <h2 className="m-0 truncate text-sm font-semibold text-ink" title={grupo.nome}>{grupo.nome}</h2>
                            <small className="text-xs text-text-2">{grupo.total} atividades</small>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <ColunaMetrica titulo="IMPLANTAÇÃO" itens={grupo.implantacao} corTitulo="border-pine text-pine" corTag="bg-tint text-pine-800" />
                        <ColunaMetrica titulo="TREINAMENTO" itens={grupo.treinamento} corTitulo="border-brass text-brass" corTag="bg-brass-tint text-brass" />
                    </div>
                </Card>
            ))}
        </div>
    );
}

const VAZIO: DadosProdutos = { geral: [], detalheImplantadores: [] };

export function PainelProdutos() {
    const nomes = useNomesAtivos();
    const { dados, carregando } = useDados<DadosProdutos>(paineisApi.buscarProdutos, 'produtos', VAZIO);
    const [produto, setProduto] = useState('');
    const detalhe = useDados<DetalheProduto[]>(() => (produto ? paineisApi.buscarDetalheProduto(produto) : Promise.resolve([])), produto, []);
    const ativos = (nome?: string) => Boolean(nome && nomes?.has(nome.toUpperCase()));

    if (carregando || !nomes) return <Carregando />;

    return (
        <>
            <h2 className="m-0 mb-2.5 text-[14.5px] font-semibold text-ink">Quantitativo geral por produto</h2>
            <div className="mb-5 grid grid-cols-5 gap-3">
                {dados.geral.map((item) => (
                    <button key={item.nome_produto} type="button" aria-pressed={produto === item.nome_produto} onClick={() => setProduto(item.nome_produto)} className={cn('cursor-pointer rounded-[10px] border border-solid bg-white p-3.5 text-left font-sans shadow-card transition-colors hover:border-pine', produto === item.nome_produto ? 'border-pine bg-tint' : 'border-line')}>
                        <span className="block truncate text-[13px] text-text-2" title={item.nome_produto}>{item.nome_produto}</span>
                        <b className="mt-1 block text-[17px] font-bold text-ink tabular-nums">{item.qtd_unidades} <small className="text-xs font-normal text-text-2">unidades</small></b>
                    </button>
                ))}
            </div>
            <div className="mb-2.5 flex items-center justify-between gap-3">
                <h2 className="m-0 text-[14.5px] font-semibold text-ink">{produto ? `Detalhes: ${produto}` : 'Desempenho geral por implantador'}</h2>
                {produto && <Button variant="secondary" size="sm" onClick={() => setProduto('')}><Icon n="x" /> Limpar seleção</Button>}
            </div>
            {produto ? (
                <Tabela cabecalho={<><Th>Data</Th><Th>Unidade</Th><Th>Projeto</Th><Th>Implantador</Th><Th>Motivo</Th></>}>
                    {detalhe.carregando && <LinhaVazia colunas={5}>Carregando...</LinhaVazia>}
                    {!detalhe.carregando && !detalhe.dados.filter((item) => ativos(item.implantador)).length && <LinhaVazia colunas={5}>Nenhum registro encontrado.</LinhaVazia>}
                    {!detalhe.carregando && detalhe.dados.filter((item) => ativos(item.implantador)).map((item, indice) => (
                        <tr key={`${item.data_atividade}-${item.unidade}-${indice}`}>
                            <Td className="whitespace-nowrap tabular-nums">{dataBR(item.data_atividade)}</Td>
                            <Td className="font-semibold">{item.unidade || '-'}</Td>
                            <Td>{item.projeto || '-'}</Td>
                            <Td>{item.implantador || '-'}</Td>
                            <Td>{item.motivos || '-'}</Td>
                        </tr>
                    ))}
                </Tabela>
            ) : (
                <Tabela cabecalho={<><Th>Implantador</Th><Th>Produto</Th><Th centro>Total de atividades</Th></>}>
                    {!dados.detalheImplantadores.length && <LinhaVazia colunas={3}>Nenhum registro encontrado.</LinhaVazia>}
                    {dados.detalheImplantadores.filter((item) => ativos(item.implantador)).map((item) => (
                        <tr key={`${item.implantador}-${item.nome_produto}`}>
                            <Td className="font-semibold">{item.implantador}</Td>
                            <Td>{item.nome_produto}</Td>
                            <Td centro className="tabular-nums">{item.qtd_atividades}</Td>
                        </tr>
                    ))}
                </Tabela>
            )}
        </>
    );
}
