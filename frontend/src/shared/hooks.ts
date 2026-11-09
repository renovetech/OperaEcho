import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { logErro } from '@/shared/lib';

const EVENTOS_ATIVIDADE = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'] as const;

/** Volta à tela anterior; sem histórico (link aberto direto), vai para a página inicial. */
export function useVoltar(): () => void {
    const navigate = useNavigate();
    return useCallback(() => {
        const posicao = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (posicao > 0) navigate(-1);
        else navigate('/system');
    }, [navigate]);
}

type MudancasUrl = Record<string, string | null | undefined>;

/** Lê e altera parâmetros da URL; valor vazio remove o parâmetro. "empilhar" cria uma entrada no histórico. */
export function useParametrosUrl() {
    const [parametros, setParametros] = useSearchParams();
    const alterar = useCallback((mudancas: MudancasUrl, opcoes: { empilhar?: boolean } = {}) => {
        setParametros((atuais) => {
            const proximos = new URLSearchParams(atuais);
            Object.entries(mudancas).forEach(([chave, valor]) => {
                if (valor) proximos.set(chave, valor);
                else proximos.delete(chave);
            });
            return proximos;
        }, { replace: !opcoes.empilhar });
    }, [setParametros]);
    return [parametros, alterar] as const;
}

/** Lista dependente de um código: sem código, vazia; ao trocar, não mostra a lista do código anterior. */
export function useListaPorCodigo<T>(codigo: string, buscar: (codigo: string) => Promise<T[]>, contexto: string): T[] {
    const [resultado, setResultado] = useState<{ codigo: string; lista: T[] }>({ codigo: '', lista: [] });

    useEffect(() => {
        if (!codigo) return undefined;
        let ativo = true;
        buscar(codigo)
            .then((lista) => { if (ativo) setResultado({ codigo, lista }); })
            .catch((falha: unknown) => {
                logErro(contexto, falha);
                if (ativo) setResultado({ codigo, lista: [] });
            });
        return () => { ativo = false; };
    }, [codigo, buscar, contexto]);

    return resultado.codigo === codigo ? resultado.lista : [];
}

export function useClickFora(ref: RefObject<HTMLElement | null>, aoClicarFora: () => void): void {
    useEffect(() => {
        const aoPressionar = (evento: MouseEvent) => {
            if (ref.current && !ref.current.contains(evento.target as Node)) aoClicarFora();
        };
        document.addEventListener('mousedown', aoPressionar);
        return () => document.removeEventListener('mousedown', aoPressionar);
    }, [ref, aoClicarFora]);
}

export function useInatividade(limiteMs: number, aoExpirar: () => void): void {
    useEffect(() => {
        let temporizador: ReturnType<typeof setTimeout>;
        const reiniciar = () => {
            clearTimeout(temporizador);
            temporizador = setTimeout(aoExpirar, limiteMs);
        };
        EVENTOS_ATIVIDADE.forEach((evento) => document.addEventListener(evento, reiniciar));
        reiniciar();
        return () => {
            clearTimeout(temporizador);
            EVENTOS_ATIVIDADE.forEach((evento) => document.removeEventListener(evento, reiniciar));
        };
    }, [limiteMs, aoExpirar]);
}
