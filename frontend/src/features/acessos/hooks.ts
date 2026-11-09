import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { aviso, confirmar, erro as mostrarErro, sucesso } from '@/shared/feedback';
import { ativarAcesso, buscarNotificacoes, buscarPerfis, buscarSolicitante, recusarAcesso, type PerfilAcesso, type SolicitanteAcesso } from '@/features/acessos/api';
import { useNotificacoes } from '@/features/acessos/contexto';
import { useAuth } from '@/shared/auth/AuthContext';
import { logErro } from '@/shared/lib';

export function useAprovacaoAcesso(idSolicitante: number) {
    const { id_usuario: idUsuario } = useAuth().usuario;
    const { removerSolicitacao } = useNotificacoes();
    const navigate = useNavigate();
    const [solicitante, setSolicitante] = useState<SolicitanteAcesso | null>(null);
    const [perfis, setPerfis] = useState<PerfilAcesso[]>([]);
    const [perfil, setPerfil] = useState('');
    const [carregando, setCarregando] = useState(true);

    useEffect(() => {
        let ativo = true;
        const carregar = async () => {
            const notificacoes = await buscarNotificacoes(idUsuario);
            const notificacao = notificacoes.find((item) => item.tipo === 'acesso' && item.id_usuario === idSolicitante);
            const [dados, listaPerfis] = await Promise.all([notificacao ? buscarSolicitante(notificacao) : null, buscarPerfis()]);
            if (!ativo) return;
            setSolicitante(dados);
            setPerfis(listaPerfis);
        };
        carregar()
            .catch((erro: unknown) => logErro('Erro ao carregar solicitação de acesso', erro))
            .finally(() => { if (ativo) setCarregando(false); });
        return () => { ativo = false; };
    }, [idSolicitante, idUsuario]);

    const concluir = () => {
        removerSolicitacao(idSolicitante);
        navigate('/system');
    };

    const ativar = async () => {
        if (!perfil) return aviso('Selecione um perfil de acesso.');
        try {
            await ativarAcesso(idSolicitante, perfil);
            void sucesso('Acesso ativado com sucesso!');
            concluir();
        } catch (erro) {
            logErro('Erro ao ativar acesso', erro);
            void mostrarErro('Não foi possível ativar o acesso.');
        }
        return undefined;
    };

    const recusar = async () => {
        const confirmado = await confirmar('Recusar solicitação?', { texto: `Tem certeza que deseja recusar e EXCLUIR o cadastro de ${solicitante?.nome_completo}? Essa ação não pode ser desfeita.`, rotulo: 'Sim, recusar e excluir' });
        if (!confirmado) return;
        try {
            await recusarAcesso(idSolicitante);
            void sucesso('Recusado!', 'A solicitação foi removida do sistema.');
            concluir();
        } catch (erro) {
            logErro('Erro ao recusar acesso', erro);
            void mostrarErro('Erro ao excluir a solicitação. Tente novamente.');
        }
    };

    return { solicitante, perfis, perfil, setPerfil, carregando, ativar, recusar };
}
