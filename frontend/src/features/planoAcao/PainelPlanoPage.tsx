/* Painel do Plano de Ação: interno (com filtros e horas) ou público (somente leitura). */
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon from '@/shared/ui/Icon';
import * as planoApi from '@/features/planoAcao/api';
import type { DadosPainel } from '@/features/planoAcao/api';
import { BarraProgresso, SeloSaude } from '@/features/planoAcao/componentes';
import { COR_STATUS_ITEM, copiarTexto, dataBR, fmtMin, linkPublicoCarteira, linkPublicoPlano, STATUS_PLANO } from '@/features/planoAcao/formatos';
import { Barras, CurvaS, ListaPrazos, Rosca } from '@/features/planoAcao/graficos';
import { listarProjetosAtivos, type ProjetoResumo } from '@/shared/catalogos';
import { avisoRapido, mensagemDeErro, sucesso } from '@/shared/feedback';
import { useParametrosUrl, useVoltar } from '@/shared/hooks';
import { cn, logErro } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { Card, CardTitulo, PageHeader } from '@/shared/ui/Pagina';

const REGRA_INDICADORES_PLANO = 'Execução: média do % de execução das ações (ação fechada = 100%).\nEsperado: % de ações cujo prazo previsto já venceu.\nDesvio: realizado − esperado, em pontos percentuais.\nAderência: ações fechadas dentro do prazo ÷ ações fechadas que tinham prazo.\nSaúde: CRÍTICO com mais de 20% atrasado, término do plano vencido ou desvio até −25 p.p. ATENÇÃO com atraso, desvio até −10 p.p. ou entregas vencendo em 7 dias. NO PRAZO nos demais casos.';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

const INTERVALO_ATUALIZACAO_MS = 3 * 60 * 1000;
const ESPERA_DIGITACAO_MS = 250;
const STATUS_PADRAO = 'EM ANDAMENTO';
const TODAS = 'todas';

function usePainel(publico: boolean, token?: string) {
    const [parametros, alterarUrl] = useParametrosUrl();
    const statusUrl = parametros.get('status') ?? STATUS_PADRAO;
    const filtros = useMemo(() => {
        const valores: Record<string, string> = {
            projeto: parametros.get('projeto') ?? '',
            status: statusUrl === TODAS ? '' : statusUrl,
            cliente: parametros.get('cliente') ?? '',
            id_plano: parametros.get('id_plano') ?? ''
        };
        return Object.fromEntries(Object.entries(valores).filter(([, valor]) => valor));
    }, [parametros, statusUrl]);
    const [dados, setDados] = useState<DadosPainel | null>(null);
    const [falha, setFalha] = useState('');
    const [planosOpcao, setPlanosOpcao] = useState<{ id_plano: number; titulo: string }[]>([]);
    const [projetos, setProjetos] = useState<ProjetoResumo[]>([]);
    const [versao, setVersao] = useState(0);
    const [concluida, setConcluida] = useState('');
    const chave = JSON.stringify({ filtros, versao, publico, token });

    useEffect(() => {
        if (publico) return;
        listarProjetosAtivos().then(setProjetos).catch((erro: unknown) => logErro('Erro ao listar projetos', erro));
    }, [publico]);

    useEffect(() => {
        let ativo = true;
        const espera = setTimeout(() => {
            (publico ? planoApi.buscarPainelPublico(token) : planoApi.buscarPainel(filtros))
                .then((resposta) => {
                    if (!ativo) return;
                    setDados(resposta);
                    setFalha('');
                    setConcluida(chave);
                    if (!publico && !filtros.id_plano) {
                        setPlanosOpcao(resposta.planos.flatMap((plano) => (plano.id_plano ? [{ id_plano: plano.id_plano, titulo: plano.titulo }] : [])));
                    }
                })
                .catch((erro: unknown) => {
                    if (!ativo) return;
                    const status = (erro as { response?: { status?: number } }).response?.status;
                    setFalha(status === 404 ? 'Painel não encontrado ou não está mais publicado.' : mensagemDeErro(erro, 'Não foi possível carregar o painel.'));
                    setConcluida(chave);
                });
        }, ESPERA_DIGITACAO_MS);
        return () => {
            ativo = false;
            clearTimeout(espera);
        };
    }, [chave, filtros, publico, token]);

    useEffect(() => {
        const intervalo = setInterval(() => setVersao((atual) => atual + 1), INTERVALO_ATUALIZACAO_MS);
        return () => clearInterval(intervalo);
    }, []);

    return {
        dados, falha, projetos, planosOpcao, statusUrl,
        projeto: parametros.get('projeto') ?? '',
        cliente: parametros.get('cliente') ?? '',
        idPlano: parametros.get('id_plano') ?? '',
        carregando: concluida !== chave,
        atualizar: () => setVersao((atual) => atual + 1),
        filtrar: (mudancas: Record<string, string | null>) => alterarUrl(mudancas)
    };
}

