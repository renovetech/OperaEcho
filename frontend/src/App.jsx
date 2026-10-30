/* ARQUIVO: src/App.js */
import React, { useEffect } from 'react';
import { ativarEnterBusca } from './enterBusca';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Login from './Login';
import Dashboard from './Dashboard';
import IndicadoresPublicoAPS from './IndicadoresPublicoAPS';
import GeradorNota from './GeradorNota';
import PainelPlanoAcao from './PainelPlanoAcao';
import PainelProjetoPublico from './PainelProjetoPublico';
import SigtapPublico from './SigtapPublico';
import RodapeSistema from './components/RodapeSistema';
// Tema global importado também aqui: garante tokens de cor e ícones
// mesmo se o index.js do ambiente de deploy não importar estes arquivos.
import './theme.css';
import './polish.css';
import './App.css';
import './design.css';
import './efeitos.css';

function PainelPlanoPublico() {
  const { token } = useParams();
  return <PainelPlanoAcao modo="publico" token={token || null} />;
}

function App() {
  // Enter nos campos de busca aciona o botão Filtrar/Pesquisar da tela
  useEffect(() => ativarEnterBusca(), []);
  return (
    <Router>
      <Routes>
        {/* ROTA PÚBLICA (Login) */}
        <Route path="/" element={
          <RotaPublica><Login /></RotaPublica>
        } />

        {/* ROTAS PÚBLICAS LIVRES */}
        <Route path="/indicadoresaps" element={<IndicadoresPublicoAPS />} />
        <Route path="/dark" element={<GeradorNota />} />

        {/* PAINÉIS PÚBLICOS DO PLANO DE AÇÃO (somente leitura) */}
        <Route path="/painel-plano-acao" element={<PainelPlanoPublico />} />
        <Route path="/painel-plano-acao/:token" element={<PainelPlanoPublico />} />

        {/* ROTA PROTEGIDA (Dashboard) */}
        <Route path="/dashboard" element={
          <RotaPrivada><Dashboard /></RotaPrivada>
        } />

        {/* Consulta SIGTAP PÚBLICA (operaecho.com/sigtap): sem login abre a página pública;
            logado, abre a mesma consulta dentro do sistema (Operações > Consulta SIGTAP). */}
        <Route path="/sigtap" element={<SigtapRota />} />

        {/* PAINEL PÚBLICO DO PROJETO (operaecho.com/paraiba, /para, ...) - habilitado em Cadastro > Projetos.
            Slug inexistente/não público redireciona para a raiz, como antes. */}
        <Route path="/:slug" element={<PainelProjetoPublico />} />

        {/* Qualquer rota desconhecida redireciona para a raiz */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

// Barra fixa de rodapé só na área logada (login e páginas públicas ficam sem).
const ComRodape = ({ children }) => <>{children}<RodapeSistema /></>;

function RotaPrivada({ children }) {
  const token = sessionStorage.getItem('token_opera');
  const usuario = sessionStorage.getItem('usuario_opera');
  return (token && usuario) ? <ComRodape>{children}</ComRodape> : <Navigate to="/" />;
}

function SigtapRota() {
  const logado = sessionStorage.getItem('token_opera') && sessionStorage.getItem('usuario_opera');
  return logado ? <ComRodape><Dashboard telaInicial="sigtap" /></ComRodape> : <SigtapPublico />;
}

function RotaPublica({ children }) {
  const token = sessionStorage.getItem('token_opera');
  const usuario = sessionStorage.getItem('usuario_opera');
  return (token && usuario) ? <Navigate to="/dashboard" /> : children;
}

export default App;
