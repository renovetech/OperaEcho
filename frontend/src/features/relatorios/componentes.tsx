/* Molde das telas de relatório: cabeçalho com exportações, painel de filtros e a folha do documento. */
import { useState, type ReactNode, type Ref } from 'react';
import Icon from '@/shared/ui/Icon';
import { REGRAS_RELATORIOS } from '@/features/relatorios/regrasRelatorios';
import { useAuth } from '@/shared/auth/AuthContext';
import { useVoltar } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Campos';
import { Timbre } from '@/shared/ui/DocumentoFormal';
import { Card, PageHeader } from '@/shared/ui/Pagina';

export { AvisoDoc, BotaoLinha, ChipDoc, FaixaIndicadores, SecaoDoc, SeloDoc, SubLinha, TabelaDoc, TdDoc, ThDoc } from '@/shared/ui/DocumentoFormal';

export const useNomeUsuario = () => {
    const { usuario, nomeExibicao } = useAuth();
    return usuario.nome_completo || nomeExibicao;
};

interface ModeloProps {
    chave: string;
    titulo: string;
    /** Relatório que gera ao trocar o filtro não mostra o botão. */
    aoFiltrar?: () => void;
    carregando?: boolean;
    acaoExtra?: ReactNode;
    aoPdf: () => void;
    aoJpg: () => void;
    aoExcel?: () => void;
    filtros: ReactNode;
    children: ReactNode;
}

export function ModeloRelatorio({ chave, titulo, aoFiltrar, carregando, acaoExtra, aoPdf, aoJpg, aoExcel, filtros, children }: ModeloProps) {
    const voltar = useVoltar();
    return (
        <>
            <PageHeader
                titulo={titulo}
                ajuda={REGRAS_RELATORIOS[chave]}
                acoes={(
                    <>
                        <Button variant="secondary" onClick={aoPdf}><Icon n="printer" /> PDF</Button>
                        <Button variant="secondary" onClick={aoJpg}><Icon n="camera" /> JPG</Button>
                        {aoExcel && <Button variant="secondary" onClick={aoExcel}><Icon n="grid" /> Excel</Button>}
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                    </>
                )}
            />
            <Card className="mb-4 px-4 py-3.5">
                <form className="[&_input:not([type=checkbox])]:h-10 [&_select]:h-10" onSubmit={(evento) => { evento.preventDefault(); aoFiltrar?.(); }}>
                    <div className="grid grid-cols-5 items-end gap-3">{filtros}</div>
                    {(aoFiltrar || acaoExtra) && (
                        <div className="mt-3 flex items-center justify-between gap-4 border-0 border-t border-solid border-line-2 pt-3">
                            <div className="flex flex-wrap items-center gap-5">{acaoExtra}</div>
                            {aoFiltrar && <Button type="submit" isLoading={carregando}><Icon n="search" /> Gerar relatório</Button>}
                        </div>
                    )}
                </form>
            </Card>
            {children}
        </>
    );
}

export function CampoData({ rotulo, id, valor, aoMudar }: { rotulo: string; id: string; valor: string; aoMudar: (valor: string) => void }) {
    return <Field rotulo={rotulo} htmlFor={id}><Input id={id} type="date" min="1900-01-01" max="2100-12-31" value={valor} onChange={(e) => aoMudar(e.target.value)} /></Field>;
}

interface DocumentoProps {
    titulo: string;
    subtitulo: string;
    referencia: Ref<HTMLDivElement>;
    children: ReactNode;
}

/** A folha do relatório: é ela que vai para o JPG. */
export function Documento({ titulo, subtitulo, referencia, children }: DocumentoProps) {
    const usuario = useNomeUsuario();
    const [gerado] = useState(() => new Date().toLocaleString('pt-BR'));
    return (
        <div ref={referencia} className="box-border w-full rounded-[4px] border border-solid border-line bg-white px-10 py-8 text-[#1e293b] shadow-card">
            <Timbre titulo={titulo} subtitulo={subtitulo} emissao={`Emitido em ${gerado} por ${usuario}`} />
            {children}
        </div>
    );
}
