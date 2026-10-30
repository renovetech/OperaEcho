/* ARQUIVO: src/captura.js
   Envolve o html2canvas (via alias no vite.config.js): na cópia usada para a
   captura, desliga animações e transições. Sem isso, os elementos com entrada
   animada (efeitos.css) eram capturados ainda invisíveis - ex.: a logo da escala. */
import html2canvasOriginal from 'html2canvas/dist/html2canvas.esm.js';

export default function html2canvas(elemento, opcoes = {}) {
    const onclone = opcoes.onclone;
    return html2canvasOriginal(elemento, {
        ...opcoes,
        onclone: (doc, el) => {
            doc.documentElement.classList.add('oe-captura');
            return onclone ? onclone(doc, el) : undefined;
        }
    });
}
