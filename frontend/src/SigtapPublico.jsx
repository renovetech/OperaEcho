/* ARQUIVO: src/SigtapPublico.js
 * operaecho.com/sigtap aberto SEM login: Consulta SIGTAP pública, com cabeçalho
 * próprio (logo + acesso ao sistema). Quem já está logado vê a mesma tela dentro
 * do Dashboard (ver App.js). Só leitura - a importação fica em Parâmetros. */
import React, { useEffect } from 'react';
import Icon from './components/Icon';
import SigtapConsulta from './SigtapConsulta';
import './SigtapConsulta.css';

const logo = `/logo.png`;

export default function SigtapPublico() {
    // Mesmo visual da área logada (design.css / efeitos.css)
    useEffect(() => {
        document.body.classList.add('oe-app');
        return () => document.body.classList.remove('oe-app');
    }, []);

    return (
        <div className="sgp">
            <header className="sgp-topo">
                <a href="/" className="sgp-marca" title="Opera Echo">
                    <img src={logo} alt="Opera Echo" />
                </a>
                <a href="/" className="sgp-entrar"><Icon n="user" /> <span>Entrar no sistema</span></a>
            </header>
            <main className="sgp-conteudo sg-container app-content">
                <SigtapConsulta />
            </main>
            <footer className="sgp-rodape">
                Base local da Tabela Unificada do SUS (SIGTAP/DATASUS), atualizada pela equipe Opera Echo.
                Em caso de divergência, prevalece a publicação oficial do Ministério da Saúde.
            </footer>
        </div>
    );
}
