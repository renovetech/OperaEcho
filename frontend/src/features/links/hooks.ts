import { useEffect, useMemo, useState } from 'react';
import { excluirLink, listarLinks, listarProdutos, salvarLink, type LinkExterno, type ProdutoDoLink } from '@/features/links/api';
import { useAuth } from '@/shared/auth/AuthContext';
import { confirmar, erro, mensagemDeErro, pedirSelecaoETexto, sucesso } from '@/shared/feedback';
import { logErro } from '@/shared/lib';

const MODULO = 'links_externos';

export interface GrupoDeLinks {
    idProduto: number;
    nomeProduto: string;
    itens: LinkExterno[];
}

export const normalizarUrl = (url: string): string => (/^https?:\/\//i.test(url) ? url : `https://${url}`);

export function useLinksExternos() {
    const { podeAcao } = useAuth();
    const [links, setLinks] = useState<LinkExterno[]>([]);
    const [produtos, setProdutos] = useState<ProdutoDoLink[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [versao, setVersao] = useState(0);

    useEffect(() => {
        let ativo = true;
        listarLinks()
            .then((lista) => { if (ativo) setLinks(lista); })
            .catch((falha: unknown) => logErro('Erro ao carregar links', falha))
            .finally(() => { if (ativo) setCarregando(false); });
        return () => { ativo = false; };
    }, [versao]);

    useEffect(() => {
        listarProdutos().then(setProdutos).catch((falha: unknown) => logErro('Erro ao carregar produtos', falha));
    }, []);

    const nomeDoProduto = (id: number) => produtos.find((produto) => produto.id_produto === id)?.nome_produto ?? 'Produto';

    const grupos = useMemo<GrupoDeLinks[]>(() => {
        const ids = [...new Set(links.map((link) => link.id_produto))];
        return ids
            .map((idProduto) => ({
                idProduto,
                nomeProduto: produtos.find((produto) => produto.id_produto === idProduto)?.nome_produto ?? 'Produto',
                itens: links.filter((link) => link.id_produto === idProduto)
            }))
            .sort((a, b) => a.nomeProduto.localeCompare(b.nomeProduto, 'pt-BR'));
    }, [links, produtos]);

    const editar = async (link?: LinkExterno) => {
        const resposta = await pedirSelecaoETexto({
            titulo: link ? 'Editar link' : 'Novo link',
            rotuloSelecao: 'Produto',
            opcoes: produtos.map((produto) => ({ valor: String(produto.id_produto), rotulo: produto.nome_produto })),
            valorSelecao: link ? String(link.id_produto) : '',
            rotuloTexto: 'Link externo',
            placeholderTexto: 'https://...',
            valorTexto: link?.url ?? '',
            validar: (produto, url) => {
                if (!produto) return 'Selecione o produto.';
                return url ? null : 'Informe o link externo.';
            }
        });
        if (!resposta) return;
        try {
            await salvarLink(link?.id_link ?? null, Number(resposta.selecao), resposta.texto);
            setVersao((atual) => atual + 1);
            sucesso('Salvo!', 'Link disponível para todos.');
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha ao salvar.'));
        }
    };

    const excluir = async (link: LinkExterno) => {
        if (!await confirmar('Excluir link?', { texto: nomeDoProduto(link.id_produto), rotulo: 'Sim, excluir' })) return;
        try {
            await excluirLink(link.id_link);
            setVersao((atual) => atual + 1);
            sucesso('Excluído!');
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha ao excluir.'));
        }
    };

    return { grupos, carregando, editar, excluir, podeNovo: podeAcao(MODULO, 'pode_novo'), podeEditar: podeAcao(MODULO, 'pode_editar') };
}
