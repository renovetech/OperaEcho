import { Navigate, useParams } from 'react-router-dom';
import { RequireAcesso } from '@/app/guards';
import { RELATORIOS } from '@/app/navegacao';
import { EstatisticasRelatorio, PresencaRelatorio } from '@/features/relatorios/AtividadesRelatorios';
import { AuditoriaRelatorio, TempoMedioRelatorio } from '@/features/relatorios/AuditoriaTempoRelatorios';
import { PlanoAcaoRelatorio } from '@/features/relatorios/PlanoAcaoRelatorio';
import { MapaUnidadesRelatorio, ProjetosAtivosRelatorio } from '@/features/relatorios/UnidadesRelatorios';
import { useAuth } from '@/shared/auth/AuthContext';
import { Aviso } from '@/shared/ui/Estados';

const TELAS: Record<string, React.ReactNode> = {
    estatistica_atividades: <EstatisticasRelatorio deProjetos={false} />,
    estatistica_projetos: <EstatisticasRelatorio deProjetos />,
    tempo_medio_acao: <TempoMedioRelatorio />,
    plano_acao_status: <PlanoAcaoRelatorio />,
    auditoria_localizacao: <AuditoriaRelatorio />,
    presenca_implantador: <PresencaRelatorio porEquipe={false} />,
    presenca_equipe: <PresencaRelatorio porEquipe />,
    projetos_ativos: <ProjetosAtivosRelatorio />,
    mapa_unidades: <MapaUnidadesRelatorio />
};

export function RelatorioPage() {
    const { relatorio: slug } = useParams();
    const relatorio = RELATORIOS.find((item) => item.slug === slug);
    if (!relatorio) return <Aviso titulo="Página não encontrada" />;
    return <RequireAcesso key={relatorio.chave} modulos={[relatorio.modulo]}>{TELAS[relatorio.chave]}</RequireAcesso>;
}

/** /system/relatorios sem relatório escolhido: abre o primeiro que o perfil pode ver. */
export function RelatoriosInicioPage() {
    const { podeAcessar, permissoesCarregadas } = useAuth();
    if (!permissoesCarregadas) return null;
    const primeiro = RELATORIOS.find((relatorio) => podeAcessar(relatorio.modulo));
    return primeiro ? <Navigate to={primeiro.slug} replace /> : <Aviso titulo="Sem acesso a esta tela" />;
}
