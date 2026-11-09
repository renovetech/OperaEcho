/* Barra fixa no rodapé: nome do sistema, IP da máquina (como o servidor a vê) e versão. */
import { useEffect, useState } from 'react';
import api from '@/shared/api';
import { NOME_SISTEMA, VERSAO_SISTEMA } from '@/shared/versao';

export function Rodape() {
    const [ip, setIp] = useState('...');

    useEffect(() => {
        let vigente = true;
        api.get<{ ip?: string }>('/sistema/info')
            .then(({ data }) => { if (vigente) setIp(data.ip ?? '-'); })
            .catch(() => { if (vigente) setIp('-'); });
        return () => { vigente = false; };
    }, []);

    return (
        <footer role="contentinfo" className="fixed inset-x-0 bottom-0 z-[900] box-border flex h-[30px] items-center justify-between gap-4 overflow-hidden border-0 border-t border-solid border-line bg-white px-6 text-xs whitespace-nowrap text-muted print:hidden">
            <span className="truncate font-semibold">{NOME_SISTEMA}</span>
            <span className="flex gap-[18px]">
                <span>IP: <b className="font-mono font-semibold text-ink">{ip}</b></span>
                <span>Versão: <b className="font-mono font-semibold text-ink">{VERSAO_SISTEMA}</b></span>
            </span>
        </footer>
    );
}
