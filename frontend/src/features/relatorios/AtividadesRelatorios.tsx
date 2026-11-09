/* Estatísticas (Implantação e Projetos) e Presença (por implantador e por equipe). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { dataBR } from '@/features/planoAcao/formatos';
import { fmtMin } from '@/features/planoAcao/formatos';
import * as relatoriosApi from '@/features/relatorios/api';
import type { LinhaEstatistica, LinhaPresenca, ProjetoFiltro, UnidadeFiltro } from '@/features/relatorios/api';
import { AvisoDoc, CampoData, Documento, FaixaIndicadores, ModeloRelatorio, SecaoDoc, TabelaDoc, TdDoc, ThDoc, useNomeUsuario } from '@/features/relatorios/componentes';
import { ajustarColunas, exportarCaptura, gerarPdf, type Celula, type ColunaPdf } from '@/features/relatorios/exportacao';
import { periodoBloqueado } from '@/shared/periodo';
import { listarUnidadesDoProjeto } from '@/shared/catalogos';
import { aviso, erro, mensagemDeErro } from '@/shared/feedback';
import { useListaPorCodigo } from '@/shared/hooks';
import { logErro } from '@/shared/lib';
import { Checkbox, Field, Select } from '@/shared/ui/Campos';

const MOTIVOS = ['Implantação', 'Treinamento', 'Visita Técnica', 'Apoio ao Projeto'];
const SEM_DADOS = 'Gere o relatório primeiro.';

/** Muitos projetos já se chamam "Projeto X": a palavra não se repete no título. */
const rotuloDoProjeto = (nome: string) => (/^projeto\b/i.test(nome) ? nome : `Projeto ${nome}`);

const CampoMotivo = ({ id, valor, aoMudar }: { id: string; valor: string; aoMudar: (valor: string) => void }) => (
    <Field rotulo="Motivo" htmlFor={id}>
        <Select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)}>
            <option value="Todos">Todos os motivos</option>
            {MOTIVOS.map((motivo) => <option key={motivo}>{motivo}</option>)}
        </Select>
    </Field>
);

function useProjetos(): ProjetoFiltro[] {
    const [projetos, setProjetos] = useState<ProjetoFiltro[]>([]);
    useEffect(() => {
        relatoriosApi.listarProjetos().then(setProjetos).catch((falha: unknown) => logErro('Erro ao listar projetos', falha));
    }, []);
    return projetos;
}

const minutosDe = (tempo?: string | null) => {
    if (!tempo?.includes(':')) return 0;
    const [horas = '0', minutos = '0'] = tempo.split(':');
    return (Number.parseInt(horas, 10) || 0) * 60 + (Number.parseInt(minutos, 10) || 0);
};
const somarMinutos = (lista: LinhaEstatistica[]) => lista.reduce((soma, item) => soma + minutosDe(item.tempo_gasto), 0);
const somarProfissionais = (lista: LinhaEstatistica[]) => lista.reduce((soma, item) => soma + (Number.parseInt(String(item.profissionais_env ?? ''), 10) || 0), 0);
const unicos = <T,>(lista: T[]) => [...new Set(lista)];

/** Datas podem vir em dd/mm/aaaa ou ISO; a ordenação é sempre por data. */
function tempoDaData(valor?: string | null): number {
    if (!valor) return 0;
    if (valor.includes('/')) {
        const [dia, mes, ano] = valor.split('/');
        return new Date(`${ano}-${mes}-${dia}T00:00:00`).getTime();
    }
    return new Date(valor).getTime();
}
const dataTela = (valor?: string | null) => (valor?.includes('/') ? valor : dataBR(valor));

