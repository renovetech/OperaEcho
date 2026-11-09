import { useEffect, useMemo, useRef, useState } from 'react';
import { OPCOES_RESPONSAVEL } from '@/features/planoAcao/templates';
import { COR_SAUDE, COR_STATUS_ITEM, dataBR, fmtMin, minParaHHMM, STATUS_ITEM, STATUS_PLANO } from '@/features/planoAcao/formatos';
import * as relatoriosApi from '@/features/relatorios/api';
import type { DadosPlano, GrupoPlano, ItemRelatorioPlano, ProjetoFiltro } from '@/features/relatorios/api';
import { AvisoDoc, CampoData, Documento, FaixaIndicadores, ModeloRelatorio, SecaoDoc, SeloDoc, SubLinha, TabelaDoc, TdDoc, ThDoc, useNomeUsuario } from '@/features/relatorios/componentes';
import { exportarCaptura } from '@/features/relatorios/exportacao';
import { COR_PRAZO, excelPlano, pdfPlano } from '@/features/relatorios/exportacaoPlano';
import { periodoBloqueado } from '@/shared/periodo';
import { aviso, erro, mensagemDeErro } from '@/shared/feedback';
import { logErro } from '@/shared/lib';
import { Checkbox, Field, Input, Select } from '@/shared/ui/Campos';

const SITUACOES_PRAZO = ['NO PRAZO', 'FORA DO PRAZO', 'VENCIDO', 'VENCE EM 7 DIAS', 'A VENCER', 'SEM PRAZO'];
const COR_RUIM = '#8f332f';
const COR_BOA = '#1b5e20';
const SEM_DADOS = 'Gere o relatório primeiro.';

function TabelaGrupo({ titulo, lista }: { titulo: string; lista: GrupoPlano[] }) {
    if (!lista.length) return <div />;
    return (
        <SecaoDoc titulo={titulo}>
            <TabelaDoc cabecalho={<><ThDoc>Nome</ThDoc><ThDoc alinhar="centro">Ações</ThDoc><ThDoc alinhar="centro">Fechadas</ThDoc><ThDoc alinhar="centro">Atrasadas</ThDoc><ThDoc alinhar="centro">% Exec.</ThDoc></>}>
                {lista.map((item) => (
                    <tr key={item.nome}>
                        <TdDoc>{item.nome}</TdDoc>
                        <TdDoc alinhar="centro" className="tabular-nums">{item.total}</TdDoc>
                        <TdDoc alinhar="centro" className="tabular-nums">{item.fechados}</TdDoc>
                        <TdDoc alinhar="centro" className="tabular-nums"><span style={item.atrasados ? { color: COR_RUIM, fontWeight: 600 } : undefined}>{item.atrasados}</span></TdDoc>
                        <TdDoc alinhar="centro" className="font-semibold tabular-nums">{item.progresso}%</TdDoc>
                    </tr>
                ))}
            </TabelaDoc>
        </SecaoDoc>
    );
}

function TabelaPrazos({ itens, rotulo, valor }: { itens: ItemRelatorioPlano[]; rotulo: string; valor: (item: ItemRelatorioPlano) => string }) {
    return (
        <TabelaDoc cabecalho={<><ThDoc>Plano</ThDoc><ThDoc>Ação</ThDoc><ThDoc>Unidade/Etapa</ThDoc><ThDoc>Responsável</ThDoc><ThDoc alinhar="centro">Prazo</ThDoc><ThDoc alinhar="centro">{rotulo}</ThDoc></>}>
            {itens.map((item) => (
                <tr key={item.id_item}>
                    <TdDoc className="text-xs">{item.plano}</TdDoc>
                    <TdDoc className="text-xs">{item.descricao}</TdDoc>
                    <TdDoc className="text-xs">{item.unidade || item.grupo || '-'}</TdDoc>
                    <TdDoc className="text-xs">{item.responsavel || '-'}</TdDoc>
                    <TdDoc alinhar="centro" className="whitespace-nowrap tabular-nums">{dataBR(item.data_fim)}</TdDoc>
                    <TdDoc alinhar="centro" className="font-semibold tabular-nums">{valor(item)}</TdDoc>
                </tr>
            ))}
        </TabelaDoc>
    );
}

