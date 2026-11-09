/* Envia o arquivo de produção (BPA, APAC ou AIH): lê e valoriza numa prévia e só grava ao confirmar. */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '@/shared/ui/Icon';
import * as faturamentoApi from '@/features/faturamento/api';
import type { FiltroLancamentos, FormLancamento, Lancamento, LancamentoExistente, OpcoesFaturamento, PaginaLancamentos, PreviaLancamento, ProcedimentoPrevia } from '@/features/faturamento/api';
import { fmtComp, fmtMoeda, fmtNum, fmtProc } from '@/features/sigtap/formatos';
import { useAuth } from '@/shared/auth/AuthContext';
import { confirmar, erro, mensagemDeErro, sucessoHtml } from '@/shared/feedback';
import { useVoltar } from '@/shared/hooks';
import { cn, escaparHtml, logErro } from '@/shared/lib';
import { BalaoAjuda } from '@/shared/ui/BalaoAjuda';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';
import { Janela } from '@/shared/ui/Janela';
import { Badge, Card, CardTitulo, PageHeader } from '@/shared/ui/Pagina';
import { LinhaVazia, Paginacao, Tabela, Td, Th } from '@/shared/ui/Tabela';

const TIPOS = ['BPA', 'APAC', 'AIH'];
const REGRA_NOVO_LANCAMENTO = 'Envie o arquivo exportado do sistema (ex.: PA5529581.JAN) ou o .zip com ele. Ele é lido e valorizado pela Tabela SIGTAP numa prévia, e só é gravado ao confirmar.\nBPA: Boletim de Produção Ambulatorial (BPA-C e BPA-I).\nAPAC: Autorização de Procedimento de Alta Complexidade.\nAIH: Internação Hospitalar (SISAIH01), do KlinikosNet e do SER II (Internação).\nSe a unidade já tiver esse tipo e produto na competência, o novo arquivo substitui o anterior.';
const REGRA_HISTORICO = 'Procedimentos: quantidade total e códigos diferentes do arquivo.\nValor SIGTAP com *: valorizado por outra competência da tabela, porque a da produção não estava importada. Importe-a e use o botão de recalcular.';
const TIPO_PELO_NOME: [RegExp, string][] = [[/AIH/, 'AIH'], [/^AP/, 'APAC'], [/^PA/, 'BPA']];
const ORIGEM_ROTULO: Record<string, string> = { 'AIH-P': 'AIH · principal', 'AIH-S': 'AIH · secundários/especiais' };
const TOM_AVISO = { erro: 'bg-danger-tint text-danger', alerta: 'bg-brass-tint text-brass', info: 'bg-line-2 text-text' };
const ICONE_AVISO = { erro: 'x', alerta: 'alert', info: 'dot' };
const LINHAS_PREVIA = 15;
const FORM_VAZIO: FormLancamento = { id_projeto: '', id_unidade: '', id_produto: '', tipo: 'BPA', competencia: '' };
const FILTRO_VAZIO: FiltroLancamentos = { projeto: '', unidade: '', competencia: '', tipo: '' };
const OPCOES_VAZIAS: OpcoesFaturamento = { projetos: [], unidades: [], produtos: [], sigtap: [] };
const PAGINA_VAZIA: PaginaLancamentos = { itens: [], total: 0, pagina: 1, tamanho: 15 };

/** AAAAMM -> AAAA-MM (campo mês) */
const paraMes = (competencia?: string) => (/^\d{6}$/.test(competencia ?? '') ? `${competencia?.slice(0, 4)}-${competencia?.slice(4)}` : '');

