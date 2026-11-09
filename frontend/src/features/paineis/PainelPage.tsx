import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { RequireAcesso } from '@/app/guards';
import { PAINEIS } from '@/app/navegacao';
import { PainelMapa } from '@/features/paineis/PainelMapa';
import { PainelMetricas, PainelProdutividade, PainelProdutos } from '@/features/paineis/PaineisEquipe';
import { periodoBloqueado } from '@/shared/periodo';
import { useParametrosUrl, useVoltar } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Campos';
import { Aviso } from '@/shared/ui/Estados';
import { PageHeader } from '@/shared/ui/Pagina';

const CHAVE_MAPA = 'implatacao_consolidada';
const CHAVE_PRODUTIVIDADE = 'produtividade';
const CHAVE_METRICAS = 'metricas_implantacao';

function FiltroPeriodo({ dataInicio, dataFim, aoAplicar }: { dataInicio: string; dataFim: string; aoAplicar: (inicio: string, fim: string) => void }) {
    const [inicio, setInicio] = useState(dataInicio);
    const [fim, setFim] = useState(dataFim);

    const aplicar = (evento: FormEvent) => {
        evento.preventDefault();
        if (!periodoBloqueado(inicio, fim)) aoAplicar(inicio, fim);
    };

    return (
        <form onSubmit={aplicar} className="flex items-center gap-2">
            <Input aria-label="Data inicial" type="date" min="1900-01-01" max="2100-12-31" className="w-[150px]" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            <span className="text-xs text-text-2">até</span>
            <Input aria-label="Data final" type="date" min="1900-01-01" max="2100-12-31" className="w-[150px]" value={fim} onChange={(e) => setFim(e.target.value)} />
            <Button type="submit">Filtrar</Button>
            <Button variant="secondary" onClick={() => { setInicio(''); setFim(''); aoAplicar('', ''); }}>Limpar</Button>
        </form>
    );
}

function ConteudoPainel({ chave, titulo }: { chave: string; titulo: string }) {
    const voltar = useVoltar();
    const [parametros, alterarUrl] = useParametrosUrl();
    const dataInicio = parametros.get('inicio') ?? '';
    const dataFim = parametros.get('fim') ?? '';
    const periodo = useMemo(() => ({ dataInicio, dataFim }), [dataInicio, dataFim]);
    const usaPeriodo = [CHAVE_MAPA, CHAVE_PRODUTIVIDADE, CHAVE_METRICAS].includes(chave);

    return (
        <>
            <PageHeader
                titulo={titulo}
                acoes={(
                    <>
                        {usaPeriodo && <FiltroPeriodo dataInicio={dataInicio} dataFim={dataFim} aoAplicar={(inicio, fim) => alterarUrl({ inicio, fim })} />}
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                    </>
                )}
            />
            {chave === CHAVE_MAPA && <PainelMapa periodo={periodo} />}
            {chave === CHAVE_PRODUTIVIDADE && <PainelProdutividade periodo={periodo} />}
            {chave === CHAVE_METRICAS && <PainelMetricas periodo={periodo} />}
            {!usaPeriodo && <PainelProdutos />}
        </>
    );
}

export function PainelPage() {
    const { painel: slug } = useParams();
    const painel = PAINEIS.find((item) => item.slug === slug);
    if (!painel) return <Aviso titulo="Página não encontrada" />;
    return (
        <RequireAcesso modulos={[painel.modulo]}>
            <ConteudoPainel key={painel.chave} chave={painel.chave} titulo={painel.titulo} />
        </RequireAcesso>
    );
}
