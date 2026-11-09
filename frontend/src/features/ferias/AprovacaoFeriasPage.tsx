import Icon from '@/shared/ui/Icon';
import type { SolicitacaoFerias } from '@/features/ferias/api';
import { AlertaAtencao, AlertaPrazoClt, fundoDoStatus, SeloStatus } from '@/features/ferias/componentes';
import { DocumentoEmExportacao } from '@/features/ferias/documentos';
import { useAprovacaoFerias, useGestaoFerias } from '@/features/ferias/hooks';
import { AJUDA_FERIAS, formatarData, OPCOES_FERIAS, type IdOpcaoFerias } from '@/features/ferias/regras';
import { useVoltar } from '@/shared/hooks';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Checkbox, Field, Input, Select } from '@/shared/ui/Campos';
import { Janela } from '@/shared/ui/Janela';
import { Badge, Card, PageHeader } from '@/shared/ui/Pagina';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

interface GerenciarFeriasProps {
    solicitacao: SolicitacaoFerias;
    podeEditar: boolean;
    podeAprovar: boolean;
    geradoPor: string;
    emitirDocumento: ReturnType<typeof useAprovacaoFerias>['emitirDocumento'];
    aoAtualizar: () => void;
    aoFechar: () => void;
}

function GerenciarFerias({ solicitacao, podeEditar, podeAprovar, geradoPor, emitirDocumento, aoAtualizar, aoFechar }: GerenciarFeriasProps) {
    const g = useGestaoFerias({ solicitacao, podeAprovar, geradoPor, emitirDocumento, aoAtualizar });
    const decide = podeEditar && podeAprovar;

    return (
        <Janela
            titulo="Gerenciar solicitação de férias"
            larguraClasse="w-[720px]"
            aoFechar={aoFechar}
            rodape={(
                <>
                    <Button variant="secondary" className="mr-auto" onClick={g.gerarRecibo}><Icon n="camera" /> Gerar recibo</Button>
                    <Button variant="secondary" disabled={!podeEditar || g.salvando} onClick={g.salvar}><Icon n="save" /> Salvar</Button>
                    <Button variant="danger" disabled={!decide || g.salvando} onClick={() => g.decidir('RECUSADO')}><Icon n="x" /> Rejeitar</Button>
                    <Button disabled={!decide || g.salvando} onClick={() => g.decidir('APROVADO')}><Icon n="check" /> Aprovar</Button>
                </>
            )}
        >
            {g.conflitos.length > 0 && (
                <AlertaAtencao titulo="Conflito de datas detectado">
                    <ul className="list-disc m-0 pl-5">
                        {g.conflitos.map((conflito) => <li key={`${conflito.nome_completo}-${conflito.data_inicio}`}><b>{conflito.nome_completo}</b> está de férias entre {formatarData(conflito.data_inicio)} e {formatarData(conflito.data_fim)} ({conflito.status})</li>)}
                    </ul>
                </AlertaAtencao>
            )}
            {g.alertaClt && <AlertaPrazoClt alerta={g.alertaClt} />}
            <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border-0 border-l-4 border-solid border-pine-700 bg-surface-2 px-4 py-3">
                <div>
                    <p className="m-0 text-xs text-text-2">Colaborador</p>
                    <p className="m-0 text-[15px] font-semibold text-ink">{solicitacao.nome_completo}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Badge tom="marca">{solicitacao.funcao || 'Colaborador'}</Badge>
                    <SeloStatus status={g.status} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
                <Field rotulo="Período aquisitivo" htmlFor="ge-periodo"><Input id="ge-periodo" type="number" value={g.periodo} onChange={(e) => g.setPeriodo(e.target.value)} /></Field>
                <Field rotulo="Tipo de férias" htmlFor="ge-tipo">
                    <Select id="ge-tipo" value={g.idOpcao} onChange={(e) => g.setIdOpcao(e.target.value as IdOpcaoFerias)}>
                        {OPCOES_FERIAS.map((opcao) => <option key={opcao.id} value={opcao.id}>{opcao.rotulo}</option>)}
                    </Select>
                </Field>
                <Field rotulo="Início do gozo" htmlFor="ge-inicio"><Input id="ge-inicio" type="date" min="1900-01-01" max="2100-12-31" value={g.inicio} onChange={(e) => g.setInicio(e.target.value)} /></Field>
                <Field rotulo="Fim do gozo (calculado)" htmlFor="ge-fim"><Input id="ge-fim" type="date" readOnly value={g.fim} /></Field>
            </div>
        </Janela>
    );
}

