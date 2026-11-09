import Icon from '@/shared/ui/Icon';
import { linkDoAnexo } from '@/features/atividades/api';
import { FormularioAtividade } from '@/features/atividades/FormularioAtividade';
import {
    anexosDe, formatarPeriodo, nomeDoAnexo, nomesDaEquipe, useListaAtividades, useListasAtividade, useRegistroAberto,
    type ListasAtividade, type OrigemAtividade
} from '@/features/atividades/hooks';
import { useParametrosUrl, useVoltar } from '@/shared/hooks';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { Card, PageHeader } from '@/shared/ui/Pagina';
import { AcaoEditar, LinhaVazia, Paginacao, Tabela, Td, Th } from '@/shared/ui/Tabela';

const TITULO = 'Registro de Atividades';

function ListaAtividades({ origem, listas }: { origem: OrigemAtividade; listas: ListasAtividade }) {
    const voltar = useVoltar();
    const l = useListaAtividades(origem);
    const { rascunho } = l;

    return (
        <>
            <PageHeader
                titulo={TITULO}
                acoes={(
                    <>
                        {l.podeNovo && <Button onClick={() => l.abrirRegistro('novo')}>Novo registro</Button>}
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                    </>
                )}
            />
            <Card className="mb-3.5 px-4 py-3.5">
                <form onSubmit={l.pesquisar}>
                    <div className="grid grid-cols-6 gap-3.5">
                        <Field rotulo="Data início" htmlFor="fa-inicio"><Input id="fa-inicio" type="date" min="1900-01-01" max="2100-12-31" name="dataInicio" value={rascunho.dataInicio} onChange={l.alterarFiltro} /></Field>
                        <Field rotulo="Data fim" htmlFor="fa-fim"><Input id="fa-fim" type="date" min="1900-01-01" max="2100-12-31" name="dataFim" value={rascunho.dataFim} onChange={l.alterarFiltro} /></Field>
                        <Field rotulo="Implantador" htmlFor="fa-imp">
                            <Select id="fa-imp" name="id_implantador" value={rascunho.id_implantador} onChange={l.alterarFiltro}>
                                <option value="">Todos</option>
                                {listas.equipe.map((pessoa) => <option key={pessoa.id_usuario} value={pessoa.id_usuario}>{pessoa.nome_completo}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Projeto" htmlFor="fa-projeto">
                            <Select id="fa-projeto" name="id_projeto" disabled={Boolean(origem.lotacao)} value={rascunho.id_projeto} onChange={l.alterarFiltro}>
                                <option value="">Todos</option>
                                {listas.projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Unidade" htmlFor="fa-unidade">
                            <Select id="fa-unidade" name="id_unidade" disabled={!rascunho.id_projeto} value={rascunho.id_unidade} onChange={l.alterarFiltro}>
                                <option value="">Todas</option>
                                {l.unidades.map((unidade) => <option key={unidade.id_unidade} value={unidade.id_unidade}>{unidade.nome_unidade}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Motivo" htmlFor="fa-motivo">
                            <Select id="fa-motivo" name="motivo" value={rascunho.motivo} onChange={l.alterarFiltro}>
                                <option value="">Todos</option>
                                {listas.motivos.map((motivo) => <option key={motivo} value={motivo}>{motivo}</option>)}
                            </Select>
                        </Field>
                    </div>
                    <div className="mt-3 flex gap-2">
                        <Input aria-label="Busca geral" name="termo" className="flex-1" placeholder="Busca geral (equipe, unidade ou motivo)..." value={rascunho.termo} onChange={l.alterarFiltro} />
                        <Button type="submit"><Icon n="search" /> Pesquisar</Button>
                        <Button variant="secondary" onClick={l.limpar}>Limpar</Button>
                    </div>
                </form>
            </Card>
            <div className={cn('transition-opacity', l.carregando && 'opacity-50')}>
                <Tabela cabecalho={<><Th>Período</Th><Th>Equipe</Th><Th>Projeto / Unidade</Th><Th>Motivo</Th><Th centro>Anexo</Th><Th centro>Ação</Th></>}>
                    {!l.carregando && !l.atividades.length && <LinhaVazia colunas={6}>Nenhum registro encontrado.</LinhaVazia>}
                    {l.atividades.map((atividade) => (
                        <tr key={atividade.id_atividade}>
                            <Td className="whitespace-nowrap tabular-nums">{formatarPeriodo(atividade.data_inicio, atividade.data_fim)}</Td>
                            <Td>{nomesDaEquipe(atividade)}</Td>
                            <Td><small className="block text-xs text-text-2">{atividade.nome_projeto}</small>{atividade.nome_unidade}</Td>
                            <Td>{atividade.motivos}</Td>
                            <Td centro>
                                <span className="flex flex-col items-center gap-1">
                                    {anexosDe(atividade).map((caminho) => (
                                        <a key={caminho} href={linkDoAnexo(caminho)} download target="_blank" rel="noopener noreferrer" title={`Baixar: ${nomeDoAnexo(caminho)}`} aria-label={`Baixar ${nomeDoAnexo(caminho)}`} className="inline-flex rounded-md p-1.5 text-pine no-underline hover:bg-tint"><Icon n="arrow-down" /></a>
                                    ))}
                                    {!anexosDe(atividade).length && <span className="text-muted">-</span>}
                                </span>
                            </Td>
                            <Td centro className="whitespace-nowrap">
                                <AcaoEditar podeEditar={l.podeEditar} aoEditar={() => l.abrirRegistro(String(atividade.id_atividade))} />
                                {l.podeEditar && (
                                    <button type="button" title="Excluir" aria-label="Excluir" onClick={() => l.excluir(atividade)} className="ml-1 cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-danger hover:bg-danger-tint"><Icon n="trash" /></button>
                                )}
                            </Td>
                        </tr>
                    ))}
                </Tabela>
            </div>
            <Paginacao pagina={l.pagina} totalPaginas={l.totalPaginas} totalItens={l.total} aoMudar={l.irParaPagina} />
        </>
    );
}

function RegistroAberto({ origem, listas, registro }: { origem: OrigemAtividade; listas: ListasAtividade; registro: string }) {
    const [, alterarUrl] = useParametrosUrl();
    const { novo, atividade, carregando } = useRegistroAberto(origem.apiBase, registro);
    const sair = () => alterarUrl({ registro: null }, { empilhar: true });
    const titulo = novo ? 'Nova atividade' : 'Editar atividade';

    return (
        <>
            <PageHeader
                titulo={TITULO}
                subtitulo={titulo}
                acoes={<Button variant="secondary" onClick={sair}>Voltar</Button>}
            />
            {carregando && <Carregando />}
            {!carregando && !novo && !atividade && <Aviso titulo="Registro não encontrado">Ele pode ter sido excluído ou não pertencer ao seu acesso.</Aviso>}
            {!carregando && (novo || atividade) && (
                <FormularioAtividade {...origem} atividade={atividade} listas={listas} aoSair={sair} aoConcluir={() => alterarUrl({ registro: null })} />
            )}
        </>
    );
}

interface AtividadesPageProps {
    /** Módulo de permissão: Implantação (padrão) ou Projetos. */
    modulo?: string;
    /** No submenu Projetos, a tela opera travada na lotação escolhida. */
    lotacaoFixa?: string;
    apiBase?: string;
}

export function AtividadesPage({ modulo = 'registro_atividades', lotacaoFixa, apiBase = '' }: AtividadesPageProps) {
    const [parametros] = useParametrosUrl();
    const registro = parametros.get('registro');
    const listas = useListasAtividade(lotacaoFixa);
    const origem: OrigemAtividade = { modulo, apiBase, lotacao: lotacaoFixa };

    return registro
        ? <RegistroAberto key={registro} origem={origem} listas={listas} registro={registro} />
        : <ListaAtividades origem={origem} listas={listas} />;
}
