import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router-dom';
import { RequireAcesso, RotaPublica, RouteError } from '@/app/guards';
import { AppLayout } from '@/app/layout/AppLayout';
import { temSessao } from '@/shared/auth/session';
import { Carregando } from '@/shared/ui/Estados';

const LoginPage = lazy(() => import('@/features/login/LoginPage').then((m) => ({ default: m.LoginPage })));
const HoraExtraPage = lazy(() => import('@/features/horaExtra/HoraExtraPage').then((m) => ({ default: m.HoraExtraPage })));
const InicioPage = lazy(() => import('@/features/inicio/pages/InicioPage'));
const AlterarSenhaPage = lazy(() => import('@/features/conta/pages/AlterarSenhaPage'));
const AprovacaoAcessoPage = lazy(() => import('@/features/acessos/pages/AprovacaoAcessoPage'));

const ListaProdutosPage = lazy(() => import('@/features/cadastros/produtos/ProdutosPage').then((m) => ({ default: m.ListaProdutosPage })));
const FormProdutoPage = lazy(() => import('@/features/cadastros/produtos/ProdutosPage').then((m) => ({ default: m.FormProdutoPage })));
const ListaProjetosPage = lazy(() => import('@/features/cadastros/projetos/ProjetosPage').then((m) => ({ default: m.ListaProjetosPage })));
const FormProjetoPage = lazy(() => import('@/features/cadastros/projetos/ProjetosPage').then((m) => ({ default: m.FormProjetoPage })));
const ListaUnidadesPage = lazy(() => import('@/features/cadastros/unidades/UnidadesPage').then((m) => ({ default: m.ListaUnidadesPage })));
const FormUnidadePage = lazy(() => import('@/features/cadastros/unidades/UnidadesPage').then((m) => ({ default: m.FormUnidadePage })));
const ListaUsuariosPage = lazy(() => import('@/features/cadastros/usuarios/UsuariosPage').then((m) => ({ default: m.ListaUsuariosPage })));
const FormUsuarioPage = lazy(() => import('@/features/cadastros/usuarios/UsuariosPage').then((m) => ({ default: m.FormUsuarioPage })));
const RegioesPage = lazy(() => import('@/features/cadastros/regioes/RegioesPage').then((m) => ({ default: m.RegioesPage })));
const PerfisPage = lazy(() => import('@/features/cadastros/perfis/PerfisPage').then((m) => ({ default: m.PerfisPage })));
const ParametrosPage = lazy(() => import('@/features/parametros/ParametrosPage').then((m) => ({ default: m.ParametrosPage })));
const LinksPage = lazy(() => import('@/features/links/LinksPage').then((m) => ({ default: m.LinksPage })));
const IndicadoresPage = lazy(() => import('@/features/indicadoresAps/IndicadoresPage').then((m) => ({ default: m.IndicadoresPage })));
const PainelProjetoPage = lazy(() => import('@/features/painelProjeto/PainelProjetoPage').then((m) => ({ default: m.PainelProjetoPage })));
const IndicadoresSistemaPage = lazy(() => import('@/features/indicadoresAps/IndicadoresPage').then((m) => ({ default: m.IndicadoresSistemaPage })));
const RelatorioPage = lazy(() => import('@/features/relatorios/RelatorioPage').then((m) => ({ default: m.RelatorioPage })));
const RelatoriosInicioPage = lazy(() => import('@/features/relatorios/RelatorioPage').then((m) => ({ default: m.RelatoriosInicioPage })));
const PainelPage = lazy(() => import('@/features/paineis/PainelPage').then((m) => ({ default: m.PainelPage })));
const LancamentoPage = lazy(() => import('@/features/faturamento/LancamentoPage').then((m) => ({ default: m.LancamentoPage })));
const ConsolidadoPage = lazy(() => import('@/features/faturamento/ConsolidadoPage').then((m) => ({ default: m.ConsolidadoPage })));
const ListaPlanosPage = lazy(() => import('@/features/planoAcao/ListaPlanosPage').then((m) => ({ default: m.ListaPlanosPage })));
const NovoPlanoPage = lazy(() => import('@/features/planoAcao/NovoPlanoPage').then((m) => ({ default: m.NovoPlanoPage })));
const DetalhesPlanoPage = lazy(() => import('@/features/planoAcao/DetalhesPlanoPage').then((m) => ({ default: m.DetalhesPlanoPage })));
const PainelPlanoPage = lazy(() => import('@/features/planoAcao/PainelPlanoPage').then((m) => ({ default: m.PainelPlanoPage })));
const PainelPlanoPublicoPage = lazy(() => import('@/features/planoAcao/PainelPlanoPage').then((m) => ({ default: m.PainelPlanoPublicoPage })));
const SolicitacaoFeriasPage = lazy(() => import('@/features/ferias/SolicitacaoFeriasPage').then((m) => ({ default: m.SolicitacaoFeriasPage })));
const AprovacaoFeriasPage = lazy(() => import('@/features/ferias/AprovacaoFeriasPage').then((m) => ({ default: m.AprovacaoFeriasPage })));
const ProjetosPage = lazy(() => import('@/features/projetos/ProjetosPage').then((m) => ({ default: m.ProjetosPage })));
const AtividadesPage = lazy(() => import('@/features/atividades/AtividadesPage').then((m) => ({ default: m.AtividadesPage })));
const EscalasPage = lazy(() => import('@/features/escalas/EscalasPage').then((m) => ({ default: m.EscalasPage })));
const SigtapPage = lazy(() => import('@/features/sigtap/ConsultaPage').then((m) => ({ default: m.SigtapPage })));
const SigtapPublicoPage = lazy(() => import('@/features/sigtap/ConsultaPage').then((m) => ({ default: m.SigtapPublicoPage })));

