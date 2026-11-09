/* Grade editável do plano: etapas, unidades e linhas de ação. */
import { Fragment, useEffect, useRef, useState, type ChangeEvent, type TextareaHTMLAttributes } from 'react';
import Icon from '@/shared/ui/Icon';
import { COR_STATUS, OPCOES_PRIORIDADE, OPCOES_RESPONSAVEL, STATUS_PADRAO, STATUS_SERII } from '@/features/planoAcao/templates';
import type { ItemPlano } from '@/features/planoAcao/api';
import { Avatar, BarraProgresso, BotaoIcone, InclusaoRapida } from '@/features/planoAcao/componentes';
import { hhmmParaMin, mascararHora, minParaHHMM, nomeCurto, soData } from '@/features/planoAcao/formatos';
import { estaAtrasado, type DetalhesPlano } from '@/features/planoAcao/hooksDetalhes';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';

const COLUNAS = 17;
const STATUS_EM_ANDAMENTO = 'Em andamento';
const TH = 'border-0 border-b border-r border-solid border-[#ffffff26] px-2 py-1.5 text-center text-xs font-semibold whitespace-nowrap text-white normal-case';
const FIXO_1 = 'sticky top-0 z-[3]';
const FIXO_2 = 'sticky top-[31px] z-[3]';
const PREVISTO = 'bg-[#2f6f4f]';
const REALIZADO = 'bg-[#3a6ea5]';
const TEMPO = 'bg-[#6a5a8a]';
const BASE = 'bg-pine-800';
const TD = 'border-0 border-b border-solid border-line-2 px-1.5 py-[5px] align-middle';
const CAMPO = 'box-border w-full rounded-md border border-solid border-transparent bg-transparent px-1.5 py-1.5 font-sans text-[13px] text-ink hover:border-line focus:border-pine focus:bg-white focus:outline-none disabled:cursor-default disabled:hover:border-transparent';
const CAMPO_DATA = 'text-center text-xs px-0.5';

function TextoAutomatico({ value, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    const campo = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (!campo.current) return;
        campo.current.style.height = 'auto';
        campo.current.style.height = `${campo.current.scrollHeight}px`;
    }, [value]);
    return <textarea ref={campo} rows={1} value={value} className={cn(CAMPO, 'min-h-[34px] resize-none overflow-hidden leading-snug', className)} {...props} />;
}

