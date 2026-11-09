/* Conteúdo do guia, igual na página pública e no sistema. Aba e filtros ficam na URL. */
import { useMemo } from 'react';
import { CalculoDesempenho } from '@/features/indicadoresAps/CalculoDesempenho';
import { BLOCOS, INDICADORES, PROFISSIONAIS, type Indicador } from '@/features/indicadoresAps/dados';
import { corDoBloco, IndicadorCard, SeloNivel } from '@/features/indicadoresAps/IndicadorCard';
import { useParametrosUrl } from '@/shared/hooks';
import { cn } from '@/shared/lib';
import { BalaoAjuda } from '@/shared/ui/BalaoAjuda';
import { Abas } from '@/shared/ui/Abas';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Campos';
import { Card, CardTitulo } from '@/shared/ui/Pagina';

const ABA_RESUMO = 'resumo';
const ABA_CALCULO = 'calculo';
const ABAS = [{ id: '', rotulo: 'Guia de Indicadores' }, { id: ABA_RESUMO, rotulo: 'Resumo por Profissional' }, { id: ABA_CALCULO, rotulo: 'Cálculo do Desempenho' }];
const REGRA_FUNCAO = 'Os registros corretos no PEC e-SUS garantem o repasse da sua unidade (impacto financeiro em 2026).\nSelecione o seu cargo para ver o que fazer em cada indicador.';
const REGRA_RESUMO = 'Selecione sua função para ver todas as suas responsabilidades, consolidadas por indicador.';

function SeletorFuncao({ funcao, aoEscolher }: { funcao: string; aoEscolher: (id: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2 p-[18px]">
            {PROFISSIONAIS.map((profissional) => {
                const ativo = funcao === profissional.id;
                return (
                    <button key={profissional.id} type="button" aria-pressed={ativo} title={profissional.desc} onClick={() => aoEscolher(ativo ? '' : profissional.id)} className={cn('cursor-pointer rounded-full border border-solid px-4 py-2 font-sans text-[13.5px] font-semibold transition-colors', !ativo && 'border-line bg-white text-text hover:bg-surface-2')} style={ativo ? { color: profissional.cor, borderColor: profissional.cor, background: `${profissional.cor}14` } : undefined}>{profissional.label}</button>
                );
            })}
        </div>
    );
}

function ResumoProfissional({ funcao, aoEscolher }: { funcao: string; aoEscolher: (id: string) => void }) {
    const profissional = PROFISSIONAIS.find((item) => item.id === funcao);
    const lista = INDICADORES.filter((indicador) => indicador.acoes[funcao]?.length);

    return (
        <>
            <Card className="mb-4">
                <CardTitulo titulo="Selecione sua função" ajuda={REGRA_RESUMO} />
                <SeletorFuncao funcao={funcao} aoEscolher={aoEscolher} />
            </Card>
            {!profissional && <p className="m-0 rounded-[10px] border border-dashed border-line bg-white p-12 text-center text-sm text-text-2">Nenhuma função selecionada.</p>}
            {profissional && <h2 className="m-0 mb-3 text-base font-semibold" style={{ color: profissional.cor }}>{profissional.label}: {lista.length} indicadores com ações atribuídas</h2>}
            <div className="grid grid-cols-2 gap-3.5">
                {profissional && lista.map((indicador) => {
                    const cor = corDoBloco(indicador.bloco);
                    return (
                        <Card key={indicador.cod} className="flex flex-col overflow-hidden">
                            <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: `${cor}10` }}>
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold" style={{ color: cor, background: `${cor}22` }}>{indicador.cod}</span>
                                <b className="min-w-0 flex-1 text-sm font-semibold text-ink">{indicador.titulo}</b>
                                <SeloNivel nivel="otimo" valor={indicador.metas.otimo} />
                            </div>
                            <ul className="list-disc m-0 flex flex-1 flex-col gap-1.5 py-3 pr-4 pl-8 text-[13.5px] leading-snug text-text">{indicador.acoes[funcao]?.map((acao) => <li key={acao}>{acao}</li>)}</ul>
                            <p className="m-0 bg-brass-tint px-4 py-2 text-xs leading-snug text-brass">{indicador.registro}</p>
                        </Card>
                    );
                })}
            </div>
        </>
    );
}

