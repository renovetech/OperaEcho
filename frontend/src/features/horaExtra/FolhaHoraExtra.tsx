/* A folha de ponto no padrão formal dos documentos: é ela que vai para o JPG. */
import { useState, type Ref } from 'react';
import { horaOuVazio, minutosParaHora, type LinhaDia } from '@/features/horaExtra/calculos';
import type { EstadoLancamento } from '@/features/horaExtra/useLancamento';
import { SecaoDoc, TabelaDoc, TdDoc, ThDoc, Timbre } from '@/shared/ui/DocumentoFormal';

const CARGA_BASE = '200:00';
const COR_EXTRA = '#1b5e20';
const COR_NOTURNO = '#9c7a3c';
const CAMPO_HORA = 'box-border h-[26px] w-[86px] rounded-[3px] border border-solid border-transparent bg-transparent p-0 text-center font-sans text-[12.5px] text-[#1e293b] hover:border-[#e5e7eb] focus:border-[#2e7d32] focus:outline-none disabled:text-[#94a3b8]';
const CELULA = 'px-1 py-[2px] align-middle text-[12.5px]';
const CABECALHO = 'px-1 py-1.5';

function fundoDaLinha(linha: LinhaDia): string | undefined {
    if (linha.isFeriado) return '#f6f1e6';
    if (linha.isFolga || linha.isFDS) return '#f8fafc';
    return undefined;
}

function LinhaResumo({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-[3px] text-[12.5px]">
            <span className="text-[#64748b]">{rotulo}</span>
            <b className="font-semibold tabular-nums" style={{ color: cor ?? '#1e293b' }}>{valor}</b>
        </div>
    );
}

const Assinatura = ({ rotulo }: { rotulo: string }) => (
    <p className="m-0 mt-11 border-0 border-t border-solid border-[#334155] pt-1 text-center text-[11.5px] text-[#64748b]">{rotulo}</p>
);

function GradeDias({ estado }: { estado: EstadoLancamento }) {
    const { linhas, catalogo, nomeProjeto, alterarLinha, alterarUnidadeDaLinha } = estado;
    const projetosDoCatalogo = [...new Set(Object.values(catalogo).map((unidade) => unidade.id_projeto))];
    const opcoesDe = (projeto: number | null) => Object.entries(catalogo).filter(([, unidade]) => unidade.id_projeto === projeto);
    return (
        <TabelaDoc
            cabecalho={(
                <>
                    <ThDoc alinhar="centro" className={CABECALHO}>Dia</ThDoc>
                    <ThDoc className={CABECALHO}>Sem.</ThDoc>
                    <ThDoc className={CABECALHO}>Unidade</ThDoc>
                    <ThDoc alinhar="centro" className={CABECALHO} title="Feriado">Fer.</ThDoc>
                    <ThDoc alinhar="centro" className={CABECALHO} title="Folga">Fol.</ThDoc>
                    <ThDoc alinhar="centro" className={CABECALHO}>Entrada</ThDoc>
                    <ThDoc alinhar="centro" className={CABECALHO}>Saída</ThDoc>
                    <ThDoc alinhar="centro" className={CABECALHO}>Interv.</ThDoc>
                    <ThDoc alinhar="centro" className={CABECALHO}>Efetivas</ThDoc>
                    <ThDoc alinhar="centro" className={CABECALHO}>50%</ThDoc>
                    <ThDoc alinhar="centro" className={CABECALHO}>100%</ThDoc>
                    <ThDoc alinhar="centro" className={CABECALHO} title="Adicional noturno">Ad. N.</ThDoc>
                </>
            )}
        >
            {linhas.map((linha, indice) => (
                <tr key={linha.dia} style={{ background: fundoDaLinha(linha) }}>
                    <TdDoc alinhar="centro" className={`${CELULA} font-semibold`}>{linha.dia}</TdDoc>
                    <TdDoc className={`${CELULA} text-[#64748b]`}>{linha.diaSemanaStr.slice(0, 3)}</TdDoc>
                    <TdDoc className={CELULA}>
                        <select
                            aria-label={`Unidade do dia ${linha.dia}`}
                            value={linha.id_unidade ?? ''}
                            disabled={linha.isFolga}
                            title={linha.id_projeto ? nomeProjeto(linha.id_projeto) : ''}
                            onChange={(evento) => alterarUnidadeDaLinha(indice, evento.target.value)}
                            className="box-border h-[26px] w-[190px] rounded-[3px] border border-solid border-transparent bg-transparent p-0 font-sans text-[12.5px] text-[#1e293b] hover:border-[#e5e7eb] focus:border-[#2e7d32] focus:outline-none disabled:text-[#94a3b8]"
                        >
                            <option value="">-</option>
                            {projetosDoCatalogo.map((projeto) => (
                                <optgroup key={projeto ?? 'sem'} label={nomeProjeto(projeto)}>
                                    {opcoesDe(projeto).map(([id, unidade]) => <option key={id} value={id}>{unidade.nome_unidade}</option>)}
                                </optgroup>
                            ))}
                        </select>
                    </TdDoc>
                    <TdDoc alinhar="centro" className={CELULA}><input type="checkbox" aria-label={`Feriado no dia ${linha.dia}`} className="m-0 accent-[#2e7d32]" checked={linha.isFeriado} onChange={(evento) => alterarLinha(indice, 'isFeriado', evento.target.checked)} /></TdDoc>
                    <TdDoc alinhar="centro" className={CELULA}><input type="checkbox" aria-label={`Folga no dia ${linha.dia}`} className="m-0 accent-[#2e7d32]" checked={linha.isFolga} onChange={(evento) => alterarLinha(indice, 'isFolga', evento.target.checked)} /></TdDoc>
                    <TdDoc alinhar="centro" className={CELULA}><input type="time" aria-label={`Entrada do dia ${linha.dia}`} className={CAMPO_HORA} value={linha.entrada} disabled={linha.isFolga} onChange={(evento) => alterarLinha(indice, 'entrada', evento.target.value)} /></TdDoc>
                    <TdDoc alinhar="centro" className={CELULA}><input type="time" aria-label={`Saída do dia ${linha.dia}`} className={CAMPO_HORA} value={linha.saida} disabled={linha.isFolga} onChange={(evento) => alterarLinha(indice, 'saida', evento.target.value)} /></TdDoc>
                    <TdDoc alinhar="centro" className={CELULA}><input type="time" aria-label={`Intervalo do dia ${linha.dia}`} className={CAMPO_HORA} value={linha.intervalo} disabled={linha.isFolga} onChange={(evento) => alterarLinha(indice, 'intervalo', evento.target.value)} /></TdDoc>
                    <TdDoc alinhar="centro" className={`${CELULA} font-semibold tabular-nums ${linha.isFolga ? 'text-[#94a3b8]' : ''}`}>{linha.displayEfetivas}</TdDoc>
                    <TdDoc alinhar="centro" className={`${CELULA} font-semibold tabular-nums`} style={{ color: COR_EXTRA }}>{horaOuVazio(linha.he50)}</TdDoc>
                    <TdDoc alinhar="centro" className={`${CELULA} font-semibold tabular-nums`} style={{ color: COR_EXTRA }}>{horaOuVazio(linha.he100)}</TdDoc>
                    <TdDoc alinhar="centro" className={`${CELULA} font-semibold tabular-nums`} style={{ color: COR_NOTURNO }}>{horaOuVazio(linha.adNoturno)}</TdDoc>
                </tr>
            ))}
        </TabelaDoc>
    );
}

