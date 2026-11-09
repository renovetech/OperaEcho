/* Abas Compatibilidades e Tabelas da Consulta SIGTAP. */
import type { FormEvent } from 'react';
import Icon from '@/shared/ui/Icon';
import type { TipoCompatibilidade } from '@/features/sigtap/api';
import { BotaoAba, CampoBusca, LinkAcao, Mono, Selo, SeloCompat } from '@/features/sigtap/componentes';
import { COMPATIBILIDADE, fmtCid, fmtNum, fmtProc, REGISTRO_SIGLA, rotuloCompat, SEXO, SIA_SIH_TIPO } from '@/features/sigtap/formatos';
import { totalPaginas, useCompatibilidades, useTabelasAuxiliares } from '@/features/sigtap/hooks';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';
import { Card, CardTitulo } from '@/shared/ui/Pagina';
import { LinhaVazia, Paginacao, Tabela, Td, Th } from '@/shared/ui/Tabela';

const chaveDoTipo = (tipo: TipoCompatibilidade) => `${tipo.reg_principal}-${tipo.reg_compativel}-${tipo.tipo}`;

function CelulaProcedimento({ codigo, nome, registro, aoAbrir }: { codigo: string; nome: string; registro: string; aoAbrir: (codigo: string) => void }) {
    return (
        <>
            <LinkAcao mono onClick={() => aoAbrir(codigo)}>{fmtProc(codigo)}</LinkAcao>
            <span className="mt-0.5 block text-[13px]">{nome}</span>
            <Selo className="mt-1">{REGISTRO_SIGLA[registro] ?? registro}</Selo>
        </>
    );
}

