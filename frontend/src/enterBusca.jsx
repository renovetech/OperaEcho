/* ARQUIVO: src/enterBusca.js
 * Enter em campo de filtro = clicar no botão de busca da mesma área.
 * Marque o botão com data-busca="1"; o campo pode estar em qualquer nível próximo
 * (sobe até 8 níveis procurando o botão). Não interfere em <form> (que já envia
 * no Enter), textarea, modais (SweetAlert) ou campos que já tratam o Enter. */
function aoTeclar(e) {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
    const el = e.target;
    if (!(el instanceof HTMLElement) || el.isContentEditable) return;
    if (el.tagName !== 'INPUT' && el.tagName !== 'SELECT') return;
    if (['checkbox', 'radio', 'button', 'submit', 'file', 'reset'].includes(el.type)) return;
    if (el.closest('form') || el.closest('.swal2-container')) return;
    let no = el.parentElement;
    for (let i = 0; no && i < 8; i++, no = no.parentElement) {
        const botao = no.querySelector('[data-busca]:not([disabled])');
        if (botao) { e.preventDefault(); botao.click(); return; }
    }
}

export function ativarEnterBusca() {
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
}
