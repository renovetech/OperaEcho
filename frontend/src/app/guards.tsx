import type { ReactNode } from 'react';
import { Navigate, useRouteError } from 'react-router-dom';
import { useAuth } from '@/shared/auth/AuthContext';
import { temSessao } from '@/shared/auth/session';
import { logErro } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Aviso, Carregando } from '@/shared/ui/Estados';

interface RequireAcessoProps {
    /** Basta um dos módulos conceder acesso. */
    modulos: string[];
    children: ReactNode;
}

export function RequireAcesso({ modulos, children }: RequireAcessoProps) {
    const { podeAcessar, permissoesCarregadas } = useAuth();

    if (!permissoesCarregadas) return <Carregando />;
    if (!modulos.some(podeAcessar)) {
        return <Aviso titulo="Sem acesso a esta tela">Seu perfil não tem permissão. Solicite a liberação em Perfil de Acesso.</Aviso>;
    }
    return children;
}

/** Tela de login: quem já tem sessão vai direto para o sistema. */
export function RotaPublica({ children }: { children: ReactNode }) {
    return temSessao() ? <Navigate to="/system" replace /> : children;
}

/** Erro ao abrir uma tela. O caso mais comum é uma publicação nova ter trocado os arquivos da tela. */
export function RouteError() {
    logErro('Erro ao abrir a tela', useRouteError());
    return (
        <Aviso titulo="Não foi possível abrir esta tela" acao={<Button onClick={() => window.location.reload()}>Recarregar</Button>}>
            O sistema pode ter sido atualizado. Recarregue a página para continuar.
        </Aviso>
    );
}
