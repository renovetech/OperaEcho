/* Auditoria de Localização (GPS) e Tempo Médio de Ação. */
import { useEffect, useRef, useState } from 'react';
import L, { type Map as MapaLeaflet } from 'leaflet';
import marcador from 'leaflet/dist/images/marker-icon.png';
import marcadorRetina from 'leaflet/dist/images/marker-icon-2x.png';
import sombra from 'leaflet/dist/images/marker-shadow.png';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { OPCOES_RESPONSAVEL } from '@/features/planoAcao/templates';
import { dataBR, fmtMin, STATUS_ITEM } from '@/features/planoAcao/formatos';
import * as relatoriosApi from '@/features/relatorios/api';
import type { DadosTempo, GrupoTempo, PontoAuditoria, ProjetoFiltro } from '@/features/relatorios/api';
import { AvisoDoc, BotaoLinha, CampoData, Documento, FaixaIndicadores, ModeloRelatorio, SecaoDoc, SeloDoc, SubLinha, TabelaDoc, TdDoc, ThDoc, useNomeUsuario } from '@/features/relatorios/componentes';
import { ajustarColunas, capturarMapa, exportarCaptura, gerarPdf, VERMELHO_PDF, type Celula } from '@/features/relatorios/exportacao';
import { periodoBloqueado } from '@/shared/periodo';
import { aviso, erro, mensagemDeErro } from '@/shared/feedback';
import { logErro } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Select } from '@/shared/ui/Campos';
import { hexParaRgb } from '@/shared/pdfRelatorio';