/** Produto × tipo de arquivo: trocar o produto ajusta o tipo; trocar tipo ou unidade escolhe um produto que aceite o tipo. */
function ajustarProduto(form: FormLancamento, campo: keyof FormLancamento, opcoes: OpcoesFaturamento): FormLancamento {
    const produto = opcoes.produtos.find((item) => String(item.id_produto) === form.id_produto);
    if (campo === 'id_produto') return produto && !produto.tipos.includes(form.tipo) ? { ...form, tipo: produto.tipos[0] ?? form.tipo } : form;
    if (campo !== 'tipo' && campo !== 'id_unidade') return form;
    const unidade = opcoes.unidades.find((item) => String(item.id_unidade) === form.id_unidade);
    const vinculados = opcoes.produtos.filter((item) => (unidade?.produtos ?? []).includes(item.id_produto) && item.tipos.includes(form.tipo));
    if (produto?.tipos.includes(form.tipo) && (campo === 'tipo' || vinculados.includes(produto))) return form;
    const aceitam = opcoes.produtos.filter((item) => item.tipos.includes(form.tipo));
    const escolhido = vinculados[0] ?? (aceitam.length === 1 ? aceitam[0] : undefined);
    return { ...form, id_produto: escolhido ? String(escolhido.id_produto) : '' };
}

