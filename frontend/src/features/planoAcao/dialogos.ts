/* Diálogos próprios do Plano de Ação. O que vem do banco entra escapado no HTML do Swal. */
import Swal from 'sweetalert2';
import { copiarTexto, escaparHtml, linkPublicoPlano, mensagemHtml } from '@/features/planoAcao/formatos';
import { avisoRapido, erro, sucesso } from '@/shared/feedback';

const COR_MARCA = '#2e7d32';
const COR_PERIGO = '#a23b36';
const MINIMO_JUSTIFICATIVA = 10;
const PALAVRA_EXCLUSAO = 'EXCLUIR';

export const erroHtml = (falha: unknown, padrao?: string, titulo = 'Erro') =>
    Swal.fire({ icon: 'error', title: titulo, html: mensagemHtml(falha, padrao), confirmButtonColor: COR_MARCA });

export async function confirmarExclusaoDigitada(titulo: string): Promise<boolean> {
    const { isConfirmed } = await Swal.fire({
        title: 'Excluir plano?',
        html: `<b>${escaparHtml(titulo)}</b><br/>Todas as ações, apontamentos de horas e o histórico serão apagados. Esta operação não pode ser desfeita.`,
        icon: 'warning',
        input: 'text',
        inputPlaceholder: `Digite ${PALAVRA_EXCLUSAO} para confirmar`,
        showCancelButton: true,
        confirmButtonColor: COR_PERIGO,
        confirmButtonText: 'Excluir',
        cancelButtonText: 'Cancelar',
        preConfirm: (valor: string) => (valor === PALAVRA_EXCLUSAO ? true : Swal.showValidationMessage(`Digite ${PALAVRA_EXCLUSAO} para confirmar`))
    });
    return isConfirmed;
}

/** Com ações abertas exige justificativa. Devolve null se o usuário desistir. */
export async function pedirEncerramento(pendentes: number): Promise<{ justificativa: string | null } | null> {
    const exige = pendentes > 0;
    const { isConfirmed, value } = await Swal.fire<string>({
        title: 'Encerrar plano?',
        html: exige ? `Existem <b>${pendentes}</b> ação(ões) não fechadas.<br/>Informe a justificativa do encerramento:` : 'Todas as ações estão fechadas. O plano ficará somente leitura.',
        icon: 'question',
        input: exige ? 'textarea' : undefined,
        inputPlaceholder: `Justificativa (mín. ${MINIMO_JUSTIFICATIVA} caracteres)`,
        showCancelButton: true,
        confirmButtonColor: COR_MARCA,
        confirmButtonText: 'Encerrar',
        cancelButtonText: 'Cancelar',
        preConfirm: (texto?: string) => (exige && (texto?.trim().length ?? 0) < MINIMO_JUSTIFICATIVA
            ? Swal.showValidationMessage(`Justificativa obrigatória (mín. ${MINIMO_JUSTIFICATIVA} caracteres)`)
            : (texto ?? ''))
    });
    return isConfirmed ? { justificativa: value || null } : null;
}

export type DecisaoSaida = 'salvar' | 'sair' | null;

export async function decidirSaida(qtd: number): Promise<DecisaoSaida> {
    const { isConfirmed, isDenied } = await Swal.fire({
        title: 'Alterações não salvas',
        text: `Há ${qtd} linha(s) alteradas.`,
        icon: 'warning',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Salvar e sair',
        denyButtonText: 'Sair sem salvar',
        cancelButtonText: 'Continuar editando',
        confirmButtonColor: COR_MARCA,
        denyButtonColor: COR_PERIGO
    });
    if (isConfirmed) return 'salvar';
    return isDenied ? 'sair' : null;
}

export async function decidirModelo(): Promise<'substituir' | 'acrescentar' | null> {
    const { isConfirmed, isDenied } = await Swal.fire({
        title: 'Carregar modelo',
        text: 'Você já tem etapas montadas.',
        icon: 'question',
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Substituir',
        denyButtonText: 'Acrescentar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: COR_MARCA,
        denyButtonColor: COR_MARCA
    });
    if (isConfirmed) return 'substituir';
    return isDenied ? 'acrescentar' : null;
}

