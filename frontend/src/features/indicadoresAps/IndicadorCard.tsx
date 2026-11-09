import { useState, type ReactNode } from 'react';
import Icon from '@/shared/ui/Icon';
import { BLOCOS, PROFISSIONAIS, type Codigos, type Indicador, type Pratica } from '@/features/indicadoresAps/dados';
import { cn } from '@/shared/lib';
import { BalaoAjuda } from '@/shared/ui/BalaoAjuda';

type Nivel = 'regular' | 'suficiente' | 'bom' | 'otimo';

export const NIVEIS: Record<Nivel, { rotulo: string; cor: string; fundo: string }> = {
    regular: { rotulo: 'Regular', cor: '#d13b3b', fundo: '#fdecec' },
    suficiente: { rotulo: 'Suficiente', cor: '#e07c00', fundo: '#fff6ea' },
    bom: { rotulo: 'Bom', cor: '#2e7d32', fundo: '#e8f5e9' },
    otimo: { rotulo: 'Ótimo', cor: '#1565c0', fundo: '#e3f2fd' }
};
const ORDEM_NIVEIS: Nivel[] = ['regular', 'suficiente', 'bom', 'otimo'];
const COR_PROCEDIMENTO = '#1565c0';
const COR_VACINA = '#6a1b9a';
const COR_CBO = '#2e7d32';
const COR_CID = '#b26a00';
const SEM_REGRA = 'Não se aplicam';
const PONTOS_ESPERADOS = 100;

export const corDoBloco = (id: string) => BLOCOS.find((bloco) => bloco.id === id)?.cor ?? '#2e7d32';

export function SeloNivel({ nivel, valor }: { nivel: Nivel; valor: string }) {
    const { rotulo, cor, fundo } = NIVEIS[nivel];
    return <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap" style={{ background: fundo, color: cor }}>{rotulo} {valor}</span>;
}

const TituloSecao = ({ cor, children }: { cor: string; children: ReactNode }) => <p className="m-0 mb-1.5 text-[11px] font-bold tracking-wider uppercase" style={{ color: cor }}>{children}</p>;

function ListaCodigos({ titulo, itens, cor }: { titulo: string; itens?: [string, string][]; cor: string }) {
    if (!itens?.length) return null;
    return (
        <div>
            <TituloSecao cor={cor}>{titulo}</TituloSecao>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {itens.map(([codigo, descricao]) => (
                    <li key={`${codigo}-${descricao}`} className="flex items-baseline gap-2.5 text-[13px] text-text">
                        <span className="shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-bold whitespace-nowrap" style={{ color: cor, background: `${cor}12` }}>{codigo}</span>
                        {descricao}
                    </li>
                ))}
            </ul>
        </div>
    );
}

const comRegra = (texto?: string) => (texto && !texto.startsWith(SEM_REGRA) ? texto : null);

function PainelCodigos({ codigos }: { codigos: Codigos }) {
    const cid = comRegra(codigos.cid);
    const ciap = comRegra(codigos.ciap);
    return (
        <div className="grid grid-cols-2 gap-x-7 gap-y-4">
            <ListaCodigos titulo="Procedimentos (SIGTAP)" itens={codigos.proc} cor={COR_PROCEDIMENTO} />
            <ListaCodigos titulo="Vacinas" itens={codigos.vacina} cor={COR_VACINA} />
            <ListaCodigos titulo="CBO aceitos" itens={codigos.cbo} cor={COR_CBO} />
            <div className="flex flex-col gap-3.5">
                {cid && <div><TituloSecao cor={COR_CID}>CID-10</TituloSecao><p className="m-0 font-mono text-[13px] leading-relaxed text-text">{cid}</p></div>}
                {ciap && <div><TituloSecao cor={COR_CID}>CIAP-2</TituloSecao><p className="m-0 font-mono text-[13px] leading-relaxed text-text">{ciap}</p></div>}
                {!cid && !ciap && <p className="m-0 text-[13px] text-text-2">Sem regras específicas de CID-10 / CIAP-2.</p>}
            </div>
        </div>
    );
}

