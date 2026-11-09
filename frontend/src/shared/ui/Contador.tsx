/* Número que sobe até o valor ao aparecer ou mudar. Com movimento reduzido no sistema, mostra o valor direto. */
import { useEffect, useRef, useState } from 'react';

const DURACAO_PADRAO_MS = 900;

const semMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Contador({ valor, duracao = DURACAO_PADRAO_MS }: { valor: unknown; duracao?: number }) {
    const alvo = Number(valor) || 0;
    const [atual, setAtual] = useState(0);
    const anterior = useRef(0);

    useEffect(() => {
        const inicio = semMovimento() ? alvo : anterior.current;
        const comeco = performance.now();
        let quadro = 0;
        const passo = (agora: number) => {
            const progresso = Math.min(1, (agora - comeco) / duracao);
            const suave = 1 - (1 - progresso) ** 3;
            setAtual(Math.round(inicio + (alvo - inicio) * suave));
            if (progresso < 1) quadro = requestAnimationFrame(passo);
            else anterior.current = alvo;
        };
        quadro = requestAnimationFrame(passo);
        return () => cancelAnimationFrame(quadro);
    }, [alvo, duracao]);

    return <>{atual.toLocaleString('pt-BR')}</>;
}