async function copiarLink(link: string) {
    if (await copiarTexto(link)) avisoRapido('Link copiado');
    else sucesso('Copie o link', link);
}

function Kpi({ rotulo, valor, detalhe, destaque, alerta, negativo }: { rotulo: string; valor: ReactNode; detalhe: string; destaque?: boolean; alerta?: boolean; negativo?: boolean }) {
    return (
        <Card className={cn('px-4 py-3.5', destaque && 'bg-pine-800', alerta && 'border-danger bg-danger-tint')}>
            <p className={cn('m-0 mb-1 text-xs', destaque ? 'text-sage-300' : 'text-text-2')}>{rotulo}</p>
            <b className={cn('block text-[22px] leading-tight tabular-nums', destaque ? 'text-white' : 'text-ink', alerta && 'text-danger')}>{valor}</b>
            <small className={cn('text-[11.5px]', destaque ? 'text-sage-300' : 'text-text-2', negativo && !destaque && 'text-danger')}>{detalhe}</small>
        </Card>
    );
}

const Bloco = ({ titulo, extra, className, children }: { titulo: string; extra?: ReactNode; className?: string; children: ReactNode }) => (
    <Card className={className}>
        <CardTitulo titulo={titulo} extra={extra} />
        <div className="p-[18px]">{children}</div>
    </Card>
);