export function Compatibilidades({ competencia, aoAbrir }: { competencia: string; aoAbrir: (codigo: string) => void }) {
    const c = useCompatibilidades(competencia);
    const totalPares = c.tipos.reduce((soma, tipo) => soma + tipo.quantidade, 0);

    const consultar = (evento: FormEvent) => {
        evento.preventDefault();
        c.aplicar(c.rascunho);
    };

    return (
        <>
            <Card className="mb-3.5 px-4 py-3.5">
                <form onSubmit={consultar} className="flex items-end gap-3.5">
                    <Field rotulo="Compatibilidade" htmlFor="cp-tipo" className="flex-[2]">
                        <Select id="cp-tipo" value={c.rascunho.tipo} onChange={(e) => c.aplicar({ ...c.rascunho, tipo: e.target.value })}>
                            <option value="">Todos ({fmtNum(totalPares)})</option>
                            {c.tipos.map((tipo) => (
                                <option key={chaveDoTipo(tipo)} value={chaveDoTipo(tipo)}>{`${tipo.nome_principal} x ${tipo.nome_compativel} (${rotuloCompat(tipo.tipo)}) - ${fmtNum(tipo.quantidade)}`}</option>
                            ))}
                        </Select>
                    </Field>
                    <Field rotulo="Procedimento principal" htmlFor="cp-principal" className="flex-1">
                        <Input id="cp-principal" placeholder="Código ou nome" value={c.rascunho.principal} onChange={(e) => c.setRascunho({ ...c.rascunho, principal: e.target.value })} />
                    </Field>
                    <Field rotulo="Procedimento secundário" htmlFor="cp-secundario" className="flex-1">
                        <Input id="cp-secundario" placeholder="Código ou nome" value={c.rascunho.secundario} onChange={(e) => c.setRascunho({ ...c.rascunho, secundario: e.target.value })} />
                    </Field>
                    <div className="flex gap-2">
                        <Button type="submit"><Icon n="search" /> Consultar</Button>
                        <Button variant="secondary" onClick={c.limpar}>Limpar</Button>
                    </div>
                </form>
            </Card>

            {!c.consultou && (
                <Card>
                    <CardTitulo titulo="Como ler as compatibilidades" />
                    <div className="grid grid-cols-5 gap-3 border-b border-line-2 p-[18px]">
                        {Object.entries(COMPATIBILIDADE).map(([tipo, info]) => (
                            <div key={tipo}>
                                <SeloCompat tipo={tipo} />
                                <p className="m-0 mt-1.5 text-xs text-text-2">{info.ajuda}</p>
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-3 gap-3 p-[18px]">
                        {c.tipos.map((tipo) => (
                            <button key={chaveDoTipo(tipo)} type="button" onClick={() => c.aplicar({ ...c.rascunho, tipo: chaveDoTipo(tipo) })} className="flex cursor-pointer flex-col items-start gap-1 rounded-lg border border-solid border-line bg-white p-3.5 text-left font-sans transition-colors hover:border-pine hover:bg-surface-2">
                                <span className="flex w-full items-center justify-between gap-2">
                                    <SeloCompat tipo={tipo.tipo} />
                                    <em className="text-xs font-semibold text-text-2 not-italic tabular-nums">{fmtNum(tipo.quantidade)}</em>
                                </span>
                                <b className="text-sm font-semibold text-ink">{tipo.nome_principal}</b>
                                <small className="text-xs text-text-2">× {tipo.nome_compativel}</small>
                            </button>
                        ))}
                    </div>
                </Card>
            )}

            {c.consultou && (
                <>
                    <p className="m-0 mb-2.5 text-[13.5px] font-semibold text-ink">{c.carregando ? 'Consultando...' : `${fmtNum(c.resultado.total)} regra${c.resultado.total === 1 ? '' : 's'}`}</p>
                    <div className={cn('transition-opacity', c.carregando && 'opacity-50')}>
                        <Tabela cabecalho={<><Th>Procedimento principal</Th><Th>Procedimento secundário</Th><Th>Tipo</Th><Th className="text-right">Qtd.</Th></>}>
                            {!c.carregando && !c.resultado.itens.length && <LinhaVazia colunas={4}>Nenhuma compatibilidade encontrada.</LinhaVazia>}
                            {c.resultado.itens.map((regra) => (
                                <tr key={`${regra.principal}${regra.reg_principal}${regra.secundario}${regra.reg_compativel}`}>
                                    <Td><CelulaProcedimento codigo={regra.principal} nome={regra.nome_principal} registro={regra.reg_principal} aoAbrir={aoAbrir} /></Td>
                                    <Td><CelulaProcedimento codigo={regra.secundario} nome={regra.nome_secundario} registro={regra.reg_compativel} aoAbrir={aoAbrir} /></Td>
                                    <Td><SeloCompat tipo={regra.tipo} /></Td>
                                    <Td className="text-right tabular-nums">{regra.quantidade ?? '-'}</Td>
                                </tr>
                            ))}
                        </Tabela>
                    </div>
                    <Paginacao pagina={c.pagina} totalPaginas={totalPaginas(c.resultado)} totalItens={c.resultado.total} aoMudar={c.irParaPagina} />
                </>
            )}
        </>
    );
}

const ROTULO_EXTRA: Record<string, string> = {
    grupo: 'Grupo', sub_grupo: 'Subgrupo', servico: 'Serviço', descricao: 'Descrição', rede: 'Rede', sexo: 'Sexo',
    agravo: 'Agravo', estadio: 'Estádio', campos_irradiados: 'Campos irrad.', tipo: 'Tipo'
};
const COLUNAS_FIXAS = ['codigo', 'nome', 'qt_procedimentos'];

function formatarExtra(coluna: string, valor: unknown): string {
    const texto = valor === null || valor === undefined ? '-' : String(valor);
    if (coluna === 'sexo') return SEXO[texto] ?? texto;
    if (coluna === 'tipo') return SIA_SIH_TIPO[texto] ?? texto;
    return texto;
}

export function TabelasAuxiliares({ competencia, aoFiltrar }: { competencia: string; aoFiltrar: (vinculo: string, codigo: string, rotulo: string) => void }) {
    const t = useTabelasAuxiliares(competencia);
    const primeiro = t.resultado.itens[0];
    const extras = primeiro ? Object.keys(primeiro).filter((coluna) => !COLUNAS_FIXAS.includes(coluna)) : [];
    const formatarCodigo = (codigo: string) => (t.tabela === 'cid' ? fmtCid(codigo) : codigo);
    const titulo = t.lista.find((item) => item.chave === t.tabela)?.titulo ?? 'tabela';

    return (
        <>
            <Card className="mb-3.5">
                <div role="tablist" className="flex flex-wrap border-b border-line-2 px-2">
                    {t.lista.map((item) => <BotaoAba key={item.chave} ativo={t.tabela === item.chave} onClick={() => t.selecionarTabela(item.chave)}>{item.titulo}</BotaoAba>)}
                </div>
                <div className="flex px-4 py-3.5"><CampoBusca valor={t.texto} placeholder={`Buscar em ${titulo} por código ou nome`} aoAlterar={t.setTexto} /></div>
            </Card>
            <p className="m-0 mb-2.5 text-[13.5px] font-semibold text-ink">
                {t.resultado.titulo ?? 'Tabela'} <small className="ml-1 text-xs font-normal text-text-2">{t.carregando ? 'Carregando...' : `${fmtNum(t.resultado.total)} registros`}</small>
            </p>
            <div className={cn('transition-opacity', t.carregando && 'opacity-50')}>
                <Tabela cabecalho={<><Th>Código</Th><Th>Nome</Th>{extras.map((coluna) => <Th key={coluna}>{ROTULO_EXTRA[coluna] ?? coluna}</Th>)}<Th className="text-right">Procedimentos</Th></>}>
                    {!t.carregando && !t.resultado.itens.length && <LinhaVazia colunas={3 + extras.length}>Nenhum registro encontrado.</LinhaVazia>}
                    {t.resultado.itens.map((registro) => (
                        <tr key={registro.codigo}>
                            <Td className="whitespace-nowrap"><Mono>{formatarCodigo(registro.codigo)}</Mono></Td>
                            <Td>{registro.nome}</Td>
                            {extras.map((coluna) => <Td key={coluna} className={coluna === 'descricao' ? 'max-w-96 text-xs text-text-2' : undefined}>{formatarExtra(coluna, registro[coluna])}</Td>)}
                            <Td className="text-right">
                                {registro.qt_procedimentos > 0 && t.resultado.vinculo
                                    ? <Button variant="secondary" size="sm" onClick={() => aoFiltrar(t.resultado.vinculo ?? '', registro.codigo, `${t.resultado.titulo}: ${formatarCodigo(registro.codigo)} - ${registro.nome}`)}>{fmtNum(registro.qt_procedimentos)} <Icon n="arrow-right" /></Button>
                                    : <span className="text-text-2">0</span>}
                            </Td>
                        </tr>
                    ))}
                </Tabela>
            </div>
            <Paginacao pagina={t.pagina} totalPaginas={totalPaginas(t.resultado)} totalItens={t.resultado.total} aoMudar={t.irParaPagina} />
        </>
    );
}
