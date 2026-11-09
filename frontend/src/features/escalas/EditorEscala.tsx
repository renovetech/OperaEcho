import Icon from '@/shared/ui/Icon';
import type { FormEscala, TipoEscala, TurnoEscala } from '@/features/escalas/api';
import { NOMES_DIAS, useEditorEscala, type CelulaEscala } from '@/features/escalas/hooks';
import type { Colaborador } from '@/features/escalas/api';
import { cn, formatarDiaMes } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Checkbox, Field, GrupoSelecao, Input, Select } from '@/shared/ui/Campos';
import { Janela } from '@/shared/ui/Janela';

const TIPOS: [TipoEscala, string][] = [
    ['APOIO', 'Apoio ao Projeto'],
    ['ATESTADO', 'Atestado Médico'],
    ['FALTA', 'Falta'],
    ['FERIADO', 'Feriado'],
    ['FERIAS', 'Férias'],
    ['FOLGA', 'Folga'],
    ['HOME_OFFICE', 'Home Office'],
    ['SEDE', 'Sede'],
    ['SEDE_TREINAMENTO', 'Sede - Treinamento'],
    ['TRABALHO', 'Trabalho']
];

const TURNOS: [TurnoEscala, string][] = [['NORMAL', 'Normal'], ['DIURNO', 'Plantão Diurno'], ['NOTURNO', 'Plantão Noturno']];

interface EditorEscalaProps {
    apiBase: string;
    lotacao?: string;
    celula: CelulaEscala;
    colaboradores: Colaborador[];
    dias: string[];
    copiado: FormEscala | null;
    aoCopiar: (form: FormEscala) => void;
    aoFechar: () => void;
    aoConcluir: () => void;
}

function ListaDestino({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="m-0 mb-2 text-[13px] font-semibold text-ink">{titulo}</p>
            <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto rounded-lg border border-line p-3">{children}</div>
        </div>
    );
}

