import { useState, type FormEvent } from 'react';
import Icon from '@/shared/ui/Icon';
import type { ItemCodigo } from '@/features/sigtap/api';
import { CampoBusca, Mono, Selo, SeloComplexidade } from '@/features/sigtap/componentes';
import { COMPLEXIDADE, fmtMoeda, fmtNum, fmtProc, REGISTRO_SIGLA, SEXO } from '@/features/sigtap/formatos';
import { totalPaginas, useBuscaProcedimentos, type FiltroBusca } from '@/features/sigtap/hooks';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Select } from '@/shared/ui/Campos';
import { Card, CardTitulo } from '@/shared/ui/Pagina';
import { LinhaVazia, Paginacao, Tabela, Td, Th } from '@/shared/ui/Tabela';

const FILTROS_AVANCADOS: FiltroBusca[] = ['financiamento', 'complexidade', 'registro', 'modalidade', 'sexo'];

const nomeDe = (lista: ItemCodigo[] | undefined, codigo: string) => lista?.find((item) => item.codigo === codigo)?.nome ?? codigo;

function Etiqueta({ forte, aoRemover, children }: { forte?: boolean; aoRemover: () => void; children: string }) {
    return (
        <span className={cn('inline-flex items-center gap-1.5 rounded-full py-1 pr-1.5 pl-3 text-xs font-medium', forte ? 'bg-pine text-white' : 'bg-tint text-pine-800')}>
            {children}
            <button type="button" aria-label={`Remover ${children}`} onClick={aoRemover} className="cursor-pointer border-0 bg-transparent p-0 px-1 text-sm leading-none text-current">×</button>
        </span>
    );
}

