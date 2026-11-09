import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Icon from '@/shared/ui/Icon';
import * as planoApi from '@/features/planoAcao/api';
import type { EventoHistorico, PessoaEquipe } from '@/features/planoAcao/api';
import { BarraProgresso, SeloSaude } from '@/features/planoAcao/componentes';
import { salvarPlanoJpg, salvarPlanoPdf } from '@/features/planoAcao/exportacao';
import { dataBR, fmtMin, nomeCurto } from '@/features/planoAcao/formatos';
import { GradePlano } from '@/features/planoAcao/GradePlano';
import { FILTRO_VAZIO, useDetalhesPlano, type DetalhesPlano } from '@/features/planoAcao/hooksDetalhes';
import { JanelaDadosPlano, JanelaEquipe, JanelaHoras, JanelaNovaAcao } from '@/features/planoAcao/JanelasPlano';
import { STATUS_SERII } from '@/features/planoAcao/templates';
import { erro, fecharMensagem, mostrarCarregando } from '@/shared/feedback';
import { useParametrosUrl } from '@/shared/hooks';
import { cn, logErro } from '@/shared/lib';
import { Abas } from '@/shared/ui/Abas';
import { Button } from '@/shared/ui/Button';
import { Checkbox, Field, Input, Select } from '@/shared/ui/Campos';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { Card, CardTitulo } from '@/shared/ui/Pagina';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';
const ABAS_PLANO = [{ id: 'grade', rotulo: 'Plano', icone: 'grid' }, { id: 'historico', rotulo: 'Histórico', icone: 'clock' }] as const;

const ROTULO_EVENTO: Record<string, string> = {
    CRIACAO: 'Criou o plano', ALTERACAO: 'Alterou', ALTERACAO_PLANO: 'Alterou o plano', INCLUSAO_ITEM: 'Incluiu ação',
    EXCLUSAO_ITEM: 'Excluiu ação', INCLUSAO_UNIDADE: 'Incluiu unidade', EXCLUSAO_UNIDADE: 'Removeu unidade',
    APONTAMENTO: 'Apontou horas', EXCLUSAO_APONTAMENTO: 'Excluiu apontamento', ENCERRAMENTO: 'Encerrou o plano',
    REABERTURA: 'Reabriu o plano', PUBLICACAO: 'Publicou o painel', DESPUBLICACAO: 'Despublicou o painel'
};

const ROTULO_CAMPO: Record<string, string> = {
    descricao: 'Ação', responsavel: 'Responsável', cliente: 'Cliente', observacao: 'Observação', data_inicio: 'Início previsto',
    data_fim: 'Fim previsto', data_inicio_real: 'Início realizado', data_fim_real: 'Fim realizado', prioridade: 'Prioridade',
    status: 'Situação', percentual: '% Execução', equipe: 'Equipe', horas: 'Horas', titulo: 'Título',
    data_inicio_prevista: 'Início previsto do plano', data_fim_prevista: 'Término previsto do plano'
};

function valorDoHistorico(campo: string | null | undefined, valor: string | null | undefined, equipe: PessoaEquipe[]): string {
    if (valor === null || valor === undefined || valor === '') return '-';
    if (campo?.startsWith('data_')) return dataBR(valor);
    if (campo !== 'equipe') return String(valor);
    const nomes = new Map(equipe.map((pessoa) => [String(pessoa.id_usuario), nomeCurto(pessoa.nome_completo)]));
    return String(valor).split(',').filter(Boolean).map((id) => nomes.get(id) ?? `#${id}`).join(', ') || '-';
}