export function EstatisticasRelatorio({ deProjetos }: { deProjetos: boolean }) {
    const titulo = deProjetos ? 'Estatística dos Projetos' : 'Estatísticas da Implantação';
    const rotuloEquipe = deProjetos ? 'Operador(es)/Analista(s)' : 'Implantador(es)';
    const usuario = useNomeUsuario();
    const projetos = useProjetos();
    const [unidades, setUnidades] = useState<UnidadeFiltro[]>([]);
    const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '', motivo: 'Todos', projeto: 'Todos', unidade: 'Todas' });
    const [colunas, setColunas] = useState({ equipe: false, profissionais: false, equipeProjeto: false });
    const [dados, setDados] = useState<LinhaEstatistica[]>([]);
    const [carregando, setCarregando] = useState(false);
    const folha = useRef<HTMLDivElement>(null);
    const periodo = `Período: ${dataBR(filtros.dataInicio)} até ${dataBR(filtros.dataFim)}`;
    const verEquipeProjeto = !deProjetos && colunas.equipeProjeto;
    const equipeDe = (linha: LinhaEstatistica) => (deProjetos ? linha.operadores_analistas : linha.implantadores) || '---';

    useEffect(() => {
        relatoriosApi.listarTodasUnidades().then(setUnidades).catch((falha: unknown) => logErro('Erro ao listar unidades', falha));
    }, []);

    const unidadesFiltradas = filtros.projeto === 'Todos' ? unidades : unidades.filter((unidade) => String(unidade.id_projeto) === filtros.projeto);

    const gerar = async () => {
        if (!filtros.dataInicio || !filtros.dataFim) {
            aviso('Selecione o período de datas.');
            return;
        }
        if (periodoBloqueado(filtros.dataInicio, filtros.dataFim)) return;
        setCarregando(true);
        try {
            const resposta = await relatoriosApi.buscarEstatisticas(deProjetos, filtros);
            const lista = resposta
                .filter((linha) => filtros.motivo === 'Todos' || linha.motivos === filtros.motivo)
                .sort((a, b) => tempoDaData(a.data_inicial) - tempoDaData(b.data_inicial));
            setDados(lista);
            if (!lista.length) aviso('Nenhum dado encontrado com os filtros aplicados.', 'Informação');
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha ao buscar dados.'));
        } finally {
            setCarregando(false);
        }
    };

    const pdf = () => {
        if (!dados.length) { aviso(SEM_DADOS); return; }
        void gerarPdf({
            titulo, usuario,
            periodo,
            arquivo: `${deProjetos ? 'Estatisticas_Projetos' : 'Estatisticas'}_${filtros.dataInicio || 'periodo'}`,
            preencher: (documento) => {
                const cols = (): ColunaPdf[] => ajustarColunas(documento, [
                    { h: 'Unidade', w: 100, a: 'l' }, { h: 'Produto(s)', w: 75, a: 'l' },
                    ...(colunas.equipe ? [{ h: rotuloEquipe, w: 75, a: 'l' as const }] : []),
                    ...(verEquipeProjeto ? [{ h: 'Equipe Projeto', w: 75, a: 'l' as const }] : []),
                    ...(colunas.profissionais ? [{ h: 'Profissionais Cap.', w: 40, a: 'c' as const }] : []),
                    { h: 'Data Reg.', w: 28, a: 'c' }, { h: 'Tempo', w: 30, a: 'c' }
                ]);
                unicos(dados.map((linha) => linha.motivos)).forEach((motivo) => {
                    const doMotivo = dados.filter((linha) => linha.motivos === motivo);
                    documento.bloco(`Total de ${motivo}: ${doMotivo.length}`, documento.colors.green);
                    unicos(doMotivo.map((linha) => linha.nome_projeto)).forEach((projeto) => {
                        const doProjeto = doMotivo.filter((linha) => linha.nome_projeto === projeto);
                        documento.bloco(`Projeto: ${projeto}  (Soma: ${doProjeto.length} | Tempo Total: ${fmtMin(somarMinutos(doProjeto))})`, documento.colors.blue);
                        documento.tabela(cols(), doProjeto.map((linha): Celula[] => [
                            linha.nome_unidade || '-', linha.produtos_trabalhados || '---',
                            ...(colunas.equipe ? [equipeDe(linha)] : []),
                            ...(verEquipeProjeto ? [linha.equipe_projeto || '---'] : []),
                            ...(colunas.profissionais ? [String(linha.profissionais_env || '0')] : []),
                            dataTela(linha.data_inicial), linha.tempo_gasto || '00:00'
                        ]));
                    });
                });
                documento.bloco('Totais Gerais', documento.colors.green);
                const totais: [string, string][] = [['Total de Registros', String(dados.length)], ['Tempo Total Geral', fmtMin(somarMinutos(dados))], ...(colunas.profissionais ? [['Profissionais Capacitados', String(somarProfissionais(dados))] as [string, string]] : [])];
                documento.tabela(ajustarColunas(documento, [{ h: 'Indicador', w: 60, a: 'l' }, { h: 'Total', w: 40, a: 'c' }]), totais.map(([indicador, valor]) => [{ t: indicador, bold: true }, { t: valor, bold: true, color: documento.colors.green }]));
            }
        });
    };

    const jpg = () => {
        if (!dados.length) { aviso('Nenhum dado na tela para exportar.'); return; }
        void exportarCaptura(folha, `Relatorio_${deProjetos ? 'estatistica_projetos' : 'estatistica_atividades'}`);
    };

    return (
        <ModeloRelatorio
            chave={deProjetos ? 'estatistica_projetos' : 'estatistica_atividades'}
            titulo={titulo}
            aoFiltrar={gerar}
            carregando={carregando}
            aoPdf={pdf}
            aoJpg={jpg}
            acaoExtra={(
                <>
                    <Checkbox rotulo={deProjetos ? 'Mostrar operadores/analistas' : 'Mostrar implantador'} checked={colunas.equipe} onChange={(e) => setColunas({ ...colunas, equipe: e.target.checked })} />
                    <Checkbox rotulo="Mostrar profissionais capacitados" checked={colunas.profissionais} onChange={(e) => setColunas({ ...colunas, profissionais: e.target.checked })} />
                    {!deProjetos && <Checkbox rotulo="Mostrar equipe do projeto" checked={colunas.equipeProjeto} onChange={(e) => setColunas({ ...colunas, equipeProjeto: e.target.checked })} />}
                </>
            )}
            filtros={(
                <>
                    <CampoData rotulo="Data início" id="re-inicio" valor={filtros.dataInicio} aoMudar={(dataInicio) => setFiltros({ ...filtros, dataInicio })} />
                    <CampoData rotulo="Data fim" id="re-fim" valor={filtros.dataFim} aoMudar={(dataFim) => setFiltros({ ...filtros, dataFim })} />
                    <CampoMotivo id="re-motivo" valor={filtros.motivo} aoMudar={(motivo) => setFiltros({ ...filtros, motivo })} />
                    <Field rotulo="Projeto" htmlFor="re-projeto">
                        <Select id="re-projeto" value={filtros.projeto} onChange={(e) => setFiltros({ ...filtros, projeto: e.target.value, unidade: 'Todas' })}>
                            <option value="Todos">Todos os projetos</option>
                            {projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Unidade" htmlFor="re-unidade">
                        <Select id="re-unidade" value={filtros.unidade} onChange={(e) => setFiltros({ ...filtros, unidade: e.target.value })}>
                            <option value="Todas">Todas as unidades</option>
                            {unidadesFiltradas.map((unidade) => <option key={unidade.id_unidade} value={unidade.id_unidade}>{unidade.nome_unidade}</option>)}
                        </Select>
                    </Field>
                </>
            )}
        >
            <Documento titulo={titulo} subtitulo={periodo} referencia={folha}>
                {!dados.length && <AvisoDoc>Selecione um período e gere o relatório.</AvisoDoc>}
                {dados.length > 0 && (
                    <FaixaIndicadores itens={[
                        { rotulo: 'Total de registros', valor: dados.length },
                        { rotulo: 'Tempo total', valor: fmtMin(somarMinutos(dados)) },
                        ...(colunas.profissionais ? [{ rotulo: 'Profissionais capacitados', valor: somarProfissionais(dados) }] : [])
                    ]} />
                )}
                {unicos(dados.map((linha) => linha.motivos)).map((motivo) => {
                    const doMotivo = dados.filter((linha) => linha.motivos === motivo);
                    return (
                        <div key={motivo} className="mb-8 last:mb-0">
                            <p className="m-0 mb-3 bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold tracking-wide text-[#1b5e20] uppercase">{motivo}: {doMotivo.length}</p>
                            {unicos(doMotivo.map((linha) => linha.nome_projeto)).map((projeto) => {
                                const doProjeto = doMotivo.filter((linha) => linha.nome_projeto === projeto);
                                return (
                                    <SecaoDoc key={projeto} titulo={projeto} detalhe={`${doProjeto.length} registro(s) · ${fmtMin(somarMinutos(doProjeto))}`} className="mb-5">
                                        <TabelaDoc cabecalho={(
                                            <>
                                                <ThDoc>Unidade</ThDoc><ThDoc>Produto(s)</ThDoc>
                                                {colunas.equipe && <ThDoc>{rotuloEquipe}</ThDoc>}
                                                {verEquipeProjeto && <ThDoc>Equipe do projeto</ThDoc>}
                                                {colunas.profissionais && <ThDoc alinhar="centro">Prof. cap.</ThDoc>}
                                                <ThDoc alinhar="centro">Data</ThDoc><ThDoc alinhar="centro">Tempo</ThDoc>
                                            </>
                                        )}>
                                            {doProjeto.map((linha, indice) => (
                                                <tr key={`${linha.nome_unidade}-${linha.data_inicial}-${indice}`}>
                                                    <TdDoc>{linha.nome_unidade}</TdDoc>
                                                    <TdDoc className="text-xs text-[#475569]">{linha.produtos_trabalhados || '---'}</TdDoc>
                                                    {colunas.equipe && <TdDoc className="text-xs text-[#475569]">{equipeDe(linha)}</TdDoc>}
                                                    {verEquipeProjeto && <TdDoc className="text-xs text-[#475569]">{linha.equipe_projeto || '---'}</TdDoc>}
                                                    {colunas.profissionais && <TdDoc alinhar="centro" className="tabular-nums">{linha.profissionais_env || '0'}</TdDoc>}
                                                    <TdDoc alinhar="centro" className="whitespace-nowrap tabular-nums">{dataTela(linha.data_inicial)}</TdDoc>
                                                    <TdDoc alinhar="centro" className="tabular-nums">{linha.tempo_gasto || '00:00'}</TdDoc>
                                                </tr>
                                            ))}
                                        </TabelaDoc>
                                    </SecaoDoc>
                                );
                            })}
                        </div>
                    );
                })}
            </Documento>
        </ModeloRelatorio>
    );
}