export function AprovacaoFeriasPage() {
    const voltar = useVoltar();
    const a = useAprovacaoFerias();

    return (
        <>
            <PageHeader
                titulo="Aprovação de Férias"
                ajuda={AJUDA_FERIAS.aprovacao}
                acoes={(
                    <>
                        <Button variant="secondary" onClick={a.relatorioGeral}><Icon n="file" /> Relatório geral</Button>
                        <Button variant="secondary" onClick={a.relatorioPrazos}><Icon n="calendar" /> Relatório de prazos</Button>
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                    </>
                )}
            />
            <Card className="mb-3.5 flex items-end gap-5 px-4 py-3.5">
                <Field rotulo="Lotação" htmlFor="ge-lotacao" className="w-80">
                    <Select id="ge-lotacao" value={a.lotacao} onChange={(e) => a.filtrarLotacao(e.target.value)}>
                        <option value="">Todas as lotações</option>
                        {a.global && <option value="SEDE">SEDE - GD (Implantadores)</option>}
                        {a.lotacoes.map((lotacao) => <option key={lotacao.id_projeto} value={lotacao.id_projeto}>{lotacao.nome_projeto}</option>)}
                    </Select>
                </Field>
                <Checkbox className="m-0 mb-3" rotulo="Mostrar concluídas e recusadas" checked={a.mostrarConcluidas} onChange={a.alternarConcluidas} />
                <Button variant="secondary" className="ml-auto" onClick={a.recarregar}><Icon n="refresh" /> Atualizar</Button>
            </Card>
            <div className={cn('transition-opacity', a.carregando && 'opacity-50')}>
                <Tabela cabecalho={<><Th>Colaborador</Th><Th>Função</Th><Th>Data solic.</Th><Th>Tipo</Th><Th>Início</Th><Th>Fim</Th><Th centro>Status</Th><Th centro>Ação</Th></>}>
                    {!a.carregando && !a.visiveis.length && <LinhaVazia colunas={8}>Nenhuma solicitação encontrada para o filtro selecionado.</LinhaVazia>}
                    {a.visiveis.map((item) => {
                        const liberado = a.podeEditar && a.podeAprovar(item.funcao);
                        return (
                            <tr key={item.id_ferias} className={fundoDoStatus(item.status)}>
                                <Td className="font-semibold">{item.nome_completo}</Td>
                                <Td>{item.funcao || '-'}</Td>
                                <Td className="tabular-nums">{formatarData(item.data_solicitacao)}</Td>
                                <Td>{item.tipo_solicitacao}</Td>
                                <Td className="tabular-nums">{formatarData(item.data_inicio)}</Td>
                                <Td className="tabular-nums">{formatarData(item.data_fim)}</Td>
                                <Td centro><SeloStatus status={item.status} /></Td>
                                <Td centro>
                                    <Button variant="secondary" size="sm" disabled={!liberado} title={liberado ? 'Gerenciar' : 'Sua função não pode aprovar esta solicitação'} onClick={() => a.gerenciar(item)}><Icon n="settings" /> Gerenciar</Button>
                                </Td>
                            </tr>
                        );
                    })}
                </Tabela>
            </div>
            {a.emGestao && (
                <GerenciarFerias
                    key={a.emGestao.id_ferias}
                    solicitacao={a.emGestao}
                    podeEditar={a.podeEditar}
                    podeAprovar={a.podeAprovar(a.emGestao.funcao)}
                    geradoPor={a.geradoPor}
                    emitirDocumento={a.emitirDocumento}
                    aoAtualizar={a.recarregar}
                    aoFechar={() => a.gerenciar(null)}
                />
            )}
            <DocumentoEmExportacao documento={a.documento} referencia={a.referenciaDocumento} />
        </>
    );
}
