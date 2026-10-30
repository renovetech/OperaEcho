/* ARQUIVO: src/components/Contador.jsx
 * Número que "sobe" até o valor ao aparecer ou mudar (só apresentação).
 * Com movimento reduzido no sistema operacional, mostra o valor direto. */
import { useEffect, useRef, useState } from 'react';

const semMovimento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Contador({ valor, duracao = 900 }) {
    const alvo = Number(valor) || 0;
    const [atual, setAtual] = useState(semMovimento() ? alvo : 0);
    const anterior = useRef(0);

    useEffect(() => {
        if (semMovimento()) { setAtual(alvo); anterior.current = alvo; return; }
        const inicio = anterior.current;
        const t0 = performance.now();
        let quadro;
        const passo = (t) => {
            const p = Math.min(1, (t - t0) / duracao);
            const suave = 1 - Math.pow(1 - p, 3);
            setAtual(Math.round(inicio + (alvo - inicio) * suave));
            if (p < 1) quadro = requestAnimationFrame(passo);
            else anterior.current = alvo;
        };
        quadro = requestAnimationFrame(passo);
        return () => cancelAnimationFrame(quadro);
    }, [alvo, duracao]);

    return <>{atual.toLocaleString('pt-BR')}</>;
}
