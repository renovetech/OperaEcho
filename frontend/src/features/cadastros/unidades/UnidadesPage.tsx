import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '@/shared/ui/Icon';
import type { Unidade } from '@/features/cadastros/unidades/api';
import { ESTADOS, useFormUnidade, useImportacaoCoordenadas, useListaUnidades } from '@/features/cadastros/unidades/hooks';
import { SeletorCoordenada } from '@/features/cadastros/unidades/SeletorCoordenada';
import { useVoltar } from '@/shared/hooks';
import { BalaoAjuda } from '@/shared/ui/BalaoAjuda';
import { Button } from '@/shared/ui/Button';
import { Checkbox, Field, GrupoSelecao, Input, Select } from '@/shared/ui/Campos';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { useFiltrosLista, type CampoFiltro } from '@/shared/ui/FiltrosLista';
import { Badge, Card, FormCard, FormSecao, PageHeader } from '@/shared/ui/Pagina';
import { AcaoEditar, LinhaVazia, Paginacao, StatusBadge, Tabela, Td, Th } from '@/shared/ui/Tabela';

const temCoordenada = (unidade: Unidade) => unidade.latitude != null && unidade.longitude != null;
const cidadeUf = (unidade: Unidade) => (unidade.nome_cidade ? `${unidade.nome_cidade}/${unidade.uf || unidade.estado_sigla}` : '');

const CAMPOS_FILTRO: CampoFiltro<Unidade>[] = [
    { chave: 'tipo', rotulo: 'Tipo', valor: (u) => u.nome_tipo },
    { chave: 'cidade', rotulo: 'Cidade/UF', valor: cidadeUf },
    { chave: 'geo', rotulo: 'Georreferenciada', valor: (u) => (temCoordenada(u) ? 'Sim' : 'Não') },
    { chave: 'cnes', rotulo: 'CNES', valor: (u) => (u.cnes ? 'Com CNES' : 'Sem CNES') }
];