type Agrupado = { chave: string; projeto: string; unidade: string; linhas: [string, string[]][] };

const ordemData = (a: string, b: string) => (a.split('/').reverse().join('') > b.split('/').reverse().join('') ? 1 : -1);

function agruparPresenca(registros: LinhaPresenca[], porEquipe: boolean): Agrupado[] {
    const locais = new Map<string, { projeto: string; unidade: string; registros: LinhaPresenca[] }>();
    registros.forEach((registro) => {
        const chave = `${registro.nome_projeto}|${registro.nome_unidade}`;
        const atual = locais.get(chave) ?? { projeto: registro.nome_projeto, unidade: registro.nome_unidade, registros: [] };
        locais.set(chave, { ...atual, registros: [...atual.registros, registro] });
    });
    return [...locais.entries()].map(([chave, local]) => {
        const grupos = new Map<string, Set<string>>();
        local.registros.forEach((registro) => {
            const data = dataBR(registro.data_inicio);
            const [grupo, valor] = porEquipe ? [data, registro.nome_implantador] : [registro.nome_implantador, data];
            grupos.set(grupo, new Set([...(grupos.get(grupo) ?? []), valor]));
        });
        const linhas = [...grupos.entries()].map(([grupo, valores]): [string, string[]] => [grupo, [...valores].sort(porEquipe ? undefined : ordemData)]);
        return { chave, projeto: local.projeto, unidade: local.unidade, linhas: linhas.sort((a, b) => (porEquipe ? ordemData(a[0], b[0]) : a[0].localeCompare(b[0], 'pt-BR'))) };
    });
}

