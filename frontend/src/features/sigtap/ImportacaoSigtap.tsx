import { useState, type DragEvent, type FormEvent } from 'react';
import Icon from '@/shared/ui/Icon';
import { Mono, Selo } from '@/features/sigtap/componentes';
import { fmtComp, fmtDuracao, fmtNum } from '@/features/sigtap/formatos';
import { tamanhoEmMb, totalPaginas, useImportacaoSigtap } from '@/features/sigtap/hooks';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';
import { Card, CardTitulo, Stat } from '@/shared/ui/Pagina';
import { LinhaVazia, Paginacao, Tabela, Td, Th } from '@/shared/ui/Tabela';

const URL_DATASUS = 'http://sigtap.datasus.gov.br/tabela-unificada/app/download.jsp';
const PERCENTUAL_MINIMO = 3;

const SITUACAO: Record<string, { rotulo: string; tom: string }> = {
    CONCLUIDA: { rotulo: 'Concluída', tom: 'bg-tint text-pine-800' },
    PROCESSANDO: { rotulo: 'Processando', tom: 'bg-brass-tint text-brass' },
    ERRO: { rotulo: 'Erro', tom: 'bg-danger-tint text-danger' }
};

function Barra({ percentual }: { percentual: number }) {
    return <div className="my-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-line-2"><div className="h-full rounded-full bg-pine transition-all" style={{ width: `${percentual}%` }} /></div>;
}

const ValorStat = ({ children }: { children: React.ReactNode }) => <p className="m-0 text-[17px] leading-tight font-bold text-ink tabular-nums">{children}</p>;

