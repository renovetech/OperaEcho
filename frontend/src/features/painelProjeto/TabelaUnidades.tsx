import { Fragment, useState } from 'react';
import Icon from '@/shared/ui/Icon';
import type { ProdutoPainel, UnidadePainel } from '@/features/painelProjeto/api';
import { corDaRegiao, dataBR, fmtHoras, fmtNum, type ConsolidadoPainel, type FiltroPainel, type GrupoTabela } from '@/features/painelProjeto/calculos';
import { SeloTipo } from '@/features/painelProjeto/marcadores';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Card, CardTitulo } from '@/shared/ui/Pagina';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

const OPCOES_AGRUPAR: { id: FiltroPainel['agrupar']; rotulo: string }[] = [{ id: 'macro', rotulo: 'Macro' }, { id: 'micro', rotulo: 'Micro' }, { id: 'lista', rotulo: 'Sem grupo' }];
const COLUNAS_GRUPO = 5;
const COLUNAS = 8;

export function ChipProduto({ nome, cor, selecionado }: { nome: string; cor: string; selecionado?: boolean }) {
    return (
        <span className="m-0.5 ml-0 inline-flex items-center gap-1 rounded-full border border-solid border-line bg-surface-2 px-2 py-0.5 text-[11.5px] whitespace-nowrap text-text" style={selecionado ? { borderColor: cor } : undefined}>
            <i className="size-2 rounded-full" style={{ background: cor }} />{nome}
        </span>
    );
}

interface LinhaGrupoProps {
    grupo: GrupoTabela;
    recolhido: boolean;
    aoAlternar: () => void;
    aoVerNoMapa: () => void;
}

function LinhaGrupo({ grupo, recolhido, aoAlternar, aoVerNoMapa }: LinhaGrupoProps) {
    return (
        <tr onClick={aoAlternar} className="cursor-pointer bg-surface-2">
            <Td colSpan={COLUNAS_GRUPO}>
                <div className="flex items-center gap-2">
                    <span className={cn('text-text-2 transition-transform', recolhido && '-rotate-90')}><Icon n="arrow-down" /></span>
                    <i className="size-3 shrink-0 rounded-sm" style={{ background: grupo.cor }} />
                    <b className="font-semibold text-ink">{grupo.nome}</b>
                    {grupo.sub && <span className="text-xs text-text-2">{grupo.sub}</span>}
                    <span className="text-xs text-text-2">{fmtNum(grupo.unidades.length)} unidade(s) · {fmtNum(grupo.municipios)} município(s) · {fmtNum(grupo.atendidas)} atendida(s)</span>
                    {grupo.alvo && <Button variant="ghost" size="sm" onClick={(evento) => { evento.stopPropagation(); aoVerNoMapa(); }}><Icon n="map" /> Ver no mapa</Button>}
                </div>
            </Td>
            <Td className="text-right font-semibold tabular-nums">{fmtNum(grupo.qtd)}</Td>
            <Td className="text-right font-semibold whitespace-nowrap tabular-nums">{grupo.min ? fmtHoras(grupo.min) : '-'}</Td>
            <Td className="text-right font-semibold whitespace-nowrap tabular-nums">{dataBR(grupo.ultima)}</Td>
        </tr>
    );
}

interface TabelaUnidadesProps {
    c: ConsolidadoPainel;
    filtro: FiltroPainel;
    produtos: ProdutoPainel[];
    semRegioes: boolean;
    unidadeFoco: number | null;
    aoAgrupar: (agrupar: FiltroPainel['agrupar']) => void;
    aoVerUnidade: (unidade: UnidadePainel) => void;
    aoVerGrupo: (grupo: GrupoTabela) => void;
}

