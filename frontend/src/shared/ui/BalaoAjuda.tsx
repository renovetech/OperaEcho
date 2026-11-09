import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib';

const LARGURA = 340;
const MARGEM = 12;
const AFASTAMENTO = 8;
/** Abaixo disso o balão abre para cima, para não sair da tela. */
const ESPACO_MINIMO = 280;

interface Posicao {
    left: number;
    top: number;
    acima: boolean;
}

interface BalaoAjudaProps {
    /** Quebras de linha do texto são respeitadas. */
    texto: string;
    rotulo?: string;
    /** Para cartões de fundo escuro. */
    claro?: boolean;
    className?: string;
    classeIcone?: string;
    /** A área que abre o balão ao receber o cursor. */
    children?: ReactNode;
}

/** Abre ao apontar o cursor para a área; o "i" sinaliza a ajuda e dá acesso pelo teclado. Vai no body para o cartão não cortar o balão. */
export function BalaoAjuda({ texto, rotulo = 'Regra', claro, className, classeIcone, children }: BalaoAjudaProps) {
    const id = useId();
    const area = useRef<HTMLDivElement>(null);
    const [posicao, setPosicao] = useState<Posicao | null>(null);

    const abrir = () => {
        const caixa = area.current?.getBoundingClientRect();
        if (!caixa) return;
        const acima = window.innerHeight - caixa.bottom < ESPACO_MINIMO;
        setPosicao({
            left: Math.min(Math.max(MARGEM, caixa.left + caixa.width / 2 - LARGURA / 2), window.innerWidth - LARGURA - MARGEM),
            top: acima ? caixa.top - AFASTAMENTO : caixa.bottom + AFASTAMENTO,
            acima
        });
    };
    const fechar = () => setPosicao(null);
    const aberto = posicao !== null;

    useEffect(() => {
        if (!aberto) return undefined;
        const aoTeclar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') setPosicao(null); };
        const aoRolar = () => setPosicao(null);
        window.addEventListener('keydown', aoTeclar);
        window.addEventListener('scroll', aoRolar, true);
        return () => {
            window.removeEventListener('keydown', aoTeclar);
            window.removeEventListener('scroll', aoRolar, true);
        };
    }, [aberto]);

    return (
        <div ref={area} onMouseEnter={abrir} onMouseLeave={fechar} className={cn('cursor-help', className)}>
            {children}
            <button
                type="button"
                aria-label={`Ver ${rotulo.toLowerCase()}`}
                aria-describedby={aberto ? id : undefined}
                onFocus={abrir}
                onBlur={fechar}
                className={cn(
                    'inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full border border-solid bg-transparent p-0 font-serif text-[11px] leading-none font-bold italic',
                    claro ? 'border-sage-300 text-sage-300' : 'border-muted text-text-2',
                    classeIcone
                )}
            >
                i
            </button>
            {posicao && createPortal(
                <div
                    id={id}
                    role="tooltip"
                    style={{ left: posicao.left, top: posicao.top, width: LARGURA }}
                    className={cn('pointer-events-none fixed z-[1100] rounded-lg bg-ink px-3.5 py-2.5 text-xs leading-relaxed font-normal whitespace-pre-line text-white shadow-pop', posicao.acima && '-translate-y-full')}
                >
                    <b className="mb-1 block font-semibold text-sage-300">{rotulo}</b>
                    {texto}
                </div>,
                document.fullscreenElement ?? document.body
            )}
        </div>
    );
}
