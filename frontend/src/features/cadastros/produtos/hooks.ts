import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { listarProdutos, salvarProduto, type FormProduto, type Produto } from '@/features/cadastros/produtos/api';
import { useAuth } from '@/shared/auth/AuthContext';
import { aviso, erro, sucesso } from '@/shared/feedback';
import { logErro } from '@/shared/lib';

const MODULO = 'produtos';
const ROTA_LISTA = '/system/cadastros/produtos';
const FORM_VAZIO: FormProduto = { id_produto: '', nome_produto: '', ativo: true };

export function useListaProdutos() {
    const { podeAcao } = useAuth();
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [carregando, setCarregando] = useState(true);

    useEffect(() => {
        listarProdutos()
            .then(setProdutos)
            .catch((falha: unknown) => logErro('Erro ao listar produtos', falha))
            .finally(() => setCarregando(false));
    }, []);

    return { produtos, carregando, podeNovo: podeAcao(MODULO, 'pode_novo'), podeEditar: podeAcao(MODULO, 'pode_editar') };
}

export function useFormProduto(idProduto?: number) {
    const { podeAcao, nomeExibicao } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState<FormProduto>(FORM_VAZIO);
    const [carregando, setCarregando] = useState(idProduto !== undefined);
    const [naoEncontrado, setNaoEncontrado] = useState(false);
    const podeSalvar = podeAcao(MODULO, idProduto !== undefined ? 'pode_editar' : 'pode_novo');

    useEffect(() => {
        if (idProduto === undefined) return;
        listarProdutos()
            .then((lista) => {
                const produto = lista.find((item) => item.id_produto === idProduto);
                if (produto) setForm({ id_produto: produto.id_produto, nome_produto: produto.nome_produto, ativo: Boolean(produto.ativo) });
                else setNaoEncontrado(true);
            })
            .catch((falha: unknown) => logErro('Erro ao abrir produto', falha))
            .finally(() => setCarregando(false));
    }, [idProduto]);

    const salvar = async (evento: FormEvent) => {
        evento.preventDefault();
        if (!podeSalvar) { erro('Sem permissão para salvar.'); return; }
        if (!form.nome_produto.trim()) { aviso('Preencha o nome.'); return; }
        try {
            await salvarProduto(form, nomeExibicao);
            sucesso('Produto salvo!');
            navigate(ROTA_LISTA);
        } catch {
            erro('Erro ao salvar.');
        }
    };

    return { form, setForm, carregando, naoEncontrado, podeSalvar, salvar };
}
