/* Recibo e relatórios: montados fora da área visível só durante a exportação. */
import type { ReactNode, Ref } from 'react';
import { createPortal } from 'react-dom';
import type { PrazoFerias, SolicitacaoFerias } from '@/features/ferias/api';
import type { LinhaRelatorio } from '@/features/ferias/hooks';
import { formatarData } from '@/features/ferias/regras';
import { cn } from '@/shared/lib';
import { FaixaIndicadores, RodapeDoc, SecaoDoc, TabelaDoc, TdDoc, ThDoc, Timbre } from '@/shared/ui/DocumentoFormal';

interface BaseDocumento {
    geradoPor: string;
    geradoEm: string;
}

export type DocumentoFerias = BaseDocumento & (
    | { tipo: 'recibo'; solicitacao: SolicitacaoFerias }
    | { tipo: 'geral'; categorias: { concluidas: LinhaRelatorio[]; aprovadas: LinhaRelatorio[]; pendentes: LinhaRelatorio[] }; periodos: number[] }
    | { tipo: 'prazos'; prazos: PrazoFerias[] }
);

const Dado = ({ rotulo, children }: { rotulo: string; children: ReactNode }) => <div className="text-[#1e293b]"><b className="font-semibold text-[#334155]">{rotulo}:</b> {children}</div>;

function Recibo({ solicitacao: s, geradoPor, geradoEm }: { solicitacao: SolicitacaoFerias } & BaseDocumento) {
    return (
        <>
            <Timbre rotulo="Recibo" titulo="Recibo de Férias" emissao={`Emitido em ${geradoEm} por ${geradoPor}`} />
            <SecaoDoc titulo="Dados do colaborador">
                <div className="grid grid-cols-2 gap-2.5 py-2 text-sm">
                    <Dado rotulo="Nome">{s.nome_completo}</Dado>
                    <Dado rotulo="CPF">{s.cpf || 'Não informado'}</Dado>
                    <Dado rotulo="Data de nascimento">{formatarData(s.data_nascimento) || 'Não informada'}</Dado>
                    <Dado rotulo="Matrícula">{s.matricula || 'S/N'}</Dado>
                    <Dado rotulo="Setor">{s.setor || 'Geral'}</Dado>
                    <Dado rotulo="Função">{s.funcao || 'Colaborador'}</Dado>
                    <Dado rotulo="Lotação">{s.nome_lotacao || 'Não informada'}</Dado>
                    <Dado rotulo="Data de admissão">{formatarData(s.data_admissao) || 'Não informada'}</Dado>
                    <Dado rotulo="Data da solicitação">{formatarData(s.data_solicitacao)}</Dado>
                </div>
            </SecaoDoc>
            <SecaoDoc titulo="Detalhes das férias">
                <div className="grid grid-cols-2 gap-2.5 py-2 text-sm">
                    <Dado rotulo="Período aquisitivo">{s.periodo_aquisitivo}</Dado>
                    <Dado rotulo="Tipo">{s.tipo_solicitacao}</Dado>
                    <Dado rotulo="Data de início">{formatarData(s.data_inicio)}</Dado>
                    <Dado rotulo="Data de fim">{formatarData(s.data_fim)}</Dado>
                    <Dado rotulo="Situação">{s.status}</Dado>
                </div>
            </SecaoDoc>
            <div className="mt-24 flex justify-between text-[13px] text-[#334155]">
                <div className="w-2/5 border-0 border-t border-solid border-[#1e293b] pt-1.5 text-center">Assinatura do colaborador</div>
                <div className="w-2/5 border-0 border-t border-solid border-[#1e293b] pt-1.5 text-center">Assinatura do gestor</div>
            </div>
            <RodapeDoc>Opera Echo Management System. Documento gerado eletronicamente.</RodapeDoc>
        </>
    );
}

function Secao({ titulo, linhas, rotulo, cor }: { titulo: string; linhas: LinhaRelatorio[]; rotulo: string; cor: string }) {
    if (!linhas.length) return null;
    return (
        <SecaoDoc titulo={titulo} detalhe={`${linhas.length} solicitação(ões)`}>
            <TabelaDoc cabecalho={<><ThDoc>Matrícula</ThDoc><ThDoc>Colaborador</ThDoc><ThDoc>Tipo</ThDoc><ThDoc alinhar="centro">Período aq.</ThDoc><ThDoc alinhar="centro">Saldo</ThDoc><ThDoc alinhar="centro">Início</ThDoc><ThDoc alinhar="centro">Fim</ThDoc><ThDoc alinhar="centro">Situação</ThDoc></>}>
                {linhas.map((item) => (
                    <tr key={item.id_ferias}>
                        <TdDoc>{item.matricula || 'S/N'}</TdDoc>
                        <TdDoc className="font-semibold">{item.nome_completo}</TdDoc>
                        <TdDoc>{item.tipo_solicitacao}</TdDoc>
                        <TdDoc alinhar="centro" className="tabular-nums">{item.periodo_aquisitivo}</TdDoc>
                        <TdDoc alinhar="centro" className="font-semibold tabular-nums">{item.saldo}</TdDoc>
                        <TdDoc alinhar="centro" className="whitespace-nowrap tabular-nums">{formatarData(item.data_inicio)}</TdDoc>
                        <TdDoc alinhar="centro" className="whitespace-nowrap tabular-nums">{formatarData(item.data_fim)}</TdDoc>
                        <TdDoc alinhar="centro" className="text-xs font-semibold"><span style={{ color: cor }}>{rotulo}</span></TdDoc>
                    </tr>
                ))}
            </TabelaDoc>
        </SecaoDoc>
    );
}

