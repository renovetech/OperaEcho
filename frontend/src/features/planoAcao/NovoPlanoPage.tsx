import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/shared/ui/Icon';
import { montarEtapas, resolverTemplate } from '@/features/planoAcao/templates';
import * as planoApi from '@/features/planoAcao/api';
import type { ProdutoDoPlano } from '@/features/planoAcao/api';
import { decidirModelo, erroHtml } from '@/features/planoAcao/dialogos';
import { MontadorPlano, novaAcao, novaEtapa, type AcaoMontada, type EtapaMontada } from '@/features/planoAcao/MontadorPlano';
import { listarProjetosAtivos, listarUnidadesDoProjeto, type ProjetoResumo } from '@/shared/catalogos';
import { aviso, avisoRapido, confirmar } from '@/shared/feedback';
import { useListaPorCodigo, useVoltar } from '@/shared/hooks';
import { cn, logErro } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Checkbox, Field, GrupoSelecao, Input, Textarea } from '@/shared/ui/Campos';
import { Badge, Card, PageHeader } from '@/shared/ui/Pagina';

const PASSOS = ['Projeto', 'Unidades', 'Modelo (opcional)', 'Etapas e ações', 'Dados do plano'];
const ULTIMO_PASSO = PASSOS.length - 1;
const PASSO_ETAPAS = 3;
const SUB_TIPOS = ['Atenção Primária', 'Atenção Secundária'];

const FORM_INICIAL = {
    id_projeto: '', ids_unidades: [] as number[], ids_produtos: [] as number[], sub_tipo: '', titulo: '', cliente: '',
    descricao: '', data_inicio_prevista: '', data_fim_prevista: '', publico: false
};

const alternar = (lista: number[], id: number) => (lista.includes(id) ? lista.filter((item) => item !== id) : [...lista, id]);