function Conteudo({ dados, detalhe, observacoes, itensPorPlano }: { dados: DadosPlano; detalhe: boolean; observacoes: boolean; itensPorPlano: [string, ItemRelatorioPlano[]][] }) {
    const { resumo: r } = dados;
    return (
        <>
            <FaixaIndicadores itens={[
                { rotulo: 'Planos', valor: r.planos, detalhe: `${r.planos_ativos} ativos · ${r.planos_concluidos} concluídos` },
                { rotulo: 'Execução realizada', valor: `${r.progresso}%`, detalhe: `esperado ${r.esperado}%` },
                { rotulo: 'Desvio', valor: `${r.desvio > 0 ? '+' : ''}${r.desvio} p.p.`, cor: r.desvio < 0 ? COR_RUIM : COR_BOA },
                { rotulo: 'Aderência ao prazo', valor: r.aderencia === null ? '-' : `${r.aderencia}%`, detalhe: `${r.fechados_no_prazo}/${r.fechados_com_prazo} no prazo` }
            ]} />
            <FaixaIndicadores itens={[
                { rotulo: 'Ações fechadas', valor: `${r.fechados}/${r.total}`, detalhe: `${r.andamento} em andamento · ${r.a_iniciar} a iniciar` },
                { rotulo: 'Atrasadas', valor: r.atrasados, detalhe: `${r.vencendo_7d} vencem em 7 dias`, cor: r.atrasados ? COR_RUIM : undefined },
                { rotulo: 'Horas trabalhadas', valor: fmtMin(r.trabalhado_min), detalhe: `previsto ${fmtMin(r.previsto_min)}` },
                { rotulo: 'Unidades', valor: r.unidades, detalhe: `${r.clientes} cliente(s)` }
            ]} />
            <FaixaIndicadores itens={dados.por_status.map((status) => ({ rotulo: status.nome, valor: status.total, detalhe: `${r.total ? Math.round((status.total / r.total) * 100) : 0}% das ações`, cor: COR_STATUS_ITEM[status.nome] }))} />
            <SecaoDoc titulo="Resumo por plano" detalhe={`${dados.planos.length} plano(s)`}>
                <TabelaDoc cabecalho={<><ThDoc>Plano</ThDoc><ThDoc>Cliente</ThDoc><ThDoc alinhar="centro">Saúde</ThDoc><ThDoc alinhar="centro">Execução</ThDoc><ThDoc alinhar="centro">Esperado</ThDoc><ThDoc alinhar="centro">Desvio</ThDoc><ThDoc alinhar="centro">Ações</ThDoc><ThDoc alinhar="centro">Atrasadas</ThDoc><ThDoc alinhar="centro">Próx. prazo</ThDoc><ThDoc alinhar="centro">Término</ThDoc></>}>
                    {dados.planos.map((plano) => {
                        const saude = COR_SAUDE[plano.saude];
                        return (
                            <tr key={plano.id_plano}>
                                <TdDoc><b className="font-semibold">{plano.titulo}</b>{plano.nome_projeto && <SubLinha>{plano.nome_projeto}</SubLinha>}</TdDoc>
                                <TdDoc>{plano.cliente || '-'}</TdDoc>
                                <TdDoc alinhar="centro"><SeloDoc cor={saude?.fg ?? '#334155'} fundo={saude?.bg}>{plano.saude}</SeloDoc></TdDoc>
                                <TdDoc alinhar="centro" className="font-semibold tabular-nums">{plano.progresso}%</TdDoc>
                                <TdDoc alinhar="centro" className="tabular-nums">{plano.esperado}%</TdDoc>
                                <TdDoc alinhar="centro" className="font-semibold tabular-nums"><span style={{ color: plano.desvio < 0 ? COR_RUIM : COR_BOA }}>{plano.desvio > 0 ? '+' : ''}{plano.desvio}</span></TdDoc>
                                <TdDoc alinhar="centro" className="tabular-nums">{plano.fechados}/{plano.total}</TdDoc>
                                <TdDoc alinhar="centro" className="tabular-nums">{plano.atrasados}</TdDoc>
                                <TdDoc alinhar="centro" className="whitespace-nowrap tabular-nums">{dataBR(plano.proximo_prazo)}</TdDoc>
                                <TdDoc alinhar="centro" className="whitespace-nowrap tabular-nums">{dataBR(plano.data_fim_prevista)}</TdDoc>
                            </tr>
                        );
                    })}
                </TabelaDoc>
            </SecaoDoc>
            <div className="grid grid-cols-2 gap-x-8">
                <TabelaGrupo titulo="Por etapa" lista={dados.por_etapa} />
                <TabelaGrupo titulo="Por responsável" lista={dados.por_responsavel} />
            </div>
            {dados.por_cliente.length > 1 && <TabelaGrupo titulo="Por cliente" lista={dados.por_cliente} />}
            <div className="grid grid-cols-2 gap-x-8">
                <TabelaGrupo titulo="Por unidade" lista={dados.por_unidade} />
                {dados.por_modulo.length > 1
                    ? <TabelaGrupo titulo="Por módulo" lista={dados.por_modulo} />
                    : <TabelaGrupo titulo="Por prioridade" lista={dados.por_prioridade.filter((item) => item.total)} />}
            </div>
            {dados.por_pessoa.length > 0 && (
                <SecaoDoc titulo="Equipe: alocação e horas trabalhadas">
                    <TabelaDoc cabecalho={<><ThDoc>Pessoa</ThDoc><ThDoc alinhar="centro">Ações</ThDoc><ThDoc alinhar="centro">Abertas</ThDoc><ThDoc alinhar="centro">Atrasadas</ThDoc><ThDoc alinhar="centro">Apontamentos</ThDoc><ThDoc alinhar="centro">Horas</ThDoc></>}>
                        {dados.por_pessoa.map((pessoa) => (
                            <tr key={pessoa.id_usuario}>
                                <TdDoc>{pessoa.nome}</TdDoc>
                                <TdDoc alinhar="centro" className="tabular-nums">{pessoa.itens}</TdDoc>
                                <TdDoc alinhar="centro" className="tabular-nums">{pessoa.abertos}</TdDoc>
                                <TdDoc alinhar="centro" className="tabular-nums">{pessoa.atrasados}</TdDoc>
                                <TdDoc alinhar="centro" className="tabular-nums">{pessoa.apontamentos}</TdDoc>
                                <TdDoc alinhar="centro" className="font-semibold tabular-nums">{fmtMin(pessoa.trabalhado_min)}</TdDoc>
                            </tr>
                        ))}
                    </TabelaDoc>
                </SecaoDoc>
            )}
            {dados.atrasados.length > 0 && <SecaoDoc titulo="Ações atrasadas" tom="alerta" detalhe={`${dados.atrasados.length} ação(ões)`}><TabelaPrazos itens={dados.atrasados} rotulo="Dias" valor={(item) => String(item.dias_atraso ?? '-')} /></SecaoDoc>}
            {dados.proximos_prazos.length > 0 && <SecaoDoc titulo="Próximos prazos" detalhe="15 dias"><TabelaPrazos itens={dados.proximos_prazos} rotulo="Faltam" valor={(item) => `${item.dias_restantes}d`} /></SecaoDoc>}
            {detalhe && itensPorPlano.map(([plano, lista]) => (
                <SecaoDoc key={plano} titulo={`Detalhamento: ${plano}`} detalhe={`${lista.length} ações`}>
                    <TabelaDoc cabecalho={<><ThDoc>Ação</ThDoc><ThDoc>Cliente</ThDoc><ThDoc>Etapa / Unidade</ThDoc><ThDoc>Responsável</ThDoc><ThDoc>Equipe</ThDoc><ThDoc alinhar="centro">Previsto</ThDoc><ThDoc alinhar="centro">Realizado</ThDoc><ThDoc alinhar="centro">%</ThDoc><ThDoc alinhar="centro">Situação</ThDoc><ThDoc alinhar="centro">Prazo</ThDoc><ThDoc alinhar="centro">Horas</ThDoc>{observacoes && <ThDoc>Observação</ThDoc>}</>}>
                        {lista.map((item) => (
                            <tr key={item.id_item} className="text-xs">
                                <TdDoc>{item.descricao}</TdDoc>
                                <TdDoc>{item.cliente || '-'}</TdDoc>
                                <TdDoc>{[item.modulo, item.unidade || item.grupo].filter(Boolean).join(' · ') || '-'}</TdDoc>
                                <TdDoc>{item.responsavel || '-'}</TdDoc>
                                <TdDoc>{item.equipe || '-'}</TdDoc>
                                <TdDoc alinhar="centro" className="whitespace-nowrap tabular-nums">{dataBR(item.data_inicio)}<br />{dataBR(item.data_fim)}</TdDoc>
                                <TdDoc alinhar="centro" className="whitespace-nowrap tabular-nums">{dataBR(item.data_inicio_real)}<br />{dataBR(item.data_fim_real)}</TdDoc>
                                <TdDoc alinhar="centro" className="tabular-nums">{item.percentual}%</TdDoc>
                                <TdDoc alinhar="centro" className="font-semibold"><span style={{ color: COR_STATUS_ITEM[item.status] }}>{item.status}</span></TdDoc>
                                <TdDoc alinhar="centro" className="font-medium"><span style={{ color: COR_PRAZO[item.situacao_prazo] }}>{item.situacao_prazo}{item.dias_atraso ? ` (${item.dias_atraso}d)` : ''}</span></TdDoc>
                                <TdDoc alinhar="centro" className="tabular-nums">{minParaHHMM(item.horas_trabalhadas) || '-'}</TdDoc>
                                {observacoes && <TdDoc>{item.observacao ?? ''}</TdDoc>}
                            </tr>
                        ))}
                    </TabelaDoc>
                </SecaoDoc>
            ))}
        </>
    );
}

