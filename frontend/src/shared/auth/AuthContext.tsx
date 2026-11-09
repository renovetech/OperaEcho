import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/shared/api';
import { encerrarSessao, type Usuario } from '@/shared/auth/session';
import { logErro } from '@/shared/lib';

interface RegraAcesso {
    nome_modulo: string;
    pode_acessar: boolean;
    pode_novo?: boolean;
    pode_editar?: boolean;
}

type AcaoModulo = 'pode_novo' | 'pode_editar';

interface AuthValue {
    usuario: Usuario;
    nomeExibicao: string;
    permissoesCarregadas: boolean;
    podeAcessar: (modulo: string) => boolean;
    podeAcao: (modulo: string, acao: AcaoModulo) => boolean;
    sair: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);
const PERFIL_ADMIN = 'Administrador';

export function AuthProvider({ usuario, children }: { usuario: Usuario; children: ReactNode }) {
    const navigate = useNavigate();
    const [regras, setRegras] = useState<RegraAcesso[]>([]);
    const [permissoesCarregadas, setPermissoesCarregadas] = useState(false);
    const isAdmin = usuario.perfil_acesso === PERFIL_ADMIN;

    useEffect(() => {
        let ativo = true;
        api.get<RegraAcesso[]>(`/regras/${encodeURIComponent(usuario.perfil_acesso)}`)
            .then(({ data }) => { if (ativo) setRegras(data); })
            .catch((erro: unknown) => logErro('Erro ao carregar permissões', erro))
            .finally(() => { if (ativo) setPermissoesCarregadas(true); });
        return () => { ativo = false; };
    }, [usuario.perfil_acesso]);

    const podeAcessar = useCallback((modulo: string) => {
        if (isAdmin) return true;
        return Boolean(regras.find((regra) => regra.nome_modulo === modulo)?.pode_acessar);
    }, [isAdmin, regras]);

    const podeAcao = useCallback((modulo: string, acao: AcaoModulo) => {
        if (isAdmin) return true;
        const regra = regras.find((item) => item.nome_modulo === modulo);
        return Boolean(regra?.pode_acessar && regra[acao]);
    }, [isAdmin, regras]);

    const sair = useCallback(() => {
        encerrarSessao();
        navigate('/');
    }, [navigate]);

    const valor = useMemo<AuthValue>(() => ({
        usuario,
        nomeExibicao: usuario.nome || usuario.nome_completo || 'Usuário',
        permissoesCarregadas: isAdmin || permissoesCarregadas,
        podeAcessar,
        podeAcao,
        sair
    }), [usuario, isAdmin, permissoesCarregadas, podeAcessar, podeAcao, sair]);

    return <AuthContext value={valor}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
    const valor = use(AuthContext);
    if (!valor) throw new Error('useAuth precisa estar dentro de AuthProvider.');
    return valor;
}
