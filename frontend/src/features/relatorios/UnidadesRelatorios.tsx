/* Projetos Ativos e Mapa de Unidades. "Ver" em Projetos Ativos abre o mapa já filtrado pelo projeto. */
import { useEffect, useMemo, useRef, useState } from 'react';
import L, { type LatLngTuple, type Map as MapaLeaflet } from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { CATEGORIAS_PROJETO } from '@/shared/categoriasProjeto';
import { agruparPorCoordenada, CENTRO_BRASIL, COR_SEM_PRODUTO, fmtCoord, iconeUnidade, mapaDeCores, TILE_ATTR, TILE_URL } from '@/shared/mapaUnidades';
import * as relatoriosApi from '@/features/relatorios/api';
import type { ProjetoAtivo, ProjetoFiltro, UnidadeMapa } from '@/features/relatorios/api';
import { AvisoDoc, BotaoLinha, CampoData, ChipDoc, Documento, FaixaIndicadores, ModeloRelatorio, SecaoDoc, SubLinha, TabelaDoc, TdDoc, ThDoc, useNomeUsuario } from '@/features/relatorios/componentes';
import { ajustarColunas, capturarMapa, exportarCaptura, gerarExcel, gerarPdf, type Celula } from '@/features/relatorios/exportacao';
import { periodoBloqueado } from '@/shared/periodo';
import { useAuth } from '@/shared/auth/AuthContext';
import { aviso, erro, mensagemDeErro } from '@/shared/feedback';
import { useParametrosUrl } from '@/shared/hooks';
import { cn, logErro } from '@/shared/lib';
import { Field, Select } from '@/shared/ui/Campos';
import { hexParaRgb } from '@/shared/pdfRelatorio';

const SEM_PRODUTO = 0;
const LARGURA_A4_PAISAGEM = '297mm';
const isoLocal = (data: Date) => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
const dataIso = (valor: string) => (valor ? valor.split('-').reverse().join('/') : '');
const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);
const categoriaDe = (projeto?: ProjetoFiltro) => (projeto?.categoria ?? '').trim();

function useProjetosAtivos(): ProjetoFiltro[] {
    const [projetos, setProjetos] = useState<ProjetoFiltro[]>([]);
    useEffect(() => {
        relatoriosApi.listarProjetosAtivosFiltro().then(setProjetos).catch((falha: unknown) => logErro('Erro ao listar projetos', falha));
    }, []);
    return projetos;
}

const OpcoesCategoria = () => (
    <>
        <option value="Todas">Todas</option>
        {(CATEGORIAS_PROJETO as string[]).map((categoria) => <option key={categoria} value={categoria}>Categoria {categoria}</option>)}
    </>
);

