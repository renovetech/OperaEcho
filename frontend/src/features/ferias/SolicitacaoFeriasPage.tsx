import Icon from '@/shared/ui/Icon';
import { AlertaPrazoClt, fundoDoStatus, SeloStatus } from '@/features/ferias/componentes';
import { useSolicitacaoFerias } from '@/features/ferias/hooks';
import { AJUDA_FERIAS, calcularFim, formatarData, OPCOES_FERIAS } from '@/features/ferias/regras';
import { useVoltar } from '@/shared/hooks';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';
import { Card, CardTitulo, FormCard, FormSecao, PageHeader } from '@/shared/ui/Pagina';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

interface SolicitacaoFeriasPageProps {
    /** Módulo de permissão: Implantação (padrão) ou Projetos. */
    modulo?: string;
    /** No submenu Projetos, a tela opera travada na lotação escolhida. */
    lotacaoFixa?: string;
}

export function SolicitacaoFeriasPage({ modulo = 'ferias_solicitacao', lotacaoFixa }: SolicitacaoFeriasPageProps) {
    const voltar = useVoltar();
    const s = useSolicitacaoFerias(modulo, lotacaoFixa);
    const marcadas = OPCOES_FERIAS.filter((opcao) => opcao.id in s.selecao);

    return (
        <>
            <PageHeader
                titulo="Solicitação de Férias"
                ajuda={AJUDA_FERIAS.tela}
                acoes={<Button variant="secondary" onClick={voltar}>Voltar</Button>}
            />
            <FormCard
                className="mb-3.5"
                aoEnviar={(evento) => { evento.preventDefault(); void s.enviar(); }}
                rodape={s.podeNovo
                    ? <Button type="submit" isLoading={s.enviando} disabled={!s.idColaborador || s.carregandoHistorico}><Icon n="target" /> Enviar solicitação</Button>
                    : <span className="text-[13px] text-text-2">Sem permissão para criar solicitações.</span>}
            >
                <FormSecao>
                    <div className="grid grid-cols-[3fr_1fr_1fr] gap-3.5">
                        <Field rotulo="Colaborador" htmlFor="fe-colaborador">
                            <Select id="fe-colaborador" disabled={s.colaboradores.length <= 1} value={s.idColaborador} onChange={(e) => s.selecionarColaborador(e.target.value)}>
                                <option value="">Selecione o colaborador...</option>
                                {s.colaboradores.map((item) => <option key={item.id_usuario} value={item.id_usuario}>{item.nome_completo}{item.funcao ? ` - ${item.funcao}` : ''}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Período aquisitivo (ano)" htmlFor="fe-periodo" ajuda={AJUDA_FERIAS.periodo(s.limite)}>
                            <Input id="fe-periodo" type="number" max={s.limite} value={s.periodo} onChange={(e) => s.alterarPeriodo(e.target.value)} />
                        </Field>
                        <Field rotulo="Dias restantes" htmlFor="fe-saldo" ajuda={AJUDA_FERIAS.saldo}>
                            <Input id="fe-saldo" readOnly className="text-center font-semibold text-pine-800 tabular-nums" value={s.carregandoHistorico ? '...' : s.saldo} />
                        </Field>
                    </div>
                </FormSecao>
                <FormSecao titulo="Período(s) de gozo" ajuda={AJUDA_FERIAS.gozo}>
                    {s.alertaClt && <AlertaPrazoClt alerta={s.alertaClt} />}
                    <div className="grid grid-cols-4 gap-2.5">
                        {OPCOES_FERIAS.map((opcao) => {
                            const marcada = opcao.id in s.selecao;
                            return (
                                <label key={opcao.id} className={cn('m-0 flex cursor-pointer items-center gap-2.5 rounded-lg border border-solid px-3.5 py-3 text-[13.5px] transition-colors', marcada ? 'border-pine bg-tint font-semibold text-pine-800' : 'border-line bg-white text-text hover:bg-surface-2')}>
                                    <input type="checkbox" className="m-0 size-[17px] cursor-pointer accent-pine" checked={marcada} onChange={() => s.alternar(opcao.id)} />
                                    {opcao.rotulo}
                                </label>
                            );
                        })}
                    </div>
                    {marcadas.length > 0 && (
                        <div className="mt-4 grid grid-cols-2 gap-3.5">
                            {marcadas.map((opcao) => {
                                const inicio = s.selecao[opcao.id] ?? '';
                                return (
                                    <Field key={opcao.id} rotulo={`Início para ${opcao.rotulo}${inicio ? ` · termina em ${formatarData(calcularFim(inicio, opcao.dias))}` : ''}`} htmlFor={`fe-${opcao.id}`} obrigatorio>
                                        <Input id={`fe-${opcao.id}`} type="date" min="1900-01-01" max="2100-12-31" value={inicio} onChange={(e) => s.alterarData(opcao.id, e.target.value)} />
                                    </Field>
                                );
                            })}
                        </div>
                    )}
                </FormSecao>
            </FormCard>
            <Card>
                <CardTitulo titulo="Solicitações do colaborador" />
                <div className="p-3.5">
                    <Tabela cabecalho={<><Th>Data solicitação</Th><Th>Tipo</Th><Th centro>Período aq.</Th><Th centro>Período de gozo</Th><Th centro>Status</Th></>}>
                        {!s.historico.length && <LinhaVazia colunas={5}>{s.idColaborador ? 'Nenhuma solicitação registrada.' : 'Selecione um colaborador.'}</LinhaVazia>}
                        {s.historico.map((item) => (
                            <tr key={item.id_ferias} className={fundoDoStatus(item.status)}>
                                <Td className="tabular-nums">{formatarData(item.data_solicitacao)}</Td>
                                <Td>{item.tipo_solicitacao}</Td>
                                <Td centro className="tabular-nums">{item.periodo_aquisitivo}</Td>
                                <Td centro className="tabular-nums">{formatarData(item.data_inicio)} até {formatarData(item.data_fim)}</Td>
                                <Td centro><SeloStatus status={item.status} /></Td>
                            </tr>
                        ))}
                    </Tabela>
                </div>
            </Card>
        </>
    );
}