export function EditorEscala({ apiBase, lotacao, celula, colaboradores, dias, copiado, aoCopiar, aoFechar, aoConcluir }: EditorEscalaProps) {
    const e = useEditorEscala({ apiBase, lotacao, celula, colaboradores, copiado, aoCopiar, aoConcluir });
    const { form } = e;
    const trabalho = form.tipo === 'TRABALHO';
    const pedeProjeto = trabalho || form.tipo === 'APOIO';
    const indiceDia = dias.indexOf(celula.dia);
    const rotuloTipo = TIPOS.find(([valor]) => valor === form.tipo)?.[1];
    const avisoProdutos = form.id_unidade ? 'Nenhum produto vinculado.' : 'Selecione a unidade.';

    const acoes = (
        <>
            <Button variant="secondary" size="sm" onClick={e.copiar}><Icon n="clipboard" /> Copiar</Button>
            {copiado && <Button variant="secondary" size="sm" onClick={e.colar}><Icon n="inbox" /> Colar</Button>}
            <Button variant={e.replicando ? 'primary' : 'secondary'} size="sm" onClick={e.alternarReplicacao}>{e.replicando ? 'Cancelar replicação' : 'Replicar...'}</Button>
        </>
    );

    const rodape = e.replicando
        ? (
            <>
                <Button variant="secondary" onClick={e.alternarReplicacao}>Voltar</Button>
                <Button isLoading={e.salvando} onClick={e.replicar}><Icon n="check" /> Confirmar</Button>
            </>
        )
        : (
            <>
                <Button variant="secondary" onClick={aoFechar}>Cancelar</Button>
                {celula.item && <Button variant="secondary" disabled={e.salvando} onClick={e.limpar}>Limpar dia</Button>}
                <Button isLoading={e.salvando} onClick={e.salvar}>Salvar</Button>
            </>
        );

    return (
        <Janela
            titulo={<>{celula.colaborador.nome_completo} <small className="ml-1 text-[13px] font-normal text-text-2">{NOMES_DIAS[indiceDia]}, {formatarDiaMes(celula.dia)}</small></>}
            larguraClasse="w-[1080px]"
            acoes={acoes}
            rodape={rodape}
            aoFechar={aoFechar}
        >
            {e.replicando ? (
                <>
                    <p className="m-0 mb-3 text-[13.5px] text-text-2">Selecione quem receberá <b className="text-ink">{rotuloTipo}</b> e em quais dias.</p>
                    <div className="grid grid-cols-2 gap-6">
                        <ListaDestino titulo="1. Para quem?">
                            {colaboradores.map((colaborador) => (
                                <Checkbox key={colaborador.id_usuario} className="m-0" rotulo={colaborador.nome_completo} checked={e.usuariosDestino.includes(colaborador.id_usuario)} onChange={() => e.alternarUsuario(colaborador.id_usuario)} />
                            ))}
                        </ListaDestino>
                        <ListaDestino titulo="2. Para quais dias?">
                            {dias.map((dia, indice) => (
                                <Checkbox key={dia} className="m-0" rotulo={`${NOMES_DIAS[indice]} (${formatarDiaMes(dia)})`} checked={e.diasDestino.includes(dia)} onChange={() => e.alternarDia(dia)} />
                            ))}
                        </ListaDestino>
                    </div>
                </>
            ) : (
                <div className={cn('grid gap-6', trabalho && 'grid-cols-[minmax(0,1.7fr)_minmax(240px,1fr)]')}>
                    <div className="flex min-w-0 flex-col gap-3.5">
                        <div className="flex gap-3.5">
                            <Field rotulo="Tipo" htmlFor="esc-tipo" className="flex-1">
                                <Select id="esc-tipo" value={form.tipo} onChange={(ev) => e.alterar({ tipo: ev.target.value as TipoEscala })}>
                                    {TIPOS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                                </Select>
                            </Field>
                            {trabalho && (
                                <div className="flex shrink-0 flex-col gap-1.5">
                                    <span className="text-[12.5px] font-medium text-text">Turno</span>
                                    <div role="radiogroup" aria-label="Turno" className="flex gap-1.5">
                                        {TURNOS.map(([valor, rotulo]) => (
                                            <label key={valor} className={cn('m-0 inline-flex h-[42px] cursor-pointer items-center gap-1.5 rounded-lg border border-solid px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors', form.turno === valor ? 'border-pine bg-tint text-pine-800' : 'border-line bg-white text-text hover:bg-surface-2')}>
                                                <input type="radio" name="turno" className="m-0 accent-pine" checked={form.turno === valor} onChange={() => e.alterar({ turno: valor })} />
                                                {rotulo}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {pedeProjeto && (
                            <Field rotulo="Projeto" htmlFor="esc-projeto" obrigatorio>
                                <Select id="esc-projeto" value={form.id_projeto} onChange={(ev) => e.alterarProjeto(ev.target.value)}>
                                    <option value="">Selecione...</option>
                                    {e.projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                                </Select>
                            </Field>
                        )}
                        {trabalho && (
                            <div className="grid grid-cols-[3fr_1fr] gap-3.5">
                                <Field rotulo="Unidade" htmlFor="esc-unidade" obrigatorio>
                                    <Select id="esc-unidade" value={form.id_unidade} disabled={!form.id_projeto} onChange={(ev) => e.alterarUnidade(ev.target.value)}>
                                        <option value="">Selecione...</option>
                                        {e.unidades.map((unidade) => <option key={unidade.id_unidade} value={unidade.id_unidade}>{unidade.nome_unidade}</option>)}
                                    </Select>
                                </Field>
                                {/* Não aparece na escala nem em relatórios, só nas mensagens do WhatsApp. */}
                                <Field rotulo="Redmine (opcional)" htmlFor="esc-redmine">
                                    <Input id="esc-redmine" maxLength={30} placeholder="Nº do chamado" value={form.redmine} onChange={(ev) => e.alterar({ redmine: ev.target.value })} />
                                </Field>
                            </div>
                        )}
                    </div>
                    {trabalho && (
                        <div className="flex min-w-0 flex-col gap-2 border-l border-line pl-6">
                            <span className="text-[12.5px] font-medium text-text">Produtos</span>
                            <GrupoSelecao
                                itens={e.produtos.map((produto) => ({ id: Number(produto.id_produto), nome: produto.nome_produto }))}
                                selecionados={form.produtos}
                                aoAlternar={e.alternarProduto}
                                vazio={avisoProdutos}
                            />
                        </div>
                    )}
                </div>
            )}
        </Janela>
    );
}