export function ProjetosAtivosRelatorio() {
    const usuario = useNomeUsuario();
    const navigate = useNavigate();
    const { podeAcessar } = useAuth();
    const projetos = useProjetosAtivos();
    const [filtros, setFiltros] = useState(() => {
        const hoje = new Date();
        return { dataInicio: isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), dataFim: isoLocal(hoje), categoria: 'Todas', id_projeto: 'Todos' };
    });
    const [lista, setLista] = useState<ProjetoAtivo[] | null>(null);
    const [carregando, setCarregando] = useState(false);
    const folha = useRef<HTMLDivElement>(null);
    const linhas = useMemo(() => lista ?? [], [lista]);

    const consultar = async (parametros: typeof filtros) => {
        setCarregando(true);
        try {
            setLista(await relatoriosApi.buscarProjetosAtivos(parametros));
        } catch (falha) {
            setLista([]);
            erro(mensagemDeErro(falha, 'Não foi possível gerar o relatório.'));
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        let ativo = true;
        relatoriosApi.buscarProjetosAtivos(filtros)
            .then((resposta) => { if (ativo) setLista(resposta); })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setLista([]);
                erro(mensagemDeErro(falha, 'Não foi possível gerar o relatório.'));
            });
        return () => { ativo = false; };
        // Só a primeira carga é automática; depois, o usuário pede pelo botão.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const gerar = () => {
        if (filtros.dataInicio && filtros.dataFim && filtros.dataFim < filtros.dataInicio) {
            aviso('A data final não pode ser anterior à inicial.');
            return;
        }
        if (!periodoBloqueado(filtros.dataInicio, filtros.dataFim)) void consultar(filtros);
    };

    const projetosCategoria = filtros.categoria === 'Todas' ? projetos : projetos.filter((projeto) => categoriaDe(projeto) === filtros.categoria);
    const mudarCategoria = (categoria: string) => {
        const atual = projetos.find((projeto) => String(projeto.id_projeto) === filtros.id_projeto);
        const mantem = !atual || categoria === 'Todas' || categoriaDe(atual) === categoria;
        setFiltros({ ...filtros, categoria, id_projeto: mantem ? filtros.id_projeto : 'Todos' });
    };

    const total = useMemo(() => linhas.reduce((soma, projeto) => ({
        projetos: soma.projetos + 1,
        unidades: soma.unidades + projeto.unidades_ativas,
        georref: soma.georref + projeto.unidades_georref,
        municipios: soma.municipios + projeto.municipios,
        atividades: soma.atividades + projeto.atividades_implantacao + projeto.atividades_projetos
    }), { projetos: 0, unidades: 0, georref: 0, municipios: 0, atividades: 0 }), [linhas]);

    const periodo = `${filtros.dataInicio && filtros.dataFim ? `Atividades de ${dataIso(filtros.dataInicio)} até ${dataIso(filtros.dataFim)}` : 'Sem período de atividades'}${filtros.categoria === 'Todas' ? '' : ` · Categoria ${filtros.categoria}`}`;
    const semDados = !linhas.length;
    const seHouverDados = (acao: () => void) => {
        if (semDados) aviso('Nenhum projeto para exportar.');
        else acao();
    };

    const pdf = () => gerarPdf({
        titulo: 'Projetos Ativos', periodo, usuario, arquivo: 'Relatorio_Projetos_Ativos',
        preencher: (documento) => {
            documento.bloco('Indicadores gerais', documento.colors.green);
            documento.tabela(ajustarColunas(documento, [{ h: 'Projetos ativos', w: 40, a: 'c' }, { h: 'Unidades ativas', w: 40, a: 'c' }, { h: 'Georreferenciadas', w: 40, a: 'c' }, { h: 'Municípios', w: 40, a: 'c' }, { h: 'Atividades no período', w: 40, a: 'c' }]),
                [[String(total.projetos), String(total.unidades), `${total.georref} (${pct(total.georref, total.unidades)}%)`, String(total.municipios), String(total.atividades)]]);
            documento.bloco('Resumo por projeto', documento.colors.green);
            documento.tabela(ajustarColunas(documento, [{ h: 'Projeto', w: 70, a: 'l' }, { h: 'Cat.', w: 14, a: 'c' }, { h: 'UF', w: 22, a: 'c' }, { h: 'Unid. ativas', w: 22, a: 'c' }, { h: 'Inativas', w: 18, a: 'c' }, { h: 'Municípios', w: 22, a: 'c' }, { h: 'Georref.', w: 24, a: 'c' }, { h: 'Ativ. Implant.', w: 24, a: 'c' }, { h: 'Ativ. Projetos', w: 24, a: 'c' }, { h: 'Última ativ.', w: 24, a: 'c' }]),
                linhas.map((projeto) => [projeto.nome_projeto, projeto.categoria || '-', projeto.ufs || '-', String(projeto.unidades_ativas), String(projeto.unidades_inativas), String(projeto.municipios), `${projeto.unidades_georref} (${pct(projeto.unidades_georref, projeto.unidades_ativas)}%)`, String(projeto.atividades_implantacao), String(projeto.atividades_projetos), projeto.ultima_atividade || '-']));
            linhas.filter((projeto) => projeto.produtos.length).forEach((projeto) => {
                documento.bloco(`${projeto.nome_projeto} - unidades por produto`, documento.colors.blue);
                documento.tabela(ajustarColunas(documento, [{ h: 'Produto', w: 160, a: 'l' }, { h: 'Unidades', w: 40, a: 'c' }, { h: '% das unidades ativas', w: 50, a: 'c' }]),
                    projeto.produtos.map((produto) => [produto.nome_produto, String(produto.unidades), `${pct(produto.unidades, projeto.unidades_ativas)}%`]));
            });
        }
    });

    const excel = () => gerarExcel([
        {
            nome: 'Projetos',
            linhas: linhas.map((projeto) => ({
                Projeto: projeto.nome_projeto, Categoria: projeto.categoria ?? '', UFs: projeto.ufs ?? '', 'Unidades ativas': projeto.unidades_ativas, 'Unidades inativas': projeto.unidades_inativas,
                Municípios: projeto.municipios, Georreferenciadas: projeto.unidades_georref, '% Georref.': pct(projeto.unidades_georref, projeto.unidades_ativas),
                'Atividades Implantação': projeto.atividades_implantacao, 'Atividades Projetos': projeto.atividades_projetos, 'Última atividade': projeto.ultima_atividade ?? '',
                Produtos: projeto.produtos.map((produto) => `${produto.nome_produto} (${produto.unidades})`).join(', ')
            }))
        },
        { nome: 'Produtos', linhas: linhas.flatMap((projeto) => projeto.produtos.map((produto) => ({ Projeto: projeto.nome_projeto, Produto: produto.nome_produto, Unidades: produto.unidades }))) }
    ], `Relatorio_Projetos_Ativos_${isoLocal(new Date())}.xlsx`);

    return (
        <ModeloRelatorio
            chave="projetos_ativos"
            titulo="Projetos Ativos"
            aoFiltrar={gerar}
            carregando={carregando}
            aoPdf={() => seHouverDados(() => { void pdf(); })}
            aoJpg={() => seHouverDados(() => { void exportarCaptura(folha, 'Relatorio_Projetos_Ativos'); })}
            aoExcel={() => seHouverDados(() => { void excel(); })}
            filtros={(
                <>
                    <CampoData rotulo="Atividades de" id="pa-inicio" valor={filtros.dataInicio} aoMudar={(dataInicio) => setFiltros({ ...filtros, dataInicio })} />
                    <CampoData rotulo="Até" id="pa-fim" valor={filtros.dataFim} aoMudar={(dataFim) => setFiltros({ ...filtros, dataFim })} />
                    <Field rotulo="Categoria" htmlFor="pa-categoria"><Select id="pa-categoria" value={filtros.categoria} onChange={(e) => mudarCategoria(e.target.value)}><OpcoesCategoria /></Select></Field>
                    <Field rotulo="Projeto" htmlFor="pa-projeto" className="col-span-2">
                        <Select id="pa-projeto" value={filtros.id_projeto} onChange={(e) => setFiltros({ ...filtros, id_projeto: e.target.value })}>
                            <option value="Todos">Todos</option>
                            {projetosCategoria.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                        </Select>
                    </Field>
                </>
            )}
        >
            <Documento titulo="Projetos Ativos" subtitulo={periodo} referencia={folha}>
                {lista === null && <AvisoDoc>Carregando...</AvisoDoc>}
                {lista !== null && semDados && <AvisoDoc>Nenhum projeto ativo encontrado.</AvisoDoc>}
                {!semDados && (
                    <>
                        <FaixaIndicadores itens={[
                            { rotulo: 'Projetos ativos', valor: total.projetos },
                            { rotulo: 'Unidades ativas', valor: total.unidades },
                            { rotulo: 'Georreferenciadas', valor: `${pct(total.georref, total.unidades)}%`, detalhe: `${total.georref} com coordenada` },
                            { rotulo: 'Municípios', valor: total.municipios },
                            { rotulo: 'Atividades', valor: total.atividades }
                        ]} />
                        <SecaoDoc titulo="Resumo por projeto" detalhe={`${linhas.length} projeto(s)`}>
                            <TabelaDoc cabecalho={<><ThDoc>Projeto</ThDoc><ThDoc alinhar="centro">Unidades</ThDoc><ThDoc alinhar="centro">Municípios</ThDoc><ThDoc>Produtos (unidades)</ThDoc><ThDoc alinhar="centro">Georreferenciamento</ThDoc><ThDoc alinhar="centro">Atividades</ThDoc><ThDoc alinhar="centro">Última atividade</ThDoc><ThDoc alinhar="centro" data-sem-exportar="true">Mapa</ThDoc></>}>
                                {linhas.map((projeto) => {
                                    const georref = pct(projeto.unidades_georref, projeto.unidades_ativas);
                                    return (
                                        <tr key={projeto.id_projeto}>
                                            <TdDoc><b className="font-semibold">{projeto.nome_projeto}</b><SubLinha>{projeto.categoria ? `Categoria ${projeto.categoria} · ` : ''}{projeto.ufs || 'Sem UF'}{projeto.gera_lotacao ? ' · Lotação' : ''}</SubLinha></TdDoc>
                                            <TdDoc alinhar="centro" className="tabular-nums"><b className="font-semibold">{projeto.unidades_ativas}</b>{projeto.unidades_inativas > 0 && <SubLinha>{projeto.unidades_inativas} inativa(s)</SubLinha>}</TdDoc>
                                            <TdDoc alinhar="centro" className="tabular-nums">{projeto.municipios}</TdDoc>
                                            <TdDoc>{projeto.produtos.length ? projeto.produtos.map((produto) => <ChipDoc key={produto.id_produto}>{produto.nome_produto} ({produto.unidades})</ChipDoc>) : '-'}</TdDoc>
                                            <TdDoc alinhar="centro" className="min-w-[120px]">
                                                <div className="h-1.5 overflow-hidden rounded-full bg-[#eef1f5]" title={`${projeto.unidades_georref} de ${projeto.unidades_ativas}`}><span className="block h-full bg-[#2e7d32]" style={{ width: `${georref}%` }} /></div>
                                                <SubLinha>{projeto.unidades_georref}/{projeto.unidades_ativas} ({georref}%)</SubLinha>
                                            </TdDoc>
                                            <TdDoc alinhar="centro" className="tabular-nums">{projeto.atividades_implantacao + projeto.atividades_projetos}<SubLinha>Impl. {projeto.atividades_implantacao} · Proj. {projeto.atividades_projetos}</SubLinha></TdDoc>
                                            <TdDoc alinhar="centro" className="whitespace-nowrap tabular-nums">{projeto.ultima_atividade || '-'}</TdDoc>
                                            <TdDoc alinhar="centro" data-sem-exportar="true">
                                                {podeAcessar('rel_mapa_unidades') && projeto.unidades_ativas > 0
                                                    ? <BotaoLinha icone="map" aoClicar={() => navigate(`/system/relatorios/mapa-unidades?projeto=${projeto.id_projeto}`)}>Ver</BotaoLinha>
                                                    : '-'}
                                            </TdDoc>
                                        </tr>
                                    );
                                })}
                            </TabelaDoc>
                        </SecaoDoc>
                    </>
                )}
            </Documento>
        </ModeloRelatorio>
    );
}

