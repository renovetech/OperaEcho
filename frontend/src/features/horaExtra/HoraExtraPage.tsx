/* Lançamento de Hora Extra: histórico e formulário. Serve Implantação e, com apiBase e lotação, o submenu Projetos. */
import { useEffect, useRef, useState } from 'react';
import Icon from '@/shared/ui/Icon';
import { excluirLancamento, listarLancamentos, type LancamentoResumo } from '@/features/horaExtra/api';
import { statusVisual } from '@/features/horaExtra/calculos';
import { salvarFolhaExcel, salvarFolhaJpg, salvarFolhaPdf, type DadosFolha } from '@/features/horaExtra/exportacao';
import { FolhaHoraExtra } from '@/features/horaExtra/FolhaHoraExtra';
import { JanelaCalculadora, JanelaJornada, PARAMETROS_INICIAIS } from '@/features/horaExtra/JanelasFerramentas';
import { useLancamento, type EstadoLancamento } from '@/features/horaExtra/useLancamento';
import { useAuth } from '@/shared/auth/AuthContext';
import { aviso, confirmar, erro, fecharMensagem, mensagemDeErro, mostrarCarregando, sucesso } from '@/shared/feedback';
import { useVoltar } from '@/shared/hooks';
import { logErro } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';
import { Esqueleto } from '@/shared/ui/Estados';
import { Badge, Card, PageHeader } from '@/shared/ui/Pagina';
import { AcaoEditar, LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

const AJUDA_FOLHA = 'Horas além da jornada padrão contam como extra. Sábado rende 50%; domingo e feriado, 100%. O adicional noturno cobre das 22h às 5h. Na virada da noite, o intervalo sai do maior período, e a virada de sexta para sábado segue a regra do sábado. Marque a unidade de cada dia para separar as horas por unidade; o lançamento guarda como principal a de mais horas.';
const AJUDA_LISTA = 'Lançamentos do mês, do mais recente para o mais antigo. O pendente passa a constar como pago a partir do dia 5 do segundo mês seguinte.';

interface HoraExtraProps {
    modulo?: string;
    apiBase?: string;
    lotacaoFixa?: string;
}

function ListaLancamentos({ lista, podeNovo, podeEditar, aoNovo, aoAbrir, aoExcluir }: {
    lista: LancamentoResumo[] | null;
    podeNovo: boolean;
    podeEditar: boolean;
    aoNovo: () => void;
    aoAbrir: (lancamento: LancamentoResumo) => void;
    aoExcluir: (id: number) => void;
}) {
    const voltar = useVoltar();
    return (
        <>
            <PageHeader
                titulo="Horas Extras"
                ajuda={AJUDA_LISTA}
                acoes={(
                    <>
                        {podeNovo && <Button onClick={aoNovo}><Icon n="plus" /> Novo lançamento</Button>}
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                    </>
                )}
            />
            {lista === null ? <Esqueleto /> : (
                <Tabela cabecalho={<><Th>Mês/Ano</Th><Th>Colaborador</Th><Th>Projeto</Th><Th centro>Situação</Th><Th centro>Ações</Th></>}>
                    {lista.length === 0 && <LinhaVazia colunas={5}>Nenhum registro encontrado.</LinhaVazia>}
                    {lista.map((item) => {
                        const situacao = statusVisual(item.status, item.mes_referencia);
                        return (
                            <tr key={item.id_lancamento}>
                                <Td>{item.mes_referencia.split('-').reverse().join('/')}</Td>
                                <Td>{item.colaborador}</Td>
                                <Td>{item.nome_projeto}</Td>
                                <Td centro><Badge tom={situacao === 'PAGO' ? 'marca' : 'neutro'}>{situacao}</Badge></Td>
                                <Td centro>
                                    <AcaoEditar podeEditar={podeEditar} aoEditar={() => aoAbrir(item)} />
                                    {podeEditar && (
                                        <button type="button" title="Excluir" aria-label="Excluir" onClick={() => aoExcluir(item.id_lancamento)} className="cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-danger hover:bg-danger-tint"><Icon n="trash" /></button>
                                    )}
                                </Td>
                            </tr>
                        );
                    })}
                </Tabela>
            )}
        </>
    );
}

function FiltrosFolha({ estado, travarProjeto }: { estado: EstadoLancamento; travarProjeto: boolean }) {
    const { idLancamento, mes, idUsuario, idProjeto, idUnidade, ehGestao, colaboradores, projetos, unidades, intervalo } = estado;
    return (
        <Card className="mb-4 px-4 py-3.5">
            <div className="grid grid-cols-[185px_1.5fr_1fr_1.3fr] items-end gap-3">
                <Field rotulo="Mês" htmlFor="he-mes"><Input id="he-mes" type="month" value={mes} disabled={Boolean(idLancamento)} onChange={(e) => estado.alterarMes(e.target.value)} /></Field>
                <Field rotulo="Colaborador" htmlFor="he-colaborador">
                    <Select id="he-colaborador" value={idUsuario} disabled={!ehGestao} onChange={(e) => estado.alterarColaborador(e.target.value)}>
                        <option value="">Selecione...</option>
                        {colaboradores.map((pessoa) => <option key={pessoa.id_usuario} value={pessoa.id_usuario}>{pessoa.nome_completo}</option>)}
                    </Select>
                </Field>
                <Field rotulo="Projeto" htmlFor="he-projeto">
                    <Select id="he-projeto" value={idProjeto} disabled={travarProjeto} onChange={(e) => void estado.selecionarProjeto(e.target.value)}>
                        <option value="">Selecione...</option>
                        {projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                    </Select>
                </Field>
                <Field rotulo="Unidade padrão" htmlFor="he-unidade" ajuda="Preenche só os dias úteis ainda sem unidade.">
                    <Select id="he-unidade" value={idUnidade} disabled={!idProjeto} onChange={(e) => estado.aplicarUnidadePadrao(e.target.value)}>
                        <option value="">Selecione...</option>
                        {unidades.map((unidade) => <option key={unidade.id_unidade} value={unidade.id_unidade}>{unidade.nome_unidade}</option>)}
                    </Select>
                </Field>
            </div>
            <div className="mt-3 grid grid-cols-[90px_90px_1fr_auto_auto] items-end gap-3 border-0 border-t border-solid border-line-2 pt-3">
                <Field rotulo="Do dia" htmlFor="he-de"><Input id="he-de" type="number" min="1" max="31" value={intervalo.de} onChange={(e) => estado.setIntervalo({ ...intervalo, de: e.target.value })} /></Field>
                <Field rotulo="Até o dia" htmlFor="he-ate"><Input id="he-ate" type="number" min="1" max="31" value={intervalo.ate} onChange={(e) => estado.setIntervalo({ ...intervalo, ate: e.target.value })} /></Field>
                <Field rotulo="Unidade do período" htmlFor="he-intervalo" ajuda="Atribui o projeto selecionado e esta unidade aos dias úteis do período.">
                    <Select id="he-intervalo" value={intervalo.id} disabled={!idProjeto} onChange={(e) => estado.setIntervalo({ ...intervalo, id: e.target.value })}>
                        <option value="">Selecione...</option>
                        {unidades.map((unidade) => <option key={unidade.id_unidade} value={unidade.id_unidade}>{unidade.nome_unidade}</option>)}
                    </Select>
                </Field>
                <Button variant="secondary" onClick={estado.aplicarNoIntervalo}>Aplicar no período</Button>
                <Button variant="secondary" disabled={!idUnidade} onClick={estado.aplicarPadraoEmTodos}>Aplicar padrão a todos</Button>
            </div>
        </Card>
    );
}

function FormularioLancamento({ estado, podeSalvar, podeExcluir, travarProjeto, aoSair, aoSalvo, aoExcluir }: {
    estado: EstadoLancamento;
    podeSalvar: boolean;
    podeExcluir: boolean;
    travarProjeto: boolean;
    aoSair: () => void;
    aoSalvo: () => void;
    aoExcluir: (id: number) => void;
}) {
    const { usuario, nomeExibicao } = useAuth();
    const folha = useRef<HTMLDivElement>(null);
    const [janela, setJanela] = useState<'jornada' | 'calculadora' | null>(null);
    const [parametros, setParametros] = useState(PARAMETROS_INICIAIS);
    const { colaboradores, projetos, unidades, idUsuario, idProjeto, idUnidade, idLancamento, porUnidade, nomeProjeto, nomeUnidade } = estado;

    const colaborador = colaboradores.find((pessoa) => String(pessoa.id_usuario) === idUsuario)?.nome_completo ?? '';
    const projetosDoMes = [...new Set(porUnidade.flatMap((item) => (item.id_projeto ? [item.id_projeto] : [])))];
    const projetoAtual = projetos.find((projeto) => String(projeto.id_projeto) === idProjeto)?.nome_projeto ?? 'N/A';
    const unidadeAtual = unidades.find((unidade) => String(unidade.id_unidade) === idUnidade)?.nome_unidade ?? 'N/A';
    const projetoResumo = projetosDoMes.length > 1 ? 'Vários projetos' : projetosDoMes[0] ? nomeProjeto(projetosDoMes[0]) : projetoAtual;
    const primeira = porUnidade[0];
    const unidadeResumo = porUnidade.length > 1 ? 'Várias unidades' : primeira ? nomeUnidade(primeira.id_unidade) : unidadeAtual;
    const emissor = usuario.nome_completo || nomeExibicao;

    const dadosFolha = (): DadosFolha => ({
        colaborador, mes: estado.mes, projeto: projetoResumo, unidade: unidadeResumo, emissor,
        linhas: estado.linhas, totais: estado.totais, porUnidade, nomeUnidade, nomeProjeto
    });

    const exportar = async (formato: string, gerar: () => Promise<void>) => {
        if (!idUsuario) {
            aviso('Selecione um colaborador.');
            return;
        }
        mostrarCarregando(`Gerando ${formato}...`);
        try {
            await gerar();
            fecharMensagem();
        } catch (falha) {
            logErro(`Erro ao gerar o ${formato} da hora extra`, falha);
            erro(`Falha ao gerar o ${formato}.`);
        }
    };

    const aoSalvar = async () => {
        if (await estado.salvar()) aoSalvo();
    };

    return (
        <>
            <PageHeader
                titulo={idLancamento ? 'Editar lançamento' : 'Novo lançamento'}
                ajuda={AJUDA_FOLHA}
                acoes={(
                    <>
                        <Button variant="secondary" onClick={() => setJanela('jornada')}><Icon n="settings" /> Jornada</Button>
                        <Button variant="secondary" onClick={() => setJanela('calculadora')}><Icon n="bar-chart" /> Calculadora</Button>
                        <Button variant="secondary" onClick={() => void exportar('PDF', () => salvarFolhaPdf(dadosFolha()))}><Icon n="printer" /> PDF</Button>
                        <Button variant="secondary" onClick={() => { if (folha.current) { const elemento = folha.current; void exportar('JPG', () => salvarFolhaJpg(elemento, dadosFolha())); } }}><Icon n="camera" /> JPG</Button>
                        <Button variant="secondary" onClick={() => void exportar('Excel', () => salvarFolhaExcel(dadosFolha()))}><Icon n="grid" /> Excel</Button>
                        {idLancamento && podeExcluir && <Button variant="danger" onClick={() => aoExcluir(idLancamento)}><Icon n="trash" /> Excluir</Button>}
                        {podeSalvar && <Button onClick={() => void aoSalvar()}><Icon n="save" /> Salvar</Button>}
                        <Button variant="secondary" onClick={aoSair}>Cancelar</Button>
                    </>
                )}
            />
            <FiltrosFolha estado={estado} travarProjeto={travarProjeto} />
            <FolhaHoraExtra estado={estado} colaborador={colaborador} resumoProjetoUnidade={`Projeto: ${projetoResumo} · Unidade: ${unidadeResumo}`} emissor={emissor} referencia={folha} />
            {janela === 'jornada' && <JanelaJornada jornada={estado.jornada} aoMudar={estado.alterarJornada} aoAplicar={estado.aplicarJornadaNaTabela} aoFechar={() => setJanela(null)} />}
            {janela === 'calculadora' && <JanelaCalculadora totais={estado.totais} parametros={parametros} aoMudar={setParametros} aoFechar={() => setJanela(null)} />}
        </>
    );
}

export function HoraExtraPage({ modulo = 'hora_extra', apiBase = '', lotacaoFixa }: HoraExtraProps) {
    const { podeAcao } = useAuth();
    const estado = useLancamento(apiBase, lotacaoFixa);
    const [editando, setEditando] = useState(false);
    const [versao, setVersao] = useState(0);
    const [resultado, setResultado] = useState<{ chave: string; lista: LancamentoResumo[] } | null>(null);
    const chave = `${apiBase}|${lotacaoFixa ?? ''}|${versao}`;

    useEffect(() => {
        let ativo = true;
        listarLancamentos(apiBase, lotacaoFixa)
            .catch((falha: unknown) => {
                logErro('Erro ao carregar o histórico da hora extra', falha);
                return [];
            })
            .then((lista) => { if (ativo) setResultado({ chave, lista }); });
        return () => { ativo = false; };
    }, [apiBase, lotacaoFixa, chave]);

    const podeNovo = estado.ehGestao || podeAcao(modulo, 'pode_novo');
    const podeEditar = estado.ehGestao || podeAcao(modulo, 'pode_editar');

    const aoExcluir = async (id: number) => {
        if (!await confirmar('Tem certeza?', { texto: 'Essa ação não pode ser desfeita!', rotulo: 'Sim, excluir' })) return;
        try {
            await excluirLancamento(apiBase, id);
            sucesso('O registro foi apagado.');
            setVersao((atual) => atual + 1);
            setEditando(false);
        } catch (falha) {
            logErro('Erro ao excluir a hora extra', falha);
            erro(mensagemDeErro(falha, 'Erro ao excluir.'));
        }
    };

    if (editando) {
        return (
            <FormularioLancamento
                estado={estado}
                podeSalvar={estado.idLancamento ? podeEditar : podeNovo}
                podeExcluir={podeEditar}
                travarProjeto={Boolean(lotacaoFixa)}
                aoSair={() => setEditando(false)}
                aoSalvo={() => { setVersao((atual) => atual + 1); setEditando(false); }}
                aoExcluir={(id) => void aoExcluir(id)}
            />
        );
    }

    return (
        <ListaLancamentos
            lista={resultado?.chave === chave ? resultado.lista : null}
            podeNovo={podeNovo}
            podeEditar={podeEditar}
            aoNovo={() => { estado.iniciarNovo(); setEditando(true); }}
            aoAbrir={(lancamento) => { void estado.abrir(lancamento).then((abriu) => { if (abriu) setEditando(true); }); }}
            aoExcluir={(id) => void aoExcluir(id)}
        />
    );
}
