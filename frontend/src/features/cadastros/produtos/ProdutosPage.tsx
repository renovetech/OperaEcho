import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Produto } from '@/features/cadastros/produtos/api';
import { useFormProduto, useListaProdutos } from '@/features/cadastros/produtos/hooks';
import { useVoltar } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { Checkbox, Field, Input } from '@/shared/ui/Campos';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { useFiltrosLista, type CampoFiltro } from '@/shared/ui/FiltrosLista';
import { FormCard, FormSecao, PageHeader } from '@/shared/ui/Pagina';
import { AcaoEditar, LinhaVazia, StatusBadge, Tabela, Td, Th } from '@/shared/ui/Tabela';

const CAMPOS_FILTRO: CampoFiltro<Produto>[] = [
    { chave: 'nome', rotulo: 'Nome', tipo: 'texto', valor: (p) => p.nome_produto },
    { chave: 'status', rotulo: 'Status', valor: (p) => (p.ativo ? 'Ativo' : 'Inativo') }
];

export function ListaProdutosPage() {
    const navigate = useNavigate();
    const voltar = useVoltar();
    const { produtos, carregando, podeNovo, podeEditar } = useListaProdutos();
    const [filtrados, barraFiltros] = useFiltrosLista(produtos, CAMPOS_FILTRO);

    return (
        <>
            <PageHeader
                titulo="Produtos"
                acoes={(
                    <>
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                        {podeNovo && <Link to="novo" className="no-underline"><Button>Novo produto</Button></Link>}
                    </>
                )}
            />
            {barraFiltros}
            <Tabela cabecalho={<><Th>Nome</Th><Th centro className="w-32">Status</Th><Th centro className="w-24">Ação</Th></>}>
                {carregando && <LinhaVazia colunas={3}>Carregando...</LinhaVazia>}
                {!carregando && filtrados.length === 0 && <LinhaVazia colunas={3}>Nenhum produto encontrado.</LinhaVazia>}
                {filtrados.map((produto) => (
                    <tr key={produto.id_produto}>
                        <Td className="font-medium">{produto.nome_produto}</Td>
                        <Td centro><StatusBadge ativo={Boolean(produto.ativo)} /></Td>
                        <Td centro><AcaoEditar podeEditar={podeEditar} aoEditar={() => navigate(String(produto.id_produto))} /></Td>
                    </tr>
                ))}
            </Tabela>
        </>
    );
}

export function FormProdutoPage() {
    const { id } = useParams();
    const voltar = useVoltar();
    const idProduto = id ? Number(id) : undefined;
    const { form, setForm, carregando, naoEncontrado, podeSalvar, salvar } = useFormProduto(idProduto);

    if (carregando) return <Carregando />;
    if (naoEncontrado) return <Aviso titulo="Produto não encontrado" />;

    return (
        <>
            <PageHeader titulo={idProduto ? 'Editar produto' : 'Novo produto'} />
            <FormCard
                className="max-w-[720px]"
                aoEnviar={salvar}
                rodape={(
                    <>
                        <Button variant="secondary" onClick={voltar}>Cancelar</Button>
                        {podeSalvar && <Button type="submit">Salvar produto</Button>}
                    </>
                )}
            >
                <FormSecao>
                    <Field rotulo="Nome do produto" htmlFor="nome-produto" obrigatorio className="mb-4">
                        <Input id="nome-produto" value={form.nome_produto} onChange={(e) => setForm({ ...form, nome_produto: e.target.value })} required />
                    </Field>
                    <Checkbox rotulo="Produto ativo" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                </FormSecao>
            </FormCard>
        </>
    );
}