function useNovoPlano() {
    const navigate = useNavigate();
    const [passo, setPasso] = useState(0);
    const [form, setForm] = useState(FORM_INICIAL);
    const [projetos, setProjetos] = useState<ProjetoResumo[]>([]);
    const [produtos, setProdutos] = useState<ProdutoDoPlano[]>([]);
    const [vinculos, setVinculos] = useState<{ chave: string; ids: Set<number> }>({ chave: '', ids: new Set() });
    const [etapas, setEtapas] = useState<EtapaMontada[]>(() => [novaEtapa('PLANEJAMENTO')]);
    const [acoesUnidade, setAcoesUnidade] = useState<AcaoMontada[]>([]);
    const [gerando, setGerando] = useState(false);
    const unidades = useListaPorCodigo(form.id_projeto, listarUnidadesDoProjeto, 'Erro ao listar unidades');
    const chaveUnidades = form.ids_unidades.join(',');

    useEffect(() => {
        listarProjetosAtivos().then(setProjetos).catch((falha: unknown) => logErro('Erro ao listar projetos', falha));
        planoApi.listarProdutosDoPlano().then(setProdutos).catch((falha: unknown) => logErro('Erro ao listar produtos', falha));
    }, []);

    useEffect(() => {
        if (!chaveUnidades) return undefined;
        let ativo = true;
        Promise.all(chaveUnidades.split(',').map((id) => planoApi.idsDeProdutosDaUnidade(Number(id)).catch(() => [] as number[])))
            .then((listas) => { if (ativo) setVinculos({ chave: chaveUnidades, ids: new Set(listas.flat()) }); });
        return () => { ativo = false; };
    }, [chaveUnidades]);

    // Sem unidades, todos os produtos valem; só aparecem os que têm modelo de etapas cadastrado.
    const visiveis = useMemo(() => produtos.filter((produto) => (!chaveUnidades || (vinculos.chave === chaveUnidades && vinculos.ids.has(produto.id_produto))) && resolverTemplate(produto.nome_produto)), [produtos, chaveUnidades, vinculos]);
    const selecionados = useMemo(() => produtos.filter((produto) => form.ids_produtos.includes(produto.id_produto)), [produtos, form.ids_produtos]);
    const precisaSubTipo = selecionados.some((produto) => resolverTemplate(produto.nome_produto)?.precisaSubTipo);
    const modulos = useMemo<string[]>(() => [...new Set(selecionados.map((produto) => resolverTemplate(produto.nome_produto)?.modulo).filter(Boolean))] as string[], [selecionados]);
    const projeto = projetos.find((item) => String(item.id_projeto) === form.id_projeto);
    const totalGerais = etapas.reduce((soma, etapa) => soma + etapa.acoes.length, 0);

    const alterar = (mudancas: Partial<typeof FORM_INICIAL>) => setForm((atual) => ({ ...atual, ...mudancas }));

    const problemaDoPasso = (indice: number): string | null => {
        if (indice === 0 && !form.id_projeto) return 'Selecione o projeto.';
        if (indice === PASSO_ETAPAS) {
            const acoes = [...etapas.flatMap((etapa) => etapa.acoes), ...acoesUnidade];
            if (etapas.some((etapa) => !etapa.nome.trim())) return 'Há etapa sem nome.';
            const invertida = acoes.find((acao) => acao.data_inicio && acao.data_fim && acao.data_fim < acao.data_inicio);
            if (invertida) return `A ação "${invertida.acao.slice(0, 40)}" tem fim anterior ao início.`;
            if (acoes.some((acao) => !acao.acao.trim())) return 'Há ação sem descrição.';
        }
        if (indice === ULTIMO_PASSO) {
            if (!form.titulo.trim()) return 'Informe o título do plano.';
            if (form.data_inicio_prevista && form.data_fim_prevista && form.data_fim_prevista < form.data_inicio_prevista) return 'O término previsto não pode ser anterior ao início.';
        }
        return null;
    };

    const irPara = (alvo: number) => {
        for (let indice = 0; indice < alvo; indice += 1) {
            const problema = problemaDoPasso(indice);
            if (problema) {
                aviso(problema);
                return;
            }
        }
        setPasso(alvo);
    };

    const carregarModelo = async () => {
        if (!selecionados.length) return aviso('Selecione ao menos um produto.');
        if (precisaSubTipo && !form.sub_tipo) return aviso('Selecione o Tipo de Atenção.');
        let substituir = true;
        if (etapas.some((etapa) => etapa.acoes.length) || acoesUnidade.length) {
            const decisao = await decidirModelo();
            if (!decisao) return undefined;
            substituir = decisao === 'substituir';
        }
        const novas: EtapaMontada[] = [];
        const porUnidade: AcaoMontada[] = [];
        selecionados.forEach((produto) => {
            const modelo = resolverTemplate(produto.nome_produto);
            if (!modelo) return;
            const { etapas_padrao: padrao, etapas_unidade: unidade } = montarEtapas(modelo, form.sub_tipo);
            padrao.forEach((item) => {
                const nome = item.grupo ?? 'GERAL';
                const modulo = item.modulo ?? null;
                let etapa = novas.find((atual) => atual.nome === nome && atual.modulo === modulo);
                if (!etapa) {
                    etapa = novaEtapa(nome, [], modulo);
                    novas.push(etapa);
                }
                etapa.acoes.push(novaAcao(item.acao, { responsavel: item.responsavel ?? '' }));
            });
            unidade.forEach((item) => porUnidade.push(novaAcao(item.acao, { responsavel: item.responsavel ?? '', modulo: item.modulo ?? null })));
        });
        if (!novas.length && !porUnidade.length) return aviso('Os produtos escolhidos não possuem modelo cadastrado. Monte as etapas do zero.', 'Sem modelo');
        setEtapas([...(substituir ? [] : etapas.filter((etapa) => etapa.acoes.length || etapa.nome.trim())), ...novas]);
        setAcoesUnidade(substituir ? porUnidade : [...acoesUnidade, ...porUnidade]);
        if (!form.titulo) {
            const unico = selecionados.length === 1 ? selecionados[0] : undefined;
            const titulo = unico
                ? (resolverTemplate(unico.nome_produto)?.tituloSugerido ?? `IMPLANTAÇÃO ${unico.nome_produto.toUpperCase()}`)
                : `IMPLANTAÇÃO - ${selecionados.map((item) => (resolverTemplate(item.nome_produto)?.modulo ?? item.nome_produto).toUpperCase()).join(' + ')}`;
            alterar({ titulo });
        }
        setPasso(PASSO_ETAPAS);
        return avisoRapido('Modelo carregado');
    };

    const criar = async () => {
        for (let indice = 0; indice <= ULTIMO_PASSO; indice += 1) {
            const problema = problemaDoPasso(indice);
            if (problema) {
                setPasso(indice);
                aviso(problema);
                return;
            }
        }
        if (!totalGerais && !acoesUnidade.length && !await confirmar('Plano sem ações', { texto: 'Deseja criar o plano vazio e cadastrar as ações depois, na grade?', rotulo: 'Criar vazio' })) return;
        const limpar = (acao: AcaoMontada) => ({ acao: acao.acao.trim(), responsavel: acao.responsavel || null, prioridade: acao.prioridade, data_inicio: acao.data_inicio || null, data_fim: acao.data_fim || null });
        setGerando(true);
        try {
            const id = await planoApi.criarPlano({
                titulo: form.titulo.trim(),
                id_projeto: form.id_projeto,
                id_produto: form.ids_produtos[0] ?? null,
                ids_produtos: form.ids_produtos,
                unidades_ids: form.ids_unidades,
                sub_tipo: form.sub_tipo || null,
                cliente: form.cliente,
                descricao: form.descricao,
                data_inicio_prevista: form.data_inicio_prevista || null,
                data_fim_prevista: form.data_fim_prevista || null,
                publico: form.publico,
                etapas_padrao: etapas.flatMap((etapa) => etapa.acoes.map((acao) => ({ ...limpar(acao), grupo: etapa.nome.trim(), modulo: etapa.modulo }))),
                etapas_unidade: acoesUnidade.map((acao) => ({ ...limpar(acao), modulo: acao.modulo ?? (modulos.length === 1 ? modulos[0] : null) }))
            });
            avisoRapido('Plano criado');
            navigate(`/system/plano-acao/${id}`, { replace: true });
        } catch (falha) {
            erroHtml(falha, undefined, 'Falha ao criar o plano');
        } finally {
            setGerando(false);
        }
    };

    return {
        passo, form, projetos, projeto, unidades, visiveis, precisaSubTipo, modulos, etapas, acoesUnidade, gerando, totalGerais,
        alterar, irPara, carregarModelo, criar, setEtapas, setAcoesUnidade, setPasso,
        trocarProjeto: (id_projeto: string) => alterar({ id_projeto, ids_unidades: [], ids_produtos: [], sub_tipo: '' }),
        alternarUnidade: (id: number) => setForm((atual) => ({ ...atual, ids_unidades: alternar(atual.ids_unidades, id) })),
        alternarProduto: (id: number) => setForm((atual) => ({ ...atual, ids_produtos: alternar(atual.ids_produtos, id) }))
    };
}

