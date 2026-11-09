/* Montador de etapas e ações para criar o plano do zero ou ajustar um modelo carregado. */
import { useState } from 'react';
import Icon from '@/shared/ui/Icon';
import { OPCOES_PRIORIDADE, OPCOES_RESPONSAVEL } from '@/features/planoAcao/templates';
import { BotaoIcone, InclusaoRapida } from '@/features/planoAcao/componentes';
import { cn } from '@/shared/lib';
import { BalaoAjuda } from '@/shared/ui/BalaoAjuda';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Campos';
import { Badge } from '@/shared/ui/Pagina';

export interface AcaoMontada {
    key: string;
    acao: string;
    responsavel: string;
    data_inicio: string;
    data_fim: string;
    prioridade: string;
    modulo?: string | null;
}

export interface EtapaMontada {
    key: string;
    nome: string;
    modulo: string | null;
    acoes: AcaoMontada[];
}

export const novaChave = () => crypto.randomUUID();

export const novaAcao = (acao = '', extra: Partial<AcaoMontada> = {}): AcaoMontada =>
    ({ key: novaChave(), acao, responsavel: '', data_inicio: '', data_fim: '', prioridade: 'Alta', ...extra });

export const novaEtapa = (nome = '', acoes: AcaoMontada[] = [], modulo: string | null = null): EtapaMontada =>
    ({ key: novaChave(), nome, modulo, acoes });

function mover<T>(lista: T[], indice: number, direcao: number): T[] {
    const alvo = indice + direcao;
    const a = lista[indice];
    const b = lista[alvo];
    if (a === undefined || b === undefined) return lista;
    return lista.map((item, posicao) => {
        if (posicao === indice) return b;
        return posicao === alvo ? a : item;
    });
}

const CAMPO_COMPACTO = 'px-2 py-1.5 text-[13px]';

function LinhaAcao({ acao, indice, total, aoMudar, aoRemover, aoMover }: { acao: AcaoMontada; indice: number; total: number; aoMudar: (acao: AcaoMontada) => void; aoRemover: () => void; aoMover: (direcao: number) => void }) {
    const alterar = (campo: keyof AcaoMontada, valor: string) => aoMudar({ ...acao, [campo]: valor });
    const invertida = Boolean(acao.data_inicio && acao.data_fim && acao.data_fim < acao.data_inicio);

    return (
        <div className={cn('mb-1.5 flex items-center gap-2 rounded-md border border-solid bg-white px-2 py-1.5', invertida ? 'border-danger' : 'border-line-2')}>
            <div className="flex shrink-0 items-center text-xs text-text-2">
                <BotaoIcone icone="arrow-up" titulo="Subir" disabled={indice === 0} onClick={() => aoMover(-1)} />
                <span className="w-4 text-center tabular-nums">{indice + 1}</span>
                <BotaoIcone icone="arrow-down" titulo="Descer" disabled={indice === total - 1} onClick={() => aoMover(1)} />
            </div>
            <Input aria-label="Descrição da ação" className={cn(CAMPO_COMPACTO, 'min-w-0 flex-1')} maxLength={1000} placeholder="Descreva a ação..." value={acao.acao} onChange={(e) => alterar('acao', e.target.value)} />
            <Select aria-label="Responsável" className={cn(CAMPO_COMPACTO, 'w-40 shrink-0')} value={acao.responsavel} onChange={(e) => alterar('responsavel', e.target.value)}>
                <option value="">Responsável</option>
                {OPCOES_RESPONSAVEL.map((opcao: string) => <option key={opcao}>{opcao}</option>)}
            </Select>
            <Input aria-label="Início previsto" title="Início previsto" type="date" min="1900-01-01" max="2100-12-31" className={cn(CAMPO_COMPACTO, 'w-[132px] shrink-0')} value={acao.data_inicio} onChange={(e) => alterar('data_inicio', e.target.value)} />
            <Input aria-label="Fim previsto" title="Fim previsto" type="date" max="2100-12-31" min={acao.data_inicio || undefined} className={cn(CAMPO_COMPACTO, 'w-[132px] shrink-0')} value={acao.data_fim} onChange={(e) => alterar('data_fim', e.target.value)} />
            <Select aria-label="Prioridade" className={cn(CAMPO_COMPACTO, 'w-24 shrink-0')} value={acao.prioridade} onChange={(e) => alterar('prioridade', e.target.value)}>
                {OPCOES_PRIORIDADE.map((opcao: string) => <option key={opcao}>{opcao}</option>)}
            </Select>
            <BotaoIcone perigo icone="x" titulo="Remover ação" onClick={aoRemover} />
        </div>
    );
}

function ListaAcoes({ acoes, aoMudar }: { acoes: AcaoMontada[]; aoMudar: (acoes: AcaoMontada[]) => void }) {
    return (
        <>
            {acoes.map((acao, indice) => (
                <LinhaAcao
                    key={acao.key}
                    acao={acao}
                    indice={indice}
                    total={acoes.length}
                    aoMudar={(nova) => aoMudar(acoes.map((item, posicao) => (posicao === indice ? nova : item)))}
                    aoRemover={() => aoMudar(acoes.filter((_, posicao) => posicao !== indice))}
                    aoMover={(direcao) => aoMudar(mover(acoes, indice, direcao))}
                />
            ))}
            {!acoes.length && <p className="m-0 mb-2 text-[13px] text-text-2">Nenhuma ação ainda. Digite abaixo e pressione Enter.</p>}
        </>
    );
}

