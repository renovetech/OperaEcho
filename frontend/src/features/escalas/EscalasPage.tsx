import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Icon from '@/shared/ui/Icon';
import type { Colaborador, FormEscala } from '@/features/escalas/api';
import { EditorEscala } from '@/features/escalas/EditorEscala';
import { salvarJpg, salvarPdf } from '@/features/escalas/exportacao';
import { foraDaVigencia, useEscalas, type CelulaEscala } from '@/features/escalas/hooks';
import { GradeEscala } from '@/features/escalas/GradeEscala';
import { useAuth } from '@/shared/auth/AuthContext';
import { aviso, erro, fecharMensagem, mostrarCarregando } from '@/shared/feedback';
import { useVoltar } from '@/shared/hooks';
import { formatarDiaMes, logErro } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Carregando } from '@/shared/ui/Estados';
import { PageHeader } from '@/shared/ui/Pagina';

interface EscalasPageProps {
    /** Módulo de permissão: Implantação (padrão) ou Projetos. */
    modulo?: string;
    /** No submenu Projetos, a tela opera travada na lotação escolhida. */
    lotacaoFixa?: string;
    apiBase?: string;
}

export function EscalasPage({ modulo = 'escala', lotacaoFixa, apiBase = '' }: EscalasPageProps) {
    const voltar = useVoltar();
    const { usuario, nomeExibicao, podeAcao } = useAuth();
    const podeEditar = podeAcao(modulo, 'pode_editar');
    const escala = useEscalas({ apiBase, lotacao: lotacaoFixa });
    const folha = useRef<HTMLDivElement>(null);
    const [celula, setCelula] = useState<CelulaEscala | null>(null);
    const [copiado, setCopiado] = useState<FormEscala | null>(null);
    const [geradaEm, setGeradaEm] = useState(() => new Date());
    const periodo = `${formatarDiaMes(escala.inicio)} a ${formatarDiaMes(escala.fim)}`;

    const abrir = (colaborador: Colaborador, dia: string) => {
        if (!podeEditar) {
            aviso('Você não tem permissão para editar a escala.', 'Acesso restrito');
            return;
        }
        if (foraDaVigencia(colaborador, dia)) return;
        setCelula({ colaborador, dia, item: escala.itemDe(colaborador.id_usuario, dia) });
    };

    const exportar = async (salvar: (elemento: HTMLElement, nome: string) => Promise<void>) => {
        if (!folha.current) return;
        flushSync(() => setGeradaEm(new Date()));
        mostrarCarregando('Gerando exportação...', 'Aguarde enquanto processamos a imagem.');
        try {
            await salvar(folha.current, `Escala_${escala.inicio}`);
            fecharMensagem();
        } catch (falha) {
            logErro('Erro ao exportar a escala', falha);
            erro('Falha ao gerar a exportação.');
        }
    };

    return (
        <>
            <PageHeader
                titulo="Gerador de Escalas"
                ajuda={"Clique em um dia para lançar. A escala da semana pode ser exportada em JPG ou PDF.\nCom os avisos ligados em Parâmetros > WhatsApp, a equipe recebe a escala da semana no dia e hora definidos. Alterações são agrupadas: a mensagem só sai depois do tempo de espera sem novas mudanças."}
                acoes={(
                    <>
                        <div className="flex items-center gap-1 rounded-lg border border-solid border-line bg-white p-0.5">
                            <Button variant="ghost" size="sm" aria-label="Semana anterior" onClick={() => escala.mudarSemana(-1)}><Icon n="arrow-left" /></Button>
                            <span className="min-w-[116px] text-center text-[13px] font-semibold text-ink tabular-nums">{periodo}</span>
                            <Button variant="ghost" size="sm" aria-label="Próxima semana" onClick={() => escala.mudarSemana(1)}><Icon n="arrow-right" /></Button>
                        </div>
                        <Button variant="secondary" onClick={() => exportar(salvarJpg)}><Icon n="camera" /> Salvar JPG</Button>
                        <Button variant="secondary" onClick={() => exportar(salvarPdf)}><Icon n="printer" /> Gerar PDF</Button>
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                    </>
                )}
            />

            {escala.colaboradores === null ? <Carregando /> : (
                <div ref={folha} className="group/folha box-border rounded-[10px] bg-white p-5 shadow-card data-[exportando]:rounded-none data-[exportando]:shadow-none">
                    <div className="mb-3 hidden items-center justify-between border-0 border-b-2 border-solid border-pine pb-2.5 group-data-[exportando]/folha:flex">
                        <div>
                            <h2 className="m-0 text-[23px] font-bold text-pine">Gerador de Escalas</h2>
                            <p className="m-0 mt-1 text-sm font-semibold text-pine-800">Semana de {periodo}</p>
                        </div>
                        <img src="/logo.png" alt="Opera Echo" className="block h-(--altura-logo) w-auto" />
                    </div>
                    <p className="m-0 mb-3 px-1 text-[15px] text-[#333333] italic group-data-[exportando]/folha:text-[13px]">
                        <b className="font-bold text-[#c62828] not-italic">Observação:</b> Durante esta semana, a escala poderá sofrer alterações a qualquer momento, dependendo do surgimento de novas frentes de trabalho.
                    </p>
                    <GradeEscala colaboradores={escala.colaboradores} dias={escala.dias} itemDe={escala.itemDe} aoAbrir={abrir} />
                    <div className="mt-3 hidden justify-between text-xs text-text-2 group-data-[exportando]/folha:flex">
                        <span>Opera Echo Management System</span>
                        <span><b>Escala gerada por:</b> {usuario.nome_completo || nomeExibicao} | <b>Data:</b> {geradaEm.toLocaleString('pt-BR')}</span>
                    </div>
                </div>
            )}

            {celula && escala.colaboradores && (
                <EditorEscala
                    key={`${celula.colaborador.id_usuario}-${celula.dia}`}
                    apiBase={apiBase}
                    lotacao={lotacaoFixa}
                    celula={celula}
                    colaboradores={escala.colaboradores}
                    dias={escala.dias}
                    copiado={copiado}
                    aoCopiar={setCopiado}
                    aoFechar={() => setCelula(null)}
                    aoConcluir={() => {
                        setCelula(null);
                        escala.recarregar();
                    }}
                />
            )}
        </>
    );
}