export function BuscaProcedimentos({ competencia, aoAbrir }: { competencia: string; aoAbrir: (codigo: string) => void }) {
    const b = useBuscaProcedimentos(competencia);
    const { filtros, meta } = b;
    const [avancado, setAvancado] = useState(false);
    const qtdAvancados = FILTROS_AVANCADOS.filter((chave) => filtros[chave]).length;
    const subgrupos = (meta?.subgrupos ?? []).filter((item) => filtros.grupo && item.codigo.startsWith(filtros.grupo));
    const formas = (meta?.formas ?? []).filter((item) => filtros.subgrupo && item.codigo.startsWith(filtros.subgrupo));

    const enviar = (evento: FormEvent) => {
        evento.preventDefault();
        b.enviar();
    };

    const etiquetas: { campo: FiltroBusca; texto: string }[] = [
        { campo: 'grupo', texto: `Grupo: ${nomeDe(meta?.grupos, filtros.grupo)}` },
        { campo: 'subgrupo', texto: `Subgrupo: ${nomeDe(meta?.subgrupos, filtros.subgrupo)}` },
        { campo: 'forma', texto: `Forma: ${nomeDe(meta?.formas, filtros.forma)}` },
        { campo: 'financiamento', texto: nomeDe(meta?.financiamentos, filtros.financiamento) },
        { campo: 'complexidade', texto: COMPLEXIDADE[filtros.complexidade] ?? '' },
        { campo: 'registro', texto: nomeDe(meta?.registros, filtros.registro) },
        { campo: 'modalidade', texto: nomeDe(meta?.modalidades, filtros.modalidade) },
        { campo: 'sexo', texto: `Sexo: ${SEXO[filtros.sexo] ?? ''}` }
    ];

    return (
        <>
            <Card className="mb-3.5 px-4 py-3.5">
                <form onSubmit={enviar}>
                    <div className="flex gap-2.5">
                        <CampoBusca autoFocus valor={b.texto} placeholder="Código (03.01.10.027-6) ou nome do procedimento" aoAlterar={b.setTexto} />
                        <Button type="submit">Buscar</Button>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3.5">
                        <Field rotulo="Grupo" htmlFor="sg-grupo">
                            <Select id="sg-grupo" value={filtros.grupo} onChange={(e) => b.alterar('grupo', e.target.value)}>
                                <option value="">Todos os grupos</option>
                                {(meta?.grupos ?? []).map((item) => <option key={item.codigo} value={item.codigo}>{item.codigo} - {item.nome}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Subgrupo" htmlFor="sg-subgrupo">
                            <Select id="sg-subgrupo" value={filtros.subgrupo} disabled={!filtros.grupo} onChange={(e) => b.alterar('subgrupo', e.target.value)}>
                                <option value="">{filtros.grupo ? 'Todos os subgrupos' : 'Selecione o grupo'}</option>
                                {subgrupos.map((item) => <option key={item.codigo} value={item.codigo}>{item.codigo.slice(2)} - {item.nome}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Forma de organização" htmlFor="sg-forma">
                            <Select id="sg-forma" value={filtros.forma} disabled={!filtros.subgrupo} onChange={(e) => b.alterar('forma', e.target.value)}>
                                <option value="">{filtros.subgrupo ? 'Todas as formas' : 'Selecione o subgrupo'}</option>
                                {formas.map((item) => <option key={item.codigo} value={item.codigo}>{item.codigo.slice(4)} - {item.nome}</option>)}
                            </Select>
                        </Field>
                    </div>
                    <Button variant="ghost" size="sm" className="mt-2.5 -ml-2" aria-expanded={avancado} onClick={() => setAvancado(!avancado)}>
                        <Icon n="settings" /> Filtros avançados{qtdAvancados ? ` (${qtdAvancados})` : ''} {avancado ? '▴' : '▾'}
                    </Button>
                    {avancado && (
                        <div className="mt-2 grid grid-cols-3 gap-3.5">
                            <Field rotulo="Financiamento" htmlFor="sg-financiamento">
                                <Select id="sg-financiamento" value={filtros.financiamento} onChange={(e) => b.alterar('financiamento', e.target.value)}>
                                    <option value="">Todos</option>
                                    {(meta?.financiamentos ?? []).map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}
                                </Select>
                            </Field>
                            <Field rotulo="Complexidade" htmlFor="sg-complexidade">
                                <Select id="sg-complexidade" value={filtros.complexidade} onChange={(e) => b.alterar('complexidade', e.target.value)}>
                                    <option value="">Todas</option>
                                    {Object.entries(COMPLEXIDADE).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
                                </Select>
                            </Field>
                            <Field rotulo="Instrumento de registro" htmlFor="sg-registro">
                                <Select id="sg-registro" value={filtros.registro} onChange={(e) => b.alterar('registro', e.target.value)}>
                                    <option value="">Todos</option>
                                    {(meta?.registros ?? []).map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}
                                </Select>
                            </Field>
                            <Field rotulo="Modalidade" htmlFor="sg-modalidade">
                                <Select id="sg-modalidade" value={filtros.modalidade} onChange={(e) => b.alterar('modalidade', e.target.value)}>
                                    <option value="">Todas</option>
                                    {(meta?.modalidades ?? []).map((item) => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}
                                </Select>
                            </Field>
                            <Field rotulo="Sexo" htmlFor="sg-sexo">
                                <Select id="sg-sexo" value={filtros.sexo} onChange={(e) => b.alterar('sexo', e.target.value)}>
                                    <option value="">Todos</option>
                                    {Object.entries(SEXO).map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
                                </Select>
                            </Field>
                            <Field rotulo="Ordenar por" htmlFor="sg-ordem">
                                <Select id="sg-ordem" value={filtros.ordem || 'codigo'} onChange={(e) => b.alterar('ordem', e.target.value)}>
                                    <option value="codigo">Código</option>
                                    <option value="nome">Nome</option>
                                    <option value="valor_amb">Maior valor ambulatorial</option>
                                    <option value="valor_hosp">Maior valor hospitalar</option>
                                </Select>
                            </Field>
                        </div>
                    )}
                    {b.consultou && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            {filtros.vinculo && <Etiqueta forte aoRemover={b.removerVinculo}>{b.rotuloVinculo || `${filtros.vinculo}: ${filtros.codigo}`}</Etiqueta>}
                            {etiquetas.filter(({ campo }) => filtros[campo]).map(({ campo, texto }) => <Etiqueta key={campo} aoRemover={() => b.alterar(campo, '')}>{texto}</Etiqueta>)}
                            <Button variant="ghost" size="sm" onClick={b.limpar}>Limpar tudo</Button>
                        </div>
                    )}
                </form>
            </Card>

            {!b.consultou && (
                <Card>
                    <CardTitulo titulo="Navegue pelos grupos" extra={<Button variant="secondary" size="sm" onClick={b.verTodos}>Ver todos os procedimentos</Button>} />
                    <div className="grid grid-cols-3 gap-3 p-[18px]">
                        {(meta?.grupos ?? []).map((grupo) => (
                            <button key={grupo.codigo} type="button" onClick={() => b.alterar('grupo', grupo.codigo)} className="flex cursor-pointer flex-col items-start gap-0.5 rounded-lg border border-solid border-line bg-white p-3.5 text-left font-sans transition-colors hover:border-pine hover:bg-surface-2">
                                <Mono>{grupo.codigo}</Mono>
                                <b className="text-sm font-semibold text-ink">{grupo.nome}</b>
                                <small className="text-xs text-text-2">{(meta?.subgrupos ?? []).filter((item) => item.codigo.startsWith(grupo.codigo)).length} subgrupos</small>
                            </button>
                        ))}
                    </div>
                </Card>
            )}

            {b.consultou && (
                <>
                    <p className="m-0 mb-2.5 text-[13.5px] font-semibold text-ink">
                        {b.carregando ? 'Buscando...' : `${fmtNum(b.resultado.total)} procedimento${b.resultado.total === 1 ? '' : 's'}`}
                    </p>
                    <div className={cn('transition-opacity', b.carregando && 'opacity-50')}>
                        <Tabela cabecalho={<><Th>Código</Th><Th>Procedimento</Th><Th>Complexidade</Th><Th>Instrumentos</Th><Th className="text-right">Ambulatorial</Th><Th className="text-right">Hospitalar</Th></>}>
                            {!b.carregando && b.resultado.itens.length === 0 && <LinhaVazia colunas={6}>Nenhum procedimento encontrado. Revise o texto ou remova algum filtro.</LinhaVazia>}
                            {b.resultado.itens.map((procedimento) => (
                                <tr
                                    key={procedimento.co_procedimento}
                                    tabIndex={0}
                                    className="cursor-pointer"
                                    onClick={() => aoAbrir(procedimento.co_procedimento)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') aoAbrir(procedimento.co_procedimento); }}
                                >
                                    <Td className="whitespace-nowrap"><Mono>{fmtProc(procedimento.co_procedimento)}</Mono></Td>
                                    <Td>
                                        <span className="font-medium">{procedimento.no_procedimento}</span>
                                        <small className="mt-0.5 block text-xs text-text-2">{procedimento.no_financiamento}</small>
                                    </Td>
                                    <Td><SeloComplexidade tipo={procedimento.tp_complexidade}>{COMPLEXIDADE[String(procedimento.tp_complexidade)] ?? '-'}</SeloComplexidade></Td>
                                    <Td>
                                        <span className="flex flex-wrap gap-1">
                                            {(procedimento.registros ?? '').split(',').filter(Boolean).map((registro) => (
                                                <Selo key={registro} title={nomeDe(meta?.registros, registro)}>{REGISTRO_SIGLA[registro] ?? registro}</Selo>
                                            ))}
                                        </span>
                                    </Td>
                                    <Td className="text-right whitespace-nowrap tabular-nums">{fmtMoeda(procedimento.vl_sa)}</Td>
                                    <Td className="text-right whitespace-nowrap tabular-nums">{fmtMoeda((procedimento.vl_sh ?? 0) + (procedimento.vl_sp ?? 0))}</Td>
                                </tr>
                            ))}
                        </Tabela>
                    </div>
                    <Paginacao pagina={b.pagina} totalPaginas={totalPaginas(b.resultado)} totalItens={b.resultado.total} aoMudar={b.irParaPagina} />
                </>
            )}
        </>
    );
}
