/* Submenu Projetos: o usuário escolhe a lotação e a tela opera travada nela.
   O isolamento real é garantido pelo backend (rotas /projetos/* e escopo). */
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CHAVE_LOTACAO_PROJETO } from '@/shared/auth/session';
import { listarMinhasLotacoes, type LotacaoResumo } from '@/shared/catalogos';
import { logErro } from '@/shared/lib';
import { Select } from '@/shared/ui/Campos';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import Icon from '@/shared/ui/Icon';
import { Badge, Card, PageHeader } from '@/shared/ui/Pagina';

const AtividadesPage = lazy(() => import('@/features/atividades/AtividadesPage').then((m) => ({ default: m.AtividadesPage })));
const EscalasPage = lazy(() => import('@/features/escalas/EscalasPage').then((m) => ({ default: m.EscalasPage })));
const HoraExtraPage = lazy(() => import('@/features/horaExtra/HoraExtraPage').then((m) => ({ default: m.HoraExtraPage })));
const SolicitacaoFeriasPage = lazy(() => import('@/features/ferias/SolicitacaoFeriasPage').then((m) => ({ default: m.SolicitacaoFeriasPage })));

const API_PROJETOS = '/projetos';

export type TelaProjetos = 'atividades' | 'hora-extra' | 'escalas' | 'ferias';

const TELAS: Record<TelaProjetos, { titulo: string; modulo: string }> = {
    atividades: { titulo: 'Registro de Atividades', modulo: 'proj_registro_atividades' },
    'hora-extra': { titulo: 'Horas Extras', modulo: 'proj_hora_extra' },
    escalas: { titulo: 'Gerador de Escalas', modulo: 'proj_escala' },
    ferias: { titulo: 'Solicitação de Férias', modulo: 'proj_ferias_solicitacao' }
};

/** A lotação escolhida fica na URL e acompanha a troca de tela durante a sessão. */
function useLotacaoProjeto() {
    const [parametros, setParametros] = useSearchParams();
    const [dados, setDados] = useState<{ lotacoes: LotacaoResumo[]; global: boolean } | null>(null);

    useEffect(() => {
        let ativo = true;
        listarMinhasLotacoes()
            .then((resposta) => { if (ativo) setDados(resposta); })
            .catch((falha: unknown) => {
                logErro('Erro ao listar lotações', falha);
                if (ativo) setDados({ lotacoes: [], global: false });
            });
        return () => { ativo = false; };
    }, []);

    const lotacoes = dados?.lotacoes;
    const pedida = parametros.get('lotacao') ?? sessionStorage.getItem(CHAVE_LOTACAO_PROJETO) ?? '';
    const naLista = lotacoes?.some((lotacao) => String(lotacao.id_projeto) === pedida);
    // Com uma única lotação não há o que escolher.
    const unica = lotacoes?.length === 1 ? String(lotacoes[0]?.id_projeto) : '';
    const lotacao = naLista ? pedida : unica;

    const selecionar = useCallback((nova: string) => {
        if (nova) sessionStorage.setItem(CHAVE_LOTACAO_PROJETO, nova);
        else sessionStorage.removeItem(CHAVE_LOTACAO_PROJETO);
        setParametros(nova ? { lotacao: nova } : {}, { replace: true });
    }, [setParametros]);

    return { lotacoes, global: dados?.global ?? false, lotacao, selecionar };
}

function TelaDaLotacao({ tela, lotacao }: { tela: TelaProjetos; lotacao: string }) {
    const { modulo } = TELAS[tela];
    const comum = { modulo, lotacaoFixa: lotacao };

    const conteudo: Record<TelaProjetos, () => ReactNode> = {
        atividades: () => <AtividadesPage {...comum} apiBase={API_PROJETOS} />,
        escalas: () => <EscalasPage {...comum} apiBase={API_PROJETOS} />,
        ferias: () => <SolicitacaoFeriasPage {...comum} />,
        'hora-extra': () => <HoraExtraPage {...comum} apiBase={API_PROJETOS} />
    };

    return <Suspense fallback={<Carregando />}>{conteudo[tela]()}</Suspense>;
}

export function ProjetosPage({ tela }: { tela: TelaProjetos }) {
    const { lotacoes, global, lotacao, selecionar } = useLotacaoProjeto();

    return (
        <>
            <Card className="mb-[18px] flex items-center gap-3 px-4 py-2.5">
                <label htmlFor="pj-lotacao" className="flex items-center gap-2 text-[13px] font-semibold text-ink"><Icon n="pin" className="text-pine" /> Lotação</label>
                <Select id="pj-lotacao" className="w-80" value={lotacao} onChange={(e) => selecionar(e.target.value)}>
                    <option value="">Selecione a lotação...</option>
                    {(lotacoes ?? []).map((item) => <option key={item.id_projeto} value={item.id_projeto}>{item.nome_projeto}</option>)}
                </Select>
            </Card>
            {/* Com a lotação escolhida, o título, o balão e as ações ficam no cabeçalho da própria tela. */}
            {!lotacao && <PageHeader titulo={TELAS[tela].titulo} />}
            {!lotacoes && <Carregando />}
            {lotacoes?.length === 0 && <Aviso titulo="Nenhuma lotação vinculada">Nenhuma lotação está vinculada ao seu acesso. Procure um Gerente ou Coordenador de Implantação.</Aviso>}
            {Boolean(lotacoes?.length) && !lotacao && (
                <Aviso titulo="Selecione a lotação" acao={global ? <Badge tom="marca">Você tem visão global</Badge> : undefined}>Escolha a lotação acima para começar.</Aviso>
            )}
            {lotacao && <TelaDaLotacao key={`${tela}-${lotacao}`} tela={tela} lotacao={lotacao} />}
        </>
    );
}