export function TabelaUnidades({ c, filtro, produtos, semRegioes, unidadeFoco, aoAgrupar, aoVerUnidade, aoVerGrupo }: TabelaUnidadesProps) {
    const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(new Set());
    const { gruposTabela: grupos } = c;
    const todosRecolhidos = grupos.length > 0 && grupos.every((grupo) => recolhidos.has(grupo.k));
    const alternar = (k: string) => setRecolhidos((atuais) => (atuais.has(k) ? new Set([...atuais].filter((item) => item !== k)) : new Set([...atuais, k])));

    return (
        <Card className="mb-3.5">
            <CardTitulo
                titulo={`Unidades (${fmtNum(c.kpi.unidades)}): ${c.tituloEscopo}${c.produtoAtual ? ` · ${c.produtoAtual.nome_produto}` : ''}`}
                extra={(
                    <div className="flex items-center gap-1.5">
                        <span className="mr-1 text-xs text-text-2">Agrupar por</span>
                        {OPCOES_AGRUPAR.map((opcao) => <Button key={opcao.id} size="sm" variant={filtro.agrupar === opcao.id ? 'primary' : 'secondary'} disabled={opcao.id !== 'lista' && semRegioes} onClick={() => { setRecolhidos(new Set()); aoAgrupar(opcao.id); }}>{opcao.rotulo}</Button>)}
                        {filtro.agrupar !== 'lista' && grupos.length > 1 && <Button size="sm" variant="ghost" onClick={() => setRecolhidos(todosRecolhidos ? new Set() : new Set(grupos.map((grupo) => grupo.k)))}>{todosRecolhidos ? 'Expandir todos' : 'Recolher todos'}</Button>}
                    </div>
                )}
            />
            <div className="max-h-[560px] overflow-y-auto p-3.5">
                <Tabela cabecalho={<><Th>Unidade</Th><Th>Município</Th><Th>Macro</Th><Th>Micro</Th><Th>Produtos</Th><Th className="text-right">Atividades</Th><Th className="text-right">Horas</Th><Th className="text-right">Última</Th></>}>
                    {!c.kpi.unidades && <LinhaVazia colunas={COLUNAS}>Nenhuma unidade para o filtro selecionado.</LinhaVazia>}
                    {grupos.map((grupo) => (
                        <Fragment key={grupo.k}>
                            {filtro.agrupar !== 'lista' && <LinhaGrupo grupo={grupo} recolhido={recolhidos.has(grupo.k)} aoAlternar={() => alternar(grupo.k)} aoVerNoMapa={() => aoVerGrupo(grupo)} />}
                            {!recolhidos.has(grupo.k) && grupo.unidades.map((unidade) => {
                                const dados = c.porUnidade.get(unidade.id_unidade);
                                return (
                                    <tr key={unidade.id_unidade} onClick={() => aoVerUnidade(unidade)} title="Ver no mapa" className={cn('cursor-pointer', unidadeFoco === unidade.id_unidade && 'bg-tint')}>
                                        <Td>
                                            <span className="flex items-center gap-1.5">
                                                <i className="h-4 w-1 shrink-0 rounded-sm" style={{ background: corDaRegiao(c.regioes, filtro.visao, unidade.id_macro, unidade.id_micro) }} />
                                                <SeloTipo sigla={c.siglaDe(unidade)} titulo={c.tipoPorId.get(unidade.id_tipo_unidade ?? 0)?.nome_tipo ?? 'Sem tipo'} />
                                                <b className="font-semibold">{unidade.nome_unidade}</b>
                                            </span>
                                            <small className="block pl-[11px] text-xs text-text-2">CNES {unidade.cnes || '-'}</small>
                                        </Td>
                                        <Td>{unidade.nome_cidade || '-'}</Td>
                                        <Td>{c.regioes.macros.get(unidade.id_macro ?? 0)?.nome_macro ?? '-'}</Td>
                                        <Td>{c.regioes.micros.get(unidade.id_micro ?? 0)?.nome_micro ?? '-'}</Td>
                                        <Td>{unidade.produtos.map((id) => {
                                            const produto = produtos.find((item) => item.id_produto === id);
                                            return produto ? <ChipProduto key={id} nome={produto.nome_produto} cor={c.corProduto(id)} selecionado={String(id) === filtro.produto} /> : null;
                                        })}</Td>
                                        <Td className="text-right font-semibold tabular-nums">{dados?.qtd ?? 0}</Td>
                                        <Td className="text-right whitespace-nowrap tabular-nums">{dados?.min ? fmtHoras(dados.min) : '-'}</Td>
                                        <Td className="text-right whitespace-nowrap tabular-nums">{dataBR(dados?.ultima)}</Td>
                                    </tr>
                                );
                            })}
                        </Fragment>
                    ))}
                </Tabela>
            </div>
        </Card>
    );
}