const Titulo = ({ texto, ajuda }: { texto: string; ajuda?: string }) => <h2 className="m-0 mb-3.5 text-[15px] font-semibold text-ink">{texto}{ajuda && <small className="ml-1.5 text-xs font-normal text-text-2">{ajuda}</small>}</h2>;

const CARTAO = 'flex cursor-pointer items-center gap-2 rounded-lg border border-solid p-3.5 text-left font-sans text-[13.5px] transition-colors';
const cartaoAtivo = (ativo: boolean) => (ativo ? 'border-pine bg-tint font-semibold text-pine-800' : 'border-line bg-white text-text hover:bg-surface-2');

export function NovoPlanoPage() {
    const voltar = useVoltar();
    const n = useNovoPlano();
    const [buscaUnidade, setBuscaUnidade] = useState('');
    const { form } = n;
    const unidadesVisiveis = n.unidades.filter((unidade) => unidade.nome_unidade.toLowerCase().includes(buscaUnidade.toLowerCase()));

    return (
        <>
            <PageHeader titulo="Novo Plano de Ação" acoes={<Button variant="secondary" onClick={voltar}>Cancelar</Button>} />
            <ol className="m-0 mb-3.5 flex list-none gap-2 p-0">
                {PASSOS.map((rotulo, indice) => (
                    <li key={rotulo} className="flex-1">
                        <button type="button" aria-current={indice === n.passo ? 'step' : undefined} onClick={() => n.irPara(indice)} className={cn('flex w-full cursor-pointer items-center gap-2 rounded-lg border border-solid px-3 py-2.5 font-sans text-[13px] font-medium', indice === n.passo ? 'border-pine bg-pine text-white' : 'border-line bg-white text-text hover:bg-surface-2')}>
                            <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', indice === n.passo ? 'bg-white text-pine-800' : 'bg-line-2 text-text-2', indice < n.passo && 'bg-tint text-pine-800')}>{indice < n.passo ? <Icon n="check" /> : indice + 1}</span>
                            {rotulo}
                        </button>
                    </li>
                ))}
            </ol>
            <Card>
                <div className="p-[22px]">
                    {n.passo === 0 && (
                        <>
                            <Titulo texto="Em qual projeto este plano será executado?" />
                            <div className="grid grid-cols-4 gap-2.5">
                                {n.projetos.map((projeto) => (
                                    <button key={projeto.id_projeto} type="button" className={cn(CARTAO, cartaoAtivo(form.id_projeto === String(projeto.id_projeto)))} onClick={() => n.trocarProjeto(String(projeto.id_projeto))}><Icon n="folder" /> {projeto.nome_projeto}</button>
                                ))}
                            </div>
                        </>
                    )}
                    {n.passo === 1 && (
                        <>
                            <Titulo texto="Unidades envolvidas" ajuda={`(opcional - ${form.ids_unidades.length} selecionada(s))`} />
                            <div className="mb-3 flex gap-2">
                                <Input aria-label="Buscar unidade" className="flex-1" placeholder="Buscar unidade..." value={buscaUnidade} onChange={(e) => setBuscaUnidade(e.target.value)} />
                                <Button variant="secondary" onClick={() => n.alterar({ ids_unidades: [...new Set([...form.ids_unidades, ...unidadesVisiveis.map((unidade) => unidade.id_unidade)])] })}>Marcar visíveis</Button>
                                <Button variant="secondary" onClick={() => n.alterar({ ids_unidades: [] })}>Limpar</Button>
                            </div>
                            <div className="max-h-[340px] overflow-y-auto">
                                <GrupoSelecao vazio="Nenhuma unidade encontrada." itens={unidadesVisiveis.map((unidade) => ({ id: unidade.id_unidade, nome: unidade.nome_unidade }))} selecionados={form.ids_unidades} aoAlternar={n.alternarUnidade} />
                            </div>
                        </>
                    )}
                    {n.passo === 2 && (
                        <>
                            <Titulo texto="Partir de um modelo?" ajuda="(opcional)" />
                            <button type="button" className={cn(CARTAO, 'mb-4 w-72', cartaoAtivo(!form.ids_produtos.length))} onClick={() => { n.alterar({ ids_produtos: [], sub_tipo: '' }); n.setPasso(PASSO_ETAPAS); }}>
                                <Icon n="edit" /><b>Montar do zero</b>
                            </button>
                            {n.visiveis.length > 0 && (
                                <>
                                    <h3 className="m-0 mb-2.5 text-[13.5px] font-semibold text-ink">Produtos / módulos disponíveis</h3>
                                    <GrupoSelecao
                                        itens={n.visiveis.map((produto) => {
                                            const modulo = resolverTemplate(produto.nome_produto)?.modulo;
                                            return { id: produto.id_produto, nome: modulo ? `${produto.nome_produto} · ${modulo}` : produto.nome_produto };
                                        })}
                                        selecionados={form.ids_produtos}
                                        aoAlternar={n.alternarProduto}
                                    />
                                    {n.precisaSubTipo && (
                                        <div role="radiogroup" aria-label="Tipo de Atenção" className="mt-3.5 flex items-center gap-4 text-sm">
                                            <b className="font-semibold">Tipo de Atenção:</b>
                                            {SUB_TIPOS.map((tipo) => (
                                                <label key={tipo} className="m-0 inline-flex cursor-pointer items-center gap-1.5"><input type="radio" name="subtipo" className="m-0 accent-pine" checked={form.sub_tipo === tipo} onChange={() => n.alterar({ sub_tipo: tipo })} /> {tipo}</label>
                                            ))}
                                        </div>
                                    )}
                                    {form.ids_produtos.length > 0 && <Button className="mt-4" onClick={n.carregarModelo}><Icon n="clipboard" /> Carregar modelo nas etapas</Button>}
                                </>
                            )}
                        </>
                    )}
                    {n.passo === PASSO_ETAPAS && (
                        <>
                            <Titulo texto="Etapas e ações" />
                            <MontadorPlano etapas={n.etapas} aoMudarEtapas={n.setEtapas} acoesUnidade={n.acoesUnidade} aoMudarAcoesUnidade={n.setAcoesUnidade} qtdUnidades={form.ids_unidades.length} modulos={n.modulos} />
                        </>
                    )}
                    {n.passo === ULTIMO_PASSO && (
                        <>
                            <Titulo texto="Dados do plano" />
                            <div className="grid grid-cols-2 gap-3.5">
                                <Field rotulo="Título do plano" htmlFor="np-titulo" obrigatorio className="col-span-2"><Input id="np-titulo" maxLength={300} placeholder="Ex.: IMPLANTAÇÃO DO PRONTUÁRIO - REDE MUNICIPAL" value={form.titulo} onChange={(e) => n.alterar({ titulo: e.target.value })} /></Field>
                                <Field rotulo="Cliente" htmlFor="np-cliente" className="col-span-2"><Input id="np-cliente" maxLength={200} placeholder={n.projeto?.nome_projeto ?? 'Nome do cliente'} value={form.cliente} onChange={(e) => n.alterar({ cliente: e.target.value })} /></Field>
                                <Field rotulo="Início previsto" htmlFor="np-inicio"><Input id="np-inicio" type="date" min="1900-01-01" max="2100-12-31" value={form.data_inicio_prevista} onChange={(e) => n.alterar({ data_inicio_prevista: e.target.value })} /></Field>
                                <Field rotulo="Término previsto" htmlFor="np-fim"><Input id="np-fim" type="date" max="2100-12-31" min={form.data_inicio_prevista || undefined} value={form.data_fim_prevista} onChange={(e) => n.alterar({ data_fim_prevista: e.target.value })} /></Field>
                                <Field rotulo="Objetivo / escopo" htmlFor="np-descricao" className="col-span-2"><Textarea id="np-descricao" rows={3} maxLength={1000} value={form.descricao} onChange={(e) => n.alterar({ descricao: e.target.value })} /></Field>
                                <Checkbox className="col-span-2 m-0" rotulo="Publicar o painel deste plano (link público somente leitura)" checked={form.publico} onChange={(e) => n.alterar({ publico: e.target.checked })} />
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Badge>{n.projeto?.nome_projeto ?? '-'}</Badge>
                                <Badge>{form.ids_unidades.length} unidade(s)</Badge>
                                <Badge>{n.etapas.length} etapa(s)</Badge>
                                <Badge tom="marca">{n.totalGerais + n.acoesUnidade.length * form.ids_unidades.length} ação(ões) no total</Badge>
                            </div>
                        </>
                    )}
                </div>
                <div className="flex justify-between rounded-b-[10px] border-t border-line bg-surface-2 px-[22px] py-3.5">
                    <Button variant="secondary" disabled={n.passo === 0} onClick={() => n.setPasso(n.passo - 1)}><Icon n="arrow-left" /> Voltar</Button>
                    {n.passo < ULTIMO_PASSO
                        ? <Button onClick={() => n.irPara(n.passo + 1)}>Continuar <Icon n="arrow-right" /></Button>
                        : <Button isLoading={n.gerando} onClick={n.criar}><Icon n="target" /> Criar plano de ação</Button>}
                </div>
            </Card>
        </>
    );
}
