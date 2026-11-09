/* Indicadores APS em dois lugares, com o mesmo conteúdo:
   /indicadoresaps, pública, liberada pelo CNES de unidade com Prime Saúde ou e-SUS (vale enquanto a página está aberta);
   /system/indicadores-aps, no menu Operações, liberada pelo perfil de acesso. */
import { useRef, useState } from 'react';
import Icon from '@/shared/ui/Icon';
import { AcessoCnes, type UnidadeAcesso } from '@/features/indicadoresAps/AcessoCnes';
import { GuiaIndicadores } from '@/features/indicadoresAps/GuiaIndicadores';
import { confirmar } from '@/shared/feedback';
import { useClickFora, useParametrosUrl, useVoltar } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { PageHeader } from '@/shared/ui/Pagina';

const REGRA_GUIA = 'Material de apoio baseado nos Guias de Bolso (CONASEMS) e nas Notas Metodológicas do Ministério da Saúde, atualizadas em 02/10/2026, para as equipes eSF/eAP, eSFR, eMulti, eAPP, eCR e eSB.\nOs dados oficiais estão em sisaps.saude.gov.br.';

/** Tela do sistema, dentro do layout com o menu. */
export function IndicadoresSistemaPage() {
    const voltar = useVoltar();
    return (
        <>
            <PageHeader titulo="Indicadores APS 2026" ajuda={REGRA_GUIA} acoes={<Button variant="secondary" onClick={voltar}>Voltar</Button>} />
            <GuiaIndicadores />
        </>
    );
}

function MenuUnidade({ unidade, aoSair }: { unidade: UnidadeAcesso; aoSair: () => void }) {
    const [aberto, setAberto] = useState(false);
    const raiz = useRef<HTMLDivElement>(null);
    useClickFora(raiz, () => setAberto(false));

    return (
        <div ref={raiz} className="relative">
            <button type="button" aria-expanded={aberto} onClick={() => setAberto(!aberto)} className="flex cursor-pointer items-center gap-2.5 rounded-full border border-solid border-sage-300 bg-tint px-4 py-1.5 text-right font-sans">
                <Icon n="building" />
                <span><b className="block text-[13px] font-semibold text-pine-800">{unidade.nome}</b><span className="block text-[11px] text-text-2">CNES: {unidade.cnes}</span></span>
            </button>
            {aberto && (
                <div className="absolute top-[calc(100%+6px)] right-0 z-20 min-w-44 overflow-hidden rounded-lg border border-solid border-line bg-white shadow-pop">
                    <button type="button" onClick={aoSair} className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3.5 py-2.5 text-left font-sans text-[13.5px] font-semibold text-danger hover:bg-danger-tint"><Icon n="logout" /> Sair do guia</button>
                </div>
            )}
        </div>
    );
}

export function IndicadoresPage() {
    const [unidade, setUnidade] = useState<UnidadeAcesso | null>(null);
    const [, alterarUrl] = useParametrosUrl();

    if (!unidade) return <AcessoCnes aoEntrar={setUnidade} />;

    const sair = async () => {
        if (!await confirmar('Sair do guia?', { texto: 'Você precisará informar o CNES novamente para acessar.', rotulo: 'Sim, sair' })) return;
        alterarUrl({ aba: null, funcao: null, equipe: null, busca: null });
        setUnidade(null);
    };

    return (
        <div className="flex min-h-screen min-w-[1340px] flex-col bg-paper">
            <header className="sticky top-0 z-10 flex h-[60px] shrink-0 items-center justify-between bg-pine-800 px-6">
                <div className="flex items-center gap-4">
                    <span className="flex items-center rounded-lg bg-white px-2.5 py-1"><img src="/logo.png" alt="Opera Echo" className="block h-[30px] w-auto" /></span>
                    <h1 className="m-0 text-[17px] font-semibold text-white">Indicadores APS 2026</h1>
                </div>
                <MenuUnidade unidade={unidade} aoSair={sair} />
            </header>
            <main className="app-content mx-auto box-border w-full max-w-[1440px] flex-1 px-7 pt-[22px] pb-7">
                <GuiaIndicadores />
            </main>
            <footer className="border-0 border-t border-solid border-line bg-white p-5 text-center text-[13px] leading-relaxed text-text-2">
                Eco Sistemas - Opera Echo © 2026<br />
                Material de apoio baseado nos Guias de Bolso (CONASEMS) e nas Notas Metodológicas do Ministério da Saúde, atualizadas em 02/10/2026 · sisaps.saude.gov.br
            </footer>
        </div>
    );
}
