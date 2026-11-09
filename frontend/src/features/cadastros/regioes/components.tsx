import type { FormEvent, ReactNode } from 'react';
import Icon from '@/shared/ui/Icon';
import type { FormMacro, FormMicro, Macro, UnidadeRegiao } from '@/features/cadastros/regioes/api';
import { MACRO_VAZIA, MICRO_VAZIA, PALETA, useEdicaoRegioes, useVinculos } from '@/features/cadastros/regioes/hooks';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Checkbox, Field, Input, Select } from '@/shared/ui/Campos';
import { Card, CardTitulo } from '@/shared/ui/Pagina';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

interface Permissoes {
    podeNovo: boolean;
    podeEditar: boolean;
}

function FormularioRegiao({ nome, sigla, cor, exemplo, siglaExemplo, emEdicao, aoEnviar, aoAlterar, extra }: {
    nome: string;
    sigla: string;
    cor: string;
    exemplo: string;
    siglaExemplo: string;
    emEdicao: boolean;
    aoEnviar: (evento: FormEvent) => void;
    aoAlterar: (campo: 'nome' | 'sigla' | 'cor', valor: string) => void;
    extra?: ReactNode;
}) {
    return (
        <form onSubmit={aoEnviar} className="mb-3.5 border-b border-line-2 px-[18px] pt-3.5 pb-4">
            <div className="grid grid-cols-[1fr_90px_56px_auto] items-end gap-2.5">
                <Field rotulo="Nome"><Input value={nome} maxLength={120} placeholder={exemplo} onChange={(e) => aoAlterar('nome', e.target.value)} /></Field>
                <Field rotulo="Sigla"><Input value={sigla} maxLength={20} placeholder={siglaExemplo} onChange={(e) => aoAlterar('sigla', e.target.value)} /></Field>
                <Field rotulo="Cor"><input type="color" aria-label="Cor" value={cor} className="box-border h-[42px] w-full cursor-pointer rounded-lg border border-line bg-white p-1" onChange={(e) => aoAlterar('cor', e.target.value)} /></Field>
                <Button type="submit">{emEdicao ? 'Atualizar' : 'Adicionar'}</Button>
            </div>
            {extra && <div className="mt-3 flex items-end gap-4">{extra}</div>}
        </form>
    );
}

function ItemRegiao({ cor, titulo, detalhe, inativa, selecionada, aoSelecionar, podeEditar, aoEditar, aoExcluir }: {
    cor: string;
    titulo: string;
    detalhe: string;
    inativa: boolean;
    selecionada?: boolean;
    aoSelecionar?: () => void;
    podeEditar: boolean;
    aoEditar: () => void;
    aoExcluir: () => void;
}) {
    return (
        <li
            onClick={aoSelecionar}
            className={cn(
                'flex items-center gap-3 border-b border-line-2 px-[18px] py-2.5 last:border-b-0',
                aoSelecionar && 'cursor-pointer hover:bg-surface-2',
                selecionada && 'bg-tint shadow-[inset_3px_0_0_var(--color-pine)]',
                inativa && 'opacity-60'
            )}
        >
            <span className="size-3 shrink-0 rounded-full" style={{ background: cor }} />
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">{titulo}</span>
                <span className="block text-xs text-text-2">{detalhe}</span>
            </span>
            {podeEditar && (
                <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button type="button" title="Editar" aria-label="Editar" className="cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-pine hover:bg-tint" onClick={aoEditar}><Icon n="edit" /></button>
                    <button type="button" title="Excluir" aria-label="Excluir" className="cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-danger hover:bg-danger-tint" onClick={aoExcluir}><Icon n="trash" /></button>
                </span>
            )}
        </li>
    );
}

const comSigla = (nome: string, sigla?: string | null) => (sigla ? `${nome} (${sigla})` : nome);
const CancelarEdicao = ({ aoClicar }: { aoClicar: () => void }) => <Button variant="ghost" size="sm" onClick={aoClicar}>Cancelar edição</Button>;

