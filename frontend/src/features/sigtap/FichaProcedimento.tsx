import { useMemo, useState, type ReactNode } from 'react';
import Icon from '@/shared/ui/Icon';
import type { CompatExcecao, CompatItem, FichaProcedimentoDados, HistoricoProcedimento } from '@/features/sigtap/api';
import { BotaoAba, LinkAcao, ListaFiltravel, Mono, Selo, SeloCompat, SeloComplexidade } from '@/features/sigtap/componentes';
import {
    COMPATIBILIDADE, COMPLEXIDADE, fmtCid, fmtComp, fmtIdade, fmtMoeda, fmtNum, fmtPerc, fmtProc, fmtQtd, REGISTRO_SIGLA, rotuloCompat, SEXO, SIA_SIH_TIPO
} from '@/features/sigtap/formatos';
import { useFichaProcedimento } from '@/features/sigtap/hooks';
import { avisoRapido } from '@/shared/feedback';
import { cn, logErro } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { Card, CardTitulo } from '@/shared/ui/Pagina';
import { Tabela, Td, Th } from '@/shared/ui/Tabela';

interface FichaProps {
    codigo: string;
    competencia: string;
    aoVoltar: () => void;
    aoAbrir: (codigo: string) => void;
    aoFiltrar: (vinculo: string, codigo: string, rotulo: string) => void;
}

function Atributo({ rotulo, title, larga, children }: { rotulo: string; title?: string; larga?: boolean; children: ReactNode }) {
    return (
        <div className={cn(larga && 'col-span-3')}>
            <dt className="text-xs text-text-2">{rotulo}</dt>
            <dd className="m-0 mt-0.5 text-[13.5px] text-ink" title={title}>{children}</dd>
        </div>
    );
}

function LinhaValor({ rotulo, valor, total }: { rotulo: string; valor: number; total?: boolean }) {
    return (
        <div className={cn('flex justify-between py-1.5 text-[13px]', total ? 'mt-1 border-t border-line-2 pt-2 font-semibold text-ink' : 'text-text')}>
            <span>{rotulo}</span><b className="font-semibold tabular-nums">{fmtMoeda(valor)}</b>
        </div>
    );
}

const Subtitulo = ({ children }: { children: ReactNode }) => <h3 className="m-0 mt-5 mb-2.5 text-[13.5px] font-semibold text-ink">{children}</h3>;