const ICONE = L.icon({ iconUrl: marcador, iconRetinaUrl: marcadorRetina, shadowUrl: sombra, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
const CENTRO_PADRAO: [number, number] = [-22.9068, -43.1729];
const LARGURA_A4_PAISAGEM = '297mm';
const TITULO_AUDITORIA = 'Auditoria de Localização (GPS)';
const ALTURA_MAPA_PDF_MM = 95;
const FILTRO_AUDITORIA = { dataInicio: '', dataFim: '', usuario: 'Todos', tipo_registro: 'Todos' };
const TIPOS_REGISTRO = [['CADASTRO_ATIVIDADE', 'Cadastro de Atividade'], ['LANCAMENTO_HORA_EXTRA', 'Hora Extra'], ['SEGUNDO_PLANO', 'Segundo Plano']];
const COR_RUIM = '#8f332f';
const COR_BOA = '#1b5e20';
const ACOES_NA_TELA = 15;
const ACOES_NO_PDF = 20;

/** "2026-05-01T10:00:00.000Z" -> "01/05/2026, 10:00:00", sem converter fuso: o banco já grava no horário de Brasília. */
function dataHoraBR(valor: string): string {
    if (!valor.includes('T')) return dataBR(valor);
    const [data = '', hora = ''] = valor.split('T');
    return `${dataBR(data)}, ${hora.split('.')[0]}`;
}

export function AuditoriaRelatorio() {
    const [filtros, setFiltros] = useState(FILTRO_AUDITORIA);
    const [pontos, setPontos] = useState<PontoAuditoria[]>([]);
    const [usuarios, setUsuarios] = useState<string[]>([]);
    const [carregando, setCarregando] = useState(false);
    const usuario = useNomeUsuario();
    const folha = useRef<HTMLDivElement>(null);
    const caixaMapa = useRef<HTMLDivElement>(null);
    const mapa = useRef<MapaLeaflet>(null);
    const primeiro = pontos.find((ponto) => ponto.latitude && ponto.longitude);
    const periodo = filtros.dataInicio ? `Período: ${dataBR(filtros.dataInicio)} até ${dataBR(filtros.dataFim)}` : 'Todo o histórico';

    useEffect(() => {
        relatoriosApi.buscarAuditoria({})
            .then((lista) => {
                setPontos(lista);
                setUsuarios([...new Set(lista.map((ponto) => ponto.usuario))].filter(Boolean));
            })
            .catch((falha: unknown) => logErro('Erro na auditoria', falha));
    }, []);

    const consultar = async (parametros: typeof FILTRO_AUDITORIA) => {
        setCarregando(true);
        try {
            const lista = await relatoriosApi.buscarAuditoria(parametros);
            setPontos(lista);
            return lista;
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha ao buscar dados de auditoria.'));
            return null;
        } finally {
            setCarregando(false);
        }
    };

    const gerar = async () => {
        if (!filtros.dataInicio !== !filtros.dataFim) {
            aviso('Informe a data inicial e a data final.');
            return;
        }
        if (periodoBloqueado(filtros.dataInicio, filtros.dataFim)) return;
        const lista = await consultar(filtros);
        if (lista && !lista.length) aviso('Nenhum registro de localização encontrado nesse período/filtro.', 'Informação');
    };

    const seHouverPontos = (acao: () => void) => {
        if (pontos.length) acao();
        else aviso('Nenhum dado na tela para exportar.');
    };

    const pdf = () => gerarPdf({
        titulo: TITULO_AUDITORIA, periodo, usuario,
        arquivo: `Auditoria_Localizacao_${filtros.dataInicio || 'historico'}`,
        preencher: async (documento) => {
            const foto = await capturarMapa(caixaMapa.current);
            if (foto) {
                const alturaLivre = (foto.altura / foto.largura) * documento.CW;
                const altura = Math.min(alturaLivre, ALTURA_MAPA_PDF_MM);
                const largura = (foto.largura / foto.altura) * altura;
                documento.doc.addImage(foto.imagem, 'JPEG', documento.M + (documento.CW - largura) / 2, documento.cursor.y, largura, altura);
                documento.cursor.y += altura + 6;
            }
            documento.bloco(`Registros · ${pontos.length} ponto(s)`);
            documento.tabela(
                ajustarColunas(documento, [{ h: 'Data e hora', w: 38, a: 'l' }, { h: 'Usuário', w: 62, a: 'l' }, { h: 'Tipo de registro', w: 113, a: 'l' }, { h: 'Latitude', w: 30, a: 'r' }, { h: 'Longitude', w: 30, a: 'r' }]),
                pontos.map((ponto): Celula[] => [
                    dataHoraBR(ponto.data_hora),
                    { t: ponto.usuario, bold: true },
                    [ponto.tipo_registro.replace(/_/g, ' '), ponto.detalhes_registro].filter(Boolean).join('\n'),
                    ponto.latitude || '-',
                    ponto.longitude || '-'
                ])
            );
        }
    });

    return (
        <ModeloRelatorio
            chave="auditoria_localizacao"
            titulo={TITULO_AUDITORIA}
            aoFiltrar={gerar}
            carregando={carregando}
            aoPdf={() => seHouverPontos(() => { void pdf(); })}
            aoJpg={() => seHouverPontos(() => { void exportarCaptura(folha, 'Relatorio_auditoria_localizacao', { larguraFixa: LARGURA_A4_PAISAGEM }); })}
            acaoExtra={<Button variant="ghost" size="sm" disabled={carregando} onClick={() => { setFiltros(FILTRO_AUDITORIA); void consultar(FILTRO_AUDITORIA); }}>Limpar filtros</Button>}
            filtros={(
                <>
                    <CampoData rotulo="Data início" id="ra-inicio" valor={filtros.dataInicio} aoMudar={(dataInicio) => setFiltros({ ...filtros, dataInicio })} />
                    <CampoData rotulo="Data fim" id="ra-fim" valor={filtros.dataFim} aoMudar={(dataFim) => setFiltros({ ...filtros, dataFim })} />
                    <Field rotulo="Usuário" htmlFor="ra-usuario">
                        <Select id="ra-usuario" value={filtros.usuario} onChange={(e) => setFiltros({ ...filtros, usuario: e.target.value })}>
                            <option value="Todos">Todos os usuários</option>
                            {usuarios.map((usuario) => <option key={usuario}>{usuario}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Tipo de registro" htmlFor="ra-tipo">
                        <Select id="ra-tipo" value={filtros.tipo_registro} onChange={(e) => setFiltros({ ...filtros, tipo_registro: e.target.value })}>
                            <option value="Todos">Todos os tipos</option>
                            {TIPOS_REGISTRO.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                        </Select>
                    </Field>
                </>
            )}
        >
            <Documento titulo={TITULO_AUDITORIA} subtitulo={periodo} referencia={folha}>
                <div ref={caixaMapa} className="mb-6 h-[400px] overflow-hidden rounded-[3px] border border-solid border-[#cbd5e1]">
                    <MapContainer key={primeiro ? 'com-pontos' : 'vazio'} ref={mapa} center={primeiro?.latitude && primeiro.longitude ? [primeiro.latitude, primeiro.longitude] : CENTRO_PADRAO} zoom={primeiro ? 10 : 4} className="size-full">
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
                        {pontos.filter((ponto) => ponto.latitude && ponto.longitude).map((ponto) => (
                            <Marker key={ponto.id_rastreio} icon={ICONE} position={[Number(ponto.latitude), Number(ponto.longitude)]}>
                                <Popup><strong>{ponto.usuario}</strong><br />{dataHoraBR(ponto.data_hora)}<br />{ponto.tipo_registro}</Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                </div>
                <SecaoDoc titulo="Registros" detalhe={`${pontos.length} ponto(s)`}>
                    <TabelaDoc cabecalho={<><ThDoc>Data e hora</ThDoc><ThDoc>Usuário</ThDoc><ThDoc>Tipo de registro</ThDoc><ThDoc alinhar="direita">Latitude</ThDoc><ThDoc alinhar="direita">Longitude</ThDoc><ThDoc alinhar="centro" data-sem-exportar="true">Ação</ThDoc></>}>
                        {pontos.map((ponto) => (
                            <tr key={ponto.id_rastreio}>
                                <TdDoc className="whitespace-nowrap tabular-nums">{dataHoraBR(ponto.data_hora)}</TdDoc>
                                <TdDoc className="font-semibold">{ponto.usuario}</TdDoc>
                                <TdDoc>{ponto.tipo_registro.replace(/_/g, ' ')}{ponto.detalhes_registro && <SubLinha>{ponto.detalhes_registro}</SubLinha>}</TdDoc>
                                <TdDoc alinhar="direita" className="tabular-nums">{ponto.latitude || '-'}</TdDoc>
                                <TdDoc alinhar="direita" className="tabular-nums">{ponto.longitude || '-'}</TdDoc>
                                <TdDoc alinhar="centro" data-sem-exportar="true">
                                    {ponto.latitude && ponto.longitude
                                        ? <BotaoLinha icone="pin" aoClicar={() => mapa.current?.flyTo([Number(ponto.latitude), Number(ponto.longitude)], 16, { animate: true, duration: 1.5 })}>Ver</BotaoLinha>
                                        : <span className="text-xs text-[#94a3b8]">Sem GPS</span>}
                                </TdDoc>
                            </tr>
                        ))}
                        {!pontos.length && <tr><TdDoc colSpan={6} alinhar="centro" className="py-8 text-[#64748b]">Nenhum registro encontrado no sistema.</TdDoc></tr>}
                    </TabelaDoc>
                </SecaoDoc>
            </Documento>
        </ModeloRelatorio>
    );
}

const CLASSIFICACAO: Record<string, { rotulo: string; cor: string }> = {
    ESTOURADO: { rotulo: 'Estourado', cor: '#8f332f' },
    'NA MEDIA': { rotulo: 'Na média', cor: '#8a5212' },
    LEGAL: { rotulo: 'No prazo', cor: '#1b5e20' },
    'SEM DADOS': { rotulo: 'Sem dados', cor: '#64748b' }
};
const SEM_CLASSE = 'SEM DADOS';

function fmtDesvio(minutos: number): string {
    const total = Math.round(Number(minutos) || 0);
    if (total === 0) return '0min';
    return `${total > 0 ? '+' : '−'}${fmtMin(Math.abs(total))}`;
}
const corDesvio = (minutos: number) => (minutos > 0 ? COR_RUIM : COR_BOA);

function TabelaGrupoTempo({ rotulo, linhas }: { rotulo: string; linhas: (GrupoTempo & { nome: string })[] }) {
    return (
        <TabelaDoc cabecalho={<><ThDoc>{rotulo}</ThDoc><ThDoc alinhar="centro">Itens</ThDoc><ThDoc alinhar="centro">Média prev.</ThDoc><ThDoc alinhar="centro">Média gasto</ThDoc><ThDoc alinhar="centro">Desvio médio</ThDoc><ThDoc alinhar="centro">Estourados</ThDoc></>}>
            {linhas.map((linha) => (
                <tr key={linha.nome}>
                    <TdDoc>{linha.nome}</TdDoc>
                    <TdDoc alinhar="centro" className="tabular-nums">{linha.qtd}</TdDoc>
                    <TdDoc alinhar="centro" className="tabular-nums">{fmtMin(linha.media_previsto)}</TdDoc>
                    <TdDoc alinhar="centro" className="tabular-nums">{fmtMin(linha.media_gasto)}</TdDoc>
                    <TdDoc alinhar="centro" className="font-semibold tabular-nums"><span style={{ color: corDesvio(linha.media_desvio) }}>{fmtDesvio(linha.media_desvio)}</span></TdDoc>
                    <TdDoc alinhar="centro" className="tabular-nums">{linha.estourados}</TdDoc>
                </tr>
            ))}
        </TabelaDoc>
    );
}

export function TempoMedioRelatorio() {
    const usuario = useNomeUsuario();
    const [projetos, setProjetos] = useState<ProjetoFiltro[]>([]);
    const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '', id_projeto: 'Todos', responsavel: 'Todos', status: 'Todos' });
    const [dados, setDados] = useState<DadosTempo | null>(null);
    const [carregando, setCarregando] = useState(false);
    const folha = useRef<HTMLDivElement>(null);
    const periodo = `Período: ${dataBR(filtros.dataInicio)} até ${dataBR(filtros.dataFim)}`;
    const temDados = Boolean(dados?.itens.length);

    useEffect(() => {
        relatoriosApi.listarProjetos().then(setProjetos).catch((falha: unknown) => logErro('Erro ao listar projetos', falha));
    }, []);

    const gerar = async () => {
        if (!filtros.dataInicio || !filtros.dataFim) {
            aviso('Selecione o período de datas.');
            return;
        }
        if (periodoBloqueado(filtros.dataInicio, filtros.dataFim)) return;
        setCarregando(true);
        try {
            const resposta = await relatoriosApi.buscarTempoMedio(filtros);
            setDados(resposta);
            if (!resposta.itens.length) aviso('Nenhum item de plano encontrado com os filtros aplicados.', 'Informação');
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha ao buscar dados de tempo.'));
        } finally {
            setCarregando(false);
        }
    };

    const pdf = () => {
        if (!dados || !temDados) { aviso('Gere o relatório primeiro.'); return; }
        const { resumo: r } = dados;
        void gerarPdf({
            titulo: 'Tempo Médio de Ação', periodo, usuario,
            arquivo: `Tempo_Medio_Acao_${filtros.dataInicio || 'periodo'}`,
            preencher: (documento) => {
                const corPdf = (minutos: number) => (minutos > 0 ? VERMELHO_PDF : documento.colors.green);
                documento.kpis([
                    { num: String(r.com_dados), lbl: 'Execuções avaliadas', sub: `${r.sem_dados} sem dados` },
                    { num: fmtMin(r.media_previsto), lbl: 'Média prevista' },
                    { num: fmtMin(r.media_gasto), lbl: 'Média gasta' },
                    { num: fmtDesvio(r.media_desvio), lbl: 'Desvio médio', c: corPdf(r.media_desvio) }
                ]);
                documento.kpis([
                    { num: String(r.qtd_estourado), lbl: 'Estourado', sub: `média ${fmtMin(r.media_tempo_estourado)}`, c: VERMELHO_PDF },
                    { num: String(r.qtd_na_media), lbl: 'Na média', sub: `média ${fmtMin(r.media_tempo_na_media)}`, c: [138, 82, 18] },
                    { num: String(r.qtd_legal), lbl: 'No prazo', sub: `média ${fmtMin(r.media_tempo_legal)}` }
                ]);
                const linhaGrupo = (nome: string, linha: GrupoTempo): Celula[] => [nome, String(linha.qtd), fmtMin(linha.media_previsto), fmtMin(linha.media_gasto), { t: fmtDesvio(linha.media_desvio), color: corPdf(linha.media_desvio), bold: true }, String(linha.estourados)];
                documento.bloco('Ranking por Responsável (maior desvio primeiro)');
                documento.tabela(ajustarColunas(documento, [{ h: 'Responsável', w: 88, a: 'l' }, { h: 'Itens', w: 22, a: 'c' }, { h: 'Média prev.', w: 38, a: 'c' }, { h: 'Média gasto', w: 38, a: 'c' }, { h: 'Desvio médio', w: 47, a: 'c' }, { h: 'Estourados', w: 40, a: 'c' }]), dados.porResponsavel.map((linha) => linhaGrupo(linha.responsavel, linha)));
                documento.bloco('Ações Mais Demoradas (maior tempo gasto primeiro)');
                documento.tabela(ajustarColunas(documento, [{ h: 'Ação', w: 118, a: 'l' }, { h: 'Ocorr.', w: 20, a: 'c' }, { h: 'Média prev.', w: 35, a: 'c' }, { h: 'Média gasto', w: 35, a: 'c' }, { h: 'Desvio médio', w: 45, a: 'c' }, { h: 'Estour.', w: 20, a: 'c' }]), dados.porAcao.slice(0, ACOES_NO_PDF).map((linha) => linhaGrupo(linha.descricao, linha)));
                documento.bloco(`Detalhe por Execução (${dados.itens.length} itens)`);
                documento.tabela(ajustarColunas(documento, [{ h: 'Projeto', w: 42, a: 'l' }, { h: 'Ação', w: 96, a: 'l' }, { h: 'Responsável', w: 42, a: 'l' }, { h: 'Prev.', w: 21, a: 'c' }, { h: 'Gasto', w: 21, a: 'c' }, { h: 'Desvio', w: 26, a: 'c' }, { h: 'Classif.', w: 25, a: 'c' }]), dados.itens.map((item): Celula[] => {
                    const classe = CLASSIFICACAO[item.classificacao] ?? CLASSIFICACAO[SEM_CLASSE];
                    return [
                        item.nome_projeto || '-', `${item.descricao}${item.modulo ? `  [${item.modulo}]` : ''}`, item.responsavel || '-', fmtMin(item.previsto_min), fmtMin(item.gasto_min),
                        item.classificacao === SEM_CLASSE ? '-' : { t: fmtDesvio(item.desvio_min), color: corPdf(item.desvio_min), bold: true },
                        { t: classe?.rotulo ?? item.classificacao, color: hexParaRgb(classe?.cor ?? '#64748b'), bold: true }
                    ];
                }));
                documento.texto('Base: previsto e gasto em horas (hh:mm). Estourado, Na média e No prazo usam tolerância de ±10% sobre o previsto.', { italic: true });
            }
        });
    };

    return (
        <ModeloRelatorio
            chave="tempo_medio_acao"
            titulo="Tempo Médio de Ação"
            aoFiltrar={gerar}
            carregando={carregando}
            aoPdf={pdf}
            aoJpg={() => { if (temDados) void exportarCaptura(folha, 'Relatorio_tempo_medio_acao'); else aviso('Gere o relatório primeiro.'); }}
            filtros={(
                <>
                    <CampoData rotulo="Data início" id="rt-inicio" valor={filtros.dataInicio} aoMudar={(dataInicio) => setFiltros({ ...filtros, dataInicio })} />
                    <CampoData rotulo="Data fim" id="rt-fim" valor={filtros.dataFim} aoMudar={(dataFim) => setFiltros({ ...filtros, dataFim })} />
                    <Field rotulo="Projeto" htmlFor="rt-projeto">
                        <Select id="rt-projeto" value={filtros.id_projeto} onChange={(e) => setFiltros({ ...filtros, id_projeto: e.target.value })}>
                            <option value="Todos">Todos os projetos</option>
                            {projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Responsável" htmlFor="rt-responsavel">
                        <Select id="rt-responsavel" value={filtros.responsavel} onChange={(e) => setFiltros({ ...filtros, responsavel: e.target.value })}>
                            <option value="Todos">Todos</option>
                            {(OPCOES_RESPONSAVEL as string[]).map((opcao) => <option key={opcao}>{opcao}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Situação" htmlFor="rt-status">
                        <Select id="rt-status" value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
                            <option value="Todos">Todas</option>
                            {STATUS_ITEM.map((status) => <option key={status}>{status}</option>)}
                        </Select>
                    </Field>
                </>
            )}
        >
            <Documento titulo="Tempo Médio de Ação" subtitulo={periodo} referencia={folha}>
                {(!dados || !temDados) && <AvisoDoc>Selecione um período e gere o relatório.</AvisoDoc>}
                {dados && temDados && (
                    <>
                        <FaixaIndicadores itens={[
                            { rotulo: 'Execuções avaliadas', valor: dados.resumo.com_dados, detalhe: `${dados.resumo.sem_dados} sem dados de tempo` },
                            { rotulo: 'Média prevista', valor: fmtMin(dados.resumo.media_previsto) },
                            { rotulo: 'Média gasta', valor: fmtMin(dados.resumo.media_gasto) },
                            { rotulo: 'Desvio médio', valor: fmtDesvio(dados.resumo.media_desvio), cor: corDesvio(dados.resumo.media_desvio) },
                            { rotulo: 'Estourado', valor: dados.resumo.qtd_estourado, detalhe: `média ${fmtMin(dados.resumo.media_tempo_estourado)}`, cor: COR_RUIM },
                            { rotulo: 'Na média', valor: dados.resumo.qtd_na_media, detalhe: `média ${fmtMin(dados.resumo.media_tempo_na_media)}`, cor: '#8a5212' },
                            { rotulo: 'No prazo', valor: dados.resumo.qtd_legal, detalhe: `média ${fmtMin(dados.resumo.media_tempo_legal)}`, cor: COR_BOA }
                        ]} />
                        <SecaoDoc titulo="Ranking por responsável" detalhe="Maior desvio primeiro">
                            <TabelaGrupoTempo rotulo="Responsável" linhas={dados.porResponsavel.map((linha) => ({ ...linha, nome: linha.responsavel }))} />
                        </SecaoDoc>
                        <SecaoDoc titulo="Ações mais demoradas" detalhe="Maior tempo gasto primeiro">
                            <TabelaGrupoTempo rotulo="Ação" linhas={dados.porAcao.slice(0, ACOES_NA_TELA).map((linha) => ({ ...linha, nome: linha.descricao }))} />
                        </SecaoDoc>
                        <SecaoDoc titulo="Detalhe por execução" detalhe={`${dados.itens.length} itens`}>
                            <TabelaDoc cabecalho={<><ThDoc>Projeto</ThDoc><ThDoc>Ação</ThDoc><ThDoc>Responsável</ThDoc><ThDoc alinhar="centro">Prev.</ThDoc><ThDoc alinhar="centro">Gasto</ThDoc><ThDoc alinhar="centro">Desvio</ThDoc><ThDoc alinhar="centro">Classificação</ThDoc></>}>
                                {dados.itens.map((item) => {
                                    const classe = CLASSIFICACAO[item.classificacao];
                                    return (
                                        <tr key={item.id_item}>
                                            <TdDoc className="text-xs">{item.nome_projeto || '-'}</TdDoc>
                                            <TdDoc className="text-xs">{item.descricao}{item.modulo && <SubLinha>{item.modulo}</SubLinha>}</TdDoc>
                                            <TdDoc className="text-xs">{item.responsavel || '-'}</TdDoc>
                                            <TdDoc alinhar="centro" className="tabular-nums">{fmtMin(item.previsto_min)}</TdDoc>
                                            <TdDoc alinhar="centro" className="tabular-nums">{fmtMin(item.gasto_min)}</TdDoc>
                                            <TdDoc alinhar="centro" className="font-semibold tabular-nums"><span style={{ color: corDesvio(item.desvio_min) }}>{item.classificacao === SEM_CLASSE ? '-' : fmtDesvio(item.desvio_min)}</span></TdDoc>
                                            <TdDoc alinhar="centro"><SeloDoc cor={classe?.cor ?? '#64748b'}>{classe?.rotulo ?? item.classificacao}</SeloDoc></TdDoc>
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