export function AbaRegioes({ idProjeto, macros, recarregar, permissoes }: { idProjeto: string; macros: Macro[]; recarregar: () => void; permissoes: Permissoes }) {
    const { macroAtual, formMacro, setFormMacro, formMicro, setFormMicro, gravarMacro, removerMacro, gravarMicro, removerMicro, selecionarMacro } =
        useEdicaoRegioes(idProjeto, macros, recarregar);
    const podeGravarMacro = formMacro.id_macro ? permissoes.podeEditar : permissoes.podeNovo;
    const podeGravarMicro = formMicro.id_micro ? permissoes.podeEditar : permissoes.podeNovo;
    const alterarMacro = (campo: 'nome' | 'sigla' | 'cor', valor: string) =>
        setFormMacro({ ...formMacro, ...(campo === 'nome' ? { nome_macro: valor } : { [campo]: valor }) } as FormMacro);
    const alterarMicro = (campo: 'nome' | 'sigla' | 'cor', valor: string) =>
        setFormMicro({ ...formMicro, ...(campo === 'nome' ? { nome_micro: valor } : { [campo]: valor }) } as FormMicro);

    return (
        <div className="grid grid-cols-2 items-start gap-4">
            <Card>
                <CardTitulo titulo="Macro regiões" />
                {podeGravarMacro && (
                    <FormularioRegiao
                        nome={formMacro.nome_macro} sigla={formMacro.sigla || ''} cor={formMacro.cor || MACRO_VAZIA.cor}
                        exemplo="Ex.: III Macro" siglaExemplo="III" emEdicao={Boolean(formMacro.id_macro)} aoEnviar={gravarMacro} aoAlterar={alterarMacro}
                        extra={formMacro.id_macro ? (
                            <>
                                <Checkbox rotulo="Ativa" checked={formMacro.ativo} onChange={(e) => setFormMacro({ ...formMacro, ativo: e.target.checked })} />
                                <CancelarEdicao aoClicar={() => setFormMacro(MACRO_VAZIA)} />
                            </>
                        ) : undefined}
                    />
                )}
                <ul className="m-0 list-none p-0">
                    {macros.map((macro) => (
                        <ItemRegiao
                            key={macro.id_macro}
                            cor={macro.cor || '#94a3b8'}
                            titulo={comSigla(macro.nome_macro, macro.sigla)}
                            detalhe={`${macro.micros.length} micro(s) · ${macro.unidades} unidade(s)${macro.ativo ? '' : ' · inativa'}`}
                            inativa={!macro.ativo}
                            selecionada={macroAtual?.id_macro === macro.id_macro}
                            aoSelecionar={() => selecionarMacro(macro.id_macro)}
                            podeEditar={permissoes.podeEditar}
                            aoEditar={() => setFormMacro({ id_macro: macro.id_macro, nome_macro: macro.nome_macro, sigla: macro.sigla || '', cor: macro.cor || MACRO_VAZIA.cor, ativo: Boolean(macro.ativo), ordem: macro.ordem })}
                            aoExcluir={() => removerMacro(macro)}
                        />
                    ))}
                    {!macros.length && <li className="px-[18px] py-8 text-center text-sm text-text-2">Nenhuma macro região cadastrada.</li>}
                </ul>
            </Card>

            <Card>
                <CardTitulo titulo="Micro regiões" extra={macroAtual && <small className="text-xs text-text-2">de {macroAtual.nome_macro}</small>} />
                {!macroAtual && <p className="m-0 px-[18px] py-11 text-center text-sm text-text-2">Selecione uma macro região ao lado.</p>}
                {macroAtual && (
                    <>
                        {podeGravarMicro && (
                            <FormularioRegiao
                                nome={formMicro.nome_micro} sigla={formMicro.sigla || ''} cor={formMicro.cor || macroAtual.cor || PALETA[0] || ''}
                                exemplo="Ex.: 6ª Região" siglaExemplo="6ª" emEdicao={Boolean(formMicro.id_micro)} aoEnviar={gravarMicro} aoAlterar={alterarMicro}
                                extra={formMicro.id_micro ? (
                                    <>
                                        <Field rotulo="Macro" className="w-56">
                                            <Select value={formMicro.id_macro} onChange={(e) => setFormMicro({ ...formMicro, id_macro: e.target.value })}>
                                                {macros.map((macro) => <option key={macro.id_macro} value={macro.id_macro}>{macro.nome_macro}</option>)}
                                            </Select>
                                        </Field>
                                        <Checkbox rotulo="Ativa" className="mb-3" checked={formMicro.ativo} onChange={(e) => setFormMicro({ ...formMicro, ativo: e.target.checked })} />
                                        <CancelarEdicao aoClicar={() => setFormMicro(MICRO_VAZIA)} />
                                    </>
                                ) : undefined}
                            />
                        )}
                        <ul className="m-0 list-none p-0">
                            {macroAtual.micros.map((micro) => (
                                <ItemRegiao
                                    key={micro.id_micro}
                                    cor={micro.cor || macroAtual.cor || '#94a3b8'}
                                    titulo={comSigla(micro.nome_micro, micro.sigla)}
                                    detalhe={`${micro.unidades} unidade(s)${micro.ativo ? '' : ' · inativa'}`}
                                    inativa={!micro.ativo}
                                    podeEditar={permissoes.podeEditar}
                                    aoEditar={() => setFormMicro({ id_micro: micro.id_micro, id_macro: micro.id_macro, nome_micro: micro.nome_micro, sigla: micro.sigla || '', cor: micro.cor || '', ativo: Boolean(micro.ativo), ordem: micro.ordem })}
                                    aoExcluir={() => removerMicro(micro.id_micro, micro.nome_micro)}
                                />
                            ))}
                            {!macroAtual.micros.length && <li className="px-[18px] py-8 text-center text-sm text-text-2">Nenhuma micro região nesta macro.</li>}
                        </ul>
                    </>
                )}
            </Card>
        </div>
    );
}