function Linha({ item, d }: { item: ItemPlano; d: DetalhesPlano }) {
    const { editavel, hoje } = d;
    const bloqueado = Boolean(item.tempo_previsto_bloqueado || Number(item.tempo_previsto) > 0) && item._tempo_str === undefined;
    const emAndamento = item.status === STATUS_EM_ANDAMENTO;
    const fechado = item.status === 'Fechado';
    const liberaPrevisto = editavel && emAndamento && !bloqueado;
    const vencido = !fechado && Boolean(soData(item.data_fim)) && soData(item.data_fim) < hoje;
    const sujo = d.sujos.has(item.id_item);
    const equipe = item.equipe ?? [];
    const nomesEquipe = equipe.map((pessoa) => nomeCurto(pessoa.nome_completo)).join(', ');
    const cor = (COR_STATUS as Record<string, typeof COR_STATUS['A Iniciar']>)[item.status ?? ''] ?? COR_STATUS['A Iniciar'];
    const alterarCampo = (campo: keyof ItemPlano) => (evento: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => d.alterar(item.id_item, { [campo]: evento.target.value });
    const tituloPrevisto = bloqueado ? 'Travado após salvar' : (emAndamento ? 'Informe hh:mm (trava ao salvar)' : 'Liberado apenas quando a situação for "Em andamento"');
    const responsaveis: string[] = [...new Set<string>([...OPCOES_RESPONSAVEL, ...(item.responsavel ? [item.responsavel] : [])])];
    const contexto = { grupo: item.id_unidade ? null : (item.titulo ?? 'GERAL'), modulo: item.modulo, id_unidade: item.id_unidade, apos_id_item: item.id_item, rotulo: item.id_unidade ? d.unidades.find((unidade) => unidade.id_unidade === item.id_unidade)?.nome_unidade : (item.titulo ?? 'GERAL') };

    return (
        <tr className={cn('group/linha hover:bg-surface-2', fechado && 'text-text-2')}>
            <td data-sem-exportar="" className={cn(TD, 'w-[34px] min-w-[34px] text-center', sujo && 'shadow-[inset_4px_0_0_#9c7a3c]')}>
                {editavel && (
                    <div className="flex flex-col items-center opacity-30 transition-opacity group-hover/linha:opacity-100">
                        <BotaoIcone icone="arrow-up" titulo="Mover para cima" onClick={() => d.moverItem(item, 'cima')} />
                        <BotaoIcone icone="arrow-down" titulo="Mover para baixo" onClick={() => d.moverItem(item, 'baixo')} />
                    </div>
                )}
            </td>
            <td className={cn(TD, 'w-80 min-w-80', vencido && 'shadow-[inset_4px_0_0_#a23b36]')}>
                {editavel
                    ? <TextoAutomatico aria-label="Ação" className={cn('font-medium', fechado && 'text-text-2')} maxLength={1000} value={item.descricao ?? ''} onChange={alterarCampo('descricao')} />
                    : <div className="px-1.5 py-1 text-[13px] font-medium whitespace-pre-wrap">{item.descricao}</div>}
            </td>
            <td className={cn(TD, 'w-[150px] min-w-[150px]')}><input type="text" aria-label="Cliente" className={CAMPO} maxLength={200} disabled={!editavel} placeholder={(d.cabecalho?.cliente ?? d.cabecalho?.nome_projeto) || '-'} value={item.cliente ?? ''} onChange={alterarCampo('cliente')} /></td>
            <td className={cn(TD, 'w-[200px] min-w-[200px]')}>
                <select aria-label="Responsável" className={cn(CAMPO, 'cursor-pointer')} disabled={!editavel} value={item.responsavel ?? ''} onChange={alterarCampo('responsavel')}>
                    <option value="">-</option>
                    {responsaveis.map((opcao) => <option key={opcao} value={opcao}>{opcao}</option>)}
                </select>
            </td>
            <td className={cn(TD, 'w-[150px] min-w-[150px]')}>
                <button type="button" data-sem-exportar="" title={nomesEquipe || (editavel ? 'Definir equipe' : 'Sem equipe')} onClick={() => d.setJanela({ tipo: 'equipe', item })} className="flex min-h-8 w-full cursor-pointer items-center rounded-lg border border-dashed border-transparent bg-transparent px-1.5 py-1 hover:border-line hover:bg-surface-2">
                    {equipe.slice(0, 3).map((pessoa) => <Avatar key={pessoa.id_usuario} nome={nomeCurto(pessoa.nome_completo)} />)}
                    {equipe.length > 3 && <Avatar mais={equipe.length - 3} />}
                    {!equipe.length && <span className="text-xs font-semibold text-muted">{editavel ? '+ equipe' : '-'}</span>}
                </button>
                <span data-equipe-nomes="" className="hidden px-1.5 py-1 text-xs">{nomesEquipe}</span>
            </td>
            <td className={cn(TD, 'w-[250px] min-w-[250px]')}><TextoAutomatico aria-label="Observação" className="break-words whitespace-pre-wrap" maxLength={1000} disabled={!editavel} value={item.observacao ?? ''} onChange={alterarCampo('observacao')} /></td>
            <td className={cn(TD, 'w-[92px] min-w-[92px]')}><input type="date" aria-label="Início previsto" min="1900-01-01" max="2100-12-31" className={cn(CAMPO, CAMPO_DATA)} disabled={!editavel} value={soData(item.data_inicio)} onChange={alterarCampo('data_inicio')} /></td>
            <td className={cn(TD, 'w-[92px] min-w-[92px]')}><input type="date" aria-label="Fim previsto" max="2100-12-31" min={soData(item.data_inicio) || undefined} className={cn(CAMPO, CAMPO_DATA, vencido && 'font-bold text-danger')} disabled={!editavel} value={soData(item.data_fim)} onChange={alterarCampo('data_fim')} /></td>
            <td className={cn(TD, 'w-[92px] min-w-[92px]')}><input type="date" aria-label="Início realizado" min="1900-01-01" max={hoje} className={cn(CAMPO, CAMPO_DATA)} disabled={!editavel} value={soData(item.data_inicio_real)} onChange={alterarCampo('data_inicio_real')} /></td>
            <td className={cn(TD, 'w-[92px] min-w-[92px]')}><input type="date" aria-label="Fim realizado" max={hoje} min={soData(item.data_inicio_real) || undefined} className={cn(CAMPO, CAMPO_DATA)} disabled={!editavel} value={soData(item.data_fim_real)} onChange={alterarCampo('data_fim_real')} /></td>
            <td className={cn(TD, 'w-16 min-w-16')}>
                <input
                    type="number"
                    aria-label="Percentual"
                    min={0}
                    max={100}
                    step={5}
                    placeholder="0"
                    className={cn(CAMPO, 'px-0.5 text-center font-bold')}
                    disabled={!editavel || fechado}
                    value={fechado ? 100 : (item.percentual ?? '')}
                    onChange={(evento) => d.alterar(item.id_item, { percentual: evento.target.value === '' ? null : Math.max(0, Math.min(100, Number.parseInt(evento.target.value, 10) || 0)) })}
                />
            </td>
            <td className={cn(TD, 'w-[84px] min-w-[84px]')}>
                <input
                    type="text"
                    aria-label="Tempo previsto"
                    inputMode="numeric"
                    placeholder="hh:mm"
                    maxLength={5}
                    title={tituloPrevisto}
                    className={cn(CAMPO, 'text-center font-bold disabled:cursor-not-allowed disabled:bg-line-2 disabled:text-muted')}
                    disabled={!liberaPrevisto}
                    value={item._tempo_str ?? minParaHHMM(item.tempo_previsto)}
                    onChange={(evento) => {
                        const valor = mascararHora(evento.target.value);
                        d.alterar(item.id_item, { _tempo_str: valor, tempo_previsto: hhmmParaMin(valor) });
                    }}
                />
            </td>
            <td className={cn(TD, 'w-[84px] min-w-[84px] text-center font-bold text-[#6a5a8a]')} title="Calculado automaticamente entre 'Em andamento' e 'Fechado' (expediente seg-sex, 08-19h).">{minParaHHMM(item.tempo_gasto) || '-'}</td>
            <td className={cn(TD, 'w-[84px] min-w-[84px]')}>
                <button type="button" data-botao-horas="" title="Apontamentos de horas trabalhadas" disabled={d.encerrado && !item.horas_trabalhadas} onClick={() => d.setJanela({ tipo: 'horas', item })} className="w-full cursor-pointer rounded-md border border-solid border-[#e3ddef] bg-[#f6f4fa] px-1 py-1.5 font-sans text-xs font-bold text-[#6a5a8a] hover:border-[#6a5a8a] disabled:cursor-default disabled:opacity-70">
                    {minParaHHMM(item.horas_trabalhadas) || (d.encerrado ? '-' : '+ horas')}
                </button>
            </td>
            <td className={cn(TD, 'w-[116px] min-w-[116px]')}>
                <select aria-label="Situação" data-selo="1" className="box-border w-full cursor-pointer rounded-lg border border-solid px-1.5 py-1.5 font-sans text-xs font-bold disabled:cursor-default disabled:opacity-100" style={{ backgroundColor: cor.bg, color: cor.fg, borderColor: cor.bd }} disabled={!editavel} value={item.status ?? 'A Iniciar'} onChange={alterarCampo('status')}>
                    {(item.modulo ? STATUS_SERII : STATUS_PADRAO).map((status: string) => <option key={status} value={status}>{status}</option>)}
                </select>
            </td>
            <td className={cn(TD, 'w-[92px] min-w-[92px]')}>
                <select aria-label="Prioridade" data-selo="1" className="box-border w-full cursor-pointer rounded-lg border border-solid border-line bg-white px-1.5 py-1.5 font-sans text-xs font-bold text-ink disabled:cursor-default disabled:opacity-100" disabled={!editavel} value={item.prioridade ?? 'Alta'} onChange={alterarCampo('prioridade')}>
                    {OPCOES_PRIORIDADE.map((opcao: string) => <option key={opcao} value={opcao}>{opcao}</option>)}
                </select>
            </td>
            <td data-sem-exportar="" className={cn(TD, 'w-[70px] min-w-[70px] whitespace-nowrap')}>
                {editavel && (
                    <div className="flex justify-center opacity-40 transition-opacity group-hover/linha:opacity-100">
                        <BotaoIcone icone="plus" titulo="Inserir ação abaixo" onClick={() => d.setJanela({ tipo: 'acao', ctx: contexto })} />
                        <BotaoIcone perigo icone="trash" titulo="Excluir ação" onClick={() => d.excluirItem(item)} />
                    </div>
                )}
            </td>
        </tr>
    );
}

interface CabecalhoEtapaProps {
    numero?: number;
    nome: string;
    lista: ItemPlano[];
    unidade?: boolean;
    d: DetalhesPlano;
    aoNovaAcao: () => void;
    aoRenomear?: (novo: string) => void;
    aoExcluir: () => void;
}

function CabecalhoEtapa({ numero, nome, lista, unidade, d, aoNovaAcao, aoRenomear, aoExcluir }: CabecalhoEtapaProps) {
    const [editando, setEditando] = useState(false);
    const [valor, setValor] = useState(nome);
    const fechados = lista.filter((item) => item.status === 'Fechado').length;
    const atrasados = lista.filter((item) => estaAtrasado(item, d.hoje)).length;
    const percentual = lista.length ? Math.round((fechados / lista.length) * 100) : 0;
    const podeRenomear = d.editavel && !unidade;

    const confirmarNome = () => {
        setEditando(false);
        if (valor.trim() && valor.trim().toUpperCase() !== nome) aoRenomear?.(valor);
        else setValor(nome);
    };

    return (
        <tr>
            <td colSpan={COLUNAS} className="border-0 bg-white px-2.5 pt-3.5 pb-1.5">
                <div className={cn('sticky left-2 flex max-w-[1240px] items-center gap-3 rounded-lg border-0 border-l-4 border-solid px-3 py-2', unidade ? 'border-brass bg-brass-tint' : 'border-pine bg-tint')}>
                    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white', unidade ? 'bg-brass' : 'bg-pine')}>{unidade ? <Icon n="building" /> : String(numero).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1">
                        {editando ? (
                            <input aria-label="Nome da etapa" value={valor} maxLength={120} className={cn(CAMPO, 'border-pine bg-white font-bold')} onChange={(e) => setValor(e.target.value.toUpperCase())} onBlur={confirmarNome} onKeyDown={(e) => { if (e.key === 'Enter') confirmarNome(); if (e.key === 'Escape') { setValor(nome); setEditando(false); } }} />
                        ) : (
                            <b className="block truncate text-[13.5px] text-ink" title={podeRenomear ? 'Duplo clique para renomear' : undefined} onDoubleClick={() => podeRenomear && setEditando(true)}>{nome}</b>
                        )}
                        <small className="text-xs text-text-2">
                            {unidade ? 'Unidade · ' : 'Etapa · '}
                            {lista.length ? `${fechados} de ${lista.length} ação(ões) concluída(s)` : 'nenhuma ação cadastrada'}
                            {atrasados > 0 && <em className="font-semibold text-danger not-italic"> · {atrasados} atrasada(s)</em>}
                        </small>
                    </div>
                    <div className="flex w-40 shrink-0 items-center gap-2" title={`${percentual}% concluído`}><BarraProgresso valor={percentual} /><b className="text-xs tabular-nums">{percentual}%</b></div>
                    {d.editavel && (
                        <div data-sem-exportar="" className="flex shrink-0 items-center">
                            <Button variant="ghost" size="sm" title="Nova ação (formulário completo)" onClick={aoNovaAcao}><Icon n="plus" /> Ação</Button>
                            {!unidade && <BotaoIcone icone="edit" titulo="Renomear etapa" onClick={() => setEditando(true)} />}
                            <BotaoIcone perigo icone="trash" titulo={unidade ? 'Remover unidade do plano' : 'Excluir etapa'} onClick={aoExcluir} />
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
}

function LinhaRapida({ placeholder, aoAdicionar }: { placeholder: string; aoAdicionar: (texto: string) => void }) {
    return <tr data-sem-exportar=""><td colSpan={COLUNAS} className="border-0 px-2.5 py-1.5"><div className="sticky left-2 max-w-[1240px]"><InclusaoRapida placeholder={placeholder} aoAdicionar={aoAdicionar} /></div></td></tr>;
}

function LinhaNovaEtapa({ modulo, aoCriar }: { modulo: string | null; aoCriar: (nome: string) => void }) {
    const [aberto, setAberto] = useState(false);
    const [nome, setNome] = useState('');
    const sufixo = modulo ? ` em ${modulo}` : '';
    const criar = () => {
        if (!nome.trim()) return;
        aoCriar(nome);
        setNome('');
        setAberto(false);
    };

    return (
        <tr data-sem-exportar="">
            <td colSpan={COLUNAS} className="border-0 px-2.5 py-1.5">
                <div className="sticky left-2 flex max-w-[1240px] items-center gap-2">
                    {aberto ? (
                        <>
                            <input aria-label="Nome da nova etapa" value={nome} maxLength={120} placeholder={`Nome da nova etapa${sufixo} (ex.: TREINAMENTO)`} className={cn(CAMPO, 'flex-1 border-line bg-white')} onChange={(e) => setNome(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') criar(); if (e.key === 'Escape') setAberto(false); }} />
                            <Button size="sm" disabled={!nome.trim()} onClick={criar}>Criar etapa</Button>
                            <Button size="sm" variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
                        </>
                    ) : <Button variant="ghost" size="sm" onClick={() => setAberto(true)}><Icon n="plus" /> Nova etapa{sufixo}</Button>}
                </div>
            </td>
        </tr>
    );
}

export function GradePlano({ d }: { d: DetalhesPlano }) {
    const { editavel, filtroAtivo, visivel } = d;
    const temModulos = d.blocos.some((bloco) => bloco.modulo);
    const moduloPadrao = d.modulos[0] ?? null;

    return (
        <div data-grade-rolagem="" className="max-h-[70vh] overflow-auto rounded-lg border border-solid border-line">
            <table className="w-full min-w-[1960px] border-collapse text-[13px]">
                <thead>
                    <tr>
                        <th rowSpan={2} data-sem-exportar="" className={cn(TH, FIXO_1, BASE)}>#</th>
                        {['Ação a ser realizada', 'Cliente', 'Responsável', 'Equipe', 'Observação / Justificativa'].map((titulo) => <th key={titulo} rowSpan={2} className={cn(TH, FIXO_1, BASE)}>{titulo}</th>)}
                        <th colSpan={2} className={cn(TH, FIXO_1, PREVISTO)}>Prazo Previsto</th>
                        <th colSpan={2} className={cn(TH, FIXO_1, REALIZADO)}>Execução Realizada</th>
                        <th colSpan={4} className={cn(TH, FIXO_1, TEMPO)}>Tempo e Execução</th>
                        <th rowSpan={2} className={cn(TH, FIXO_1, BASE)}>Situação</th>
                        <th rowSpan={2} className={cn(TH, FIXO_1, BASE)}>Prioridade</th>
                        <th rowSpan={2} data-sem-exportar="" className={cn(TH, FIXO_1, BASE)} aria-label="Ações da linha" />
                    </tr>
                    <tr>
                        <th className={cn(TH, FIXO_2, PREVISTO)}>Início</th>
                        <th className={cn(TH, FIXO_2, PREVISTO)}>Fim</th>
                        <th className={cn(TH, FIXO_2, REALIZADO)}>Início</th>
                        <th className={cn(TH, FIXO_2, REALIZADO)}>Fim</th>
                        {['%', 'Previsto', 'Gasto', 'Horas trab.'].map((titulo) => <th key={titulo} className={cn(TH, FIXO_2, TEMPO)}>{titulo}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {d.blocos.map((bloco) => {
                        const todos = [...bloco.subgrupos.flatMap(([, lista]) => lista), ...bloco.porUnidade.flatMap(([, unidade]) => unidade.itens)];
                        if (filtroAtivo && !todos.some(visivel)) return null;
                        return (
                            <Fragment key={bloco.modulo ?? 'base'}>
                                {temModulos && bloco.modulo && (
                                    <tr>
                                        <td colSpan={COLUNAS} className="border-0 bg-pine-800 px-3 py-2 text-[13px] font-bold text-white">
                                            <div className="sticky left-2 flex max-w-[1240px] justify-between">
                                                <span><Icon n="puzzle" /> MÓDULO {bloco.modulo}</span>
                                                <span className="text-xs font-semibold">{bloco.fechados}/{bloco.total} · {bloco.progresso}% concluído</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {bloco.subgrupos.map(([grupo, lista], indice) => {
                                    const visiveis = lista.filter(visivel);
                                    if (filtroAtivo && !visiveis.length) return null;
                                    return (
                                        <Fragment key={grupo}>
                                            <CabecalhoEtapa d={d} numero={indice + 1} nome={grupo} lista={lista} aoNovaAcao={() => d.setJanela({ tipo: 'acao', ctx: { grupo, modulo: bloco.modulo, rotulo: grupo } })} aoRenomear={(novo) => d.renomearEtapa(bloco.modulo, grupo, novo)} aoExcluir={() => d.excluirEtapa(bloco.modulo, grupo, lista.length)} />
                                            {visiveis.map((item) => <Linha key={item.id_item} item={item} d={d} />)}
                                            {editavel && !filtroAtivo && <LinhaRapida placeholder={`Adicionar ação em ${grupo}... (Enter)`} aoAdicionar={(texto) => d.gravarAcao({ grupo, modulo: bloco.modulo }, { descricao: texto })} />}
                                        </Fragment>
                                    );
                                })}
                                {editavel && !filtroAtivo && <LinhaNovaEtapa modulo={bloco.modulo} aoCriar={(nome) => d.criarEtapa(bloco.modulo, nome)} />}
                                {bloco.porUnidade.map(([nome, { id, itens: lista }]) => {
                                    const visiveis = lista.filter(visivel);
                                    if (filtroAtivo && !visiveis.length) return null;
                                    return (
                                        <Fragment key={nome}>
                                            <CabecalhoEtapa unidade d={d} nome={nome} lista={lista} aoNovaAcao={() => d.setJanela({ tipo: 'acao', ctx: { modulo: bloco.modulo, id_unidade: id, rotulo: nome } })} aoExcluir={() => d.removerUnidade(id, nome)} />
                                            {visiveis.map((item) => <Linha key={item.id_item} item={item} d={d} />)}
                                            {editavel && !filtroAtivo && <LinhaRapida placeholder={`Adicionar ação na unidade ${nome}... (Enter)`} aoAdicionar={(texto) => d.gravarAcao({ modulo: bloco.modulo, id_unidade: id }, { descricao: texto })} />}
                                        </Fragment>
                                    );
                                })}
                            </Fragment>
                        );
                    })}
                    {!filtroAtivo && d.unidadesVazias.map((unidade) => (
                        <Fragment key={unidade.id_unidade}>
                            <CabecalhoEtapa unidade d={d} nome={unidade.nome_unidade} lista={[]} aoNovaAcao={() => d.setJanela({ tipo: 'acao', ctx: { modulo: moduloPadrao, id_unidade: unidade.id_unidade, rotulo: unidade.nome_unidade } })} aoExcluir={() => d.removerUnidade(unidade.id_unidade, unidade.nome_unidade)} />
                            {editavel && <LinhaRapida placeholder={`Adicionar ação na unidade ${unidade.nome_unidade}... (Enter)`} aoAdicionar={(texto) => d.gravarAcao({ modulo: moduloPadrao, id_unidade: unidade.id_unidade }, { descricao: texto })} />}
                        </Fragment>
                    ))}
                    {!d.itens.length && !d.pendentes.length && <tr><td colSpan={COLUNAS} className="p-8 text-sm text-text-2"><b>Plano ainda sem etapas.</b> {editavel ? 'Crie a primeira etapa acima e cadastre as ações.' : ''}</td></tr>}
                    {filtroAtivo && !d.qtdVisiveis && <tr><td colSpan={COLUNAS} className="p-8 text-sm text-text-2">Nenhuma ação corresponde aos filtros.</td></tr>}
                </tbody>
            </table>
        </div>
    );
}
