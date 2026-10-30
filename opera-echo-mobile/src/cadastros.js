/* ARQUIVO: src/cadastros.js
   Listas de apoio compartilhadas pelas telas (com cache em memória). */

import { useEffect, useState } from 'react';
import api from './api';

/* Motivos da visita - mesma fonte do web (/motivos), com a lista padrão de reserva. */
export const MOTIVOS_PADRAO = ['Implantação', 'Treinamento', 'Visita Técnica', 'Apoio ao Projeto'];

let _motivos = null;

export function useMotivos() {
    const [motivos, setMotivos] = useState(_motivos || MOTIVOS_PADRAO);
    useEffect(() => {
        if (_motivos) return;
        let vivo = true;
        api.get('/motivos')
            .then(r => {
                const lista = (Array.isArray(r.data) ? r.data : [])
                    .map(m => m?.descricao).filter(Boolean);
                if (lista.length) { _motivos = lista; if (vivo) setMotivos(lista); }
            })
            .catch(() => {});
        return () => { vivo = false; };
    }, []);
    return motivos;
}

/* "dd/mm/aaaa" ou "dd/mm/aaaa até dd/mm/aaaa" (igual à tabela do web). */
export function formatarPeriodo(inicio, fim) {
    if (!inicio) return '-';
    const br = (d) => String(d).split('T')[0].split('-').reverse().join('/');
    const i = String(inicio).split('T')[0];
    const f = fim ? String(fim).split('T')[0] : '';
    return !f || f === i ? br(i) : `${br(i)} até ${br(f)}`;
}

/* Data local em YYYY-MM-DD - toISOString() desloca o dia em BRT (UTC-3). */
export const dataISOLocal = (d) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