export function AbaVinculos({ idProjeto, macros, unidades, recarregar, podeEditar }: { idProjeto: string; macros: Macro[]; unidades: UnidadeRegiao[]; recarregar: () => void; podeEditar: boolean }) {
    const v = useVinculos(idProjeto, unidades, recarregar);
    const microsDa = (idMacro: number | string) => macros.find((macro) => String(macro.id_macro) === String(idMacro))?.micros ?? [];
    const qtdAlteradas = Object.keys(v.alteracoes).length;
    const colunas = podeEditar ? 5 : 4;

    return (
        <>
            <Card className="mb-3.5 flex items-end gap-3.5 px-4 py-3.5">
                <Field rotulo="Buscar" className="w-96"><Input placeholder="Unidade, CNES ou município..." value={v.filtro.termo} onChange={(e) => v.setFiltro({ ...v.filtro, termo: e.target.value })} /></Field>
                <Field rotulo="Situação" className="w-52">
                    <Select value={v.filtro.situacao} onChange={(e) => v.setFiltro({ ...v.filtro, situacao: e.target.value })}>
                        <option value="todas">Todas as unidades</option>
                        <option value="sem">Sem região</option>
                        <option value="com">Com região</option>
                    </Select>
                </Field>
                {podeEditar && (
                    <div className="ml-auto flex items-end gap-2.5 border-l border-line pl-3.5">
                        <span className="pb-3 text-[13px] font-semibold whitespace-nowrap text-ink">{v.selecionadas.size} marcada(s)</span>
                        <Field rotulo="Macro" className="w-48">
                            <Select value={v.massa.id_macro} onChange={(e) => v.setMassa({ id_macro: e.target.value, id_micro: '' })}>
                                <option value="">Selecione...</option>
                                {macros.filter((macro) => macro.ativo).map((macro) => <option key={macro.id_macro} value={macro.id_macro}>{macro.nome_macro}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Micro (opcional)" className="w-48">
                            <Select value={v.massa.id_micro} disabled={!v.massa.id_macro} onChange={(e) => v.setMassa({ ...v.massa, id_micro: e.target.value })}>
                                <option value="">Selecione...</option>
                                {microsDa(v.massa.id_macro).filter((micro) => micro.ativo).map((micro) => <option key={micro.id_micro} value={micro.id_micro}>{micro.nome_micro}</option>)}
                            </Select>
                        </Field>
                        <Button variant="secondary" onClick={v.aplicarEmMassa}>Aplicar</Button>
                    </div>
                )}
            </Card>
            <Tabela
                cabecalho={(
                    <>
                        {podeEditar && <Th centro className="w-10"><input type="checkbox" aria-label="Marcar todas" className="accent-pine" checked={v.todasMarcadas} onChange={(e) => v.alternarTodas(e.target.checked)} /></Th>}
                        <Th>Unidade</Th><Th>Município</Th><Th className="w-64">Macro região</Th><Th className="w-64">Micro região</Th>
                    </>
                )}
            >
                {v.filtradas.map((unidade) => {
                    const vinculo = v.valorDe(unidade);
                    return (
                        <tr key={unidade.id_unidade} className={cn(v.alteracoes[unidade.id_unidade] && 'bg-brass-tint')}>
                            {podeEditar && <Td centro><input type="checkbox" aria-label={`Marcar ${unidade.nome_unidade}`} className="accent-pine" checked={v.selecionadas.has(unidade.id_unidade)} onChange={(e) => v.alternarSelecao(unidade.id_unidade, e.target.checked)} /></Td>}
                            <Td>
                                <span className="font-medium">{unidade.nome_unidade}</span>
                                <span className="mt-0.5 block text-xs text-text-2">CNES {unidade.cnes || '-'}{unidade.ativo ? '' : ' · Inativa'}</span>
                            </Td>
                            <Td>{unidade.nome_cidade || '-'}{unidade.uf ? ` / ${unidade.uf}` : ''}</Td>
                            <Td>
                                <Select value={vinculo.id_macro} disabled={!podeEditar} aria-label="Macro região" onChange={(e) => v.alterarUnidade(unidade, 'id_macro', e.target.value)}>
                                    <option value="">Sem macro</option>
                                    {macros.map((macro) => <option key={macro.id_macro} value={macro.id_macro}>{macro.nome_macro}</option>)}
                                </Select>
                            </Td>
                            <Td>
                                <Select value={vinculo.id_micro} disabled={!podeEditar || !vinculo.id_macro} aria-label="Micro região" onChange={(e) => v.alterarUnidade(unidade, 'id_micro', e.target.value)}>
                                    <option value="">Sem micro</option>
                                    {microsDa(vinculo.id_macro).map((micro) => <option key={micro.id_micro} value={micro.id_micro}>{micro.nome_micro}</option>)}
                                </Select>
                            </Td>
                        </tr>
                    );
                })}
                {!v.filtradas.length && <LinhaVazia colunas={colunas}>Nenhuma unidade.</LinhaVazia>}
            </Tabela>
            {podeEditar && (
                <div className="mt-3.5 flex justify-end gap-2.5">
                    {qtdAlteradas > 0 && <Button variant="secondary" onClick={() => v.setAlteracoes({})}>Descartar</Button>}
                    <Button disabled={!qtdAlteradas} onClick={v.salvar}>Salvar vínculos{qtdAlteradas ? ` (${qtdAlteradas})` : ''}</Button>
                </div>
            )}
        </>
    );
}