function ResumoMensal({ estado }: { estado: EstadoLancamento }) {
    const { totais, porUnidade, nomeUnidade, nomeProjeto } = estado;
    const variosProjetos = new Set(porUnidade.map((item) => item.id_projeto).filter(Boolean)).size > 1;
    return (
        <>
            <SecaoDoc titulo="Resumo mensal" className="mb-4">
                <LinhaResumo rotulo="Carga base" valor={CARGA_BASE} />
                <LinhaResumo rotulo="Horas trabalhadas" valor={minutosParaHora(totais.horasEfetivas)} />
                <LinhaResumo rotulo="Hora extra 50%" valor={minutosParaHora(totais.he50)} cor={COR_EXTRA} />
                <LinhaResumo rotulo="Hora extra 100%" valor={minutosParaHora(totais.he100)} cor={COR_EXTRA} />
                <LinhaResumo rotulo="Adicional noturno" valor={minutosParaHora(totais.adNoturno)} cor={COR_NOTURNO} />
            </SecaoDoc>
            {porUnidade.length > 0 && (
                <SecaoDoc titulo="Por unidade" className="mb-4">
                    {porUnidade.map((item) => (
                        <div key={item.id_unidade ?? 'sem'} className="border-0 border-b border-solid border-[#eef1f5] py-1.5 last:border-b-0">
                            {variosProjetos && <p className="m-0 text-[10.5px] tracking-wide text-[#9c7a3c] uppercase">{nomeProjeto(item.id_projeto)}</p>}
                            <p className="m-0 mb-0.5 text-[12px] font-semibold text-[#334155]">{nomeUnidade(item.id_unidade)}</p>
                            <p className="m-0 text-[11.5px] text-[#64748b] tabular-nums">
                                50% <b className="font-semibold text-[#1b5e20]">{minutosParaHora(item.he50)}</b> · 100% <b className="font-semibold text-[#1b5e20]">{minutosParaHora(item.he100)}</b> · Not. <b className="font-semibold text-[#9c7a3c]">{minutosParaHora(item.adNoturno)}</b>
                            </p>
                        </div>
                    ))}
                </SecaoDoc>
            )}
            <p className="m-0 text-[11px] text-[#64748b] italic">Valores sujeitos a conferência do RH.</p>
            <Assinatura rotulo="Assinatura do colaborador" />
            <Assinatura rotulo="Assinatura do gestor" />
        </>
    );
}

interface FolhaProps {
    estado: EstadoLancamento;
    colaborador: string;
    resumoProjetoUnidade: string;
    emissor: string;
    referencia: Ref<HTMLDivElement>;
}

export function FolhaHoraExtra({ estado, colaborador, resumoProjetoUnidade, emissor, referencia }: FolhaProps) {
    const [emitido] = useState(() => new Date().toLocaleString('pt-BR'));
    const periodo = estado.mes.split('-').reverse().join('/');
    return (
        <div ref={referencia} className="box-border w-full rounded-[4px] border border-solid border-line bg-white px-8 py-7 text-[#1e293b] shadow-card">
            <Timbre rotulo="Folha de ponto" titulo="Horas Extras" subtitulo={`${colaborador || 'Colaborador não selecionado'} · ${periodo}`} emissao={`${resumoProjetoUnidade} · Emitido em ${emitido} por ${emissor}`} />
            <div className="grid grid-cols-[1fr_236px] items-start gap-7">
                <GradeDias estado={estado} />
                <div><ResumoMensal estado={estado} /></div>
            </div>
        </div>
    );
}
