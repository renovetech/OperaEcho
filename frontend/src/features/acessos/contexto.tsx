import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buscarNotificacoes, type Notificacao } from '@/features/acessos/api';
import { useAuth } from '@/shared/auth/AuthContext';
import { podeAprovarAcesso } from '@/shared/auth/session';
import { logErro } from '@/shared/lib';

const INTERVALO_MS = 30000;

interface NotificacoesValue {
    notificacoes: Notificacao[];
    removerSolicitacao: (idUsuario: number) => void;
}

const NotificacoesContext = createContext<NotificacoesValue | null>(null);

export function NotificacoesProvider({ children }: { children: ReactNode }) {
    const { usuario } = useAuth();
    const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
    const habilitado = podeAprovarAcesso(usuario);

    useEffect(() => {
        if (!habilitado) return undefined;
        let ativo = true;
        const carregar = () => {
            buscarNotificacoes(usuario.id_usuario)
                .then((lista) => { if (ativo) setNotificacoes(lista); })
                .catch((erro: unknown) => logErro('Erro ao buscar notificações', erro));
        };
        carregar();
        const intervalo = setInterval(carregar, INTERVALO_MS);
        return () => { ativo = false; clearInterval(intervalo); };
    }, [habilitado, usuario.id_usuario]);

    const removerSolicitacao = useCallback((idUsuario: number) => {
        setNotificacoes((lista) => lista.filter((item) => !(item.tipo === 'acesso' && item.id_usuario === idUsuario)));
    }, []);

    const valor = useMemo(() => ({ notificacoes, removerSolicitacao }), [notificacoes, removerSolicitacao]);
    return <NotificacoesContext value={valor}>{children}</NotificacoesContext>;
}

export function useNotificacoes(): NotificacoesValue {
    const valor = use(NotificacoesContext);
    if (!valor) throw new Error('useNotificacoes precisa estar dentro de NotificacoesProvider.');
    return valor;
}