function useLancamento(podeEditar: boolean) {
    const [opcoes, setOpcoes] = useState(OPCOES_VAZIAS);
    const [form, setForm] = useState(FORM_VAZIO);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [analise, setAnalise] = useState<{ chave: string; previa: PreviaLancamento | null }>({ chave: '', previa: null });
    const [gravando, setGravando] = useState(0);
    const [rascunho, setRascunho] = useState(FILTRO_VAZIO);
    const [consulta, setConsulta] = useState({ filtro: FILTRO_VAZIO, pagina: 1 });
    const [versao, setVersao] = useState(0);
    const [historico, setHistorico] = useState({ chave: '', dados: PAGINA_VAZIA });
    const [detalhe, setDetalhe] = useState<{ lancamento: Lancamento; procedimentos: ProcedimentoPrevia[] } | null>(null);
    const chaveHistorico = JSON.stringify({ consulta, versao });
    const pronto = Boolean(form.id_projeto && form.id_unidade && form.id_produto && form.tipo && arquivo);
    const chaveAnalise = pronto && arquivo ? JSON.stringify({ form, nome: arquivo.name, tamanho: arquivo.size, data: arquivo.lastModified }) : '';
    const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);

    useEffect(() => {
        faturamentoApi.buscarOpcoes().then(setOpcoes).catch((falha: unknown) => erro(mensagemDeErro(falha, 'Não foi possível carregar os cadastros.')));
    }, []);

    useEffect(() => {
        let ativo = true;
        faturamentoApi.listarLancamentos(consulta.filtro, consulta.pagina)
            .then((dados) => { if (ativo) setHistorico({ chave: chaveHistorico, dados }); })
            .catch((falha: unknown) => {
                logErro('Erro ao listar lançamentos', falha);
                if (ativo) setHistorico({ chave: chaveHistorico, dados: PAGINA_VAZIA });
            });
        return () => { ativo = false; };
    }, [chaveHistorico, consulta]);

    // Lê de novo ao completar o formulário ou trocar o arquivo.
    useEffect(() => {
        if (!chaveAnalise || !arquivo) return undefined;
        let ativo = true;
        faturamentoApi.analisarArquivo(form, arquivo)
            .then((previa) => {
                if (!ativo) return;
                setAnalise({ chave: chaveAnalise, previa });
                // Competência vazia: assume a do arquivo, que é a competência real da produção.
                if (!form.competencia && previa.resumo.competencia_arquivo) setForm((atual) => ({ ...atual, competencia: paraMes(previa.resumo.competencia_arquivo) }));
            })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setAnalise({ chave: chaveAnalise, previa: null });
                erro(mensagemDeErro(falha, 'Não foi possível ler o arquivo.'), 'Não foi possível ler o arquivo');
            });
        return () => { ativo = false; };
        // "form" muda junto com a chave.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chaveAnalise, arquivo]);

    const previa = analise.chave === chaveAnalise ? analise.previa : null;
    const unidadeSelecionada = opcoes.unidades.find((item) => String(item.id_unidade) === form.id_unidade);
    const produtos = useMemo(() => {
        const vinculados = new Set(unidadeSelecionada?.produtos ?? []);
        return opcoes.produtos
            .filter((item) => item.tipos.includes(form.tipo))
            .map((item) => ({ ...item, vinculado: vinculados.has(item.id_produto) }))
            .sort((a, b) => Number(b.vinculado) - Number(a.vinculado) || a.nome_produto.localeCompare(b.nome_produto));
    }, [opcoes.produtos, unidadeSelecionada, form.tipo]);

    const gravar = async (substituir: boolean): Promise<void> => {
        if (!arquivo) return;
        setGravando(1);
        try {
            const { mensagem, resumo } = await faturamentoApi.gravarLancamento(form, arquivo, substituir, setGravando);
            sucessoHtml(mensagem, `${escaparHtml(resumo.unidade)}<br>Competência <b>${fmtComp(resumo.competencia)}</b> · ${escaparHtml(resumo.tipo)}<br><b>${fmtMoeda(resumo.vl_total)}</b> · ${fmtNum(resumo.qt_total)} procedimentos`);
            setArquivo(null);
            setForm((atual) => ({ ...atual, competencia: '' }));
            setConsulta((atual) => ({ ...atual, pagina: 1 }));
            recarregar();
        } catch (falha) {
            const resposta = (falha as { response?: { status?: number; data?: { existente?: LancamentoExistente } } }).response;
            const existente = resposta?.data?.existente;
            if (resposta?.status !== 409 || !existente) {
                erro(mensagemDeErro(falha, 'Não foi possível lançar.'), 'Erro ao lançar');
                return;
            }
            const texto = `Já existe ${form.tipo} desta unidade e produto em ${fmtComp(form.competencia.replace('-', '') || previa?.resumo.competencia)}: ${fmtMoeda(existente.vl_total)}, lançado por ${existente.usuario} em ${existente.dt_lancamento}. Deseja substituir pelo novo arquivo?`;
            if (await confirmar('Competência já lançada', { texto, rotulo: 'Substituir' })) await gravar(true);
        } finally {
            setGravando(0);
        }
    };

    const atualizarLista = async (acao: () => Promise<void>) => {
        try {
            await acao();
            recarregar();
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Não foi possível concluir a operação.'));
        }
    };

    return {
        opcoes, form, arquivo, previa, gravando, rascunho, setRascunho, consulta, detalhe, setDetalhe, pronto, produtos, podeEditar,
        analisando: Boolean(chaveAnalise) && analise.chave !== chaveAnalise,
        historico: historico.dados,
        carregandoHistorico: historico.chave !== chaveHistorico,
        unidadesDoProjeto: opcoes.unidades.filter((item) => String(item.id_projeto) === form.id_projeto),
        gravar,
        alterar: (campo: keyof FormLancamento, valor: string) => setForm((atual) => ajustarProduto({ ...atual, [campo]: valor, ...(campo === 'id_projeto' && { id_unidade: '' }) }, campo, opcoes)),
        escolherArquivo: (selecionado?: File | null) => {
            if (!selecionado) return;
            setArquivo(selecionado);
            // Sugere o tipo pelo nome (PA = BPA, AP = APAC); a leitura confirma pelo conteúdo.
            const nome = selecionado.name.toUpperCase();
            const sugestao = TIPO_PELO_NOME.find(([padrao]) => padrao.test(nome));
            if (sugestao) setForm((atual) => ajustarProduto({ ...atual, tipo: sugestao[1] }, 'tipo', opcoes));
        },
        cancelarArquivo: () => setArquivo(null),
        filtrar: (evento: FormEvent) => {
            evento.preventDefault();
            setConsulta({ filtro: rascunho, pagina: 1 });
        },
        limparFiltro: () => {
            setRascunho(FILTRO_VAZIO);
            setConsulta({ filtro: FILTRO_VAZIO, pagina: 1 });
        },
        irParaPagina: (pagina: number) => setConsulta((atual) => ({ ...atual, pagina })),
        excluir: async (lancamento: Lancamento) => {
            const texto = `${lancamento.nome_unidade} · ${lancamento.tipo} · ${fmtComp(lancamento.competencia)} · ${fmtMoeda(lancamento.vl_total)}`;
            if (await confirmar('Excluir lançamento?', { texto, rotulo: 'Excluir' })) await atualizarLista(() => faturamentoApi.excluirLancamento(lancamento.id_lancamento).then(() => undefined));
        },
        revalorizar: (lancamento: Lancamento) => atualizarLista(async () => {
            const resultado = await faturamentoApi.revalorizarLancamento(lancamento.id_lancamento);
            sucessoHtml(resultado.mensagem, `${fmtMoeda(resultado.vl_anterior)} → <b>${fmtMoeda(resultado.vl_total)}</b>`);
        }),
        detalhar: async (lancamento: Lancamento) => {
            try {
                const { procedimentos } = await faturamentoApi.buscarLancamento(lancamento.id_lancamento);
                setDetalhe({ lancamento, procedimentos });
            } catch (falha) {
                erro(mensagemDeErro(falha, 'Não foi possível abrir o lançamento.'));
            }
        }
    };
}