function Enquadrar({ pontos }: { pontos: LatLngTuple[] }) {
    const mapa = useMap();
    useEffect(() => {
        const [primeiro] = pontos;
        if (!primeiro) return;
        if (pontos.length === 1) mapa.setView(primeiro, 14);
        else mapa.fitBounds(L.latLngBounds(pontos), { padding: [30, 30], maxZoom: 14 });
    }, [mapa, pontos]);
    return null;
}

const nomeLocal = (unidade: UnidadeMapa) => `${unidade.nome_cidade ?? '-'}${unidade.uf ? ` / ${unidade.uf}` : ''}`;
type SeloLocal = { aproximada: boolean };
const Localizacao = ({ aproximada }: SeloLocal) => <span className={cn('text-xs font-semibold', aproximada ? 'text-[#8a5212]' : 'text-[#1b5e20]')}>{aproximada ? 'Aproximada' : 'Exata'}</span>;

export function MapaUnidadesRelatorio() {
    const usuario = useNomeUsuario();
    const [parametros] = useParametrosUrl();
    const projetos = useProjetosAtivos();
    const [filtros, setFiltros] = useState({ categoria: 'Todas', id_projeto: parametros.get('projeto') ?? '', id_produto: 'Todos', status: 'true', id_cidade: 'Todos', localizacao: 'Todas' });
    const [resultado, setResultado] = useState<{ chave: string; unidades: UnidadeMapa[] }>({ chave: '', unidades: [] });
    const [ocultos, setOcultos] = useState<ReadonlySet<number>>(new Set());
    const folha = useRef<HTMLDivElement>(null);
    const caixaMapa = useRef<HTMLDivElement>(null);
    const mapa = useRef<MapaLeaflet>(null);
    const chave = filtros.id_projeto ? JSON.stringify([filtros.id_projeto, filtros.status, filtros.categoria]) : '';
    const carregando = Boolean(chave) && resultado.chave !== chave;
    const unidades = useMemo(() => (resultado.chave === chave ? resultado.unidades : []), [resultado, chave]);

    useEffect(() => {
        if (!chave) return undefined;
        let ativo = true;
        relatoriosApi.buscarMapaUnidades({ id_projeto: filtros.id_projeto, status: filtros.status, categoria: filtros.categoria })
            .then((lista) => {
                if (!ativo) return;
                setResultado({ chave, unidades: lista });
                setOcultos(new Set());
            })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setResultado({ chave, unidades: [] });
                erro(mensagemDeErro(falha, 'Falha ao carregar as unidades.'));
            });
        return () => { ativo = false; };
        // "filtros" muda junto com a chave.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chave]);

    const produtos = useMemo(() => {
        const unicos = new Map(unidades.flatMap((unidade) => unidade.produtos).map((produto) => [produto.id_produto, produto]));
        return [...unicos.values()].sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'));
    }, [unidades]);
    const cores = useMemo(() => mapaDeCores(produtos) as Record<number, string>, [produtos]);
    const corDe = (id: number) => (id === SEM_PRODUTO ? COR_SEM_PRODUTO : cores[id] ?? COR_SEM_PRODUTO);
    const municipios = useMemo(() => {
        const unicos = new Map(unidades.filter((unidade) => unidade.id_cidade).map((unidade) => [unidade.id_cidade, nomeLocal(unidade)]));
        return [...unicos.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    }, [unidades]);

    const produtosVisiveis = useMemo(() => (unidade: UnidadeMapa): number[] => {
        if (filtros.id_produto !== 'Todos') {
            const id = Number(filtros.id_produto);
            return unidade.produtos.some((produto) => produto.id_produto === id) ? [id] : [];
        }
        if (!unidade.produtos.length) return ocultos.has(SEM_PRODUTO) ? [] : [SEM_PRODUTO];
        return unidade.produtos.map((produto) => produto.id_produto).filter((id) => !ocultos.has(id));
    }, [filtros.id_produto, ocultos]);

    const filtradas = useMemo(() => unidades.filter((unidade) => (filtros.id_cidade === 'Todos' || String(unidade.id_cidade) === filtros.id_cidade)
        && (filtros.localizacao !== 'Exata' || !unidade.aproximada)
        && (filtros.localizacao !== 'Aproximada' || unidade.aproximada)
        && produtosVisiveis(unidade).length > 0), [unidades, filtros.id_cidade, filtros.localizacao, produtosVisiveis]);

    const grupos = useMemo(() => agruparPorCoordenada(filtradas) as { chave: string; lat: number; lng: number; unidades: UnidadeMapa[] }[], [filtradas]);
    const pontos = useMemo(() => grupos.map((grupo): LatLngTuple => [grupo.lat, grupo.lng]), [grupos]);
    const semCoordenada = filtradas.filter((unidade) => unidade.latitude === null || unidade.longitude === null);
    const resumo = {
        unidades: filtradas.length,
        exatas: filtradas.filter((unidade) => !unidade.aproximada).length,
        aproximadas: filtradas.filter((unidade) => unidade.aproximada && unidade.latitude !== null).length,
        municipios: new Set(filtradas.map((unidade) => unidade.id_cidade).filter(Boolean)).size,
        produtos: new Set(filtradas.flatMap((unidade) => unidade.produtos.map((produto) => produto.id_produto))).size
    };
    const temProduto = (lista: UnidadeMapa[], id: number) => lista.filter((unidade) => (id === SEM_PRODUTO ? !unidade.produtos.length : unidade.produtos.some((produto) => produto.id_produto === id))).length;
    const projetosCategoria = filtros.categoria === 'Todas' ? projetos : projetos.filter((projeto) => categoriaDe(projeto) === filtros.categoria);
    const nomeProjeto = filtros.id_projeto === 'Todos' ? `Categoria ${filtros.categoria}: todos os projetos` : projetos.find((projeto) => String(projeto.id_projeto) === filtros.id_projeto)?.nome_projeto ?? '';
    const nomeProduto = filtros.id_produto === 'Todos' ? 'Todos os produtos' : produtos.find((produto) => String(produto.id_produto) === filtros.id_produto)?.nome_produto ?? '';
    const subtitulo = `${nomeProjeto || 'Projeto'} · ${nomeProduto}${filtros.id_cidade === 'Todos' ? '' : ` · ${municipios.find(([id]) => String(id) === filtros.id_cidade)?.[1] ?? ''}`}`;
    const legenda = filtros.id_produto === 'Todos'
        ? [...produtos, ...(temProduto(unidades, SEM_PRODUTO) ? [{ id_produto: SEM_PRODUTO, nome_produto: 'Sem produto vinculado' }] : [])]
        : produtos.filter((produto) => String(produto.id_produto) === filtros.id_produto);
    const arquivo = `Mapa_Unidades_${(nomeProjeto || 'projeto').replace(/\s+/g, '_')}`;

    const alternarLegenda = (id: number) => {
        if (filtros.id_produto !== 'Todos') return;
        setOcultos((atuais) => (atuais.has(id) ? new Set([...atuais].filter((item) => item !== id)) : new Set([...atuais, id])));
    };
    const alterar = (campo: 'id_projeto' | 'id_produto' | 'id_cidade' | 'status' | 'localizacao', valor: string) => setFiltros((atual) => ({ ...atual, [campo]: valor, ...(campo === 'id_projeto' && { id_produto: 'Todos', id_cidade: 'Todos' }) }));
    const mudarCategoria = (categoria: string) => {
        const atual = projetos.find((projeto) => String(projeto.id_projeto) === filtros.id_projeto);
        const mantem = atual && (categoria === 'Todas' || categoriaDe(atual) === categoria);
        let idProjeto = categoria === 'Todas' ? '' : 'Todos';
        if (mantem) idProjeto = filtros.id_projeto;
        setFiltros({ ...filtros, categoria, id_projeto: idProjeto, ...(idProjeto !== filtros.id_projeto && { id_produto: 'Todos', id_cidade: 'Todos' }) });
    };
    const verNoMapa = (unidade: UnidadeMapa) => {
        if (unidade.latitude === null || unidade.longitude === null) return;
        mapa.current?.flyTo([unidade.latitude, unidade.longitude], 16, { animate: true, duration: 1.2 });
        caixaMapa.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    const seHouverDados = (acao: () => void) => {
        if (filtradas.length) acao();
        else aviso('Selecione um projeto com unidades para exportar.');
    };

    const pdf = () => gerarPdf({
        titulo: 'Mapa de Unidades', periodo: subtitulo, usuario, arquivo,
        preencher: async (documento) => {
            const foto = await capturarMapa(caixaMapa.current);
            if (foto) {
                const maximo = documento.H - documento.cursor.y - 16;
                const alturaLivre = (foto.altura / foto.largura) * documento.CW;
                const altura = Math.min(alturaLivre, maximo);
                const largura = alturaLivre > maximo ? (foto.largura / foto.altura) * altura : documento.CW;
                documento.doc.addImage(foto.imagem, 'JPEG', documento.M + (documento.CW - largura) / 2, documento.cursor.y, largura, altura);
                documento.cursor.y += altura + 4;
                documento.texto('Marcador tracejado = localização aproximada (centro do município). Número no marcador = unidades no mesmo ponto.', { italic: true });
            }
            documento.doc.addPage();
            documento.cursor.y = documento.M;
            documento.bloco('Indicadores', documento.colors.green);
            documento.tabela(ajustarColunas(documento, [{ h: 'Unidades', w: 40, a: 'c' }, { h: 'Coordenada exata', w: 40, a: 'c' }, { h: 'Aproximadas', w: 40, a: 'c' }, { h: 'Municípios', w: 40, a: 'c' }, { h: 'Produtos', w: 40, a: 'c' }]),
                [[String(resumo.unidades), String(resumo.exatas), String(resumo.aproximadas), String(resumo.municipios), String(resumo.produtos)]]);
            documento.bloco('Unidades por produto', documento.colors.green);
            documento.tabela(ajustarColunas(documento, [{ h: 'Produto', w: 160, a: 'l' }, { h: 'Cor', w: 30, a: 'c' }, { h: 'Unidades', w: 40, a: 'c' }]), legenda.map((produto): Celula[] => {
                const hex = corDe(produto.id_produto);
                return [produto.nome_produto, { t: '●', bold: true, color: hexParaRgb(hex) }, String(temProduto(filtradas, produto.id_produto))];
            }));
            documento.bloco(`Unidades (${filtradas.length})`, documento.colors.blue);
            documento.tabela(ajustarColunas(documento, [{ h: 'Unidade', w: 80, a: 'l' }, { h: 'CNES', w: 22, a: 'c' }, { h: 'Município/UF', w: 45, a: 'l' }, { h: 'Produtos', w: 75, a: 'l' }, { h: 'Latitude', w: 24, a: 'c' }, { h: 'Longitude', w: 24, a: 'c' }, { h: 'Localização', w: 24, a: 'c' }]),
                filtradas.map((unidade): Celula[] => [unidade.nome_unidade, unidade.cnes || '-', nomeLocal(unidade), unidade.produtos.map((produto) => produto.nome_produto).join(', ') || '-', fmtCoord(unidade.latitude), fmtCoord(unidade.longitude), unidade.aproximada ? { t: 'Aproximada', color: [138, 82, 18], bold: true } : { t: 'Exata', color: documento.colors.green, bold: true }]));
        }
    });

    const excel = () => gerarExcel([{
        nome: 'Unidades',
        linhas: filtradas.map((unidade) => ({
            Projeto: unidade.nome_projeto, Unidade: unidade.nome_unidade, CNES: unidade.cnes ?? '', Município: unidade.nome_cidade ?? '', UF: unidade.uf ?? '',
            Produtos: unidade.produtos.map((produto) => produto.nome_produto).join(', '), Latitude: unidade.latitude, Longitude: unidade.longitude,
            Localização: unidade.aproximada ? 'Aproximada (centro do município)' : 'Exata', Status: unidade.ativo ? 'Ativa' : 'Inativa'
        }))
    }], `${arquivo}.xlsx`);

    return (
        <ModeloRelatorio
            chave="mapa_unidades"
            titulo="Mapa de Unidades"
            aoPdf={() => seHouverDados(() => { void pdf(); })}
            aoJpg={() => seHouverDados(() => { void exportarCaptura(folha, 'Mapa_Unidades', { larguraFixa: LARGURA_A4_PAISAGEM }); })}
            aoExcel={() => seHouverDados(() => { void excel(); })}
            filtros={(
                <>
                    <Field rotulo="Categoria" htmlFor="mu-categoria"><Select id="mu-categoria" value={filtros.categoria} onChange={(e) => mudarCategoria(e.target.value)}><OpcoesCategoria /></Select></Field>
                    <Field rotulo="Projeto" htmlFor="mu-projeto" className="col-span-2">
                        <Select id="mu-projeto" value={filtros.id_projeto} onChange={(e) => alterar('id_projeto', e.target.value)}>
                            {filtros.categoria === 'Todas' ? <option value="">Selecione o projeto</option> : <option value="Todos">Todos da categoria {filtros.categoria}</option>}
                            {projetosCategoria.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Produto" htmlFor="mu-produto">
                        <Select id="mu-produto" disabled={!produtos.length} value={filtros.id_produto} onChange={(e) => alterar('id_produto', e.target.value)}>
                            <option value="Todos">Todos os produtos</option>
                            {produtos.map((produto) => <option key={produto.id_produto} value={produto.id_produto}>{produto.nome_produto}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Município" htmlFor="mu-municipio">
                        <Select id="mu-municipio" disabled={!municipios.length} value={filtros.id_cidade} onChange={(e) => alterar('id_cidade', e.target.value)}>
                            <option value="Todos">Todos os municípios</option>
                            {municipios.map(([id, nome]) => <option key={id} value={String(id)}>{nome}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Status da unidade" htmlFor="mu-status">
                        <Select id="mu-status" value={filtros.status} onChange={(e) => alterar('status', e.target.value)}><option value="true">Ativas</option><option value="false">Inativas</option><option value="Todos">Todas</option></Select>
                    </Field>
                    <Field rotulo="Localização" htmlFor="mu-localizacao">
                        <Select id="mu-localizacao" value={filtros.localizacao} onChange={(e) => alterar('localizacao', e.target.value)}><option value="Todas">Exata e aproximada</option><option value="Exata">Somente coordenada exata</option><option value="Aproximada">Somente aproximada</option></Select>
                    </Field>
                </>
            )}
        >
            <Documento titulo="Mapa de Unidades" subtitulo={subtitulo} referencia={folha}>
                {!filtros.id_projeto && <AvisoDoc>Selecione um projeto para ver as unidades no mapa.</AvisoDoc>}
                {carregando && <AvisoDoc>Carregando unidades...</AvisoDoc>}
                {filtros.id_projeto && !carregando && (
                    <>
                        <FaixaIndicadores itens={[
                            { rotulo: 'Unidades', valor: resumo.unidades },
                            { rotulo: 'Coordenada exata', valor: resumo.exatas, detalhe: `${pct(resumo.exatas, resumo.unidades)}% georreferenciadas` },
                            { rotulo: 'Aproximadas', valor: resumo.aproximadas, cor: resumo.aproximadas ? '#8a5212' : undefined },
                            { rotulo: 'Municípios', valor: resumo.municipios },
                            { rotulo: 'Produtos', valor: resumo.produtos }
                        ]} />
                        <div ref={caixaMapa} className="mb-3 h-[440px] overflow-hidden rounded-[3px] border border-solid border-[#cbd5e1]">
                            <MapContainer ref={mapa} center={CENTRO_BRASIL as LatLngTuple} zoom={4} preferCanvas className="size-full">
                                <TileLayer url={TILE_URL} attribution={TILE_ATTR} crossOrigin="anonymous" />
                                <Enquadrar pontos={pontos} />
                                {grupos.map((grupo) => {
                                    const idsCores = [...new Set(grupo.unidades.flatMap(produtosVisiveis))];
                                    return (
                                        <Marker key={grupo.chave} position={[grupo.lat, grupo.lng]} icon={iconeUnidade(idsCores.slice(0, 8).map(corDe), grupo.unidades.length, grupo.unidades.every((unidade) => unidade.aproximada))}>
                                            <Popup maxHeight={320}>
                                                {grupo.unidades.map((unidade, indice) => (
                                                    <div key={unidade.id_unidade} className={cn('text-[12.5px] leading-normal', indice > 0 && 'mt-2 border-0 border-t border-solid border-line pt-2')}>
                                                        <h4 className="m-0 mb-1 text-sm font-semibold text-[#1b5e20]">{unidade.nome_unidade}</h4>
                                                        <p className="m-0">CNES: <b>{unidade.cnes || '-'}</b></p>
                                                        <p className="m-0">{nomeLocal(unidade)}</p>
                                                        <p className="m-0 my-1">{unidade.produtos.length ? unidade.produtos.map((produto) => <ChipDoc key={produto.id_produto} cor={corDe(produto.id_produto)}>{produto.nome_produto}</ChipDoc>) : <ChipDoc>Sem produto</ChipDoc>}</p>
                                                        <p className="m-0">{fmtCoord(unidade.latitude)}, {fmtCoord(unidade.longitude)}</p>
                                                        <p className="m-0"><Localizacao aproximada={unidade.aproximada} /></p>
                                                    </div>
                                                ))}
                                            </Popup>
                                        </Marker>
                                    );
                                })}
                            </MapContainer>
                        </div>
                        <div className="mb-6 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-[#334155]">
                            {legenda.map((produto) => (
                                <button key={produto.id_produto} type="button" disabled={filtros.id_produto !== 'Todos'} title={filtros.id_produto === 'Todos' ? 'Clique para ocultar ou exibir' : undefined} onClick={() => alternarLegenda(produto.id_produto)} className={cn('inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-sans text-xs text-[#334155] disabled:cursor-default', ocultos.has(produto.id_produto) && 'line-through opacity-50')}>
                                    <i className="size-2.5 rounded-full" style={{ background: corDe(produto.id_produto) }} />{produto.nome_produto} ({temProduto(unidades, produto.id_produto)})
                                </button>
                            ))}
                            <span className="inline-flex items-center gap-1.5"><i className="box-border size-2.5 rounded-full border border-dashed border-[#64748b]" /> Localização aproximada</span>
                        </div>
                        {semCoordenada.length > 0 && <p className="m-0 mb-5 text-[12.5px] text-[#8a5212]">{semCoordenada.length} unidade(s) sem coordenada e sem município georreferenciado, fora do mapa: {semCoordenada.map((unidade) => unidade.nome_unidade).join(', ')}.</p>}
                        <SecaoDoc titulo="Unidades" detalhe={`${filtradas.length} unidade(s)`}>
                            <TabelaDoc cabecalho={<><ThDoc>Unidade</ThDoc><ThDoc alinhar="centro">CNES</ThDoc><ThDoc>Município/UF</ThDoc><ThDoc>Produtos</ThDoc><ThDoc alinhar="direita">Latitude</ThDoc><ThDoc alinhar="direita">Longitude</ThDoc><ThDoc alinhar="centro">Localização</ThDoc><ThDoc alinhar="centro" data-sem-exportar="true">Ação</ThDoc></>}>
                                {filtradas.map((unidade) => (
                                    <tr key={unidade.id_unidade}>
                                        <TdDoc><b className="font-semibold">{unidade.nome_unidade}</b>{!unidade.ativo && <SubLinha>Inativa</SubLinha>}</TdDoc>
                                        <TdDoc alinhar="centro" className="tabular-nums">{unidade.cnes || '-'}</TdDoc>
                                        <TdDoc>{nomeLocal(unidade)}</TdDoc>
                                        <TdDoc>{unidade.produtos.length ? unidade.produtos.map((produto) => <ChipDoc key={produto.id_produto} cor={corDe(produto.id_produto)}>{produto.nome_produto}</ChipDoc>) : '-'}</TdDoc>
                                        <TdDoc alinhar="direita" className="tabular-nums">{fmtCoord(unidade.latitude)}</TdDoc>
                                        <TdDoc alinhar="direita" className="tabular-nums">{fmtCoord(unidade.longitude)}</TdDoc>
                                        <TdDoc alinhar="centro"><Localizacao aproximada={unidade.aproximada} /></TdDoc>
                                        <TdDoc alinhar="centro" data-sem-exportar="true">
                                            {unidade.latitude === null ? <span className="text-xs text-[#94a3b8]">Sem local</span> : <BotaoLinha icone="pin" aoClicar={() => verNoMapa(unidade)}>Ver</BotaoLinha>}
                                        </TdDoc>
                                    </tr>
                                ))}
                                {!filtradas.length && <tr><TdDoc colSpan={8} alinhar="centro" className="py-8 text-[#64748b]">Nenhuma unidade para os filtros selecionados.</TdDoc></tr>}
                            </TabelaDoc>
                        </SecaoDoc>
                    </>
                )}
            </Documento>
        </ModeloRelatorio>
    );
}