function AbaCompatibilidades({ dados, nomeRegistro, aoAbrir }: { dados: FichaProcedimentoDados['compatibilidades']; nomeRegistro: (codigo: string) => string; aoAbrir: (codigo: string) => void }) {
    const inicial = dados.comoPrincipal.length ? 'principal' : dados.comoSecundario.length ? 'secundario' : 'excecoes';
    const [lado, setLado] = useState(inicial);
    const lista = lado === 'principal' ? dados.comoPrincipal : dados.comoSecundario;

    const grupos = useMemo(() => {
        const mapa = new Map<string, CompatItem[]>();
        lista.forEach((item) => {
            const chave = `${item.reg_principal}-${item.reg_compativel}-${item.tipo}`;
            mapa.set(chave, [...(mapa.get(chave) ?? []), item]);
        });
        return [...mapa.entries()];
    }, [lista]);

    const celulaExcecao = (codigo: string, nome: string, registro?: string) => (
        <><LinkAcao mono onClick={() => aoAbrir(codigo)}>{fmtProc(codigo)}</LinkAcao><small className="mt-0.5 block text-xs text-text-2">{nome}{registro ? ` · ${nomeRegistro(registro)}` : ''}</small></>
    );

    return (
        <div>
            <div className="mb-3.5 flex gap-2">
                <Button size="sm" variant={lado === 'principal' ? 'primary' : 'secondary'} disabled={!dados.comoPrincipal.length} onClick={() => setLado('principal')}>Como principal ({dados.comoPrincipal.length})</Button>
                <Button size="sm" variant={lado === 'secundario' ? 'primary' : 'secondary'} disabled={!dados.comoSecundario.length} onClick={() => setLado('secundario')}>Como secundário ({dados.comoSecundario.length})</Button>
                <Button size="sm" variant={lado === 'excecoes' ? 'primary' : 'secondary'} disabled={!dados.excecoes.length} onClick={() => setLado('excecoes')}>Exceções ({dados.excecoes.length})</Button>
            </div>
            {lado !== 'excecoes' && grupos.map(([chave, itens]) => {
                const primeiro = itens[0] as CompatItem;
                return (
                    <div key={chave} className="mb-5 last:mb-0">
                        <div className="mb-1 flex items-center gap-2.5 text-[13.5px] text-ink">
                            <SeloCompat tipo={primeiro.tipo} />
                            <span>{nomeRegistro(primeiro.reg_principal)} <b>×</b> {nomeRegistro(primeiro.reg_compativel)}</span>
                            <small className="text-xs text-text-2">{itens.length}</small>
                        </div>
                        <small className="mb-2 block text-xs text-text-2">{COMPATIBILIDADE[String(primeiro.tipo)]?.ajuda}</small>
                        <ListaFiltravel
                            itens={itens}
                            limite={8}
                            chave={(item) => item.codigo}
                            busca={(item) => `${item.codigo} ${fmtProc(item.codigo)} ${item.nome}`}
                            cabecalho={['Procedimento', 'Nome', 'Qtd.']}
                            linha={(item) => [<LinkAcao mono onClick={() => aoAbrir(item.codigo)}>{fmtProc(item.codigo)}</LinkAcao>, item.nome, <Mono>{item.quantidade ?? '-'}</Mono>]}
                        />
                    </div>
                );
            })}
            {lado === 'excecoes' && (
                <ListaFiltravel<CompatExcecao>
                    itens={dados.excecoes}
                    chave={(item) => item.restricao + item.principal + item.compativel}
                    busca={(item) => `${item.restricao} ${item.principal} ${item.compativel} ${item.nome_restricao} ${item.nome_principal} ${item.nome_compativel}`}
                    cabecalho={['Restrição', 'Principal', 'Compatível', 'Tipo']}
                    linha={(item) => [
                        celulaExcecao(item.restricao, item.nome_restricao),
                        celulaExcecao(item.principal, item.nome_principal, item.reg_principal),
                        celulaExcecao(item.compativel, item.nome_compativel, item.reg_compativel),
                        rotuloCompat(item.tipo)
                    ]}
                />
            )}
        </div>
    );
}

type CampoHistorico = keyof Omit<HistoricoProcedimento, 'competencia' | 'no_procedimento'>;

const CAMPOS_HISTORICO: [CampoHistorico, string, (valor: number) => string][] = [
    ['vl_sa', 'SA', fmtMoeda],
    ['vl_sh', 'SH', fmtMoeda],
    ['vl_sp', 'SP', fmtMoeda],
    ['tp_complexidade', 'Complexidade', (valor) => COMPLEXIDADE[String(valor)] ?? String(valor)],
    ['qt_maxima_execucao', 'Qtd. máx.', (valor) => fmtQtd(valor)],
    ['vl_idade_minima', 'Idade mín.', fmtIdade],
    ['vl_idade_maxima', 'Idade máx.', fmtIdade]
];

function AbaHistorico({ historico }: { historico: HistoricoProcedimento[] }) {
    return (
        <Tabela cabecalho={<><Th>Competência</Th>{CAMPOS_HISTORICO.map(([campo, rotulo]) => <Th key={campo}>{rotulo}</Th>)}</>}>
            {historico.map((item, indice) => {
                const anterior = historico[indice + 1];
                return (
                    <tr key={item.competencia}>
                        <Td>
                            <Mono>{fmtComp(item.competencia)}</Mono>
                            {anterior && anterior.no_procedimento !== item.no_procedimento && <small className="mt-0.5 block text-xs text-brass">nome alterado</small>}
                        </Td>
                        {CAMPOS_HISTORICO.map(([campo, , formatar]) => (
                            <Td key={campo} className={cn('tabular-nums', anterior && anterior[campo] !== item[campo] && 'font-semibold text-brass')}>{formatar(item[campo])}</Td>
                        ))}
                    </tr>
                );
            })}
        </Tabela>
    );
}

