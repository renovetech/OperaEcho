import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { listarProjetos, salvarProjeto, type FormProjeto, type Projeto } from '@/features/cadastros/projetos/api';
import { useAuth } from '@/shared/auth/AuthContext';
import { aviso, erro, mensagemDeErro, sucesso, sucessoHtml } from '@/shared/feedback';
import { logErro } from '@/shared/lib';

const MODULO = 'projetos';
const ROTA_LISTA = '/system/cadastros/projetos';
const FORM_VAZIO: FormProjeto = { id_projeto: '', nome_projeto: '', categoria: '', ativo: true, gera_lotacao: false, painel_publico: false, slug_publico: '' };

/** "Projeto Paraíba" -> "paraiba" (mesma regra do backend: utils/slugPublico.js) */
export const gerarSlug = (nome: string): string => nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/^\s*(projeto|cliente)\s+/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');

export const limparSlug = (valor: string): string => valor.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);

export function useListaProjetos() {
    const { podeAcao } = useAuth();
    const [projetos, setProjetos] = useState<Projeto[]>([]);
    const [carregando, setCarregando] = useState(true);

    useEffect(() => {
        listarProjetos()
            .then(setProjetos)
            .catch((falha: unknown) => logErro('Erro ao listar projetos', falha))
            .finally(() => setCarregando(false));
    }, []);

    return { projetos, carregando, podeNovo: podeAcao(MODULO, 'pode_novo'), podeEditar: podeAcao(MODULO, 'pode_editar') };
}

function paraFormulario(projeto: Projeto): FormProjeto {
    return {
        id_projeto: projeto.id_projeto,
        nome_projeto: projeto.nome_projeto,
        categoria: (projeto.categoria || '').trim(),
        ativo: Boolean(projeto.ativo),
        gera_lotacao: Boolean(projeto.gera_lotacao),
        painel_publico: Boolean(projeto.painel_publico),
        slug_publico: projeto.slug_publico || ''
    };
}

export function useFormProjeto(idProjeto?: number) {
    const { podeAcao } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState<FormProjeto>(FORM_VAZIO);
    const [carregando, setCarregando] = useState(idProjeto !== undefined);
    const [naoEncontrado, setNaoEncontrado] = useState(false);
    const podeSalvar = podeAcao(MODULO, idProjeto !== undefined ? 'pode_editar' : 'pode_novo');

    useEffect(() => {
        if (idProjeto === undefined) return;
        listarProjetos()
            .then((lista) => {
                const projeto = lista.find((item) => item.id_projeto === idProjeto);
                if (projeto) setForm(paraFormulario(projeto));
                else setNaoEncontrado(true);
            })
            .catch((falha: unknown) => logErro('Erro ao abrir projeto', falha))
            .finally(() => setCarregando(false));
    }, [idProjeto]);

    const salvar = async (evento: FormEvent) => {
        evento.preventDefault();
        if (!podeSalvar) { erro('Você não tem permissão para salvar projetos.', 'Sem permissão'); return; }
        if (!form.nome_projeto.trim()) { aviso('Preencha o nome do projeto.'); return; }
        if (!form.categoria) { aviso('Selecione a categoria do projeto.'); return; }
        try {
            const slug = await salvarProjeto({
                ...form,
                id_projeto: form.id_projeto || null,
                slug_publico: form.painel_publico ? (form.slug_publico || gerarSlug(form.nome_projeto)) : ''
            });
            if (slug) {
                sucessoHtml('Salvo!', `Projeto salvo. Painel público disponível em:<br/><a href="/${slug}" target="_blank" rel="noreferrer"><b>${window.location.host}/${slug}</b></a>`);
            } else {
                sucesso('Salvo!', 'Projeto salvo com sucesso.');
            }
            navigate(ROTA_LISTA);
        } catch (falha) {
            logErro('Erro ao salvar projeto', falha);
            erro(mensagemDeErro(falha, 'Não foi possível salvar o projeto.'));
        }
    };

    return { form, setForm, carregando, naoEncontrado, podeSalvar, salvar };
}
