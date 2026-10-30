/* ARQUIVO: src/components/RodapeSistema.js
 * Barra fixa no rodapé: nome do sistema, IP da máquina (como o servidor a vê) e versão.
 * Enquanto montada, reserva a altura no layout via classe "com-rodape" no <body>. */
import React, { useEffect, useState } from 'react';
import api from '../api';
import { NOME_SISTEMA, VERSAO_SISTEMA } from '../versao';
import './RodapeSistema.css';

export default function RodapeSistema() {
    const [ip, setIp] = useState('...');

    useEffect(() => {
        document.body.classList.add('com-rodape');
        let vivo = true;
        api.get('/sistema/info').then(r => { if (vivo) setIp(r.data.ip || '-'); }).catch(() => { if (vivo) setIp('-'); });
        return () => { vivo = false; document.body.classList.remove('com-rodape'); };
    }, []);

    return (
        <footer className="rodape-sistema" role="contentinfo">
            <span className="rodape-nome">{NOME_SISTEMA}</span>
            <span className="rodape-dados">
                <span>IP: <b>{ip}</b></span>
                <span>Versão: <b>{VERSAO_SISTEMA}</b></span>
            </span>
        </footer>
    );
}