function Conteudo({ dados, publico }: { dados: DadosPainel; publico: boolean }) {
    const { resumo: r, plano } = dados;
    const blocosEtapas = useMemo(() => {
        const mapa = new Map<string, NonNullable<DadosPainel['etapas']>>();
        (dados.etapas ?? []).forEach((etapa) => {
            const chave = [etapa.modulo, etapa.unidade ?? etapa.grupo].filter(Boolean).join(' · ') || 'GERAL';
            mapa.set(chave, [...(mapa.get(chave) ?? []), etapa]);
        });
        return [...mapa.entries()];
    }, [dados.etapas]);
    const saudePlano = dados.planos[0]?.saude;

    return (
        <div className="flex flex-col gap-3.5">
            {plano && (
                <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 px-[18px] py-3.5 text-[13.5px]">
                    <div><small className="block text-xs text-text-2">Situação</small><b>{plano.status}</b></div>
                    <div><small className="block text-xs text-text-2">Início previsto</small><b>{dataBR(plano.data_inicio_prevista)}</b></div>
                    <div><small className="block text-xs text-text-2">Término previsto</small><b>{dataBR(plano.data_fim_prevista)}</b></div>
                    <div><small className="block text-xs text-text-2">Unidades</small><b>{r.unidades}</b></div>
                    {saudePlano && <div><small className="block text-xs text-text-2">Saúde</small><SeloSaude saude={saudePlano} /></div>}
                    {plano.descricao && <p className="m-0 w-full text-[13px] text-text">{plano.descricao}</p>}
                </Card>
            )}
            <section className={cn('grid gap-3.5', publico ? 'grid-cols-6' : 'grid-cols-7', plano && (publico ? 'grid-cols-5' : 'grid-cols-6'))}>
                {!plano && <Kpi rotulo="Planos ativos" valor={r.planos_ativos} detalhe={`${r.planos} no total · ${r.planos_concluidos} concluídos`} />}
                <Kpi destaque rotulo="Execução geral" valor={`${r.progresso}%`} negativo={r.desvio < 0} detalhe={`esperado ${r.esperado}% · ${r.desvio > 0 ? '+' : ''}${r.desvio} p.p.`} />
                <Kpi rotulo="Ações" valor={r.total} detalhe={`${r.fechados} fechadas · ${r.andamento} em andamento`} />
                <Kpi alerta={r.atrasados > 0} rotulo="Atrasadas" valor={r.atrasados} detalhe={`${r.total ? Math.round((r.atrasados / r.total) * 100) : 0}% das ações`} />
                <Kpi rotulo="Vencem em 7 dias" valor={r.vencendo_7d} detalhe="ações abertas" />
                <Kpi rotulo="Aderência ao prazo" valor={r.aderencia == null ? '-' : `${r.aderencia}%`} detalhe="fechadas dentro do prazo" />
                {!publico && <Kpi rotulo="Horas trabalhadas" valor={fmtMin(r.trabalhado_min)} detalhe={`previsto ${fmtMin(r.previsto_min)}`} />}
            </section>
            <section className="grid grid-cols-3 gap-3.5">
                <Bloco titulo="Situação das ações"><Rosca dados={dados.por_status} total={r.total} /></Bloco>
                <Bloco titulo="Curva S - previsto x realizado" className="col-span-2"><CurvaS pontos={dados.evolucao} /></Bloco>
            </section>
            {!plano && (
                <div>
                    <div className="mb-2 flex items-center gap-3">
                        <h2 className="m-0 text-[14.5px] font-semibold text-ink">Planos ({dados.planos.length})</h2>
                        {Object.entries(r.saude ?? {}).map(([saude, qtd]) => <span key={saude} className="inline-flex items-center gap-1 text-[13px]"><SeloSaude saude={saude} /> {qtd}</span>)}
                    </div>
                    <Tabela cabecalho={<><Th>Plano</Th><Th>Cliente</Th>{!publico && <Th>Projeto</Th>}<Th centro>Saúde</Th><Th className="min-w-44">Execução</Th><Th centro>Ações</Th><Th centro>Atrasadas</Th><Th centro>Próx. prazo</Th><Th centro>Término</Th><Th centro>{publico ? 'Painel' : 'Público'}</Th></>}>
                        {!dados.planos.length && <LinhaVazia colunas={publico ? 9 : 10}>Nenhum plano encontrado.</LinhaVazia>}
                        {dados.planos.map((item) => (
                            <tr key={item.id_plano ?? item.token_publico ?? item.titulo}>
                                <Td><b className="font-semibold">{item.titulo}</b><small className="block text-xs text-text-2">{item.produto}</small></Td>
                                <Td>{item.cliente || '-'}</Td>
                                {!publico && <Td>{item.nome_projeto || '-'}</Td>}
                                <Td centro><SeloSaude saude={item.saude} /></Td>
                                <Td><div className="flex items-center gap-2" title={`Realizado ${item.progresso}% · esperado até hoje ${item.esperado ?? 0}%`}><BarraProgresso valor={item.progresso} esperado={item.esperado} /><b className="text-xs tabular-nums">{item.progresso}%</b></div></Td>
                                <Td centro className="tabular-nums">{item.fechados}/{item.total}</Td>
                                <Td centro className="tabular-nums">{item.atrasados ? <b className="text-danger">{item.atrasados}</b> : 0}</Td>
                                <Td centro className="whitespace-nowrap tabular-nums">{dataBR(item.proximo_prazo)}</Td>
                                <Td centro className="whitespace-nowrap tabular-nums">{dataBR(item.data_fim_prevista)}</Td>
                                <Td centro>
                                    {!item.token_publico && <small className="text-xs text-text-2">privado</small>}
                                    {item.token_publico && publico && <Link to={`/painel-plano-acao/${item.token_publico}`} className="text-[13px] font-medium text-pine">Abrir</Link>}
                                    {item.token_publico && !publico && <Button variant="ghost" size="sm" onClick={() => copiarLink(linkPublicoPlano(item.token_publico as string))}><Icon n="link" /> Copiar</Button>}
                                </Td>
                            </tr>
                        ))}
                    </Tabela>
                </div>
            )}
            <section className="grid grid-cols-3 gap-3.5">
                <Bloco titulo="Por etapa"><Barras dados={dados.por_etapa} maximo={12} /></Bloco>
                <Bloco titulo="Por responsável"><Barras dados={dados.por_responsavel} /></Bloco>
                <Bloco titulo="Por unidade"><Barras dados={dados.por_unidade} maximo={12} vazio="Plano sem unidades." /></Bloco>
            </section>
            {(dados.por_cliente?.length ?? 0) > 1 && <Bloco titulo="Por cliente"><Barras dados={dados.por_cliente} maximo={15} /></Bloco>}
            {(dados.por_modulo?.length ?? 0) > 1 && (
                <section className="grid grid-cols-2 gap-3.5">
                    <Bloco titulo="Por módulo / produto"><Barras dados={dados.por_modulo} /></Bloco>
                    <Bloco titulo="Por prioridade"><Barras dados={dados.por_prioridade?.filter((item) => item.total)} /></Bloco>
                </section>
            )}
            <section className="grid grid-cols-2 gap-3.5">
                <Bloco titulo={`Ações atrasadas (${dados.atrasados.length})`}><ListaPrazos atraso itens={dados.atrasados} mostrarPlano={!plano} /></Bloco>
                <Bloco titulo="Próximos prazos (15 dias)"><ListaPrazos itens={dados.proximos_prazos} mostrarPlano={!plano} /></Bloco>
            </section>
            {!publico && Boolean(dados.por_pessoa?.length) && (
                <div>
                    <h2 className="m-0 mb-2 text-[14.5px] font-semibold text-ink">Equipe - alocação e horas trabalhadas</h2>
                    <Tabela cabecalho={<><Th>Pessoa</Th><Th centro>Ações alocadas</Th><Th centro>Abertas</Th><Th centro>Atrasadas</Th><Th centro>Apontamentos</Th><Th centro>Horas trabalhadas</Th></>}>
                        {dados.por_pessoa?.map((pessoa) => (
                            <tr key={pessoa.id_usuario}>
                                <Td>{pessoa.nome}</Td>
                                <Td centro className="tabular-nums">{pessoa.itens}</Td>
                                <Td centro className="tabular-nums">{pessoa.abertos}</Td>
                                <Td centro className="tabular-nums">{pessoa.atrasados ? <b className="text-danger">{pessoa.atrasados}</b> : 0}</Td>
                                <Td centro className="tabular-nums">{pessoa.apontamentos}</Td>
                                <Td centro className="font-semibold tabular-nums">{fmtMin(pessoa.trabalhado_min)}</Td>
                            </tr>
                        ))}
                    </Tabela>
                </div>
            )}
            {plano && blocosEtapas.length > 0 && (
                <div>
                    <h2 className="m-0 mb-2 text-[14.5px] font-semibold text-ink">Cronograma de etapas</h2>
                    <Tabela cabecalho={<><Th>Ação</Th><Th>Cliente</Th><Th>Responsável</Th><Th centro>Início prev.</Th><Th centro>Fim prev.</Th><Th centro>Início real</Th><Th centro>Fim real</Th><Th centro>Situação</Th></>}>
                        {blocosEtapas.map(([bloco, lista]) => (
                            <Fragment key={bloco}>
                                <tr><td colSpan={8} className="bg-tint px-[18px] py-2 text-[13px] font-semibold text-pine-800">{bloco}</td></tr>
                                {lista.map((etapa) => (
                                    <tr key={`${bloco}-${etapa.descricao}-${etapa.data_inicio}`}>
                                        <Td>{etapa.descricao}</Td>
                                        <Td>{etapa.cliente || '-'}</Td>
                                        <Td>{etapa.responsavel || '-'}</Td>
                                        {[etapa.data_inicio, etapa.data_fim, etapa.data_inicio_real, etapa.data_fim_real].map((data, indice) => <Td key={indice} centro className="whitespace-nowrap tabular-nums">{dataBR(data)}</Td>)}
                                        <Td centro><span className="inline-block rounded-full border border-solid px-2 py-0.5 text-xs font-semibold whitespace-nowrap" style={{ color: COR_STATUS_ITEM[etapa.status], borderColor: COR_STATUS_ITEM[etapa.status] }}>{etapa.status}</span></Td>
                                    </tr>
                                ))}
                            </Fragment>
                        ))}
                    </Tabela>
                </div>
            )}
            <footer className="flex justify-between text-xs text-text-2">
                <span>Opera Echo - Plano de Ação · {publico ? 'Visualização pública (somente leitura)' : 'Uso interno'}</span>
                <span>Atualização automática a cada 3 minutos</span>
            </footer>
        </div>
    );
}

