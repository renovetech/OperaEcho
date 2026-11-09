import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Junta classes do Tailwind; em caso de conflito, a última vence. */
export function cn(...classes: ClassValue[]): string {
    return twMerge(clsx(classes));
}

/** Para o que vem do banco entrar em HTML (mensagens do Swal). */
export const escaparHtml = (texto: unknown): string => String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Único ponto de log de erro do front. */
export function logErro(contexto: string, erro: unknown): void {
    // eslint-disable-next-line no-console
    console.error(contexto, erro);
}

/** Data de hoje no fuso local, em YYYY-MM-DD (toISOString() vira o dia à noite, em UTC-3). */
export function hojeLocal(): string {
    const agora = new Date();
    return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** "2026-11-08T00:00:00" -> "08/11" */
export function formatarDiaMes(data?: string | null): string {
    if (!data) return '';
    const meioDia = new Date(`${data.split('T')[0]}T12:00:00`);
    return meioDia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