function ImportacaoCoordenadas({ projetos, aoConcluir }: { projetos: { id_projeto: number; nome_projeto: string }[]; aoConcluir: () => void }) {
    const { importacao, baixarModelo, lerPlanilha, enviar, cancelar, abrir, selecionarProjeto } = useImportacaoCoordenadas(aoConcluir);

    if (!importacao.aberto) {
        return <div className="mb-3 flex justify-end"><Button variant="secondary" size="sm" onClick={abrir}><Icon n="upload" /> Importar coordenadas</Button></div>;
    }
    return (
        <Card className="mb-3.5 px-4 py-3.5">
            <BalaoAjuda texto="Colunas CNES, LATITUDE e LONGITUDE (.xlsx ou .csv). Atualiza só as coordenadas das unidades encontradas pelo CNES." className="mb-3.5 flex w-fit items-center gap-1.5">
                <h2 className="m-0 text-[14.5px] font-semibold text-ink">Importar coordenadas por planilha</h2>
            </BalaoAjuda>
            <div className="flex items-end gap-2.5">
                <Field rotulo="Restringir ao projeto (opcional)" className="w-72">
                    <Select value={importacao.idProjeto} onChange={(e) => selecionarProjeto(e.target.value)}>
                        <option value="">Todos os projetos</option>
                        {projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                    </Select>
                </Field>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-solid border-line bg-white px-4 py-2.5 text-sm font-medium text-text hover:bg-surface-2">
                    <Icon n="file" /> {importacao.arquivo || 'Selecionar planilha'}
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={lerPlanilha} />
                </label>
                <Button variant="secondary" onClick={baixarModelo}><Icon n="download" /> Modelo</Button>
                <Button isLoading={importacao.enviando} disabled={!importacao.linhas.length} onClick={enviar}>
                    Importar{importacao.linhas.length ? ` (${importacao.linhas.length})` : ''}
                </Button>
                <Button variant="ghost" onClick={cancelar}>Cancelar</Button>
            </div>
        </Card>
    );
}

export function ListaUnidadesPage() {
    const navigate = useNavigate();
    const voltar = useVoltar();
    const lista = useListaUnidades();
    const { rascunho, alterarRascunho } = lista;
    const [filtradas, barraFiltros] = useFiltrosLista(lista.unidades, CAMPOS_FILTRO);

    return (
        <>
            <PageHeader
                titulo="Unidades"
                acoes={(
                    <>
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                        {lista.podeNovo && <Link to="novo" className="no-underline"><Button>Nova unidade</Button></Link>}
                    </>
                )}
            />
            {lista.podeEditar && <ImportacaoCoordenadas projetos={lista.projetos} aoConcluir={lista.recarregar} />}
            <Card className="mb-3.5 px-4 py-3.5">
                <form onSubmit={lista.filtrar} className="flex items-end gap-3.5">
                    <Field rotulo="Buscar (nome/CNES)" htmlFor="f-termo" className="flex-[2]"><Input id="f-termo" name="termo" placeholder="Digite..." value={rascunho.termo} onChange={alterarRascunho} /></Field>
                    <Field rotulo="Projeto" htmlFor="f-projeto" className="flex-1">
                        <Select id="f-projeto" name="projeto" value={rascunho.projeto} onChange={alterarRascunho}>
                            <option value="">Todos</option>
                            {lista.projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="UF" htmlFor="f-uf" className="w-24">
                        <Select id="f-uf" name="uf" value={rascunho.uf} onChange={alterarRascunho}>
                            <option value="">Todas</option>
                            {ESTADOS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Cidade" htmlFor="f-cidade" className="flex-1">
                        <Select id="f-cidade" name="id_cidade" value={rascunho.id_cidade} disabled={!rascunho.uf} onChange={alterarRascunho}>
                            <option value="">Todas</option>
                            {lista.cidades.map((cidade) => <option key={cidade.id_cidade} value={cidade.id_cidade}>{cidade.nome_cidade}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Status" htmlFor="f-status" className="w-32">
                        <Select id="f-status" name="status" value={rascunho.status} onChange={alterarRascunho}>
                            <option value="Todos">Todos</option>
                            <option value="true">Ativos</option>
                            <option value="false">Inativos</option>
                        </Select>
                    </Field>
                    <div className="flex gap-2">
                        <Button type="submit"><Icon n="search" /> Filtrar</Button>
                        <Button variant="secondary" onClick={lista.limpar}>Limpar</Button>
                    </div>
                </form>
            </Card>
            {barraFiltros}
            <Tabela cabecalho={<><Th>Nome</Th><Th centro>Tipo</Th><Th>CNES</Th><Th>Projeto</Th><Th>Cidade/UF</Th><Th centro>Geo</Th><Th centro>Status</Th><Th centro>Ação</Th></>}>
                {lista.carregando && <LinhaVazia colunas={8}>Carregando...</LinhaVazia>}
                {!lista.carregando && filtradas.length === 0 && <LinhaVazia colunas={8}>Nenhuma unidade encontrada.</LinhaVazia>}
                {!lista.carregando && filtradas.map((unidade) => (
                    <tr key={unidade.id_unidade}>
                        <Td className="font-medium">{unidade.nome_unidade}</Td>
                        <Td centro title={unidade.nome_tipo || 'Sem tipo'}>{unidade.sigla_tipo ? <Badge>{unidade.sigla_tipo}</Badge> : '-'}</Td>
                        <Td className="tabular-nums">{unidade.cnes || '-'}</Td>
                        <Td>{unidade.nome_projeto || unidade.id_projeto}</Td>
                        <Td>{cidadeUf(unidade) || '-'}</Td>
                        <Td centro>
                            {temCoordenada(unidade)
                                ? <span className="text-pine" title={`${Number(unidade.latitude).toFixed(6)}, ${Number(unidade.longitude).toFixed(6)}`}><Icon n="pin" /></span>
                                : <span className="text-muted" title="Sem coordenada (usa o centro do município)">-</span>}
                        </Td>
                        <Td centro><StatusBadge ativo={Boolean(unidade.ativo)} /></Td>
                        <Td centro><AcaoEditar podeEditar={lista.podeEditar} aoEditar={() => navigate(String(unidade.id_unidade))} /></Td>
                    </tr>
                ))}
            </Tabela>
            <Paginacao pagina={lista.pagina} totalPaginas={lista.totais.totalPaginas} totalItens={lista.totais.total} aoMudar={lista.mudarPagina} />
        </>
    );
}

export function FormUnidadePage() {
    const { id } = useParams();
    const voltar = useVoltar();
    const idUnidade = id ? Number(id) : undefined;
    const u = useFormUnidade(idUnidade);
    const { form } = u;

    if (u.carregando) return <Carregando />;
    if (u.naoEncontrado) return <Aviso titulo="Unidade não encontrada" />;

    const macroAtual = u.regioes.find((macro) => String(macro.id_macro) === String(form.id_macro));
    const georreferenciada = form.latitude !== '' && form.longitude !== '';
    const textoMacro = !form.id_projeto ? 'Selecione o projeto' : u.regioes.length ? 'Sem macro' : 'Projeto sem regiões cadastradas';

    return (
        <>
            <PageHeader titulo={idUnidade ? 'Editar unidade' : 'Nova unidade'} />
            <FormCard
                aoEnviar={u.salvar}
                rodape={(
                    <>
                        <Button variant="secondary" onClick={voltar}>Cancelar</Button>
                        {u.podeSalvar && <Button type="submit">Salvar unidade</Button>}
                    </>
                )}
            >
                <FormSecao titulo="Identificação">
                    <div className="grid grid-cols-12 gap-x-[18px] gap-y-4">
                        <Field rotulo="Nome da unidade" htmlFor="nome_unidade" obrigatorio className="col-span-8">
                            <Input id="nome_unidade" name="nome_unidade" value={form.nome_unidade} placeholder="Ex.: UBS Centro..." onChange={u.alterarCampo} required />
                        </Field>
                        <Field rotulo="CNES (até 7 dígitos)" htmlFor="cnes" obrigatorio className="col-span-4">
                            <Input id="cnes" name="cnes" inputMode="numeric" value={form.cnes} placeholder="Somente números" onChange={u.alterarCampo} required />
                        </Field>
                        <Field rotulo="Projeto" htmlFor="id_projeto" obrigatorio className="col-span-6">
                            <Select id="id_projeto" name="id_projeto" value={form.id_projeto} onChange={u.alterarCampo} required>
                                <option value="">Selecione...</option>
                                {u.projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="UF" htmlFor="uf" className="col-span-2">
                            <Select id="uf" name="uf" value={form.uf} onChange={u.alterarCampo}>
                                <option value="">-</option>
                                {ESTADOS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Município" htmlFor="id_cidade" className="col-span-4">
                            <Select id="id_cidade" name="id_cidade" value={form.id_cidade} disabled={!form.uf} onChange={u.alterarCampo}>
                                <option value="">{form.uf ? 'Selecione...' : 'Selecione a UF'}</option>
                                {u.cidades.map((cidade) => <option key={cidade.id_cidade} value={cidade.id_cidade}>{cidade.nome_cidade}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Tipo de unidade" htmlFor="id_tipo_unidade" className="col-span-4">
                            <Select id="id_tipo_unidade" name="id_tipo_unidade" value={form.id_tipo_unidade} onChange={u.alterarCampo}>
                                <option value="">Selecione...</option>
                                {u.tipos.filter((tipo) => tipo.ativo || String(tipo.id_tipo_unidade) === String(form.id_tipo_unidade)).map((tipo) => (
                                    <option key={tipo.id_tipo_unidade} value={tipo.id_tipo_unidade}>{tipo.sigla} - {tipo.nome_tipo}</option>
                                ))}
                            </Select>
                        </Field>
                        <Field rotulo="Macro região" htmlFor="id_macro" className="col-span-4">
                            <Select id="id_macro" name="id_macro" value={form.id_macro} disabled={!form.id_projeto || !u.regioes.length} onChange={u.alterarCampo}>
                                <option value="">{textoMacro}</option>
                                {u.regioes.filter((macro) => macro.ativo || String(macro.id_macro) === String(form.id_macro)).map((macro) => (
                                    <option key={macro.id_macro} value={macro.id_macro}>{macro.nome_macro}</option>
                                ))}
                            </Select>
                        </Field>
                        <Field rotulo="Micro região" htmlFor="id_micro" className="col-span-4">
                            <Select id="id_micro" name="id_micro" value={form.id_micro} disabled={!form.id_macro} onChange={u.alterarCampo}>
                                <option value="">Sem micro</option>
                                {(macroAtual?.micros ?? []).filter((micro) => micro.ativo || String(micro.id_micro) === String(form.id_micro)).map((micro) => (
                                    <option key={micro.id_micro} value={micro.id_micro}>{micro.nome_micro}</option>
                                ))}
                            </Select>
                        </Field>
                        <Checkbox className="col-span-12" name="ativo" rotulo="Unidade ativa" checked={form.ativo} onChange={u.alterarCampo} />
                    </div>
                </FormSecao>

                <FormSecao titulo="Localização" ajuda="Cole o par de coordenadas do Google Maps, digite ou clique no mapa.">
                    <div className="flex items-end gap-[18px]">
                        <Field rotulo="Latitude" htmlFor="latitude" className="flex-1">
                            <Input id="latitude" name="latitude" inputMode="decimal" value={form.latitude} placeholder="-7.119495" onChange={u.alterarCampo} onBlur={u.recentralizar} />
                        </Field>
                        <Field rotulo="Longitude" htmlFor="longitude" className="flex-1">
                            <Input id="longitude" name="longitude" inputMode="decimal" value={form.longitude} placeholder="-34.845011" onChange={u.alterarCampo} onBlur={u.recentralizar} />
                        </Field>
                        <Button variant="secondary" onClick={u.usarCentroDoMunicipio}><Icon n="pin" /> Centro do município</Button>
                        <Button variant="ghost" onClick={u.limparCoordenadas}><Icon n="x" /> Limpar</Button>
                    </div>
                    <div className="mt-2.5">
                        <Badge tom={georreferenciada ? 'marca' : 'ouro'}>{georreferenciada ? 'Unidade georreferenciada' : 'Sem coordenada: o mapa usará o centro do município'}</Badge>
                    </div>
                    <SeletorCoordenada
                        latitude={form.latitude}
                        longitude={form.longitude}
                        latCidade={u.cidadeAtual?.latitude}
                        lngCidade={u.cidadeAtual?.longitude}
                        chaveCentro={u.chaveCentro}
                        somenteLeitura={!u.podeSalvar}
                        aoMarcar={u.marcarNoMapa}
                    />
                </FormSecao>

                <FormSecao titulo="Produtos vinculados">
                    <GrupoSelecao
                        itens={u.produtos.map((produto) => ({ id: produto.id_produto, nome: produto.nome_produto }))}
                        selecionados={u.produtosSelecionados}
                        aoAlternar={u.alternarProduto}
                        vazio="Nenhum produto cadastrado."
                    />
                </FormSecao>
            </FormCard>
        </>
    );
}
