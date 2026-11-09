/* Padrão único de mensagens do sistema (Swal.fire). */
import Swal from 'sweetalert2';

const COR_MARCA = '#2e7d32';
const COR_PERIGO = '#a23b36';
const COR_NEUTRA = '#64748b';
const DURACAO_SUCESSO_MS = 1800;

export function sucesso(titulo: string, texto?: string) {
    return Swal.fire({ icon: 'success', title: titulo, text: texto, timer: DURACAO_SUCESSO_MS, showConfirmButton: false });
}

export function avisoRapido(titulo: string) {
    return Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: titulo, timer: 1300, showConfirmButton: false });
}

export function mostrarCarregando(titulo: string, texto?: string) {
    return Swal.fire({ title: titulo, text: texto, didOpen: () => Swal.showLoading() });
}

export const fecharMensagem = () => Swal.close();

export function sucessoHtml(titulo: string, html: string) {
    return Swal.fire({ icon: 'success', title: titulo, html, confirmButtonColor: COR_MARCA });
}

export function aviso(texto: string, titulo = 'Atenção') {
    return Swal.fire({ icon: 'warning', title: titulo, text: texto, confirmButtonColor: COR_MARCA });
}

export function erro(texto: string, titulo = 'Erro') {
    return Swal.fire({ icon: 'error', title: titulo, text: texto, confirmButtonColor: COR_MARCA });
}

export function resultadoComDetalhes(icon: 'success' | 'warning', titulo: string, html: string) {
    return Swal.fire({ icon, title: titulo, html, confirmButtonColor: COR_MARCA });
}

export async function confirmar(titulo: string, opcoes: { texto?: string; rotulo?: string } = {}): Promise<boolean> {
    const { isConfirmed } = await Swal.fire({
        icon: 'warning',
        title: titulo,
        text: opcoes.texto,
        showCancelButton: true,
        confirmButtonText: opcoes.rotulo ?? 'Confirmar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: COR_PERIGO,
        cancelButtonColor: COR_NEUTRA
    });
    return isConfirmed;
}

/** Exibe um texto longo preservando as quebras de linha, sem interpretar HTML. */
export function verTexto(titulo: string, texto: string) {
    return Swal.fire({
        title: titulo,
        text: texto,
        width: 560,
        confirmButtonColor: COR_MARCA,
        customClass: { htmlContainer: 'whitespace-pre-wrap text-left text-sm' }
    });
}

interface OpcaoSelecao {
    valor: string;
    rotulo: string;
}

interface FormularioSelecaoETexto {
    titulo: string;
    rotuloSelecao: string;
    opcoes: OpcaoSelecao[];
    valorSelecao: string;
    rotuloTexto: string;
    placeholderTexto: string;
    valorTexto: string;
    validar: (selecao: string, texto: string) => string | null;
}

/** Formulário curto em Swal: uma seleção e um texto. Os campos são montados sem HTML vindo dos dados. */
export async function pedirSelecaoETexto(opcoes: FormularioSelecaoETexto): Promise<{ selecao: string; texto: string } | null> {
    const { value } = await Swal.fire<{ selecao: string; texto: string }>({
        title: opcoes.titulo,
        html: `<div style="display:flex;flex-direction:column;gap:12px;text-align:left">
            <label style="font-size:12.5px;font-weight:500;display:flex;flex-direction:column;gap:6px"><span id="oe-rotulo-selecao"></span><select id="oe-selecao" class="swal2-select" style="margin:0;width:100%;max-width:100%"></select></label>
            <label style="font-size:12.5px;font-weight:500;display:flex;flex-direction:column;gap:6px"><span id="oe-rotulo-texto"></span><input id="oe-texto" class="swal2-input" style="margin:0;width:100%;max-width:100%;box-sizing:border-box" /></label>
        </div>`,
        showCancelButton: true,
        confirmButtonText: 'Salvar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: COR_MARCA,
        cancelButtonColor: COR_NEUTRA,
        didOpen: () => {
            const selecao = document.getElementById('oe-selecao') as HTMLSelectElement;
            selecao.add(new Option('Selecione...', ''));
            opcoes.opcoes.forEach((opcao) => selecao.add(new Option(opcao.rotulo, opcao.valor)));
            selecao.value = opcoes.valorSelecao;
            const texto = document.getElementById('oe-texto') as HTMLInputElement;
            texto.value = opcoes.valorTexto;
            texto.placeholder = opcoes.placeholderTexto;
            (document.getElementById('oe-rotulo-selecao') as HTMLElement).textContent = opcoes.rotuloSelecao;
            (document.getElementById('oe-rotulo-texto') as HTMLElement).textContent = opcoes.rotuloTexto;
        },
        preConfirm: () => {
            const selecao = (document.getElementById('oe-selecao') as HTMLSelectElement).value;
            const texto = (document.getElementById('oe-texto') as HTMLInputElement).value.trim();
            const problema = opcoes.validar(selecao, texto);
            if (problema) return Swal.showValidationMessage(problema);
            return { selecao, texto };
        }
    });
    return value ?? null;
}

/** Mensagem enviada pela API; sem ela, o texto padrão da tela. */
export function mensagemDeErro(falha: unknown, padrao: string): string {
    const resposta = (falha as { response?: { data?: { erro?: string } } })?.response;
    return resposta?.data?.erro ?? padrao;
}
