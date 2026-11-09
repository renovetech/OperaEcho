/* /:slug: painel público do projeto, sem login e somente leitura, para espelhar em TVs.
   Os filtros ficam na URL para fixar um painel específico na tela. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import Icon from '@/shared/ui/Icon';
import { buscarPainelProjeto, carregarMalhaIbge, type DadosPainelProjeto, type UnidadePainel } from '@/features/painelProjeto/api';
import { consolidarPainel, dataBR, fmtHoras, fmtNum, type Agrupar, type ConsolidadoPainel, type FiltroPainel, type GrupoTabela, type LinhaRegiao, type Visao } from '@/features/painelProjeto/calculos';
import { BarrasHorizontais, BarrasMes, Rosca, SemDados } from '@/features/painelProjeto/GraficosProjeto';
import { MapaProjeto, type EstadoMalha } from '@/features/painelProjeto/MapaProjeto';
import { SeloTipo } from '@/features/painelProjeto/marcadores';
import { ChipProduto, TabelaUnidades } from '@/features/painelProjeto/TabelaUnidades';
import { useParametrosUrl } from '@/shared/hooks';
import { cn, logErro } from '@/shared/lib';
import { Abas } from '@/shared/ui/Abas';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';
import { Carregando } from '@/shared/ui/Estados';
import { Card, CardTitulo, PageHeader } from '@/shared/ui/Pagina';

const INTERVALO_ATUALIZACAO_MS = 5 * 60 * 1000;
const COR_IMPLANTACAO = '#2E7D32';
const COR_PROJETOS = '#9C7A3C';
const VISOES: { id: Visao; rotulo: string }[] = [{ id: 'geral', rotulo: 'Geral' }, { id: 'macro', rotulo: 'Por Macro' }, { id: 'micro', rotulo: 'Por Micro' }];
const REGRA_PAINEL = 'Dados agregados das atividades lançadas na Implantação e em Projetos, sem informações pessoais. Atualiza sozinho a cada 5 minutos.\nOs filtros ficam no endereço da página: copie o link para fixar um painel específico em uma TV.';
const REGRA_ATENDIDAS = 'Horas somam só o que foi informado nas atividades. Uma unidade é atendida quando tem ao menos uma atividade no filtro.';
const REGRA_MAPA = 'Municípios coloridos pela região predominante das unidades do projeto. Cada marcador traz a sigla do tipo da unidade e, com mais de uma unidade no mesmo ponto, a quantidade.\nClique em uma região ou tipo abaixo do mapa para filtrar.';

interface Resposta { versao: number; dados: DadosPainelProjeto | null; erro: string; naoEncontrado: boolean }

function usePainelProjeto(slug: string) {
    const [versao, setVersao] = useState(0);
    const [resposta, setResposta] = useState<Resposta>({ versao: -1, dados: null, erro: '', naoEncontrado: false });
    const chave = `${slug}|${versao}`;

    useEffect(() => {
        const relogio = setInterval(() => setVersao((atual) => atual + 1), INTERVALO_ATUALIZACAO_MS);
        return () => clearInterval(relogio);
    }, []);

    useEffect(() => {
        let ativo = true;
        buscarPainelProjeto(slug)
            .then((dados) => { if (ativo) setResposta({ versao, dados, erro: '', naoEncontrado: false }); })
            .catch((falha: { response?: { status?: number; data?: { erro?: string } } }) => {
                if (!ativo) return;
                // Falha numa atualização não derruba a TV: mantém os últimos dados.
                setResposta((atual) => ({ ...atual, versao, erro: falha.response?.data?.erro ?? 'Não foi possível carregar o painel.', naoEncontrado: falha.response?.status === 404 }));
            });
        return () => { ativo = false; };
    }, [chave, slug, versao]);

    return { ...resposta, carregando: resposta.versao !== versao, atualizar: () => setVersao((atual) => atual + 1) };
}

function useMalha(uf: string | null | undefined): EstadoMalha {
    const [resultado, setResultado] = useState<{ uf: string; malha: EstadoMalha } | null>(null);
    useEffect(() => {
        if (!uf) return undefined;
        let ativo = true;
        carregarMalhaIbge(uf)
            .then((dados) => { if (ativo) setResultado({ uf, malha: dados ? { estado: 'ok', dados } : { estado: 'erro' } }); })
            .catch((falha: unknown) => {
                logErro('Erro ao carregar a malha do IBGE', falha);
                if (ativo) setResultado({ uf, malha: { estado: 'erro' } });
            });
        return () => { ativo = false; };
    }, [uf]);
    return resultado?.uf === uf && resultado ? resultado.malha : { estado: 'carregando' };
}

function lerFiltro(parametros: URLSearchParams): FiltroPainel {
    const visaoUrl = parametros.get('visao');
    const visao: Visao = visaoUrl === 'macro' || visaoUrl === 'micro' ? visaoUrl : 'geral';
    const agruparUrl = parametros.get('agrupar');
    const agrupar: Agrupar = agruparUrl === 'macro' || agruparUrl === 'micro' || agruparUrl === 'lista' ? agruparUrl : (visao === 'geral' ? 'macro' : 'micro');
    return {
        visao, agrupar,
        macro: parametros.get('macro') ?? '',
        micro: parametros.get('micro') ?? '',
        produto: parametros.get('produto') ?? '',
        tipo: parametros.get('tipo') ?? '',
        de: parametros.get('de') ?? '',
        ate: parametros.get('ate') ?? ''
    };
}

type AlterarFiltro = (mudancas: Partial<Record<keyof FiltroPainel, string>>) => void;

function Filtros({ filtro, dados, c, semRegioes, aoAlterar, aoLimpar }: { filtro: FiltroPainel; dados: DadosPainelProjeto; c: ConsolidadoPainel; semRegioes: boolean; aoAlterar: AlterarFiltro; aoLimpar: () => void }) {
    const micros = c.macroAtual ? c.macroAtual.micros : dados.regioes.flatMap((macro) => macro.micros);
    const filtrando = filtro.de || filtro.ate || filtro.produto || filtro.tipo || filtro.visao !== 'geral';
    const trocarVisao = (visao: Visao) => aoAlterar({
        visao: visao === 'geral' ? '' : visao,
        ...(visao === 'geral' && { macro: '', micro: '' }),
        ...(visao === 'macro' && { micro: '' })
    });

    return (
        <Card className="mb-3.5 flex items-end gap-3 px-4 py-3.5">
            <Field rotulo="Visão do mapa" className="shrink-0">
                <Abas rotulo="Visão do mapa" className="gap-1" itens={VISOES.map((visao) => ({ ...visao, desativada: visao.id !== 'geral' && semRegioes }))} ativa={filtro.visao} aoMudar={trocarVisao} />
            </Field>
            <Field rotulo="Macro região" htmlFor="pj-macro" className="min-w-0 flex-1">
                <Select id="pj-macro" disabled={filtro.visao === 'geral'} value={filtro.macro} onChange={(e) => aoAlterar({ macro: e.target.value, micro: '' })}>
                    <option value="">{filtro.visao === 'geral' ? 'Todas' : 'Selecione...'}</option>
                    {dados.regioes.map((macro) => <option key={macro.id_macro} value={macro.id_macro}>{macro.nome_macro}</option>)}
                </Select>
            </Field>
            <Field rotulo="Micro região" htmlFor="pj-micro" className="min-w-0 flex-1">
                <Select id="pj-micro" disabled={filtro.visao !== 'micro'} value={filtro.micro} onChange={(e) => {
                    const micro = c.regioes.micros.get(Number(e.target.value));
                    aoAlterar({ micro: e.target.value, macro: micro ? String(micro.id_macro) : filtro.macro });
                }}>
                    <option value="">{filtro.visao === 'micro' ? 'Selecione...' : 'Todas'}</option>
                    {micros.map((micro) => <option key={micro.id_micro} value={micro.id_micro}>{micro.nome_micro}</option>)}
                </Select>
            </Field>
            <Field rotulo="Produto" htmlFor="pj-produto" className="min-w-0 flex-1">
                <Select id="pj-produto" value={filtro.produto} onChange={(e) => aoAlterar({ produto: e.target.value })}>
                    <option value="">Todos os produtos</option>
                    {dados.produtos.map((produto) => <option key={produto.id_produto} value={produto.id_produto}>{produto.nome_produto}</option>)}
                </Select>
            </Field>
            <Field rotulo="Tipo de unidade" htmlFor="pj-tipo" className="min-w-0 flex-1">
                <Select id="pj-tipo" value={filtro.tipo} onChange={(e) => aoAlterar({ tipo: e.target.value })}>
                    <option value="">Todos os tipos</option>
                    {dados.tipos.map((tipo) => <option key={tipo.id_tipo_unidade} value={tipo.id_tipo_unidade}>{tipo.sigla} - {tipo.nome_tipo}</option>)}
                </Select>
            </Field>
            <Field rotulo="De" htmlFor="pj-de" className="w-[140px] shrink-0"><Input id="pj-de" type="date" max={filtro.ate || undefined} value={filtro.de} onChange={(e) => aoAlterar({ de: e.target.value })} /></Field>
            <Field rotulo="Até" htmlFor="pj-ate" className="w-[140px] shrink-0"><Input id="pj-ate" type="date" min={filtro.de || undefined} value={filtro.ate} onChange={(e) => aoAlterar({ ate: e.target.value })} /></Field>
            {filtrando && <Button variant="ghost" onClick={aoLimpar}><Icon n="x" /> Limpar</Button>}
        </Card>
    );
}

const Kpi = ({ rotulo, destaque, children, detalhe }: { rotulo: string; destaque?: boolean; children: React.ReactNode; detalhe: string }) => (
    <Card className={cn('px-4 py-3.5', destaque && 'bg-pine-800')}>
        <p className={cn('m-0 mb-1 text-xs', destaque ? 'text-sage-300' : 'text-text-2')}>{rotulo}</p>
        <b className={cn('block text-[22px] leading-tight font-bold tabular-nums', destaque ? 'text-white' : 'text-ink')}>{children}</b>
        <small className={cn('text-xs', destaque ? 'text-sage-300' : 'text-text-2')}>{detalhe}</small>
    </Card>
);

function Indicadores({ c }: { c: ConsolidadoPainel }) {
    const { kpi } = c;
    return (
        <div className="mb-3.5 grid grid-cols-5 gap-3">
            <Kpi destaque rotulo="Atividades lançadas" detalhe={`Implantação ${fmtNum(kpi.implantacao)} · Projetos ${fmtNum(kpi.projetos)}`}>{fmtNum(kpi.atividades)}</Kpi>
            <Kpi destaque rotulo="Horas trabalhadas" detalhe={kpi.semHoras ? `${fmtNum(kpi.semHoras)} atividade(s) sem horas informadas` : 'registradas nas atividades'}>{fmtHoras(kpi.minutos)}</Kpi>
            <Kpi rotulo="Unidades" detalhe={`em ${fmtNum(kpi.municipios)} município(s)`}>{fmtNum(kpi.unidades)}</Kpi>
            <Kpi rotulo="Unidades atendidas" detalhe={`${kpi.unidades ? Math.round((kpi.atendidas / kpi.unidades) * 100) : 0}% com atividade no período`}>{fmtNum(kpi.atendidas)}</Kpi>
            <Kpi rotulo="Última atividade" detalhe={c.tituloEscopo}>{dataBR(kpi.ultima)}</Kpi>
        </div>
    );
}

const BotaoLegenda = ({ ativo, disabled, title, onClick, children }: { ativo?: boolean; disabled?: boolean; title: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" aria-pressed={ativo} disabled={disabled} title={title} onClick={onClick} className={cn('inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-solid px-2.5 py-1 font-sans text-xs disabled:cursor-default', ativo ? 'border-pine bg-tint font-semibold text-pine-800' : 'border-line bg-white text-text hover:bg-surface-2')}>{children}</button>
);

function LegendasMapa({ filtro, dados, c, aoAlterar }: { filtro: FiltroPainel; dados: DadosPainelProjeto; c: ConsolidadoPainel; aoAlterar: AlterarFiltro }) {
    const regioes = filtro.visao === 'geral'
        ? dados.regioes.map((macro) => ({ k: macro.id_macro, nome: macro.nome_macro, cor: c.regioes.macros.get(macro.id_macro)?.corFinal, abrir: { visao: 'macro', macro: String(macro.id_macro), micro: '' } }))
        : (c.macroAtual?.micros ?? []).map((micro) => ({ k: micro.id_micro, nome: micro.nome_micro, cor: c.regioes.micros.get(micro.id_micro)?.corFinal, abrir: { visao: 'micro', macro: String(micro.id_macro), micro: String(micro.id_micro) } }));

    return (
        <div className="flex flex-col gap-2 border-0 border-t border-solid border-line-2 px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
                {regioes.map((regiao) => (
                    <BotaoLegenda key={regiao.k} ativo={filtro.visao === 'micro' && String(regiao.k) === filtro.micro} title="Abrir no mapa" onClick={() => aoAlterar(regiao.abrir)}>
                        <i className="size-2.5 rounded-sm" style={{ background: regiao.cor }} />{regiao.nome}
                    </BotaoLegenda>
                ))}
                {!dados.regioes.length && <span className="text-xs text-text-2">Regiões ainda não cadastradas para este projeto: exibindo todas as unidades.</span>}
            </div>
            {c.resumoTipos.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    {c.resumoTipos.map((tipo) => (
                        <BotaoLegenda key={tipo.id_tipo_unidade} ativo={String(tipo.id_tipo_unidade) === filtro.tipo} disabled={!tipo.id_tipo_unidade} title={tipo.id_tipo_unidade ? 'Filtrar por este tipo' : 'Classifique em Cadastro > Unidades'} onClick={() => aoAlterar({ tipo: String(tipo.id_tipo_unidade) === filtro.tipo ? '' : String(tipo.id_tipo_unidade) })}>
                            <SeloTipo sigla={tipo.sigla} />{tipo.nome_tipo} <small className="text-text-2">({tipo.qtd})</small>
                        </BotaoLegenda>
                    ))}
                </div>
            )}
        </div>
    );
}

function PainelProdutos({ filtro, c, aoAlterar }: { filtro: FiltroPainel; c: ConsolidadoPainel; aoAlterar: AlterarFiltro }) {
    const { produtoAtual, kpi } = c;
    const total = c.unidadesEscopo.length;
    return (
        <Card className="flex min-h-0 flex-col">
            <CardTitulo titulo="Produtos" ajuda="Unidades do escopo atual que têm cada produto. Clique em um produto para filtrar o painel." />
            {produtoAtual && (
                <div className="border-0 border-b border-solid border-line-2 p-3.5">
                    <ChipProduto nome={produtoAtual.nome_produto} cor={c.corProduto(produtoAtual.id_produto)} selecionado />
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-text-2">
                        {([[fmtNum(kpi.unidades), `unidades de ${fmtNum(total)}`], [`${total ? Math.round((kpi.unidades / total) * 100) : 0}%`, 'cobertura'], [fmtNum(kpi.atividades), 'atividades'], [fmtHoras(kpi.minutos), 'horas']] as const).map(([valor, rotulo]) => (
                            <div key={rotulo}><b className="block text-[17px] font-bold text-ink tabular-nums">{valor}</b>{rotulo}</div>
                        ))}
                    </div>
                </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
                {!c.resumoProdutos.length && <SemDados>Nenhum produto vinculado às unidades.</SemDados>}
                <BarrasHorizontais
                    dados={c.resumoProdutos.map((produto) => ({ chave: produto.id_produto, nome: produto.nome_produto, valor: produto.unidades, cor: c.corProduto(produto.id_produto) }))}
                    vazio=""
                    aoClicar={(item) => aoAlterar({ produto: String(item.chave) === filtro.produto ? '' : String(item.chave) })}
                />
            </div>
        </Card>
    );
}

function Conteudo({ dados, atualizado, carregando, atualizar }: { dados: DadosPainelProjeto; atualizado: string; carregando: boolean; atualizar: () => void }) {
    const [parametros, alterarUrl] = useParametrosUrl();
    const [foco, setFoco] = useState<number | null>(null);
    const [alvo, setAlvo] = useState<{ lat: number; lng: number; t: number } | null>(null);
    const raiz = useRef<HTMLDivElement>(null);
    const mapa = useRef<HTMLDivElement>(null);
    const textoUrl = parametros.toString();
    const filtro = useMemo(() => lerFiltro(new URLSearchParams(textoUrl)), [textoUrl]);
    const c = useMemo(() => consolidarPainel(dados, filtro), [dados, filtro]);
    const malha = useMalha(dados.projeto.uf);
    const semRegioes = !dados.regioes.length;

    useEffect(() => {
        document.title = `${dados.projeto.nome} · Painel Opera Echo`;
        return () => { document.title = 'Opera Echo'; };
    }, [dados.projeto.nome]);

    const irParaMapa = () => mapa.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const verUnidade = (unidade: UnidadePainel) => {
        setFoco(unidade.id_unidade);
        if (unidade.latitude === null || unidade.longitude === null) return;
        setAlvo({ lat: unidade.latitude, lng: unidade.longitude, t: Date.now() });
        irParaMapa();
    };
    const verGrupo = (grupo: GrupoTabela) => {
        if (grupo.alvo) alterarUrl(grupo.alvo);
        irParaMapa();
    };
    const abrirRegiao = (linha: LinhaRegiao) => {
        if (linha.alvo?.macro) alterarUrl({ visao: 'macro', macro: String(linha.alvo.macro), micro: '' });
        else if (linha.alvo?.micro) alterarUrl({ visao: 'micro', micro: String(linha.alvo.micro) });
    };
    const telaCheia = () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else raiz.current?.requestFullscreen().catch((falha: unknown) => logErro('Erro ao abrir a tela cheia', falha));
    };

    let tituloRegioes = 'Por município';
    if (filtro.visao === 'geral') tituloRegioes = 'Por macro região';
    if (filtro.visao === 'macro') tituloRegioes = 'Por micro região';

    return (
        <div ref={raiz} className="flex min-h-screen min-w-[1340px] flex-col overflow-auto bg-paper">
            <header className="flex h-[60px] shrink-0 items-center bg-pine-800 px-6">
                <span className="flex items-center rounded-lg bg-white px-2.5 py-1"><img src="/logo.png" alt="Opera Echo" className="block h-[30px] w-auto" /></span>
            </header>
            <main className="app-content mx-auto box-border w-full max-w-[1600px] flex-1 px-7 pt-[22px] pb-7">
                <PageHeader
                    titulo={dados.projeto.nome}
                    subtitulo={`Atualizado em ${atualizado}`}
                    ajuda={REGRA_PAINEL}
                    acoes={(
                        <>
                            <Button variant="secondary" isLoading={carregando} onClick={atualizar}><Icon n="refresh" /> Atualizar</Button>
                            <Button onClick={telaCheia}><Icon n="monitor" /> Tela cheia</Button>
                        </>
                    )}
                />
                <Filtros filtro={filtro} dados={dados} c={c} semRegioes={semRegioes} aoAlterar={alterarUrl} aoLimpar={() => alterarUrl(Object.fromEntries([...new URLSearchParams(textoUrl).keys()].map((chave) => [chave, null])))} />
                <Indicadores c={c} />
                <div className="mb-3.5 grid grid-cols-[1fr_340px] gap-3.5">
                    <div ref={mapa}>
                        <Card className="overflow-hidden">
                            <CardTitulo titulo={`Mapa das unidades: ${c.tituloEscopo}${c.tipoAtual ? ` · ${c.tipoAtual.nome_tipo}` : ''}${c.produtoAtual ? ` · ${c.produtoAtual.nome_produto}` : ''}`} ajuda={REGRA_MAPA} />
                            <MapaProjeto uf={dados.projeto.uf} malha={malha} filtro={filtro} c={c} unidades={dados.unidades} unidadeFoco={foco} alvo={alvo} />
                            <LegendasMapa filtro={filtro} dados={dados} c={c} aoAlterar={alterarUrl} />
                        </Card>
                    </div>
                    <PainelProdutos filtro={filtro} c={c} aoAlterar={alterarUrl} />
                </div>
                <TabelaUnidades c={c} filtro={filtro} produtos={dados.produtos} semRegioes={semRegioes} unidadeFoco={foco} aoAgrupar={(agrupar) => alterarUrl({ agrupar })} aoVerUnidade={verUnidade} aoVerGrupo={verGrupo} />
                <div className="mb-3.5 grid grid-cols-3 gap-3.5">
                    <Card className="col-span-2"><CardTitulo titulo="Atividades por mês" ajuda="Últimos 12 meses com registro, pela data de início da atividade." /><div className="p-3.5"><BarrasMes dados={c.serieMes} /></div></Card>
                    <Card><CardTitulo titulo="Implantação x Projetos" ajuda={REGRA_ATENDIDAS} /><Rosca rotulo="atividades" partes={[{ nome: 'Implantação', valor: c.kpi.implantacao, cor: COR_IMPLANTACAO }, { nome: 'Projetos', valor: c.kpi.projetos, cor: COR_PROJETOS }]} /></Card>
                </div>
                <div className="grid grid-cols-3 gap-3.5">
                    <Card><CardTitulo titulo="Por motivo da visita" ajuda="Uma atividade com mais de um motivo conta em cada um deles." /><BarrasHorizontais dados={c.porMotivo} vazio="Sem atividades no período." /></Card>
                    <Card><CardTitulo titulo={tituloRegioes} ajuda="Atividades um nível abaixo da visão do mapa. Clique para abrir a região." /><BarrasHorizontais dados={c.porRegiao} vazio="Sem unidades no filtro." aoClicar={filtro.visao === 'micro' ? undefined : abrirRegiao} /></Card>
                    <Card><CardTitulo titulo="Unidades com mais atividades" ajuda="As 10 unidades com mais atividades no filtro. Clique para ver no mapa." /><BarrasHorizontais dados={c.topUnidades} vazio="Sem atividades no período." aoClicar={(item) => verUnidade(item.unidade)} /></Card>
                </div>
            </main>
        </div>
    );
}

export function PainelProjetoPage() {
    const { slug = '' } = useParams();
    const painel = usePainelProjeto(slug);

    if (painel.naoEncontrado) return <Navigate to="/" replace />;
    if (!painel.dados) {
        return (
            <main className="app-content flex min-h-screen items-center justify-center bg-paper">
                {painel.erro ? <p className="m-0 text-sm text-danger"><Icon n="alert" /> {painel.erro}</p> : <Carregando />}
            </main>
        );
    }
    return <Conteudo dados={painel.dados} atualizado={new Date(painel.dados.gerado_em).toLocaleString('pt-BR')} carregando={painel.carregando} atualizar={painel.atualizar} />;
}
