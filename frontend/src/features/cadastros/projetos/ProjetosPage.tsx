import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '@/shared/ui/Icon';
import { CATEGORIAS_PROJETO } from '@/shared/categoriasProjeto';
import type { Projeto } from '@/features/cadastros/projetos/api';
import { gerarSlug, limparSlug, useFormProjeto, useListaProjetos } from '@/features/cadastros/projetos/hooks';
import { useVoltar } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { Checkbox, Field, Input, Select } from '@/shared/ui/Campos';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { useFiltrosLista, type CampoFiltro } from '@/shared/ui/FiltrosLista';
import { Badge, FormCard, FormSecao, PageHeader } from '@/shared/ui/Pagina';
import { AcaoEditar, LinhaVazia, StatusBadge, Tabela, Td, Th } from '@/shared/ui/Tabela';

const CAMPOS_FILTRO: CampoFiltro<Projeto>[] = [
    { chave: 'nome', rotulo: 'Nome', tipo: 'texto', valor: (p) => p.nome_projeto },
    { chave: 'categoria', rotulo: 'Categoria', valor: (p) => p.categoria },
    { chave: 'lotacao', rotulo: 'Lotação', valor: (p) => (p.gera_lotacao ? 'Sim' : 'Não') },
    { chave: 'painel', rotulo: 'Painel Público', valor: (p) => (p.painel_publico && p.slug_publico ? 'Sim' : 'Não') },
    { chave: 'status', rotulo: 'Status', valor: (p) => (p.ativo ? 'Ativo' : 'Inativo') }
];

const VAZIO = <span className="text-muted">Não</span>;

export function ListaProjetosPage() {
    const navigate = useNavigate();
    const voltar = useVoltar();
    const { projetos, carregando, podeNovo, podeEditar } = useListaProjetos();
    const [filtrados, barraFiltros] = useFiltrosLista(projetos, CAMPOS_FILTRO);

    return (
        <>
            <PageHeader
                titulo="Projetos"
                acoes={(
                    <>
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                        {podeNovo && <Link to="novo" className="no-underline"><Button>Novo projeto</Button></Link>}
                    </>
                )}
            />
            {barraFiltros}
            <Tabela
                cabecalho={(
                    <>
                        <Th>Nome do projeto</Th><Th centro>Categoria</Th><Th centro>Lotação</Th>
                        <Th centro>Painel público</Th><Th centro>Status</Th><Th centro>Ação</Th>
                    </>
                )}
            >
                {carregando && <LinhaVazia colunas={6}>Carregando...</LinhaVazia>}
                {!carregando && filtrados.length === 0 && <LinhaVazia colunas={6}>Nenhum projeto encontrado.</LinhaVazia>}
                {filtrados.map((projeto) => (
                    <tr key={projeto.id_projeto}>
                        <Td className="font-medium">{projeto.nome_projeto}</Td>
                        <Td centro>{projeto.categoria ? <b className="font-semibold">{projeto.categoria}</b> : <span className="text-muted">-</span>}</Td>
                        <Td centro>{projeto.gera_lotacao ? <Badge tom="marca">Sim</Badge> : VAZIO}</Td>
                        <Td centro>
                            {projeto.painel_publico && projeto.slug_publico
                                ? <a href={`/${projeto.slug_publico}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] font-medium text-pine no-underline hover:underline">/{projeto.slug_publico}</a>
                                : VAZIO}
                        </Td>
                        <Td centro><StatusBadge ativo={Boolean(projeto.ativo)} /></Td>
                        <Td centro><AcaoEditar podeEditar={podeEditar} aoEditar={() => navigate(String(projeto.id_projeto))} /></Td>
                    </tr>
                ))}
            </Tabela>
        </>
    );
}

export function FormProjetoPage() {
    const { id } = useParams();
    const voltar = useVoltar();
    const idProjeto = id ? Number(id) : undefined;
    const { form, setForm, carregando, naoEncontrado, podeSalvar, salvar } = useFormProjeto(idProjeto);

    if (carregando) return <Carregando />;
    if (naoEncontrado) return <Aviso titulo="Projeto não encontrado" />;

    return (
        <>
            <PageHeader titulo={idProjeto ? 'Editar projeto' : 'Novo projeto'} />
            <FormCard
                className="max-w-[880px]"
                aoEnviar={salvar}
                rodape={(
                    <>
                        <Button variant="secondary" onClick={voltar}>Cancelar</Button>
                        {podeSalvar && <Button type="submit">Salvar projeto</Button>}
                    </>
                )}
            >
                <FormSecao titulo="Identificação">
                    <div className="grid grid-cols-[1fr_200px] gap-[18px]">
                        <Field rotulo="Nome do projeto" htmlFor="nome-projeto" obrigatorio>
                            <Input id="nome-projeto" value={form.nome_projeto} onChange={(e) => setForm({ ...form, nome_projeto: e.target.value })} required />
                        </Field>
                        <Field rotulo="Categoria" htmlFor="categoria-projeto" obrigatorio>
                            <Select id="categoria-projeto" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} required>
                                <option value="">Selecione</option>
                                {CATEGORIAS_PROJETO.map((categoria) => <option key={categoria} value={categoria}>Categoria {categoria}</option>)}
                            </Select>
                        </Field>
                    </div>
                </FormSecao>
                <FormSecao titulo="Acesso e publicação">
                    <div className="flex flex-col gap-3.5">
                        <Checkbox
                            rotulo="Gera lotação (define visualização exclusiva para usuários)"
                            checked={form.gera_lotacao}
                            onChange={(e) => setForm({ ...form, gera_lotacao: e.target.checked })}
                        />
                        <Checkbox
                            rotulo="Painel público (página aberta, sem login, com atividades, horas e mapa das unidades)"
                            checked={form.painel_publico}
                            onChange={(e) => setForm({ ...form, painel_publico: e.target.checked, slug_publico: form.slug_publico || gerarSlug(form.nome_projeto) })}
                        />
                        {form.painel_publico && (
                            <Field rotulo="Endereço do painel" htmlFor="slug-projeto" className="ml-7">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-[13px] text-text-2">{window.location.host}/</span>
                                    <Input
                                        id="slug-projeto"
                                        className="w-64 font-mono"
                                        value={form.slug_publico}
                                        placeholder={gerarSlug(form.nome_projeto) || 'paraiba'}
                                        onChange={(e) => setForm({ ...form, slug_publico: limparSlug(e.target.value) })}
                                    />
                                    {form.id_projeto && form.slug_publico && (
                                        <a href={`/${form.slug_publico}`} target="_blank" rel="noreferrer" className="no-underline">
                                            <Button variant="secondary" size="sm"><Icon n="link" /> Abrir</Button>
                                        </a>
                                    )}
                                </div>
                            </Field>
                        )}
                        <Checkbox rotulo="Projeto ativo" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                    </div>
                </FormSecao>
            </FormCard>
        </>
    );
}