export function PresencaRelatorio({ porEquipe }: { porEquipe: boolean }) {
    const titulo = porEquipe ? 'Presença por Equipe' : 'Presença por Implantador';
    const usuario = useNomeUsuario();
    const projetos = useProjetos();
    const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '', motivo: 'Todos', id_projeto: 'Todos', id_unidade: 'Todas' });
    const [registros, setRegistros] = useState<LinhaPresenca[] | null>(null);
    const [carregando, setCarregando] = useState(false);
    const folha = useRef<HTMLDivElement>(null);
    const unidades = useListaPorCodigo(filtros.id_projeto === 'Todos' ? '' : filtros.id_projeto, listarUnidadesDoProjeto, 'unidades do projeto');
    const grupos = useMemo(() => agruparPresenca(registros ?? [], porEquipe), [registros, porEquipe]);
    const periodo = `Período: ${dataBR(filtros.dataInicio)} até ${dataBR(filtros.dataFim)}`;

    const gerar = async () => {
        if (!filtros.dataInicio || !filtros.dataFim) {
            aviso('Selecione o período de datas.');
            return;
        }
        if (periodoBloqueado(filtros.dataInicio, filtros.dataFim)) return;
        setCarregando(true);
        try {
            const resposta = await relatoriosApi.buscarPresenca(filtros);
            setRegistros(resposta);
            if (!resposta.length) aviso(porEquipe ? 'Nenhuma escala encontrada com esses filtros.' : 'Nenhuma presença encontrada com esses filtros.', 'Informação');
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha ao buscar dados.'));
        } finally {
            setCarregando(false);
        }
    };

    const pdf = () => {
        if (!grupos.length) { aviso(SEM_DADOS); return; }
        void gerarPdf({
            titulo, usuario, periodo,
            arquivo: `${porEquipe ? 'Presenca_Equipe' : 'Presenca_Implantador'}_${filtros.dataInicio || 'periodo'}`,
            preencher: (documento) => grupos.forEach((grupo) => {
                documento.bloco(`${rotuloDoProjeto(grupo.projeto)}  ›  ${grupo.unidade}`, porEquipe ? documento.colors.blue : documento.colors.green);
                documento.tabela(
                    porEquipe
                        ? ajustarColunas(documento, [{ h: 'Data', w: 30, a: 'c' }, { h: 'Implantadores', w: 210, a: 'l' }, { h: 'Qtd', w: 33, a: 'c' }])
                        : ajustarColunas(documento, [{ h: 'Implantador', w: 80, a: 'l' }, { h: 'Datas', w: 160, a: 'l' }, { h: 'Dias', w: 33, a: 'c' }]),
                    grupo.linhas.map(([nome, valores]) => [nome, valores.join(', '), String(valores.length)])
                );
            })
        });
    };

    const jpg = () => {
        if (!grupos.length) { aviso(SEM_DADOS); return; }
        void exportarCaptura(folha, `Relatorio_${porEquipe ? 'presenca_equipe' : 'presenca_implantador'}`);
    };

    return (
        <ModeloRelatorio
            chave={porEquipe ? 'presenca_equipe' : 'presenca_implantador'}
            titulo={titulo}
            aoFiltrar={gerar}
            carregando={carregando}
            aoPdf={pdf}
            aoJpg={jpg}
            filtros={(
                <>
                    <CampoData rotulo="Data início" id="rp-inicio" valor={filtros.dataInicio} aoMudar={(dataInicio) => setFiltros({ ...filtros, dataInicio })} />
                    <CampoData rotulo="Data fim" id="rp-fim" valor={filtros.dataFim} aoMudar={(dataFim) => setFiltros({ ...filtros, dataFim })} />
                    <CampoMotivo id="rp-motivo" valor={filtros.motivo} aoMudar={(motivo) => setFiltros({ ...filtros, motivo })} />
                    <Field rotulo="Projeto" htmlFor="rp-projeto">
                        <Select id="rp-projeto" value={filtros.id_projeto} onChange={(e) => setFiltros({ ...filtros, id_projeto: e.target.value, id_unidade: 'Todas' })}>
                            <option value="Todos">Todos os projetos</option>
                            {projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Unidade" htmlFor="rp-unidade">
                        <Select id="rp-unidade" disabled={filtros.id_projeto === 'Todos'} value={filtros.id_unidade} onChange={(e) => setFiltros({ ...filtros, id_unidade: e.target.value })}>
                            <option value="Todas">Todas as unidades</option>
                            {unidades.map((unidade) => <option key={unidade.id_unidade} value={unidade.id_unidade}>{unidade.nome_unidade}</option>)}
                        </Select>
                    </Field>
                </>
            )}
        >
            <Documento titulo={titulo} subtitulo={periodo} referencia={folha}>
                {!registros && <AvisoDoc>Nenhum filtro aplicado.</AvisoDoc>}
                {registros && !grupos.length && <AvisoDoc>Nenhum dado encontrado para os filtros selecionados.</AvisoDoc>}
                {grupos.map((grupo) => (
                    <SecaoDoc key={grupo.chave} titulo={grupo.unidade} detalhe={rotuloDoProjeto(grupo.projeto)} className="mb-6">
                        <TabelaDoc cabecalho={<><ThDoc className="w-[26%]">{porEquipe ? 'Data' : 'Implantador'}</ThDoc><ThDoc>{porEquipe ? 'Implantadores' : 'Datas'}</ThDoc><ThDoc alinhar="centro" className="w-16">{porEquipe ? 'Qtd' : 'Dias'}</ThDoc></>}>
                            {grupo.linhas.map(([nome, valores]) => (
                                <tr key={nome}>
                                    <TdDoc className="font-semibold whitespace-nowrap">{nome}</TdDoc>
                                    <TdDoc className="leading-relaxed">{valores.join(', ')}</TdDoc>
                                    <TdDoc alinhar="centro" className="tabular-nums">{valores.length}</TdDoc>
                                </tr>
                            ))}
                        </TabelaDoc>
                    </SecaoDoc>
                ))}
            </Documento>
        </ModeloRelatorio>
    );
}