function PainelPraticas({ praticas, cor }: { praticas: Pratica[]; cor: string }) {
    const total = praticas.reduce((soma, pratica) => soma + pratica.pontos, 0);
    return (
        <>
            <div className="mb-2.5 flex items-center justify-end gap-2">
                {total !== PONTOS_ESPERADOS && (
                    <BalaoAjuda texto="A soma dos pontos publicada no guia oficial não fecha 100. Valores mantidos conforme o normativo." className="flex w-fit items-center gap-1.5">
                        <span className="text-xs font-semibold text-brass">conforme guia</span>
                    </BalaoAjuda>
                )}
                <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ color: cor, background: `${cor}12` }}>Total {total} pts</span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {praticas.map((pratica) => (
                    <li key={pratica.letra} className="flex items-start gap-3 rounded-lg border border-solid border-line-2 px-3 py-2.5 text-[13.5px] text-text">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold" style={{ color: cor, background: `${cor}16` }}>{pratica.letra}</span>
                        <span className="flex-1 leading-snug">{pratica.texto}</span>
                        <span className="shrink-0 rounded-full bg-tint px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-pine-800">{pratica.pontos} pts</span>
                    </li>
                ))}
            </ul>
        </>
    );
}

function VisaoGeral({ indicador, cor }: { indicador: Indicador; cor: string }) {
    return (
        <>
            <div className="mb-3.5 rounded-r-lg border-0 border-l-4 border-solid bg-surface-2 px-3.5 py-3" style={{ borderLeftColor: cor }}>
                <TituloSecao cor={cor}>Objetivo</TituloSecao>
                <p className="m-0 text-sm leading-relaxed text-text">{indicador.objetivo}</p>
            </div>
            <div className="mb-3.5 grid grid-cols-2 gap-2.5">
                {([['Numerador', indicador.formula.num], ['Denominador', indicador.formula.den]] as const).map(([rotulo, texto]) => (
                    <div key={rotulo} className="rounded-lg border border-solid border-line px-3.5 py-3">
                        <TituloSecao cor={cor}>{rotulo}</TituloSecao>
                        <p className="m-0 text-[13px] leading-relaxed text-text">{texto}</p>
                    </div>
                ))}
            </div>
            <div className="mb-1.5 flex items-center gap-2">
                <p className="m-0 text-[11px] font-bold tracking-wider text-text-2 uppercase">Parâmetro de desempenho</p>
                {indicador.invertido && <span className="rounded-full bg-[#e3f2fd] px-2.5 py-0.5 text-[11px] font-semibold text-[#1565c0]"><Icon n="arrow-down" /> quanto menor, melhor</span>}
            </div>
            <div className="mb-3.5 grid grid-cols-4 gap-2">
                {ORDEM_NIVEIS.map((nivel) => (
                    <div key={nivel} className="rounded-lg px-1.5 py-2 text-center" style={{ background: NIVEIS[nivel].fundo, color: NIVEIS[nivel].cor }}>
                        <span className="mb-0.5 block text-[10px] font-bold tracking-wide uppercase">{NIVEIS[nivel].rotulo}</span>
                        <b className="text-[13px] font-bold">{indicador.metas[nivel]}</b>
                    </div>
                ))}
            </div>
            <div className="rounded-lg bg-brass-tint px-3.5 py-3">
                <TituloSecao cor="#9c7a3c"><Icon n="clipboard" /> Registro no e-SUS / PEC</TituloSecao>
                <p className="m-0 text-[13.5px] leading-relaxed text-text">{indicador.registro}</p>
            </div>
        </>
    );
}

