/* ARQUIVO: src/celular.js
 * Celular com WhatsApp (obrigatório no cadastro): máscara e validação iguais às do servidor.
 * Aceito: DDD + 9 dígitos começando por 9 (ex.: (21) 98765-4321). */

export const soDigitos = (v) => String(v || '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '').slice(0, 11);

/** "21987654321" -> "(21) 98765-4321" (parcial enquanto digita) */
export function mascaraCelular(v) {
    const n = soDigitos(v);
    if (n.length <= 2) return n.length ? `(${n}` : '';
    if (n.length <= 7) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
    return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
}

export function celularValido(v) {
    const n = soDigitos(v);
    return n.length === 11 && n[2] === '9' && !/^(\d)\1+$/.test(n);
}

export const emailValido = (e) => !e || /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(String(e).trim());