function Historico({ id, equipe }: { id: string; equipe: PessoaEquipe[] }) {
    const [eventos, setEventos] = useState<EventoHistorico[] | null>(null);

    useEffect(() => {
        let ativo = true;
        planoApi.listarHistorico(id)
            .then((lista) => { if (ativo) setEventos(lista); })
            .catch((falha: unknown) => {
                logErro('Erro ao carregar o histórico', falha);
                if (ativo) setEventos([]);
            });
        return () => { ativo = false; };
    }, [id]);

    return (
        <Card>
            <CardTitulo titulo="Histórico de alterações" ajuda="Mostra os últimos 500 eventos do plano." />
            <div className="p-3.5">
                <Tabela cabecalho={<><Th>Data/hora</Th><Th>Usuário</Th><Th>Evento</Th><Th>Ação do plano</Th><Th>De</Th><Th>Para</Th></>}>
                    {eventos === null && <LinhaVazia colunas={6}>Carregando...</LinhaVazia>}
                    {eventos?.length === 0 && <LinhaVazia colunas={6}>Sem eventos registrados.</LinhaVazia>}
                    {eventos?.map((evento) => (
                        <tr key={evento.id_historico}>
                            <Td className="whitespace-nowrap tabular-nums">{new Date(evento.data_hora).toLocaleString('pt-BR')}</Td>
                            <Td>{evento.usuario || '-'}</Td>
                            <Td><b className="font-semibold">{ROTULO_EVENTO[evento.acao] ?? evento.acao}</b>{evento.campo ? ` · ${ROTULO_CAMPO[evento.campo] ?? evento.campo}` : ''}</Td>
                            <Td className="max-w-80">{evento.item || '-'}</Td>
                            <Td>{valorDoHistorico(evento.campo, evento.valor_anterior, equipe)}</Td>
                            <Td>{valorDoHistorico(evento.campo, evento.valor_novo, equipe)}</Td>
                        </tr>
                    ))}
                </Tabela>
            </div>
        </Card>
    );
}

function Kpi({ rotulo, children, alerta }: { rotulo: string; children: React.ReactNode; alerta?: boolean }) {
    return <div><small className="block text-[11px] text-text-2 uppercase">{rotulo}</small><b className={cn('text-base tabular-nums', alerta && 'text-danger')}>{children}</b></div>;
}

function FiltrosGrade({ d, adicionarUnidade }: { d: DetalhesPlano; adicionarUnidade: React.ReactNode }) {
    const { filtro, setFiltro } = d;
    return (
        <>
            {adicionarUnidade}
            <Card className="mb-3.5 flex items-end gap-3.5 px-4 py-3.5">
                <Field rotulo="Buscar na grade" htmlFor="gr-busca" className="flex-[2]"><Input id="gr-busca" placeholder="Ação, observação, cliente..." value={filtro.busca} onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })} /></Field>
                <Field rotulo="Situação" htmlFor="gr-status" className="flex-1">
                    <Select id="gr-status" value={filtro.status} onChange={(e) => setFiltro({ ...filtro, status: e.target.value })}>
                        <option value="">Todas</option>
                        {STATUS_SERII.map((status: string) => <option key={status}>{status}</option>)}
                    </Select>
                </Field>
                <Field rotulo="Responsável" htmlFor="gr-resp" className="flex-1">
                    <Select id="gr-resp" value={filtro.responsavel} onChange={(e) => setFiltro({ ...filtro, responsavel: e.target.value })}>
                        <option value="">Todos</option>
                        {d.responsaveis.map((nome) => <option key={nome}>{nome}</option>)}
                    </Select>
                </Field>
                <Checkbox className="m-0 mb-3 whitespace-nowrap" rotulo="Só atrasadas" checked={filtro.atrasados} onChange={(e) => setFiltro({ ...filtro, atrasados: e.target.checked })} />
                <Checkbox className="m-0 mb-3 whitespace-nowrap" rotulo="Minhas ações" checked={filtro.meus} onChange={(e) => setFiltro({ ...filtro, meus: e.target.checked })} />
                {d.filtroAtivo && <Button variant="secondary" onClick={() => setFiltro(FILTRO_VAZIO)}>Limpar ({d.qtdVisiveis}/{d.itens.length})</Button>}
            </Card>
        </>
    );
}

function AdicionarUnidade({ d }: { d: DetalhesPlano }) {
    const [idUnidade, setIdUnidade] = useState('');
    return (
        <Card className="mb-3.5 flex items-end gap-3.5 px-4 py-3.5">
            <Field rotulo="Adicionar unidade ao plano" htmlFor="gr-unidade" className="w-[420px]">
                <Select id="gr-unidade" value={idUnidade} onChange={(e) => setIdUnidade(e.target.value)}>
                    <option value="">Selecione...</option>
                    {d.unidadesExtras.map((unidade) => <option key={unidade.id_unidade} value={unidade.id_unidade}>{unidade.nome_unidade}</option>)}
                </Select>
            </Field>
            <Button disabled={!idUnidade} onClick={async () => { if (await d.adicionarUnidade(Number(idUnidade))) setIdUnidade(''); }}>Incluir</Button>
        </Card>
    );
}

