/* Celular com WhatsApp (obrigatório no cadastro): máscara e validação iguais às do servidor.
 * Aceito: DDD + 9 dígitos começando por 9 (ex.: (21) 98765-4321). */
const TAMANHO_CELULAR = 11;

export const soDigitos = (valor: unknown): string => String(valor ?? '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '').slice(0, TAMANHO_CELULAR);

/** "21987654321" vira "(21) 98765-4321"; parcial enquanto digita. */
export function mascaraCelular(valor: unknown): string {
    const numero = soDigitos(valor);
    if (numero.length <= 2) return numero.length ? `(${numero}` : '';
    if (numero.length <= 7) return `(${numero.slice(0, 2)}) ${numero.slice(2)}`;
    return `(${numero.slice(0, 2)}) ${numero.slice(2, 7)}-${numero.slice(7)}`;
}

export function celularValido(valor: unknown): boolean {
    const numero = soDigitos(valor);
    return numero.length === TAMANHO_CELULAR && numero[2] === '9' && !/^(\d)\1+$/.test(numero);
}

export const emailValido = (email: unknown): boolean => !email || /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
