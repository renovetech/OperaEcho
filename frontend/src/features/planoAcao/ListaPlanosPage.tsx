import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/shared/ui/Icon';
import * as planoApi from '@/features/planoAcao/api';
import type { FiltrosPlano, PlanoResumo } from '@/features/planoAcao/api';
import { BarraProgresso, BotaoIcone, SeloSaude, TagModulo } from '@/features/planoAcao/componentes';
import { confirmarExclusaoDigitada, erroHtml, gerenciarPublicacao, pedirEncerramento } from '@/features/planoAcao/dialogos';
import { dataBR, STATUS_PLANO } from '@/features/planoAcao/formatos';
import { useAuth } from '@/shared/auth/AuthContext';
import { listarProjetosAtivos, type ProjetoResumo } from '@/shared/catalogos';
import { avisoRapido, confirmar, sucesso } from '@/shared/feedback';
import { useParametrosUrl, useVoltar } from '@/shared/hooks';
import { cn, logErro } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';
import { Badge, Card, PageHeader } from '@/shared/ui/Pagina';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

const ESPERA_DIGITACAO_MS = 300;

function useListaPlanos() {
    const { podeAcao } = useAuth();
    const [parametros, alterarUrl] = useParametrosUrl();
    const filtros = useMemo<FiltrosPlano>(() => ({
        busca: parametros.get('busca') ?? '',
        data: parametros.get('data') ?? '',
        projeto: parametros.get('projeto') ?? '',
        status: parametros.get('status') ?? ''
    }), [parametros]);
    const [projetos, setProjetos] = useState<ProjetoResumo[]>([]);
    const [resultado, setResultado] = useState<{ chave: string; lista: PlanoResumo[] }>({ chave: '', lista: [] });
    const [versao, setVersao] = useState(0);
    const chave = JSON.stringify({ filtros, versao });
    const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);

    useEffect(() => {
        listarProjetosAtivos().then(setProjetos).catch((falha: unknown) => logErro('Erro ao listar projetos', falha));
    }, []);

    useEffect(() => {
        let ativo = true;
        const espera = setTimeout(() => {
            planoApi.listarPlanos(filtros)
                .then((lista) => { if (ativo) setResultado({ chave, lista }); })
                .catch((falha: unknown) => {
                    logErro('Erro ao buscar planos', falha);
                    if (ativo) setResultado({ chave, lista: [] });
                });
        }, ESPERA_DIGITACAO_MS);
        return () => {
            ativo = false;
            clearTimeout(espera);
        };
    }, [chave, filtros]);

    const podeEditarGeral = podeAcao('plano_acao', 'pode_editar');

    return {
        projetos, filtros, recarregar,
        planos: resultado.lista,
        carregando: resultado.chave !== chave,
        podeNovo: podeAcao('plano_acao', 'pode_novo'),
        podeEditar: (plano: PlanoResumo) => plano.pode_editar ?? podeEditarGeral,
        podeExcluir: (plano: PlanoResumo) => plano.pode_excluir ?? podeEditarGeral,
        filtrar: (campo: keyof FiltrosPlano, valor: string) => alterarUrl({ [campo]: valor }),
        limpar: () => alterarUrl({ busca: null, data: null, projeto: null, status: null })
    };
}

