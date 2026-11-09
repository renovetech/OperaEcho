/* Regra de força da senha, a mesma conferida pelo servidor. */
export const FORCA_MAXIMA = 5;
const TAMANHO_MINIMO = 7;

export function calcularForca(senha: string): number {
    const regras = [senha.length >= TAMANHO_MINIMO, /[A-Z]/.test(senha), /[a-z]/.test(senha), /[0-9]/.test(senha), /[^A-Za-z0-9]/.test(senha)];
    return regras.filter(Boolean).length;
}