function Painel({ publico, token, acaoVoltar }: { publico: boolean; token?: string; acaoVoltar?: () => void }) {
    const p = usePainel(publico, token);
    const raiz = useRef<HTMLDivElement>(null);
    const [modoTv, setModoTv] = useState(false);
    const { plano } = p.dados ?? {};

    const alternarTv = () => {
        if (!modoTv) raiz.current?.requestFullscreen?.().catch((erro: unknown) => logErro('Erro ao abrir a tela cheia', erro));
        else if (document.fullscreenElement) document.exitFullscreen().catch((erro: unknown) => logErro('Erro ao sair da tela cheia', erro));
        setModoTv(!modoTv);
    };

    let titulo = 'Painel do Plano de Ação';
    if (publico && plano) titulo = plano.titulo;
    else if (publico && !token) titulo = 'Carteira de Planos de Ação';
    const subtitulo = publico && plano ? [plano.cliente, plano.nome_projeto].filter(Boolean).join(' · ') : (p.dados ? `Atualizado em ${new Date(p.dados.gerado_em).toLocaleString('pt-BR')}` : undefined);

    return (
        <div ref={raiz} className={cn(modoTv && 'overflow-auto bg-paper p-6')}>
            <PageHeader
                titulo={titulo}
                subtitulo={subtitulo}
                ajuda={REGRA_INDICADORES_PLANO}
                acoes={(
                    <>
                        <Button variant="secondary" isLoading={p.carregando} onClick={p.atualizar}><Icon n="refresh" /> Atualizar</Button>
                        <Button variant="secondary" title="Tela cheia, com atualização automática" onClick={alternarTv}><Icon n="monitor" /> {modoTv ? 'Sair do modo TV' : 'Modo TV'}</Button>
                        {!publico && <Button variant="secondary" title="Link público da carteira (somente planos publicados)" onClick={() => copiarLink(linkPublicoCarteira())}><Icon n="globe" /> Link público</Button>}
                        {publico && token && <Link to="/painel-plano-acao" className="no-underline"><Button variant="secondary"><Icon n="grid" /> Carteira</Button></Link>}
                        {acaoVoltar && <Button variant="secondary" onClick={acaoVoltar}>Voltar</Button>}
                    </>
                )}
            />
            {!publico && (
                <Card className="mb-3.5 grid grid-cols-4 gap-3.5 px-4 py-3.5">
                    <Field rotulo="Projeto" htmlFor="pn-projeto">
                        <Select id="pn-projeto" value={p.projeto} onChange={(e) => p.filtrar({ projeto: e.target.value, id_plano: null })}>
                            <option value="">Todos</option>
                            {p.projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Situação do plano" htmlFor="pn-status">
                        <Select id="pn-status" value={p.statusUrl} onChange={(e) => p.filtrar({ status: e.target.value === STATUS_PADRAO ? null : e.target.value, id_plano: null })}>
                            <option value={TODAS}>Todas</option>
                            {STATUS_PLANO.map((status) => <option key={status} value={status}>{status}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Cliente" htmlFor="pn-cliente"><Input id="pn-cliente" placeholder="Buscar cliente..." value={p.cliente} onChange={(e) => p.filtrar({ cliente: e.target.value })} /></Field>
                    <Field rotulo="Plano" htmlFor="pn-plano">
                        <Select id="pn-plano" value={p.idPlano} onChange={(e) => p.filtrar({ id_plano: e.target.value })}>
                            <option value="">Todos os planos</option>
                            {p.planosOpcao.map((item) => <option key={item.id_plano} value={item.id_plano}>{item.titulo}</option>)}
                        </Select>
                    </Field>
                </Card>
            )}
            {p.falha && <Aviso titulo="Painel indisponível">{p.falha}</Aviso>}
            {!p.falha && !p.dados && <Carregando />}
            {!p.falha && p.dados && <Conteudo dados={p.dados} publico={publico} />}
        </div>
    );
}

export function PainelPlanoPage() {
    const voltar = useVoltar();
    return <Painel publico={false} acaoVoltar={voltar} />;
}

/** /painel-plano-acao/:token? sem login: um plano publicado ou a carteira. */
export function PainelPlanoPublicoPage() {
    const { token } = useParams();
    return (
        <div className="flex min-h-screen min-w-[1340px] flex-col bg-paper">
            <header className="flex h-[60px] shrink-0 items-center bg-pine-800 px-6">
                <span className="flex items-center rounded-lg bg-white px-2.5 py-1"><img src="/logo.png" alt="Opera Echo" className="block h-[30px] w-auto" /></span>
            </header>
            <main className="app-content mx-auto box-border w-full max-w-[1440px] flex-1 px-7 pt-[22px] pb-7">
                <Painel publico token={token} />
            </main>
        </div>
    );
}