interface MontadorProps {
    etapas: EtapaMontada[];
    aoMudarEtapas: (etapas: EtapaMontada[]) => void;
    acoesUnidade: AcaoMontada[];
    aoMudarAcoesUnidade: (acoes: AcaoMontada[]) => void;
    qtdUnidades: number;
    modulos: string[];
}

export function MontadorPlano({ etapas, aoMudarEtapas, acoesUnidade, aoMudarAcoesUnidade, qtdUnidades, modulos }: MontadorProps) {
    const [novoNome, setNovoNome] = useState('');
    const totalAcoes = etapas.reduce((soma, etapa) => soma + etapa.acoes.length, 0);
    const atualizar = (indice: number, etapa: EtapaMontada) => aoMudarEtapas(etapas.map((item, posicao) => (posicao === indice ? etapa : item)));

    const criarEtapa = () => {
        const nome = novoNome.trim();
        if (!nome) return;
        aoMudarEtapas([...etapas, novaEtapa(nome.toUpperCase(), [], modulos.length === 1 ? modulos[0] : null)]);
        setNovoNome('');
    };

    return (
        <div>
            <div className="mb-3.5 flex flex-wrap gap-2">
                <Badge>{etapas.length} etapa(s)</Badge>
                <Badge>{totalAcoes} ação(ões) gerais</Badge>
                {qtdUnidades > 0 && <Badge tom="marca">{acoesUnidade.length} ação(ões) × {qtdUnidades} unidade(s) = {acoesUnidade.length * qtdUnidades}</Badge>}
            </div>
            {etapas.map((etapa, indice) => (
                <section key={etapa.key} className="mb-3 rounded-lg border border-solid border-line bg-surface-2 p-3">
                    <header className="mb-2.5 flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-pine text-xs font-bold text-white tabular-nums">{String(indice + 1).padStart(2, '0')}</span>
                        <Input aria-label="Nome da etapa" className={cn(CAMPO_COMPACTO, 'flex-1 font-semibold', !etapa.nome.trim() && 'border-danger')} maxLength={120} placeholder="NOME DA ETAPA" value={etapa.nome} onChange={(e) => atualizar(indice, { ...etapa, nome: e.target.value.toUpperCase() })} />
                        {modulos.length > 0 && (
                            <Select aria-label="Módulo" className={cn(CAMPO_COMPACTO, 'w-40')} value={etapa.modulo ?? ''} onChange={(e) => atualizar(indice, { ...etapa, modulo: e.target.value || null })}>
                                <option value="">Sem módulo</option>
                                {modulos.map((modulo) => <option key={modulo}>{modulo}</option>)}
                            </Select>
                        )}
                        <small className="text-xs whitespace-nowrap text-text-2">{etapa.acoes.length} ação(ões)</small>
                        <BotaoIcone icone="arrow-up" titulo="Subir etapa" disabled={indice === 0} onClick={() => aoMudarEtapas(mover(etapas, indice, -1))} />
                        <BotaoIcone icone="arrow-down" titulo="Descer etapa" disabled={indice === etapas.length - 1} onClick={() => aoMudarEtapas(mover(etapas, indice, 1))} />
                        <BotaoIcone perigo icone="trash" titulo="Excluir etapa" onClick={() => aoMudarEtapas(etapas.filter((_, posicao) => posicao !== indice))} />
                    </header>
                    <ListaAcoes acoes={etapa.acoes} aoMudar={(acoes) => atualizar(indice, { ...etapa, acoes })} />
                    <InclusaoRapida placeholder={`Nova ação em ${etapa.nome || 'esta etapa'}... (Enter)`} aoAdicionar={(texto) => atualizar(indice, { ...etapa, acoes: [...etapa.acoes, novaAcao(texto)] })} />
                </section>
            ))}
            <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-dashed border-line p-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-line-2 text-text-2"><Icon n="plus" /></span>
                <Input aria-label="Nova etapa" className={cn(CAMPO_COMPACTO, 'flex-1')} maxLength={120} placeholder="Nova etapa" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); criarEtapa(); } }} />
                <Button size="sm" disabled={!novoNome.trim()} onClick={criarEtapa}>Criar etapa</Button>
            </div>
            {qtdUnidades > 0 && (
                <section className="rounded-lg border border-solid border-brass-soft bg-brass-tint p-3">
                    <header className="mb-2.5 flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brass text-white"><Icon n="building" /></span>
                        <div className="flex-1">
                            <BalaoAjuda texto={`Estas ações serão replicadas para as ${qtdUnidades} unidade(s) selecionada(s).`} className="flex w-fit items-center gap-1.5"><b className="text-[13.5px] text-ink">EXECUÇÃO EM CADA UNIDADE</b></BalaoAjuda>
                        </div>
                        <small className="text-xs text-text-2">{acoesUnidade.length} ação(ões)</small>
                    </header>
                    <ListaAcoes acoes={acoesUnidade} aoMudar={aoMudarAcoesUnidade} />
                    <InclusaoRapida placeholder="Nova ação por unidade" aoAdicionar={(texto) => aoMudarAcoesUnidade([...acoesUnidade, novaAcao(texto)])} />
                </section>
            )}
        </div>
    );
}