function GrupoBloco({ id, indicadores, funcao }: { id: string; indicadores: Indicador[]; funcao: string }) {
    const bloco = BLOCOS.find((item) => item.id === id);
    if (!bloco || !indicadores.length) return null;
    return (
        <div className="mb-6">
            <BalaoAjuda texto={bloco.desc} className="mb-3 flex w-fit items-center gap-1.5">
                <h3 className="m-0 text-[15px] font-semibold" style={{ color: bloco.cor }}>{bloco.label} - {bloco.full}</h3>
            </BalaoAjuda>
            {indicadores.map((indicador) => <IndicadorCard key={indicador.cod} indicador={indicador} funcao={funcao} />)}
        </div>
    );
}

interface GuiaProps {
    funcao: string;
    equipe: string;
    busca: string;
    aoAlterar: (mudancas: Record<string, string>) => void;
}

function Guia({ funcao, equipe, busca, aoAlterar }: GuiaProps) {
    const filtrados = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        return INDICADORES.filter((indicador) => (!equipe || indicador.bloco === equipe)
            && (!funcao || indicador.acoes[funcao]?.length)
            && (!termo || [indicador.titulo, indicador.cod, indicador.subtitulo].some((texto) => texto.toLowerCase().includes(termo))));
    }, [busca, equipe, funcao]);
    const nomeFuncao = PROFISSIONAIS.find((item) => item.id === funcao)?.label;

    return (
        <>
            <Card className="mb-4">
                <CardTitulo titulo="Sua função na unidade" ajuda={REGRA_FUNCAO} />
                <SeletorFuncao funcao={funcao} aoEscolher={(id) => aoAlterar({ funcao: id })} />
            </Card>
            <div className="mb-5 flex items-center gap-3">
                <Input aria-label="Buscar indicador" className="min-w-0 flex-1" placeholder="Buscar por nome ou código (ex: P2, CR3, Tuberculose)..." value={busca} onChange={(e) => aoAlterar({ busca: e.target.value })} />
                <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant={equipe ? 'secondary' : 'primary'} onClick={() => aoAlterar({ equipe: '' })}>Todos</Button>
                    {BLOCOS.map((bloco) => <Button key={bloco.id} size="sm" title={bloco.full} variant={equipe === bloco.id ? 'primary' : 'secondary'} onClick={() => aoAlterar({ equipe: bloco.id })}>{bloco.label}</Button>)}
                </div>
            </div>
            <h2 className="m-0 mb-4 border-0 border-b-2 border-solid border-line pb-2.5 text-[17px] font-semibold text-ink">
                {nomeFuncao ? `Indicadores para ${nomeFuncao}` : 'Todos os indicadores'} <span className="text-sm font-normal text-text-2">({filtrados.length} de {INDICADORES.length})</span>
            </h2>
            {BLOCOS.map((bloco) => <GrupoBloco key={bloco.id} id={bloco.id} funcao={funcao} indicadores={filtrados.filter((indicador) => indicador.bloco === bloco.id)} />)}
            {!filtrados.length && (
                <p className="m-0 rounded-[10px] border border-dashed border-line bg-white p-12 text-center text-sm text-text-2">
                    {funcao ? 'Não há ações para esta função no filtro aplicado.' : 'Nenhum indicador encontrado. Tente ajustar os filtros ou limpar a busca.'}
                </p>
            )}
        </>
    );
}

export function GuiaIndicadores() {
    const [parametros, alterarUrl] = useParametrosUrl();
    const aba = parametros.get('aba') ?? '';
    const funcao = parametros.get('funcao') ?? '';

    return (
        <>
            <Abas className="mb-4" itens={ABAS} ativa={aba} aoMudar={(id) => alterarUrl({ aba: id }, { empilhar: true })} />
            {aba === ABA_CALCULO && <CalculoDesempenho />}
            {aba === ABA_RESUMO
                && <ResumoProfissional funcao={funcao} aoEscolher={(id) => alterarUrl({ funcao: id })} />}
            {!aba && <Guia funcao={funcao} equipe={parametros.get('equipe') ?? ''} busca={parametros.get('busca') ?? ''} aoAlterar={alterarUrl} />}
        </>
    );
}