const COR_VENCIDO = '#8f332f';
const COR_PROXIMO = '#8a5212';
const COR_NO_PRAZO = '#1b5e20';
const SITUACAO_PRAZO: Record<string, { rotulo: string; cor: string }> = {
    VENCIDO: { rotulo: 'VENCIDO', cor: COR_VENCIDO },
    PROXIMO_LIMITE: { rotulo: 'PRÓXIMO DO LIMITE', cor: COR_PROXIMO }
};
const NO_PRAZO = { rotulo: 'NO PRAZO', cor: COR_NO_PRAZO };

function Prazos({ prazos, geradoPor, geradoEm }: { prazos: PrazoFerias[] } & BaseDocumento) {
    const contar = (status: string) => prazos.filter((item) => item.status_prazo === status).length;
    const vencidos = contar('VENCIDO');
    const proximos = contar('PROXIMO_LIMITE');
    return (
        <>
            <Timbre titulo="Prazos Legais de Férias" subtitulo="Implantadores ativos | CLT Art. 134 (1 ano e 11 meses)" emissao={`Emitido em ${geradoEm} por ${geradoPor}`} />
            <FaixaIndicadores itens={[
                { rotulo: 'No prazo', valor: prazos.length - vencidos - proximos, detalhe: 'Mais de 90 dias até o limite legal', cor: COR_NO_PRAZO },
                { rotulo: 'Próximo do limite', valor: proximos, detalhe: '90 dias ou menos até o limite', cor: COR_PROXIMO },
                { rotulo: 'Vencido', valor: vencidos, detalhe: 'Prazo legal ultrapassado', cor: COR_VENCIDO }
            ]} />
            <TabelaDoc cabecalho={<><ThDoc>Matrícula</ThDoc><ThDoc>Colaborador</ThDoc><ThDoc alinhar="centro">Admissão</ThDoc><ThDoc alinhar="centro">Período aq.</ThDoc><ThDoc alinhar="centro">Início PA</ThDoc><ThDoc alinhar="centro">Data limite</ThDoc><ThDoc alinhar="centro">Dias gozados</ThDoc><ThDoc alinhar="centro">Em análise</ThDoc><ThDoc alinhar="centro">Saldo</ThDoc><ThDoc alinhar="centro">Situação</ThDoc></>}>
                {prazos.map((item) => {
                    const situacao = SITUACAO_PRAZO[item.status_prazo] ?? NO_PRAZO;
                    return (
                        <tr key={`${item.nome_completo}-${item.periodo_aquisitivo}`}>
                            <TdDoc>{item.matricula || 'S/N'}</TdDoc>
                            <TdDoc className="font-semibold">{item.nome_completo}</TdDoc>
                            <TdDoc alinhar="centro" className="tabular-nums">{formatarData(item.data_admissao)}</TdDoc>
                            <TdDoc alinhar="centro" className="tabular-nums">{item.periodo_aquisitivo}</TdDoc>
                            <TdDoc alinhar="centro" className="tabular-nums">{formatarData(item.inicio_pa)}</TdDoc>
                            <TdDoc alinhar="centro" className="font-semibold tabular-nums"><span style={{ color: situacao.cor }}>{formatarData(item.data_limite)}</span></TdDoc>
                            <TdDoc alinhar="centro" className="tabular-nums">{item.dias_gozados}</TdDoc>
                            <TdDoc alinhar="centro" className="tabular-nums">{item.dias_em_analise ?? 0}</TdDoc>
                            <TdDoc alinhar="centro" className="font-semibold tabular-nums">{item.saldo_restante}</TdDoc>
                            <TdDoc alinhar="centro" className="text-xs font-semibold"><span style={{ color: situacao.cor }}>{situacao.rotulo}</span></TdDoc>
                        </tr>
                    );
                })}
            </TabelaDoc>
            <RodapeDoc>Opera Echo Management System | Relatório confidencial</RodapeDoc>
        </>
    );
}

const LARGURA: Record<DocumentoFerias['tipo'], string> = { recibo: 'w-[800px]', geral: 'w-[1100px]', prazos: 'w-[1200px]' };

export function DocumentoEmExportacao({ documento, referencia }: { documento: DocumentoFerias | null; referencia: Ref<HTMLDivElement> }) {
    if (!documento) return null;
    return createPortal(
        <div ref={referencia} className={cn('absolute top-0 left-[-20000px] box-border bg-white p-10 font-sans text-[#1e293b]', LARGURA[documento.tipo])}>
            {documento.tipo === 'recibo' && <Recibo {...documento} />}
            {documento.tipo === 'prazos' && <Prazos {...documento} />}
            {documento.tipo === 'geral' && (
                <>
                    <Timbre titulo="Relatório Geral de Férias" subtitulo={`Períodos aquisitivos ${documento.periodos.join(' e ')}`} emissao={`Emitido em ${documento.geradoEm} por ${documento.geradoPor}`} />
                    <Secao titulo="Concluídas: férias já gozadas" rotulo="CONCLUÍDA" linhas={documento.categorias.concluidas} cor="#64748b" />
                    <Secao titulo="Aprovadas: férias a gozar ou em curso" rotulo="APROVADA" linhas={documento.categorias.aprovadas} cor={COR_NO_PRAZO} />
                    <Secao titulo="Pendentes: aguardando análise" rotulo="PENDENTE" linhas={documento.categorias.pendentes} cor={COR_PROXIMO} />
                    <RodapeDoc>Opera Echo Management System | Relatório confidencial</RodapeDoc>
                </>
            )}
        </div>,
        document.body
    );
}
