import Icon from '@/shared/ui/Icon';
import { normalizarUrl, useLinksExternos } from '@/features/links/hooks';
import { useVoltar } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { Badge, Card, CardTitulo, PageHeader } from '@/shared/ui/Pagina';

export function LinksPage() {
    const voltar = useVoltar();
    const { grupos, carregando, editar, excluir, podeNovo, podeEditar } = useLinksExternos();

    return (
        <>
            <PageHeader
                titulo="Links Externos"
                acoes={(
                    <>
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                        {podeNovo && <Button onClick={() => editar()}><Icon n="plus" /> Novo link</Button>}
                    </>
                )}
            />
            {carregando && <Carregando />}
            {!carregando && grupos.length === 0 && (
                <Aviso titulo="Nenhum link cadastrado">{podeNovo ? 'Clique em "Novo link" para começar.' : undefined}</Aviso>
            )}
            <div className="grid grid-cols-3 items-start gap-4">
                {grupos.map((grupo) => (
                    <Card key={grupo.idProduto}>
                        <CardTitulo titulo={grupo.nomeProduto} extra={<Badge>{grupo.itens.length}</Badge>} />
                        <ul className="m-0 list-none p-0">
                            {grupo.itens.map((link) => (
                                <li key={link.id_link} className="flex items-center gap-2 border-b border-line-2 px-[18px] py-2.5 last:border-b-0">
                                    <a href={normalizarUrl(link.url)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 text-[13px] break-all text-pine no-underline hover:underline">{link.url}</a>
                                    {podeEditar && (
                                        <span className="flex shrink-0 gap-1">
                                            <button type="button" title="Editar" aria-label="Editar" className="cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-pine hover:bg-tint" onClick={() => editar(link)}><Icon n="edit" /></button>
                                            <button type="button" title="Excluir" aria-label="Excluir" className="cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-danger hover:bg-danger-tint" onClick={() => excluir(link)}><Icon n="trash" /></button>
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </Card>
                ))}
            </div>
        </>
    );
}