function PainelAcoes({ indicador, funcao }: { indicador: Indicador; funcao: string }) {
    if (funcao) {
        return <ul className="list-disc m-0 flex flex-col gap-2 pl-5 text-sm leading-snug text-text">{(indicador.acoes[funcao] ?? []).map((acao) => <li key={acao}>{acao}</li>)}</ul>;
    }
    return (
        <div className="grid grid-cols-2 gap-2.5">
            {PROFISSIONAIS.filter((profissional) => indicador.acoes[profissional.id]?.length).map((profissional) => (
                <div key={profissional.id} className="overflow-hidden rounded-lg border border-solid border-line">
                    <p className="m-0 px-3 py-2 text-[13.5px] font-bold" style={{ color: profissional.cor, background: `${profissional.cor}12` }}>{profissional.label}</p>
                    <ul className="list-disc m-0 flex flex-col gap-1.5 py-2.5 pr-3 pl-7 text-[13.5px] leading-snug text-text">{indicador.acoes[profissional.id]?.map((acao) => <li key={acao}>{acao}</li>)}</ul>
                </div>
            ))}
        </div>
    );
}

export function IndicadorCard({ indicador, funcao }: { indicador: Indicador; funcao: string }) {
    const [aberto, setAberto] = useState(false);
    const [aba, setAba] = useState('visao');
    const cor = corDoBloco(indicador.bloco);
    const abas = [
        { id: 'visao', rotulo: 'Visão geral' },
        ...(indicador.praticas?.length ? [{ id: 'praticas', rotulo: `Boas práticas (${indicador.praticas.length})` }] : []),
        { id: 'codigos', rotulo: 'Códigos' },
        { id: 'acoes', rotulo: funcao ? 'Minhas ações' : 'Ações por função' }
    ];

    return (
        <section className="mb-3 overflow-hidden rounded-[10px] border border-solid bg-white shadow-card transition-colors" style={{ borderColor: aberto ? cor : '#e5e7eb' }}>
            <button type="button" aria-expanded={aberto} onClick={() => setAberto(!aberto)} className="flex w-full cursor-pointer items-center gap-3.5 border-0 bg-transparent px-[18px] py-3.5 text-left font-sans hover:bg-surface-2">
                <span className="flex size-[46px] shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold" style={{ color: cor, background: `${cor}18` }}>{indicador.cod}</span>
                <span className="min-w-0 flex-1">
                    <b className="block text-[15px] font-semibold text-ink">{indicador.titulo}</b>
                    <span className="block truncate text-[13px] text-text-2">{indicador.subtitulo}</span>
                </span>
                <span className="flex shrink-0 gap-1.5">
                    <SeloNivel nivel="bom" valor={indicador.metas.bom} />
                    <SeloNivel nivel="otimo" valor={indicador.metas.otimo} />
                </span>
                <span className={cn('text-text-2 transition-transform', aberto && 'rotate-180')}><Icon n="arrow-down" /></span>
            </button>
            {aberto && (
                <div className="border-0 border-t border-solid border-line">
                    <div role="tablist" className="flex gap-1 border-0 border-b border-solid border-line bg-surface-2 px-4 pt-2.5">
                        {abas.map((item) => (
                            <button key={item.id} type="button" role="tab" aria-selected={aba === item.id} onClick={() => setAba(item.id)} className={cn('-mb-px cursor-pointer border-0 border-b-2 border-solid bg-transparent px-3.5 py-2 font-sans text-[13px]', aba === item.id ? 'font-bold' : 'border-transparent font-medium text-text-2')} style={aba === item.id ? { color: cor, borderBottomColor: cor } : undefined}>{item.rotulo}</button>
                        ))}
                    </div>
                    <div className="px-[18px] pt-4 pb-[18px]">
                        {aba === 'visao' && <VisaoGeral indicador={indicador} cor={cor} />}
                        {aba === 'praticas' && indicador.praticas && <PainelPraticas praticas={indicador.praticas} cor={cor} />}
                        {aba === 'codigos' && <PainelCodigos codigos={indicador.codigos} />}
                        {aba === 'acoes' && <PainelAcoes indicador={indicador} funcao={funcao} />}
                    </div>
                </div>
            )}
        </section>
    );
}
