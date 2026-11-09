import { useEffect, useState } from 'react';
import { GradeTotais, ProximasFerias, ResumoDia, StatusPlanos } from '@/features/inicio/components';
import { useResumoInicio } from '@/features/inicio/hooks';
import { useAuth } from '@/shared/auth/AuthContext';
import { Badge, PageHeader } from '@/shared/ui/Pagina';

const MODULOS_FERIAS = ['ferias_solicitacao', 'proj_ferias_solicitacao', 'ferias_gestao'];

function saudacao(): string {
    const hora = new Date().getHours();
    if (hora < 12) return 'Bom dia';
    return hora < 18 ? 'Boa tarde' : 'Boa noite';
}

function textoAtualizacao(agora: number, ultima: number): string {
    const segundos = Math.max(0, Math.round((agora - ultima) / 1000));
    return segundos < 60 ? `Atualizado há ${segundos}s` : `Atualizado há ${Math.round(segundos / 60)}min`;
}

export default function InicioPage() {
    const { nomeExibicao, podeAcessar } = useAuth();
    const { totais, ferias, planos, atividadesImplantacao, atividadesProjetos, ultimaAtualizacao } = useResumoInicio();
    const [agora, setAgora] = useState(() => Date.now());

    useEffect(() => {
        const relogio = setInterval(() => setAgora(Date.now()), 1000);
        return () => clearInterval(relogio);
    }, []);

    const dataPorExtenso = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    const mostrarFerias = MODULOS_FERIAS.some(podeAcessar);
    const mostrarPlanos = podeAcessar('plano_acao');

    return (
        <>
            <PageHeader
                titulo={`${saudacao()}, ${nomeExibicao}`}
                subtitulo={<span className="first-letter:uppercase">{dataPorExtenso}</span>}
                acoes={<Badge>{textoAtualizacao(agora, ultimaAtualizacao)}</Badge>}
            />
            <GradeTotais totais={totais} />
            <div className="mb-[18px] grid grid-cols-2 gap-4">
                <ResumoDia titulo="Atividades de hoje · Implantação" atividades={atividadesImplantacao} />
                <ResumoDia titulo="Atividades de hoje · Projetos" atividades={atividadesProjetos} />
            </div>
            {(mostrarFerias || mostrarPlanos) && (
                <div className="grid grid-cols-[minmax(280px,1fr)_2fr] items-start gap-4">
                    {mostrarFerias && <ProximasFerias ferias={ferias} />}
                    {mostrarPlanos && <StatusPlanos planos={planos} />}
                </div>
            )}
        </>
    );
}