/** Tenta a exclusão; se o servidor pedir confirmação (HTTP 409), pergunta e repete com "forçar". */
export async function excluirComConfirmacao(
    executar: (forcar: boolean) => Promise<unknown>,
    rotuloConfirmacao: string,
    exigeTexto?: RegExp
): Promise<boolean> {
    try {
        await executar(false);
        return true;
    } catch (falha) {
        const resposta = (falha as { response?: { status?: number; data?: { erro?: string } } }).response;
        if (resposta?.status !== 409 || (exigeTexto && !exigeTexto.test(resposta.data?.erro ?? ''))) {
            await erroHtml(falha, undefined, exigeTexto ? 'Atenção' : 'Erro');
            return false;
        }
        const { isConfirmed } = await Swal.fire({
            title: 'Confirmação adicional',
            html: mensagemHtml(falha),
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: rotuloConfirmacao,
            cancelButtonText: 'Cancelar',
            confirmButtonColor: COR_PERIGO
        });
        if (!isConfirmed) return false;
        try {
            await executar(true);
            return true;
        } catch (segundaFalha) {
            await erroHtml(segundaFalha);
            return false;
        }
    }
}

interface PublicacaoProps {
    publico?: boolean;
    token?: string | null;
    podeEditar: boolean;
    permiteNovoLink?: boolean;
    alterar: (publico: boolean, regenerar?: boolean) => Promise<string>;
    aoMudar: (publico: boolean, token?: string) => void;
}

async function mostrarLinkAtivo({ token, podeEditar, permiteNovoLink, alterar, aoMudar }: PublicacaoProps & { token: string }) {
    const link = linkPublicoPlano(token);
    const { isConfirmed, isDenied } = await Swal.fire({
        title: 'Painel público ativo',
        html: `<input class="swal2-input" readonly value="${escaparHtml(link)}" style="font-size:.85rem" />`,
        showDenyButton: podeEditar,
        showCancelButton: true,
        confirmButtonText: 'Copiar link',
        denyButtonText: 'Despublicar',
        cancelButtonText: 'Fechar',
        confirmButtonColor: COR_MARCA,
        denyButtonColor: COR_PERIGO,
        footer: podeEditar && permiteNovoLink ? '<a href="#" id="pa-novo-link">Gerar novo link (revoga o atual)</a>' : undefined,
        didOpen: () => {
            const novoLink = document.getElementById('pa-novo-link');
            if (!novoLink) return;
            novoLink.onclick = async (evento) => {
                evento.preventDefault();
                try {
                    const novoToken = await alterar(true, true);
                    aoMudar(true, novoToken);
                    sucesso('Novo link gerado', linkPublicoPlano(novoToken));
                } catch (falha) {
                    erroHtml(falha);
                }
            };
        }
    });
    if (isConfirmed) {
        if (await copiarTexto(link)) avisoRapido('Link copiado');
        else sucesso('Copie o link', link);
    }
    if (isDenied) {
        try {
            await alterar(false);
            aoMudar(false);
        } catch (falha) {
            erroHtml(falha);
        }
    }
}

/** Publica ou mostra o link do painel público de um plano. */
export async function gerenciarPublicacao(props: PublicacaoProps): Promise<void> {
    if (props.publico && props.token) {
        await mostrarLinkAtivo({ ...props, token: props.token });
        return;
    }
    if (!props.podeEditar) {
        erro('Você não tem permissão para publicar este plano. É preciso ter permissão de edição, ser o criador ou ter lotação no projeto.', 'Painel privado');
        return;
    }
    const { isConfirmed } = await Swal.fire({
        title: 'Publicar painel do plano?',
        html: 'Qualquer pessoa com o link poderá ver o <b>painel e o cronograma</b> (somente leitura).<br/>Observações, equipe e horas <b>não</b> são exibidas.',
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Publicar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: COR_MARCA
    });
    if (!isConfirmed) return;
    try {
        const token = await props.alterar(true);
        props.aoMudar(true, token);
        const link = linkPublicoPlano(token);
        await copiarTexto(link);
        sucesso('Publicado! Link copiado', link);
    } catch (falha) {
        erroHtml(falha);
    }
}
