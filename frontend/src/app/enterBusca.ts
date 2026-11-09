/* Enter em campo de filtro equivale a clicar no botão de busca da mesma área. Marque o botão com data-busca="1".
 * Não interfere em <form>, textarea, janelas do SweetAlert nem em campos que já tratam o Enter. */
const TIPOS_IGNORADOS = ['checkbox', 'radio', 'button', 'submit', 'file', 'reset'];
const NIVEIS_DE_BUSCA = 8;

function aoTeclar(evento: KeyboardEvent): void {
    if (evento.key !== 'Enter' || evento.defaultPrevented || evento.isComposing) return;
    const campo = evento.target;
    if (!(campo instanceof HTMLInputElement || campo instanceof HTMLSelectElement)) return;
    if (TIPOS_IGNORADOS.includes(campo.type) || campo.closest('form') || campo.closest('.swal2-container')) return;
    let no = campo.parentElement;
    for (let nivel = 0; no && nivel < NIVEIS_DE_BUSCA; nivel += 1, no = no.parentElement) {
        const botao = no.querySelector<HTMLElement>('[data-busca]:not([disabled])');
        if (botao) {
            evento.preventDefault();
            botao.click();
            return;
        }
    }
}

export function ativarEnterBusca(): () => void {
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
}
