import { Suspense, useCallback, useEffect, useMemo } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { aviso } from '@/shared/feedback';
import { Cabecalho } from '@/app/layout/Cabecalho';
import { Rodape } from '@/app/layout/Rodape';
import { NotificacoesProvider } from '@/features/acessos/contexto';
import { useContatoObrigatorio } from '@/features/conta/hooks';
import { AuthProvider, useAuth } from '@/shared/auth/AuthContext';
import { lerUsuario, temSessao } from '@/shared/auth/session';
import { useInatividade } from '@/shared/hooks';
import { Carregando } from '@/shared/ui/Estados';

const LIMITE_INATIVIDADE_MS = 30 * 60 * 1000;

function Moldura() {
    const { sair } = useAuth();
    const { pathname } = useLocation();
    useContatoObrigatorio();

    const aoExpirar = useCallback(() => {
        void aviso('Sua sessão foi encerrada devido à inatividade.', 'Sessão expirada').then(sair);
    }, [sair]);
    useInatividade(LIMITE_INATIVIDADE_MS, aoExpirar);

    useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

    return (
        // Resolução mínima 1366x768: 1340px já desconta a barra de rolagem vertical do navegador.
        <div className="flex min-h-screen min-w-[1340px] flex-col bg-paper pb-[30px] print:pb-0">
            <Cabecalho />
            <main className="app-content mx-auto box-border w-full max-w-[1440px] flex-1 px-7 pt-[22px] pb-7">
                <Suspense fallback={<Carregando />}>
                    <Outlet />
                </Suspense>
            </main>
            <Rodape />
        </div>
    );
}

/** Área logada: exige sessão e entrega usuário, permissões e notificações às telas. */
export function AppLayout() {
    const usuario = useMemo(() => lerUsuario(), []);
    if (!usuario || !temSessao()) return <Navigate to="/" replace />;

    return (
        <AuthProvider usuario={usuario}>
            <NotificacoesProvider>
                <Moldura />
            </NotificacoesProvider>
        </AuthProvider>
    );
}