const Metrica = ({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) => (
    <div className="rounded-lg border border-solid border-line bg-surface-2 px-3.5 py-2.5">
        <p className="m-0 mb-0.5 text-xs text-text-2">{rotulo}</p>
        <b className="block text-[15px] font-bold text-ink tabular-nums">{valor}</b>
        {detalhe && <small className="text-[11.5px] text-text-2">{detalhe}</small>}
    </div>
);

const NomeProcedimento = ({ nome }: { nome?: string | null }) => <>{nome || <i className="text-danger">Não encontrado na SIGTAP</i>}</>;

function Previa({ previa, gravando, aoCancelar, aoGravar }: { previa: PreviaLancamento; gravando: number; aoCancelar: () => void; aoGravar: () => void }) {
    const { resumo: r } = previa;
    const temErro = previa.avisos.some((aviso) => aviso.nivel === 'erro');

    return (
        <div className="border-0 border-t border-solid border-line-2 p-[18px]">
            <div className="mb-3.5 flex items-start justify-between gap-4">
                <div>
                    <small className="text-xs text-text-2">Prévia do lançamento</small>
                    <h3 className="m-0 text-[17px] font-semibold text-ink">{r.unidade}</h3>
                    <span className="text-[13px] text-text-2">{r.projeto} · {r.produto} · {r.tipo}{r.origem ? ` · origem ${r.origem}` : ''}</span>
                </div>
                <div className="text-right">
                    <small className="text-xs text-text-2">Valor SIGTAP</small>
                    <strong className="block text-[22px] font-bold text-pine-800 tabular-nums">{fmtMoeda(r.vl_total)}</strong>
                    <span className="text-[13px] text-text-2">Competência <b className="tabular-nums">{fmtComp(r.competencia)}</b></span>
                </div>
            </div>
            <div className="mb-3.5 grid grid-cols-5 gap-2.5">
                <Metrica rotulo="Competência do arquivo" valor={fmtComp(r.competencia_arquivo)} />
                <Metrica rotulo="CNES do arquivo" valor={r.cnes_arquivo || '-'} detalhe={`Unidade: ${r.cnes_unidade || 'sem CNES'}`} />
                <Metrica rotulo="Procedimentos (qtd)" valor={fmtNum(r.qt_total)} detalhe={`${fmtNum(r.qt_procedimentos)} códigos · ${fmtNum(r.qt_registros)} ${r.tipo === 'AIH' ? 'AIHs' : 'registros'}`} />
                {r.tipo === 'AIH'
                    ? <Metrica rotulo="Internações (AIHs)" valor={fmtNum(r.qt_registros)} detalhe={`${fmtMoeda(r.qt_registros ? r.vl_total / r.qt_registros : 0)} por AIH`} />
                    : <Metrica rotulo="Pacientes distintos" valor={r.qt_pacientes ? fmtNum(r.qt_pacientes) : '-'} detalhe={r.tipo === 'BPA' ? 'pelo CNS do BPA-I' : 'não se aplica'} />}
                <Metrica rotulo="Tabela SIGTAP" valor={fmtComp(r.sigtap_competencia)} />
            </div>
            {r.por_origem.length > 1 && (
                <div className="mb-3.5 flex gap-2.5">
                    {r.por_origem.map((origem) => (
                        <div key={origem.origem} className="flex flex-1 justify-between gap-2 rounded-lg bg-surface-2 px-3.5 py-2 text-[13px]">
                            <b className="font-semibold">{ORIGEM_ROTULO[origem.origem] ?? origem.origem}</b>
                            <span className="tabular-nums">{fmtNum(origem.quantidade)} proc. · {fmtMoeda(origem.vl_total)}</span>
                        </div>
                    ))}
                </div>
            )}
            {previa.avisos.length > 0 && (
                <ul className="m-0 mb-3.5 flex list-none flex-col gap-1.5 p-0">
                    {previa.avisos.map((aviso) => <li key={aviso.texto} className={cn('rounded-md px-3 py-1.5 text-[13px]', TOM_AVISO[aviso.nivel])}><Icon n={ICONE_AVISO[aviso.nivel]} /> {aviso.texto}</li>)}
                </ul>
            )}
            {previa.existente && (
                <p className="m-0 mb-3.5 rounded-lg bg-brass-tint px-4 py-2.5 text-[13px] text-ink"><Icon n="alert" /> Esta competência já foi lançada ({fmtMoeda(previa.existente.vl_total)} por {previa.existente.usuario} em {previa.existente.dt_lancamento}). Ao confirmar, o lançamento anterior será <b>substituído</b>.</p>
            )}
            <Tabela cabecalho={<><Th>Código</Th><Th>Procedimento</Th><Th className="text-right">Qtd</Th><Th className="text-right">Valor unit.</Th><Th className="text-right">Total</Th></>}>
                {previa.procedimentos.slice(0, LINHAS_PREVIA).map((item) => (
                    <tr key={item.co_procedimento} className={cn(item.encontrado === false && 'bg-danger-tint')}>
                        <Td className="whitespace-nowrap font-mono text-[13px]">{fmtProc(item.co_procedimento)}</Td>
                        <Td><NomeProcedimento nome={item.no_procedimento} /></Td>
                        <Td className="text-right tabular-nums">{fmtNum(item.quantidade)}</Td>
                        <Td className="text-right whitespace-nowrap tabular-nums">{fmtMoeda(item.vl_unitario)}</Td>
                        <Td className="text-right whitespace-nowrap tabular-nums">{fmtMoeda(item.vl_total)}</Td>
                    </tr>
                ))}
            </Tabela>
            {previa.procedimentos.length > LINHAS_PREVIA && <small className="mt-1.5 block text-xs text-text-2">Mostrando os {LINHAS_PREVIA} maiores de {previa.procedimentos.length} procedimentos.</small>}
            <div className="mt-3.5 flex justify-end gap-2.5">
                <Button variant="secondary" onClick={aoCancelar}>Cancelar</Button>
                <Button disabled={temErro || gravando > 0} onClick={aoGravar}><Icon n="save" /> {gravando > 0 ? `Gravando ${gravando}%...` : (previa.existente ? 'Substituir lançamento' : 'Confirmar lançamento')}</Button>
            </div>
        </div>
    );
}

function NovoLancamento({ l }: { l: ReturnType<typeof useLancamento> }) {
    const [arrastando, setArrastando] = useState(false);
    const entrada = useRef<HTMLInputElement>(null);
    const { form, arquivo, opcoes } = l;

    const aoSoltar = (evento: DragEvent) => {
        evento.preventDefault();
        setArrastando(false);
        l.escolherArquivo(evento.dataTransfer.files?.[0]);
    };

    return (
        <Card className="mb-3.5">
            <CardTitulo titulo="Novo lançamento" ajuda={REGRA_NOVO_LANCAMENTO} extra={opcoes.sigtap.length === 0 ? <span className="rounded-full bg-danger-tint px-2.5 py-0.5 text-xs font-semibold text-danger">SIGTAP não importada</span> : undefined} />
            <div className="p-[18px]">
                <div className="mb-3.5 grid grid-cols-4 gap-3.5">
                    <Field rotulo="Projeto" htmlFor="fl-projeto">
                        <Select id="fl-projeto" value={form.id_projeto} onChange={(e) => l.alterar('id_projeto', e.target.value)}>
                            <option value="">Selecione...</option>
                            {opcoes.projetos.map((item) => <option key={item.id_projeto} value={item.id_projeto}>{item.nome_projeto}{item.ativo ? '' : ' (inativo)'}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Unidade" htmlFor="fl-unidade">
                        <Select id="fl-unidade" disabled={!form.id_projeto} value={form.id_unidade} onChange={(e) => l.alterar('id_unidade', e.target.value)}>
                            <option value="">{form.id_projeto ? 'Selecione...' : 'Escolha o projeto'}</option>
                            {l.unidadesDoProjeto.map((item) => <option key={item.id_unidade} value={item.id_unidade}>{item.nome_unidade}{item.cnes ? ` - CNES ${item.cnes}` : ''}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Produto" htmlFor="fl-produto">
                        <Select id="fl-produto" value={form.id_produto} onChange={(e) => l.alterar('id_produto', e.target.value)}>
                            <option value="">Selecione...</option>
                            {l.produtos.map((item) => <option key={item.id_produto} value={item.id_produto}>{item.nome_produto}{item.vinculado ? ' ✓' : ''}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Competência" htmlFor="fl-competencia" ajuda="Vazio = usa a competência do arquivo">
                        <Input id="fl-competencia" type="month" value={form.competencia} onChange={(e) => l.alterar('competencia', e.target.value)} />
                    </Field>
                </div>
                <div role="radiogroup" aria-label="Tipo de arquivo" className="mb-3.5 grid grid-cols-3 gap-2.5">
                    {TIPOS.map((tipo) => (
                        <button key={tipo} type="button" role="radio" aria-checked={form.tipo === tipo} onClick={() => l.alterar('tipo', tipo)} className={cn('cursor-pointer rounded-lg border border-solid p-3 text-center font-sans text-sm font-bold text-pine-800 transition-colors', form.tipo === tipo ? 'border-pine bg-tint' : 'border-line bg-white hover:bg-surface-2')}>{tipo}</button>
                    ))}
                </div>
                <div onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={aoSoltar} className={cn('flex flex-col items-center rounded-[10px] border-2 border-dashed p-5 text-center transition-colors', arrastando || arquivo ? 'border-pine bg-tint' : 'border-line bg-surface-2')}>
                    <b className="text-sm font-semibold text-ink">{arquivo ? 'Arquivo selecionado' : 'Arraste o arquivo aqui ou escolha'}</b>
                    {arquivo
                        ? <span className="mt-1 font-mono text-[13px]">{arquivo.name} <small className="font-sans text-xs text-text-2">({Math.round(arquivo.size / 1024).toLocaleString('pt-BR')} KB)</small></span>
                        : null}
                    <label className="m-0 mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-solid border-line bg-white px-4 py-2.5 text-sm font-medium text-text hover:bg-surface-2">
                        <Icon n="file" /> {arquivo ? 'Trocar arquivo' : 'Escolher arquivo'}
                        <input ref={entrada} type="file" className="hidden" onChange={(e) => { l.escolherArquivo(e.target.files?.[0]); if (entrada.current) entrada.current.value = ''; }} />
                    </label>
                    {arquivo && !l.pronto && <small className="mt-2 text-xs text-text-2">Selecione projeto, unidade e produto para ler o arquivo.</small>}
                </div>
                {l.analisando && <p className="m-0 mt-3 text-center text-[13px] text-text-2">Lendo e valorizando o arquivo...</p>}
            </div>
            {l.previa && <Previa previa={l.previa} gravando={l.gravando} aoCancelar={l.cancelarArquivo} aoGravar={() => l.gravar(Boolean(l.previa?.existente))} />}
        </Card>
    );
}

function Historico({ l }: { l: ReturnType<typeof useLancamento> }) {
    const { rascunho, setRascunho, opcoes, historico } = l;
    const unidades = rascunho.projeto ? opcoes.unidades.filter((item) => String(item.id_projeto) === rascunho.projeto) : opcoes.unidades;

    return (
        <>
            <BalaoAjuda texto={REGRA_HISTORICO} className="mb-2.5 flex w-fit items-center gap-1.5"><h2 className="m-0 text-[14.5px] font-semibold text-ink">Lançamentos realizados</h2></BalaoAjuda>
            <Card className="mb-3.5 px-4 py-3.5">
                <form onSubmit={l.filtrar} className="flex items-end gap-3.5">
                    <Field rotulo="Projeto" htmlFor="fh-projeto" className="flex-1">
                        <Select id="fh-projeto" value={rascunho.projeto} onChange={(e) => setRascunho({ ...rascunho, projeto: e.target.value, unidade: '' })}>
                            <option value="">Todos</option>
                            {opcoes.projetos.map((item) => <option key={item.id_projeto} value={item.id_projeto}>{item.nome_projeto}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Unidade" htmlFor="fh-unidade" className="flex-1">
                        <Select id="fh-unidade" value={rascunho.unidade} onChange={(e) => setRascunho({ ...rascunho, unidade: e.target.value })}>
                            <option value="">Todas</option>
                            {unidades.map((item) => <option key={item.id_unidade} value={item.id_unidade}>{item.nome_unidade}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Competência" htmlFor="fh-competencia" className="w-44"><Input id="fh-competencia" type="month" value={rascunho.competencia} onChange={(e) => setRascunho({ ...rascunho, competencia: e.target.value })} /></Field>
                    <Field rotulo="Tipo" htmlFor="fh-tipo" className="w-28">
                        <Select id="fh-tipo" value={rascunho.tipo} onChange={(e) => setRascunho({ ...rascunho, tipo: e.target.value })}>
                            <option value="">Todos</option>
                            {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                        </Select>
                    </Field>
                    <div className="flex gap-2">
                        <Button type="submit"><Icon n="search" /> Buscar</Button>
                        <Button variant="secondary" onClick={l.limparFiltro}>Limpar</Button>
                    </div>
                </form>
            </Card>
            <Tabela cabecalho={<><Th>Unidade / Projeto</Th><Th>Competência</Th><Th>Tipo / Produto</Th><Th className="text-right">Procedimentos</Th><Th className="text-right">Valor SIGTAP</Th><Th>Lançado por</Th><Th centro>Ações</Th></>}>
                {l.carregandoHistorico && <LinhaVazia colunas={7}>Carregando...</LinhaVazia>}
                {!l.carregandoHistorico && !historico.itens.length && <LinhaVazia colunas={7}>Nenhum lançamento encontrado. Envie o primeiro arquivo de produção acima.</LinhaVazia>}
                {!l.carregandoHistorico && historico.itens.map((item) => (
                    <tr key={item.id_lancamento}>
                        <Td><b className="font-semibold">{item.nome_unidade}</b><small className="block text-xs text-text-2">{item.nome_projeto}{item.cnes ? ` · CNES ${item.cnes}` : ''}</small></Td>
                        <Td className="whitespace-nowrap tabular-nums">{fmtComp(item.competencia)}{item.competencia_arquivo && item.competencia_arquivo !== item.competencia && <small className="block text-xs text-brass">arquivo {fmtComp(item.competencia_arquivo)}</small>}</Td>
                        <Td><Badge>{item.tipo}</Badge><small className="mt-0.5 block text-xs text-text-2">{item.nome_produto}</small></Td>
                        <Td className="text-right tabular-nums">{fmtNum(item.qt_total)}<small className="block text-xs text-text-2">{item.tipo === 'AIH' ? `${fmtNum(item.qt_registros)} AIHs · ` : ''}{fmtNum(item.qt_procedimentos)} códigos</small></Td>
                        <Td className="text-right whitespace-nowrap tabular-nums"><b>{fmtMoeda(item.vl_total)}</b><small className="block text-xs text-text-2">SIGTAP {fmtComp(item.sigtap_competencia)}{item.sigtap_competencia !== item.competencia ? ' *' : ''}</small></Td>
                        <Td>{item.usuario}<small className="block text-xs text-text-2">{item.dt_lancamento}</small></Td>
                        <Td centro className="whitespace-nowrap">
                            <button type="button" title="Ver procedimentos" aria-label="Ver procedimentos" onClick={() => l.detalhar(item)} className="cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-pine hover:bg-tint"><Icon n="search" /></button>
                            {l.podeEditar && <button type="button" title="Recalcular valores pela SIGTAP" aria-label="Recalcular valores pela SIGTAP" onClick={() => l.revalorizar(item)} className="cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-pine hover:bg-tint"><Icon n="refresh" /></button>}
                            {l.podeEditar && <button type="button" title="Excluir lançamento" aria-label="Excluir lançamento" onClick={() => l.excluir(item)} className="cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-danger hover:bg-danger-tint"><Icon n="trash" /></button>}
                        </Td>
                    </tr>
                ))}
            </Tabela>
            <Paginacao pagina={l.consulta.pagina} totalPaginas={Math.max(1, Math.ceil(historico.total / (historico.tamanho || 15)))} totalItens={historico.total} aoMudar={l.irParaPagina} />
        </>
    );
}

export function LancamentoPage() {
    const voltar = useVoltar();
    const navigate = useNavigate();
    const { podeAcao, podeAcessar } = useAuth();
    const l = useLancamento(podeAcao('faturamento_lancar', 'pode_editar'));
    const { detalhe } = l;

    return (
        <>
            <PageHeader
                titulo="Lançar Faturamento"
                acoes={(
                    <>
                        {podeAcessar('painel_faturamento') && <Button variant="secondary" onClick={() => navigate('/system/faturamento/consolidado')}><Icon n="trend" /> Faturamento Consolidado</Button>}
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                    </>
                )}
            />
            {podeAcao('faturamento_lancar', 'pode_novo') && <NovoLancamento l={l} />}
            <Historico l={l} />
            {detalhe && (
                <Janela titulo={`${detalhe.lancamento.nome_unidade} · ${fmtComp(detalhe.lancamento.competencia)}`} larguraClasse="w-[900px]" aoFechar={() => l.setDetalhe(null)}>
                    <p className="m-0 mb-3 text-[13px] text-text-2">{detalhe.lancamento.tipo} · {detalhe.lancamento.nome_produto} · arquivo <b>{detalhe.lancamento.arquivo || '-'}</b> · SIGTAP {fmtComp(detalhe.lancamento.sigtap_competencia)}</p>
                    <Tabela cabecalho={<><Th>Código</Th><Th>Procedimento</Th><Th className="text-right">Qtd</Th><Th className="text-right">Valor</Th></>}>
                        {detalhe.procedimentos.map((item) => (
                            <tr key={item.co_procedimento}>
                                <Td className="whitespace-nowrap font-mono text-[13px]">{fmtProc(item.co_procedimento)}</Td>
                                <Td><NomeProcedimento nome={item.no_procedimento} /></Td>
                                <Td className="text-right tabular-nums">{fmtNum(item.quantidade)}</Td>
                                <Td className="text-right whitespace-nowrap tabular-nums">{fmtMoeda(item.vl_total)}</Td>
                            </tr>
                        ))}
                    </Tabela>
                </Janela>
            )}
        </>
    );
}