export function ListaPlanosPage() {
    const navigate = useNavigate();
    const voltar = useVoltar();
    const l = useListaPlanos();
    const abrir = (id: number | string) => navigate(`/system/plano-acao/${id}`);
    const contagemSaude = l.planos.reduce<Record<string, number>>((soma, plano) => (plano.saude ? { ...soma, [plano.saude]: (soma[plano.saude] ?? 0) + 1 } : soma), {});
    const atrasadas = l.planos.reduce((soma, plano) => soma + (plano.atrasados || 0), 0);

    const excluir = async (plano: PlanoResumo) => {
        if (!await confirmarExclusaoDigitada(plano.titulo)) return;
        try {
            await planoApi.excluirPlano(plano.id_plano);
            sucesso('Plano excluído');
            l.recarregar();
        } catch (falha) {
            erroHtml(falha, 'Erro ao excluir plano.');
        }
    };

    const encerrar = async (plano: PlanoResumo) => {
        const decisao = await pedirEncerramento((plano.total || 0) - (plano.fechados || 0));
        if (!decisao) return;
        try {
            await planoApi.encerrarPlano(plano.id_plano, decisao.justificativa);
            avisoRapido('Plano encerrado');
            l.recarregar();
        } catch (falha) {
            erroHtml(falha, 'Não foi possível encerrar o plano.');
        }
    };

    const reabrir = async (plano: PlanoResumo) => {
        if (!await confirmar('Reabrir plano?', { texto: 'O plano voltará a aceitar edições.', rotulo: 'Reabrir' })) return;
        try {
            await planoApi.reabrirPlano(plano.id_plano);
            l.recarregar();
        } catch (falha) {
            erroHtml(falha);
        }
    };

    return (
        <>
            <PageHeader
                titulo="Plano de Ação"
                acoes={(
                    <>
                        <Button variant="secondary" onClick={() => navigate('/system/plano-acao/painel')}><Icon n="bar-chart" /> Painel</Button>
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                        {l.podeNovo && <Button onClick={() => abrir('novo')}><Icon n="plus" /> Novo plano</Button>}
                    </>
                )}
            />
            <Card className="mb-3.5 flex items-end gap-3.5 px-4 py-3.5">
                <Field rotulo="Buscar (título ou cliente)" htmlFor="pl-busca" className="flex-[2]"><Input id="pl-busca" placeholder="Digite para buscar..." value={l.filtros.busca} onChange={(e) => l.filtrar('busca', e.target.value)} /></Field>
                <Field rotulo="Data de criação" htmlFor="pl-data" className="flex-1"><Input id="pl-data" type="date" min="1900-01-01" max="2100-12-31" value={l.filtros.data} onChange={(e) => l.filtrar('data', e.target.value)} /></Field>
                <Field rotulo="Projeto" htmlFor="pl-projeto" className="flex-1">
                    <Select id="pl-projeto" value={l.filtros.projeto} onChange={(e) => l.filtrar('projeto', e.target.value)}>
                        <option value="">Todos</option>
                        {l.projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                    </Select>
                </Field>
                <Field rotulo="Situação" htmlFor="pl-status" className="flex-1">
                    <Select id="pl-status" value={l.filtros.status} onChange={(e) => l.filtrar('status', e.target.value)}>
                        <option value="">Todas</option>
                        {STATUS_PLANO.map((status) => <option key={status} value={status}>{status}</option>)}
                    </Select>
                </Field>
                <Button variant="secondary" onClick={l.limpar}>Limpar</Button>
            </Card>
            {l.planos.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2.5 text-[13px] text-text">
                    <span><b>{l.planos.length}</b> plano(s)</span>
                    {Object.entries(contagemSaude).map(([saude, qtd]) => <span key={saude} className="inline-flex items-center gap-1"><SeloSaude saude={saude} /> {qtd}</span>)}
                    <span><b>{atrasadas}</b> ação(ões) atrasada(s)</span>
                </div>
            )}
            <div className={cn('transition-opacity', l.carregando && 'opacity-50')}>
                <Tabela cabecalho={<><Th>Plano / Cliente</Th><Th>Projeto</Th><Th>Produto(s)</Th><Th centro>Unid.</Th><Th className="min-w-40">Execução</Th><Th centro>Saúde</Th><Th centro>Atrasadas</Th><Th centro>Próx. prazo</Th><Th centro>Situação</Th><Th centro>Ações</Th></>}>
                    {!l.carregando && !l.planos.length && <LinhaVazia colunas={10}>Nenhum plano de ação encontrado com os filtros atuais.</LinhaVazia>}
                    {l.planos.map((plano) => {
                        const encerrado = plano.status === 'ENCERRADO';
                        const editar = l.podeEditar(plano);
                        return (
                            <tr key={plano.id_plano}>
                                <Td>
                                    <button type="button" onClick={() => abrir(plano.id_plano)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-sans text-[13.5px] font-semibold text-pine-800 hover:underline">{plano.titulo}</button>
                                    <small className="mt-0.5 block text-xs text-text-2">{plano.cliente || '-'}{plano.cliente_informado === false ? ' (projeto)' : ''} · criado em {dataBR(plano.data_criacao)}</small>
                                </Td>
                                <Td>{plano.nome_projeto || '-'}</Td>
                                <Td>{plano.modulos ? plano.modulos.split(', ').map((modulo) => <TagModulo key={modulo}>{modulo}</TagModulo>) : '-'}</Td>
                                <Td centro className="tabular-nums">{plano.qtd_unidades}</Td>
                                <Td>
                                    <div className="flex items-center gap-2" title={`Realizado ${plano.progresso}% · esperado até hoje ${plano.esperado}%`}>
                                        <BarraProgresso valor={plano.progresso} esperado={plano.esperado} />
                                        <b className="text-xs tabular-nums">{plano.progresso}%</b>
                                    </div>
                                    <small className="mt-1 block text-xs text-text-2">{plano.fechados}/{plano.total} ações fechadas</small>
                                </Td>
                                <Td centro><SeloSaude saude={plano.saude} /></Td>
                                <Td centro className="tabular-nums">{plano.atrasados ? <b className="text-danger">{plano.atrasados}</b> : 0}</Td>
                                <Td centro className="whitespace-nowrap tabular-nums">{dataBR(plano.proximo_prazo)}</Td>
                                <Td centro><Badge tom={encerrado ? 'neutro' : 'marca'}>{plano.status}</Badge></Td>
                                <Td centro className="whitespace-nowrap">
                                    <BotaoIcone icone="folder" titulo="Abrir plano" onClick={() => abrir(plano.id_plano)} />
                                    <BotaoIcone
                                        icone="globe"
                                        ativo={plano.publico}
                                        titulo={plano.publico ? 'Painel público ativo' : 'Publicar painel'}
                                        onClick={() => gerenciarPublicacao({
                                            publico: plano.publico,
                                            token: plano.token_publico,
                                            podeEditar: editar,
                                            alterar: (publico, regenerar) => planoApi.alterarPublicacao(plano.id_plano, publico, regenerar),
                                            aoMudar: l.recarregar
                                        })}
                                    />
                                    {editar && !encerrado && <BotaoIcone icone="check" titulo="Encerrar plano" onClick={() => encerrar(plano)} />}
                                    {editar && encerrado && <BotaoIcone icone="undo" titulo="Reabrir plano" onClick={() => reabrir(plano)} />}
                                    {l.podeExcluir(plano) && <BotaoIcone perigo icone="trash" titulo="Excluir" onClick={() => excluir(plano)} />}
                                </Td>
                            </tr>
                        );
                    })}
                </Tabela>
            </div>
        </>
    );
}