export function FichaProcedimento({ codigo, competencia, aoVoltar, aoAbrir, aoFiltrar }: FichaProps) {
    const { dados, falhou } = useFichaProcedimento(codigo, competencia);
    const [aba, setAba] = useState('descricao');

    const voltar = <div className="mb-2.5"><Button variant="ghost" size="sm" className="-ml-2" onClick={aoVoltar}><Icon n="arrow-left" /> Voltar</Button></div>;
    if (falhou) return <>{voltar}<Aviso titulo="Não foi possível abrir">{falhou}</Aviso></>;
    if (!dados) return <>{voltar}<Carregando /></>;

    const p = dados.procedimento;
    const compat = dados.compatibilidades;
    const nomeRegistro = (registro: string) => dados.nomesRegistro?.[registro] ?? registro;
    const procedimentos = (vinculo: string, valor: string, rotulo: string) => <LinkAcao onClick={() => aoFiltrar(vinculo, valor, rotulo)}>procedimentos</LinkAcao>;
    const copiar = () => {
        navigator.clipboard?.writeText(codigo).then(() => avisoRapido('Código copiado')).catch((falha: unknown) => logErro('Erro ao copiar código', falha));
    };

    const abas = [
        { id: 'descricao', rotulo: 'Descrição', qtd: p.ds_procedimento ? 1 : 0, semContador: true },
        { id: 'cid', rotulo: 'CID', qtd: dados.cids.length },
        { id: 'cbo', rotulo: 'CBO', qtd: dados.cbos.length },
        { id: 'compat', rotulo: 'Compatibilidades', qtd: compat.comoPrincipal.length + compat.comoSecundario.length + compat.excecoes.length },
        { id: 'servico', rotulo: 'Serviço', qtd: dados.servicos.length },
        { id: 'habilitacao', rotulo: 'Habilitação', qtd: dados.habilitacoes.length + dados.incrementos.length },
        { id: 'leito', rotulo: 'Leito', qtd: dados.leitos.length },
        { id: 'redes', rotulo: 'Redes', qtd: dados.redes.length },
        { id: 'origem', rotulo: 'Origem', qtd: dados.origens.length + dados.siaSih.length },
        { id: 'regra', rotulo: 'Regra', qtd: dados.regras.length },
        { id: 'renases', rotulo: 'RENASES', qtd: dados.renases.length },
        { id: 'tuss', rotulo: 'TUSS', qtd: dados.tuss.length },
        { id: 'historico', rotulo: 'Histórico', qtd: dados.historico.length }
    ];

    return (
        <>
            {voltar}
            <Card className="mb-3.5 px-[22px] py-[18px]">
                <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-text-2">
                    <LinkAcao onClick={() => aoFiltrar('grupo', codigo.slice(0, 2), '')}>{codigo.slice(0, 2)} · {p.no_grupo}</LinkAcao><span>›</span>
                    <LinkAcao onClick={() => aoFiltrar('subgrupo', codigo.slice(0, 4), '')}>{codigo.slice(2, 4)} · {p.no_sub_grupo}</LinkAcao><span>›</span>
                    <LinkAcao onClick={() => aoFiltrar('forma', codigo.slice(0, 6), '')}>{codigo.slice(4, 6)} · {p.no_forma_organizacao}</LinkAcao>
                </div>
                <button type="button" onClick={copiar} title="Copiar código (sem pontuação)" className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-solid border-line bg-surface-2 px-2.5 py-1 font-mono text-[13px] text-pine-800 hover:border-pine">
                    {fmtProc(codigo)} <Icon n="clipboard" />
                </button>
                <h2 className="m-0 mt-2.5 mb-3 text-lg font-bold text-ink">{p.no_procedimento}</h2>
                <div className="flex flex-wrap gap-2">
                    <SeloComplexidade tipo={p.tp_complexidade}>{COMPLEXIDADE[String(p.tp_complexidade)] ?? 'Complexidade -'}</SeloComplexidade>
                    {p.no_financiamento && <Selo>{p.no_financiamento}</Selo>}
                    {p.no_rubrica && <Selo>Rubrica: {p.no_rubrica}</Selo>}
                    <Selo className="bg-brass-tint text-brass">Competência {fmtComp(competencia)}</Selo>
                </div>
            </Card>

            <div className="mb-3.5 grid grid-cols-[2fr_1fr] items-start gap-3.5">
                <Card>
                    <CardTitulo titulo="Atributos" />
                    <dl className="m-0 grid grid-cols-3 gap-x-[18px] gap-y-3.5 px-[18px] py-4">
                        <Atributo larga rotulo="Modalidade de atendimento">
                            <span className="flex flex-wrap gap-1.5">{dados.modalidades.length ? dados.modalidades.map((item) => <Selo key={item.codigo}>{item.nome}</Selo>) : '-'}</span>
                        </Atributo>
                        <Atributo larga rotulo="Instrumento de registro">
                            <span className="flex flex-wrap gap-1.5">{dados.registros.length ? dados.registros.map((item) => <Selo key={item.codigo} className="bg-tint text-pine-800" title={REGISTRO_SIGLA[item.codigo]}>{item.nome}</Selo>) : '-'}</span>
                        </Atributo>
                        <Atributo rotulo="Sexo">{SEXO[p.tp_sexo] ?? '-'}</Atributo>
                        <Atributo rotulo="Quantidade máxima">{fmtQtd(p.qt_maxima_execucao)}</Atributo>
                        <Atributo rotulo="Pontos">{p.qt_pontos ? fmtNum(p.qt_pontos) : '-'}</Atributo>
                        <Atributo rotulo="Idade mínima" title={`${p.vl_idade_minima} meses`}>{fmtIdade(p.vl_idade_minima)}</Atributo>
                        <Atributo rotulo="Idade máxima" title={`${p.vl_idade_maxima} meses`}>{fmtIdade(p.vl_idade_maxima)}</Atributo>
                        <Atributo rotulo="Média de permanência">{fmtQtd(p.qt_dias_permanencia, ' dias')}</Atributo>
                        <Atributo rotulo="Tempo de permanência">{fmtQtd(p.qt_tempo_permanencia, ' dias')}</Atributo>
                    </dl>
                    {dados.detalhes.length > 0 && (
                        <div className="border-t border-line-2 px-[18px] py-3.5">
                            <p className="m-0 mb-2 text-xs text-text-2">Atributos complementares</p>
                            {dados.detalhes.map((item) => (
                                <details key={item.codigo} className="mb-1.5 text-[13px] last:mb-0">
                                    <summary className="cursor-pointer text-ink"><Mono>{item.codigo}</Mono> {item.nome}</summary>
                                    <p className="m-0 my-1.5 text-text-2">{item.descricao || 'Sem descrição no pacote.'}</p>
                                    <LinkAcao onClick={() => aoFiltrar('detalhe', item.codigo, `Atributo ${item.codigo} - ${item.nome}`)}>Ver procedimentos com este atributo</LinkAcao>
                                </details>
                            ))}
                        </div>
                    )}
                </Card>
                <Card>
                    <CardTitulo titulo="Valores" />
                    <div className="px-[18px] py-3.5">
                        <p className="m-0 mb-1 text-xs font-semibold text-pine-800 uppercase">Ambulatorial</p>
                        <LinhaValor rotulo="Serviço ambulatorial (SA)" valor={p.vl_sa} />
                        <LinhaValor total rotulo="Total ambulatorial" valor={p.vl_sa} />
                        <p className="m-0 mt-4 mb-1 text-xs font-semibold text-pine-800 uppercase">Hospitalar</p>
                        <LinhaValor rotulo="Serviço hospitalar (SH)" valor={p.vl_sh} />
                        <LinhaValor rotulo="Serviço profissional (SP)" valor={p.vl_sp} />
                        <LinhaValor total rotulo="Total hospitalar" valor={(p.vl_sh || 0) + (p.vl_sp || 0)} />
                        {dados.incrementos.length > 0 && <p className="m-0 mt-3 text-xs text-text-2">Possui {dados.incrementos.length} incremento(s) por habilitação: veja a aba Habilitação.</p>}
                    </div>
                </Card>
            </div>

            <Card>
                <div role="tablist" className="flex flex-wrap border-b border-line-2 px-2">
                    {abas.map((item) => (
                        <BotaoAba key={item.id} ativo={aba === item.id} desabilitado={!item.qtd} onClick={() => setAba(item.id)}>
                            {item.rotulo}{!item.semContador && item.qtd > 0 && <em className="rounded-full bg-line-2 px-1.5 text-[11px] font-semibold text-text-2 not-italic">{item.qtd}</em>}
                        </BotaoAba>
                    ))}
                </div>
                <div className="p-[18px]">
                    {aba === 'descricao' && <p className="m-0 text-sm leading-relaxed whitespace-pre-line text-text">{p.ds_procedimento || 'Sem descrição.'}</p>}
                    {aba === 'cid' && (
                        <ListaFiltravel itens={dados.cids} placeholder="Filtrar CID..." chave={(x) => x.codigo} busca={(x) => `${x.codigo} ${fmtCid(x.codigo)} ${x.nome}`} cabecalho={['CID', 'Descrição', 'Principal', '']}
                            linha={(x) => [<Mono>{fmtCid(x.codigo)}</Mono>, x.nome, x.principal === 'S' ? <Selo className="bg-tint text-pine-800">Sim</Selo> : <span className="text-text-2">Não</span>, procedimentos('cid', x.codigo, `CID ${fmtCid(x.codigo)} - ${x.nome}`)]} />
                    )}
                    {aba === 'cbo' && (
                        <ListaFiltravel itens={dados.cbos} placeholder="Filtrar CBO..." chave={(x) => x.codigo} busca={(x) => `${x.codigo} ${x.nome}`} cabecalho={['Código', 'Ocupação', '']}
                            linha={(x) => [<Mono>{x.codigo}</Mono>, x.nome, procedimentos('ocupacao', x.codigo, `CBO ${x.codigo} - ${x.nome}`)]} />
                    )}
                    {aba === 'compat' && <AbaCompatibilidades dados={compat} nomeRegistro={nomeRegistro} aoAbrir={aoAbrir} />}
                    {aba === 'servico' && (
                        <ListaFiltravel itens={dados.servicos} chave={(x) => x.servico + x.classificacao} busca={(x) => `${x.servico} ${x.nome_servico} ${x.classificacao} ${x.nome_classificacao}`} cabecalho={['Serviço', 'Classificação', '']}
                            linha={(x) => [<><Mono>{x.servico}</Mono> {x.nome_servico}</>, <><Mono>{x.classificacao}</Mono> {x.nome_classificacao}</>, procedimentos('servico', `${x.servico}.${x.classificacao}`, `Serviço ${x.servico}/${x.classificacao} - ${x.nome_classificacao}`)]} />
                    )}
                    {aba === 'habilitacao' && (
                        <>
                            {dados.habilitacoes.length > 0 && (
                                <ListaFiltravel itens={dados.habilitacoes} chave={(x) => x.codigo + (x.grupo ?? '')} busca={(x) => `${x.codigo} ${x.nome} ${x.nome_grupo ?? ''}`} cabecalho={['Código', 'Habilitação', 'Grupo', '']}
                                    linha={(x) => [<Mono>{x.codigo}</Mono>, x.nome, x.grupo ? <span title={x.descricao_grupo}><Mono>{x.grupo}</Mono> {x.nome_grupo}</span> : '-', procedimentos('habilitacao', x.codigo, `Habilitação ${x.codigo} - ${x.nome}`)]} />
                            )}
                            {dados.incrementos.length > 0 && (
                                <>
                                    <Subtitulo>Incrementos por habilitação</Subtitulo>
                                    <ListaFiltravel itens={dados.incrementos} chave={(x) => x.codigo} busca={(x) => `${x.codigo} ${x.nome}`} cabecalho={['Habilitação', '% SH', '% SA', '% SP']}
                                        linha={(x) => [<><Mono>{x.codigo}</Mono> {x.nome}</>, <Mono>{fmtPerc(x.sh)}</Mono>, <Mono>{fmtPerc(x.sa)}</Mono>, <Mono>{fmtPerc(x.sp)}</Mono>]} />
                                </>
                            )}
                        </>
                    )}
                    {aba === 'leito' && <ListaFiltravel itens={dados.leitos} chave={(x) => x.codigo} busca={(x) => x.nome} cabecalho={['Código', 'Tipo de leito']} linha={(x) => [<Mono>{x.codigo}</Mono>, x.nome]} />}
                    {aba === 'redes' && <ListaFiltravel itens={dados.redes} chave={(x) => x.codigo} busca={(x) => `${x.nome} ${x.rede}`} cabecalho={['Componente', 'Nome', 'Rede de atenção']} linha={(x) => [<Mono>{x.codigo}</Mono>, x.nome, x.rede]} />}
                    {aba === 'origem' && (
                        <>
                            {dados.origens.length > 0 && (
                                <ListaFiltravel itens={dados.origens} chave={(x) => x.codigo} busca={(x) => `${x.codigo} ${x.nome}`} cabecalho={['Procedimento de origem', 'Nome']}
                                    linha={(x) => [<LinkAcao mono onClick={() => aoAbrir(x.codigo)}>{fmtProc(x.codigo)}</LinkAcao>, x.nome]} />
                            )}
                            {dados.siaSih.length > 0 && (
                                <>
                                    <Subtitulo>Correspondência com a tabela antiga (SIA/SIH)</Subtitulo>
                                    <ListaFiltravel itens={dados.siaSih} chave={(x) => x.codigo + x.tipo} busca={(x) => `${x.codigo} ${x.nome}`} cabecalho={['Código', 'Nome', 'Tipo']}
                                        linha={(x) => [<Mono>{x.codigo}</Mono>, x.nome, SIA_SIH_TIPO[x.tipo] ?? x.tipo]} />
                                </>
                            )}
                        </>
                    )}
                    {aba === 'regra' && dados.regras.map((x) => (
                        <div key={x.codigo} className="mb-3 last:mb-0">
                            <b className="text-sm font-semibold text-ink"><Mono>{x.codigo}</Mono> {x.nome}</b>
                            {x.descricao && <p className="m-0 mt-1 text-[13px] text-text">{x.descricao}</p>}
                        </div>
                    ))}
                    {aba === 'renases' && <ListaFiltravel itens={dados.renases} chave={(x) => x.codigo} busca={(x) => `${x.codigo} ${x.nome}`} cabecalho={['Código', 'RENASES']} linha={(x) => [<Mono>{x.codigo}</Mono>, x.nome]} />}
                    {aba === 'tuss' && <ListaFiltravel itens={dados.tuss} chave={(x) => x.codigo} busca={(x) => `${x.codigo} ${x.nome}`} cabecalho={['Código', 'TUSS']} linha={(x) => [<Mono>{x.codigo}</Mono>, x.nome]} />}
                    {aba === 'historico' && <AbaHistorico historico={dados.historico} />}
                </div>
            </Card>
        </>
    );
}