export function PlanoAcaoRelatorio() {
    const usuario = useNomeUsuario();
    const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '', id_projeto: 'Todos', id_plano: '', status_plano: 'Todos', status: 'Todos', responsavel: 'Todos', situacao_prazo: 'Todos', cliente: '' });
    const [opcoes, setOpcoes] = useState({ detalhe: true, observacoes: false });
    const [projetos, setProjetos] = useState<ProjetoFiltro[]>([]);
    const [planos, setPlanos] = useState<{ id_plano: number; titulo: string }[]>([]);
    const [dados, setDados] = useState<DadosPlano | null>(null);
    const [carregando, setCarregando] = useState(false);
    const folha = useRef<HTMLDivElement>(null);
    const projetoFiltro = filtros.id_projeto === 'Todos' ? '' : filtros.id_projeto;
    const temDados = Boolean(dados?.itens.length);

    useEffect(() => {
        relatoriosApi.listarProjetos().then(setProjetos).catch((falha: unknown) => logErro('Erro ao listar projetos', falha));
    }, []);
    useEffect(() => {
        relatoriosApi.listarPlanos(projetoFiltro).then(setPlanos).catch((falha: unknown) => logErro('Erro ao listar planos', falha));
    }, [projetoFiltro]);

    const itensPorPlano = useMemo(() => {
        const grupos = new Map<string, ItemRelatorioPlano[]>();
        (dados?.itens ?? []).forEach((item) => grupos.set(item.plano, [...(grupos.get(item.plano) ?? []), item]));
        return [...grupos.entries()];
    }, [dados]);

    const periodo = filtros.dataInicio && filtros.dataFim ? `Planos criados entre ${dataBR(filtros.dataInicio)} e ${dataBR(filtros.dataFim)}` : 'Todos os períodos';
    const alterar = (campo: keyof typeof filtros, valor: string) => setFiltros((atual) => ({ ...atual, [campo]: valor, ...(campo === 'id_projeto' && { id_plano: '' }) }));

    const gerar = async () => {
        if (!filtros.dataInicio !== !filtros.dataFim) {
            aviso('Informe o período completo (início e fim) ou deixe ambos em branco.');
            return;
        }
        if (filtros.dataInicio && filtros.dataFim < filtros.dataInicio) {
            aviso('A data final não pode ser anterior à inicial.');
            return;
        }
        if (periodoBloqueado(filtros.dataInicio, filtros.dataFim)) return;
        setCarregando(true);
        try {
            const parametros = Object.fromEntries(Object.entries(filtros).filter(([, valor]) => valor && valor !== 'Todos'));
            const resposta = await relatoriosApi.buscarPlanoAcao(parametros);
            setDados(resposta);
            if (!resposta.itens.length) aviso('Nenhuma ação encontrada com os filtros aplicados.', 'Informação');
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Não foi possível gerar o relatório.'));
        } finally {
            setCarregando(false);
        }
    };

    const seHouverDados = (acao: (conteudo: DadosPlano) => void) => {
        if (dados && temDados) acao(dados);
        else aviso(SEM_DADOS);
    };

    return (
        <ModeloRelatorio
            chave="plano_acao_status"
            titulo="Plano de Ação: Status e Execução"
            aoFiltrar={gerar}
            carregando={carregando}
            aoPdf={() => seHouverDados((conteudo) => { void pdfPlano(conteudo, { periodo, usuario, detalhe: opcoes.detalhe, observacoes: opcoes.observacoes, itensPorPlano }); })}
            aoJpg={() => seHouverDados(() => { void exportarCaptura(folha, 'Relatorio_Plano_Acao'); })}
            aoExcel={() => seHouverDados((conteudo) => { void excelPlano(conteudo, periodo, usuario, new Date().toISOString().slice(0, 10)); })}
            acaoExtra={(
                <>
                    <Checkbox rotulo="Detalhamento por ação" checked={opcoes.detalhe} onChange={(e) => setOpcoes({ ...opcoes, detalhe: e.target.checked })} />
                    <Checkbox rotulo="Incluir observações" checked={opcoes.observacoes} onChange={(e) => setOpcoes({ ...opcoes, observacoes: e.target.checked })} />
                </>
            )}
            filtros={(
                <>
                    <CampoData rotulo="Criados de" id="rl-inicio" valor={filtros.dataInicio} aoMudar={(valor) => alterar('dataInicio', valor)} />
                    <CampoData rotulo="Até" id="rl-fim" valor={filtros.dataFim} aoMudar={(valor) => alterar('dataFim', valor)} />
                    <Field rotulo="Projeto" htmlFor="rl-projeto">
                        <Select id="rl-projeto" value={filtros.id_projeto} onChange={(e) => alterar('id_projeto', e.target.value)}>
                            <option value="Todos">Todos os projetos</option>
                            {projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Plano" htmlFor="rl-plano">
                        <Select id="rl-plano" value={filtros.id_plano} onChange={(e) => alterar('id_plano', e.target.value)}>
                            <option value="">Todos os planos</option>
                            {planos.map((plano) => <option key={plano.id_plano} value={plano.id_plano}>{plano.titulo}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Cliente" htmlFor="rl-cliente"><Input id="rl-cliente" placeholder="Contém..." value={filtros.cliente} onChange={(e) => alterar('cliente', e.target.value)} /></Field>
                    <Field rotulo="Situação do plano" htmlFor="rl-sit-plano">
                        <Select id="rl-sit-plano" value={filtros.status_plano} onChange={(e) => alterar('status_plano', e.target.value)}><option value="Todos">Todas</option>{STATUS_PLANO.map((status) => <option key={status}>{status}</option>)}</Select>
                    </Field>
                    <Field rotulo="Situação da ação" htmlFor="rl-sit-acao">
                        <Select id="rl-sit-acao" value={filtros.status} onChange={(e) => alterar('status', e.target.value)}><option value="Todos">Todas</option>{STATUS_ITEM.map((status) => <option key={status}>{status}</option>)}</Select>
                    </Field>
                    <Field rotulo="Responsável" htmlFor="rl-responsavel">
                        <Select id="rl-responsavel" value={filtros.responsavel} onChange={(e) => alterar('responsavel', e.target.value)}><option value="Todos">Todos</option>{(OPCOES_RESPONSAVEL as string[]).map((opcao) => <option key={opcao}>{opcao}</option>)}</Select>
                    </Field>
                    <Field rotulo="Situação do prazo" htmlFor="rl-prazo">
                        <Select id="rl-prazo" value={filtros.situacao_prazo} onChange={(e) => alterar('situacao_prazo', e.target.value)}><option value="Todos">Todas</option>{SITUACOES_PRAZO.map((situacao) => <option key={situacao}>{situacao}</option>)}</Select>
                    </Field>
                </>
            )}
        >
            <Documento titulo="Plano de Ação: Status e Execução" subtitulo={periodo} referencia={folha}>
                {dados && temDados
                    ? <Conteudo dados={dados} detalhe={opcoes.detalhe} observacoes={opcoes.observacoes} itensPorPlano={itensPorPlano} />
                    : <AvisoDoc>Defina os filtros e gere o relatório.</AvisoDoc>}
            </Documento>
        </ModeloRelatorio>
    );
}