const protegida = (path: string, modulos: string[], elemento: ReactNode): RouteObject => ({
    path,
    element: <RequireAcesso modulos={modulos}>{elemento}</RequireAcesso>
});

const rotasDoSistema: RouteObject[] = [
    { index: true, element: <InicioPage /> },
    { path: 'conta/senha', element: <AlterarSenhaPage /> },
    { path: 'acessos/aprovacao/:id', element: <AprovacaoAcessoPage /> },

    protegida('cadastros/usuarios', ['usuarios'], <ListaUsuariosPage />),
    protegida('cadastros/usuarios/novo', ['usuarios'], <FormUsuarioPage />),
    protegida('cadastros/usuarios/:id', ['usuarios'], <FormUsuarioPage />),
    protegida('cadastros/produtos', ['produtos'], <ListaProdutosPage />),
    protegida('cadastros/produtos/novo', ['produtos'], <FormProdutoPage />),
    protegida('cadastros/produtos/:id', ['produtos'], <FormProdutoPage />),
    protegida('cadastros/projetos', ['projetos'], <ListaProjetosPage />),
    protegida('cadastros/projetos/novo', ['projetos'], <FormProjetoPage />),
    protegida('cadastros/projetos/:id', ['projetos'], <FormProjetoPage />),
    protegida('cadastros/unidades', ['unidades'], <ListaUnidadesPage />),
    protegida('cadastros/unidades/novo', ['unidades'], <FormUnidadePage />),
    protegida('cadastros/unidades/:id', ['unidades'], <FormUnidadePage />),
    protegida('cadastros/regioes', ['regioes'], <RegioesPage />),
    protegida('cadastros/perfis', ['perfis'], <PerfisPage />),
    protegida('parametros/:aba?', ['parametros'], <ParametrosPage />),

    protegida('implantacao/atividades', ['registro_atividades'], <AtividadesPage />),
    protegida('implantacao/hora-extra', ['hora_extra'], <HoraExtraPage />),
    protegida('implantacao/escalas', ['escala'], <EscalasPage />),
    protegida('implantacao/ferias', ['ferias_solicitacao'], <SolicitacaoFeriasPage />),

    protegida('projetos/atividades', ['proj_registro_atividades'], <ProjetosPage tela="atividades" />),
    protegida('projetos/hora-extra', ['proj_hora_extra'], <ProjetosPage tela="hora-extra" />),
    protegida('projetos/escalas', ['proj_escala'], <ProjetosPage tela="escalas" />),
    protegida('projetos/ferias', ['proj_ferias_solicitacao'], <ProjetosPage tela="ferias" />),

    protegida('gestao/ferias', ['ferias_gestao'], <AprovacaoFeriasPage />),
    protegida('links', ['links_externos'], <LinksPage />),

    protegida('plano-acao', ['plano_acao'], <ListaPlanosPage />),
    protegida('plano-acao/novo', ['plano_acao'], <NovoPlanoPage />),
    protegida('plano-acao/painel', ['painel_plano_acao', 'plano_acao'], <PainelPlanoPage />),
    protegida('plano-acao/:id', ['plano_acao'], <DetalhesPlanoPage />),

    { path: 'paineis/:painel', element: <PainelPage /> },
    protegida('faturamento/lancamento', ['faturamento_lancar'], <LancamentoPage />),
    protegida('faturamento/consolidado', ['painel_faturamento'], <ConsolidadoPage />),
    protegida('indicadores-aps', ['indicadores_aps'], <IndicadoresSistemaPage />),

    { path: 'relatorios', element: <RelatoriosInicioPage /> },
    { path: 'relatorios/:relatorio', element: <RelatorioPage /> },

    { path: '*', element: <Navigate to="/system" replace /> }
];

/** /sigtap é pública; com sessão, abre dentro do sistema. */
function SigtapEntrada() {
    return temSessao() ? <AppLayout /> : <SigtapPublicoPage />;
}

function Raiz() {
    return (
        <Suspense fallback={<Carregando />}>
            <Outlet />
        </Suspense>
    );
}

export const router = createBrowserRouter([
    {
        element: <Raiz />,
        errorElement: <RouteError />,
        children: [
            { path: '/', element: <RotaPublica><LoginPage /></RotaPublica> },
            { path: '/dashboard', element: <Navigate to="/system" replace /> },
            { path: '/system', element: <AppLayout />, errorElement: <RouteError />, children: rotasDoSistema },
            {
                path: '/sigtap',
                element: <SigtapEntrada />,
                children: [{ index: true, element: <RequireAcesso modulos={['sigtap']}><SigtapPage /></RequireAcesso> }]
            },
            { path: '/indicadoresaps', element: <IndicadoresPage /> },
            { path: '/painel-plano-acao/:token?', element: <PainelPlanoPublicoPage /> },
            { path: '/:slug', element: <PainelProjetoPage /> },
            { path: '*', element: <Navigate to="/" replace /> }
        ]
    }
]);