export default function ImportacaoSigtap({ podeEditar }: { podeEditar: boolean }) {
    const i = useImportacaoSigtap();
    const [arrastando, setArrastando] = useState(false);
    const ultima = i.resumo?.ultimaConcluida;
    const vigente = i.resumo?.competencias?.[0];
    const enviando = i.progressoEnvio > 0;
    const competenciaVigente = fmtComp(i.resumo?.competenciaVigente);

    const aoSoltar = (evento: DragEvent) => {
        evento.preventDefault();
        setArrastando(false);
        if (podeEditar) i.escolherArquivo(evento.dataTransfer.files?.[0]);
    };

    const filtrar = (evento: FormEvent) => {
        evento.preventDefault();
        i.filtrarHistorico();
    };

    return (
        <>
            <div className="mb-3.5 grid grid-cols-4 gap-4">
                <Stat rotulo="Competência vigente"><ValorStat>{competenciaVigente === '-' ? 'Sem dados' : competenciaVigente}</ValorStat></Stat>
                <Stat rotulo="Procedimentos vigentes"><ValorStat>{fmtNum(vigente?.qt_procedimentos ?? 0)}</ValorStat></Stat>
                <Stat rotulo="Última importação">
                    <ValorStat>{ultima?.fim ?? 'Nenhuma'}</ValorStat>
                    {ultima && <small className="text-xs text-text-2">Competência {fmtComp(ultima.competencia)}</small>}
                </Stat>
                <Stat rotulo="Responsável"><ValorStat>{ultima?.usuario ?? '-'}</ValorStat></Stat>
            </div>

            <Card className="mb-3.5">
                <CardTitulo
                    titulo="Enviar pacote"
                    ajuda="Cada competência importada fica disponível na Consulta SIGTAP. Reimportar uma competência existente substitui os dados dela. Se qualquer etapa falhar, nada é alterado."
                    extra={<a href={URL_DATASUS} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-pine no-underline hover:underline"><Icon n="download" /> Baixar pacote no DATASUS</a>}
                />
                <div className="p-[18px]">
                    {i.andamento ? (
                        <div className="flex flex-col items-center rounded-[10px] border border-solid border-pine bg-tint p-6 text-center">
                            <b className="text-sm font-semibold text-ink">Importando {i.andamento.arquivo}</b>
                            <span className="mt-1 text-[13px] text-text-2">Competência {fmtComp(i.andamento.competencia)} · {i.andamento.etapa || 'Processando'}</span>
                            <Barra percentual={i.andamento.percentual || PERCENTUAL_MINIMO} />
                            <small className="text-xs text-text-2">{i.andamento.percentual || 0}% · A importação continua mesmo se você sair desta tela.</small>
                        </div>
                    ) : (
                        <div
                            onDragOver={(e) => { e.preventDefault(); if (podeEditar) setArrastando(true); }}
                            onDragLeave={() => setArrastando(false)}
                            onDrop={aoSoltar}
                            className={cn('flex flex-col items-center rounded-[10px] border-2 border-dashed p-6 text-center transition-colors', arrastando || i.arquivo ? 'border-pine bg-tint' : 'border-line bg-surface-2')}
                        >
                            <b className="text-sm font-semibold text-ink">{i.arquivo ? 'Arquivo selecionado' : 'Arraste o .zip aqui ou escolha o arquivo'}</b>
                            {i.arquivo
                                ? <span className="mt-1"><Mono>{i.arquivo.name}</Mono> <small className="text-xs text-text-2">({tamanhoEmMb(i.arquivo)} MB)</small></span>
                                : <span className="mt-1 max-w-2xl text-[13px] text-text-2">Procedimentos, descrições, CID, CBO, habilitações, serviços, instrumentos, atributos e compatibilidades são lidos do pacote.</span>}
                            {enviando && <Barra percentual={i.progressoEnvio} />}
                            {podeEditar ? (
                                <div className="mt-3.5 flex gap-2.5">
                                    <label className="m-0 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-solid border-line bg-white px-4 py-2.5 text-sm font-medium text-text hover:bg-surface-2">
                                        <Icon n="file" /> {i.arquivo ? 'Trocar arquivo' : 'Escolher arquivo'}
                                        <input type="file" accept=".zip" className="hidden" onChange={(e) => { i.escolherArquivo(e.target.files?.[0]); e.target.value = ''; }} />
                                    </label>
                                    <Button disabled={!i.arquivo || enviando} onClick={i.enviar}><Icon n="refresh" /> {enviando ? `Enviando ${i.progressoEnvio}%...` : 'Importar'}</Button>
                                </div>
                            ) : <small className="mt-2.5 text-xs text-text-2">Somente leitura: sem permissão para importar.</small>}
                        </div>
                    )}
                </div>
            </Card>

            {Boolean(i.resumo?.competencias?.length) && (
                <Card className="mb-3.5">
                    <CardTitulo titulo="Competências na base" extra={<small className="text-xs text-text-2">{i.resumo?.competencias.length} disponível(is)</small>} />
                    <div className="grid grid-cols-3 gap-3 p-[18px]">
                        {i.resumo?.competencias.map((competencia, indice) => (
                            <div key={competencia.competencia} className={cn('flex items-center justify-between gap-2 rounded-lg border border-solid p-3', indice === 0 ? 'border-pine bg-tint' : 'border-line')}>
                                <div>
                                    <b className="text-sm font-semibold text-ink">{fmtComp(competencia.competencia)}</b>
                                    {indice === 0 && <Selo className="ml-2 bg-pine text-white">vigente</Selo>}
                                    <small className="mt-0.5 block text-xs text-text-2">{fmtNum(competencia.qt_procedimentos)} procedimentos · {competencia.usuario}</small>
                                </div>
                                {podeEditar && !i.andamento && (
                                    <button type="button" title="Remover competência" aria-label={`Remover competência ${fmtComp(competencia.competencia)}`} className="cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-danger hover:bg-danger-tint" onClick={() => i.remover(competencia)}><Icon n="trash" /></button>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <h2 className="m-0 mb-3 text-[14.5px] font-semibold text-ink">Histórico de importações</h2>
            <Card className="mb-3.5 px-4 py-3.5">
                <form onSubmit={filtrar} className="flex items-end gap-3.5">
                    <Field rotulo="Competência (AAAAMM)" htmlFor="imp-competencia" className="w-52">
                        <Input id="imp-competencia" className="font-mono" inputMode="numeric" maxLength={6} placeholder="202609" value={i.rascunho.competencia} onChange={(e) => i.setRascunho({ ...i.rascunho, competencia: e.target.value.replace(/\D/g, '') })} />
                    </Field>
                    <Field rotulo="Situação" htmlFor="imp-situacao" className="w-52">
                        <Select id="imp-situacao" value={i.rascunho.situacao} onChange={(e) => i.setRascunho({ ...i.rascunho, situacao: e.target.value })}>
                            <option value="">Todas</option>
                            {Object.entries(SITUACAO).map(([valor, { rotulo }]) => <option key={valor} value={valor}>{rotulo}</option>)}
                        </Select>
                    </Field>
                    <div className="flex gap-2">
                        <Button type="submit"><Icon n="search" /> Buscar</Button>
                        <Button variant="secondary" onClick={i.limparHistorico}>Limpar</Button>
                    </div>
                </form>
            </Card>
            <Tabela cabecalho={<><Th>Arquivo / Usuário</Th><Th>Competência</Th><Th>Início</Th><Th>Duração</Th><Th className="text-right">Procedimentos</Th><Th className="text-right">Novos</Th><Th className="text-right">Compatib.</Th><Th>Situação</Th></>}>
                {i.carregandoHistorico && <LinhaVazia colunas={8}>Carregando...</LinhaVazia>}
                {!i.carregandoHistorico && i.historico.itens.length === 0 && <LinhaVazia colunas={8}>Nenhuma importação registrada. Envie o pacote da Tabela Unificada para montar a base de consulta.</LinhaVazia>}
                {!i.carregandoHistorico && i.historico.itens.map((item) => (
                    <tr key={item.id_importacao}>
                        <Td><span className="font-medium">{item.arquivo}</span><small className="mt-0.5 block text-xs text-text-2">{item.usuario}</small></Td>
                        <Td className="tabular-nums">{fmtComp(item.competencia)}{item.removida && <small className="mt-0.5 block text-xs text-text-2">removida</small>}</Td>
                        <Td className="tabular-nums">{item.inicio}</Td>
                        <Td className="tabular-nums">{fmtDuracao(item.duracao_seg)}</Td>
                        <Td className="text-right tabular-nums">{fmtNum(item.qt_procedimentos)}</Td>
                        <Td className="text-right tabular-nums">{fmtNum(item.qt_novos)}</Td>
                        <Td className="text-right tabular-nums">{fmtNum(item.qt_compatibilidades)}</Td>
                        <Td>
                            <Selo className={SITUACAO[item.situacao]?.tom}>{SITUACAO[item.situacao]?.rotulo ?? item.situacao}</Selo>
                            {item.situacao === 'PROCESSANDO' && item.percentual !== undefined && <small className="mt-1 block text-xs text-text-2">{item.etapa} · {item.percentual}%</small>}
                            {item.mensagem && <small className="mt-1 block text-xs text-danger">{item.mensagem}</small>}
                        </Td>
                    </tr>
                ))}
            </Tabela>
            <Paginacao pagina={i.pagina} totalPaginas={totalPaginas(i.historico)} totalItens={i.historico.total} aoMudar={i.irParaPagina} />
        </>
    );
}