export function DetalhesPlanoPage() {
    const { id = '' } = useParams();
    const d = useDetalhesPlano(id);
    const [parametros, alterarUrl] = useParametrosUrl();
    const folha = useRef<HTMLDivElement>(null);
    const aba = parametros.get('aba') === 'historico' ? 'historico' : 'grade';
    const { cabecalho, indicadores: ind, janela } = d;

    if (!Number.isInteger(Number(id))) return <Aviso titulo="Página não encontrada" />;
    if (!cabecalho) return <Carregando />;

    const clienteDoPlano = cabecalho.cliente ?? cabecalho.nome_projeto ?? '';
    const itemDaJanela = janela?.tipo === 'equipe' || janela?.tipo === 'horas' ? (d.itens.find((item) => item.id_item === janela.item.id_item) ?? janela.item) : null;

    const exportar = async (tipo: 'pdf' | 'jpg') => {
        if (!folha.current) return;
        mostrarCarregando(`Gerando ${tipo.toUpperCase()}...`);
        try {
            await (tipo === 'pdf' ? salvarPlanoPdf : salvarPlanoJpg)(folha.current, `Plano_${id}`);
            fecharMensagem();
        } catch (falha) {
            logErro('Erro ao exportar o plano', falha);
            erro('Não foi possível gerar a exportação.');
        }
    };

    return (
        <>
            <div className="mb-3.5 flex items-center gap-2.5">
                <Abas className="mr-auto" itens={ABAS_PLANO} ativa={aba} aoMudar={(id) => alterarUrl({ aba: id === 'grade' ? null : id })} />
                {aba === 'grade' && <Button variant="secondary" onClick={() => exportar('pdf')}><Icon n="file" /> PDF</Button>}
                {aba === 'grade' && <Button variant="secondary" onClick={() => exportar('jpg')}><Icon n="image" /> JPG</Button>}
                <Button variant="secondary" title="Painel público do plano" onClick={d.publicar}><Icon n="globe" /> {cabecalho.publico ? 'Público' : 'Publicar'}</Button>
                {d.editavel && <Button variant="secondary" onClick={() => d.setJanela({ tipo: 'cabecalho' })}><Icon n="edit" /> Dados do plano</Button>}
                {d.editavel && d.sujos.size > 0 && <Button variant="secondary" onClick={d.descartar}><Icon n="undo" /> Descartar</Button>}
                {d.editavel && <Button isLoading={d.salvando} onClick={() => d.salvar()}><Icon n="save" /> Salvar{d.sujos.size ? ` (${d.sujos.size})` : ''}</Button>}
                <Button variant="secondary" onClick={d.voltar}>Voltar</Button>
            </div>

            {d.encerrado && <Aviso titulo={`Plano encerrado${cabecalho.data_encerramento ? ` em ${dataBR(cabecalho.data_encerramento)}` : ''}`}>Somente leitura.{cabecalho.justificativa_encerramento ? ` Justificativa: ${cabecalho.justificativa_encerramento}` : ''}</Aviso>}
            {!d.permissoes.editar && !d.encerrado && <p className="m-0 mb-3.5 rounded-lg bg-brass-tint px-4 py-2.5 text-[13px] text-ink"><Icon n="lock" /> Somente leitura: para editar é preciso ter permissão de edição, ser o criador do plano ou ter lotação no projeto. Você pode apontar horas nas ações em que faz parte da equipe.</p>}

            {aba === 'historico' ? <Historico id={id} equipe={d.equipe} /> : (
                <>
                    <FiltrosGrade d={d} adicionarUnidade={d.editavel && d.unidadesExtras.length > 0 ? <AdicionarUnidade d={d} /> : null} />
                    <div ref={folha} data-folha-plano="" className="box-border rounded-[10px] border border-solid border-line bg-white p-5 shadow-card">
                        <div className="mb-5 flex items-start justify-between gap-6">
                            <div className="flex-1 border-0 border-l-[6px] border-solid border-pine pl-5">
                                <h1 className="m-0 mb-2 text-[22px] leading-tight font-bold text-ink">{cabecalho.titulo}</h1>
                                <div className="flex flex-wrap gap-x-7 gap-y-1.5 text-[13.5px] text-text">
                                    <span><b>Projeto:</b> {cabecalho.nome_projeto || '-'}</span>
                                    <span><b>Cliente:</b> {clienteDoPlano || '-'}</span>
                                    <span><b>Produto:</b> {d.modulos.length ? d.modulos.join(', ') : (cabecalho.nome_produto || '-')}</span>
                                    {cabecalho.sub_tipo && <span><b>Tipo:</b> {cabecalho.sub_tipo}</span>}
                                    <span><b>Criado em:</b> {dataBR(cabecalho.data_criacao)}</span>
                                    <span><b>Prazo do plano:</b> {dataBR(cabecalho.data_inicio_prevista)} a {dataBR(cabecalho.data_fim_prevista)}</span>
                                    <span><b>Situação:</b> {cabecalho.status}</span>
                                </div>
                                {cabecalho.descricao && <p className="m-0 mt-3 max-w-[900px] text-[13.5px] text-text">{cabecalho.descricao}</p>}
                            </div>
                            <img src="/logo.png" alt="Opera Echo" className="block h-14 w-auto shrink-0" />
                        </div>
                        <div className="mb-4 flex items-center gap-x-6 gap-y-3 rounded-xl border border-solid border-line bg-surface-2 px-4 py-3">
                            <div className="min-w-60 flex-1">
                                <div className="mb-1.5 flex justify-between text-xs text-text-2"><b className="text-sm text-pine">Execução {ind.progresso ?? 0}%</b><span>esperado até hoje {ind.esperado ?? 0}%</span></div>
                                <BarraProgresso grande valor={ind.progresso ?? 0} esperado={ind.esperado ?? 0} />
                            </div>
                            <div><small className="mb-0.5 block text-[11px] text-text-2 uppercase">Saúde</small><SeloSaude saude={ind.saude} /></div>
                            <Kpi rotulo="Ações">{ind.fechados ?? 0}/{ind.total ?? 0}</Kpi>
                            <Kpi rotulo="Em andamento">{ind.andamento ?? 0}</Kpi>
                            <Kpi rotulo="Atrasadas" alerta={Boolean(ind.atrasados)}>{ind.atrasados ?? 0}</Kpi>
                            <Kpi rotulo="Vencem em 7d">{ind.vencendo_7d ?? 0}</Kpi>
                            <Kpi rotulo="Aderência">{ind.aderencia == null ? '-' : `${ind.aderencia}%`}</Kpi>
                            <Kpi rotulo="Horas trabalhadas">{fmtMin(ind.trabalhado_min)}</Kpi>
                        </div>
                        <GradePlano d={d} />
                        <div className="mt-3 flex justify-between text-xs text-text-2">
                            <span>Opera Echo - Sistema de Gestão da Qualidade</span>
                            <span><b>Gerado por:</b> {d.usuario.nome_completo || d.usuario.nome} | <b>Em:</b> {new Date().toLocaleString('pt-BR')}</span>
                        </div>
                    </div>
                </>
            )}

            {janela?.tipo === 'equipe' && itemDaJanela && <JanelaEquipe item={itemDaJanela} disponiveis={d.equipe} editavel={d.editavel} aoFechar={() => d.setJanela(null)} aoAplicar={(lista) => { d.alterar(itemDaJanela.id_item, { equipe: lista }); d.setJanela(null); }} />}
            {janela?.tipo === 'horas' && itemDaJanela && <JanelaHoras item={itemDaJanela} equipe={d.equipe} editavel={d.editavel} podeApontar={!d.encerrado} idUsuario={d.usuario.id_usuario} aoFechar={(mudou) => { d.setJanela(null); if (mudou) d.aposApontar(itemDaJanela.id_item); }} />}
            {janela?.tipo === 'acao' && <JanelaNovaAcao ctx={janela.ctx} clientePadrao={clienteDoPlano} aoFechar={() => d.setJanela(null)} aoSalvar={async (dados) => { if (await d.gravarAcao(janela.ctx, dados)) d.setJanela(null); }} />}
            {janela?.tipo === 'cabecalho' && <JanelaDadosPlano cabecalho={cabecalho} aoFechar={() => d.setJanela(null)} aoSalvar={d.salvarDados} />}
        </>
    );
}
