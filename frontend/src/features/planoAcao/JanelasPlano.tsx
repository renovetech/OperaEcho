/* Janelas da grade: nova ação, equipe, horas trabalhadas e dados do plano. */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Icon from '@/shared/ui/Icon';
import { OPCOES_PRIORIDADE, OPCOES_RESPONSAVEL } from '@/features/planoAcao/templates';
import * as planoApi from '@/features/planoAcao/api';
import type { Apontamento, CabecalhoPlano, DadosPlano, ItemPlano, NovaAcaoItem, PessoaEquipe } from '@/features/planoAcao/api';
import { Avatar, BotaoIcone, TagModulo } from '@/features/planoAcao/componentes';
import { erroHtml } from '@/features/planoAcao/dialogos';
import { dataBR, fmtMin, hhmmParaMin, mascararHora, minParaHHMM, nomeCurto, soData } from '@/features/planoAcao/formatos';
import type { ContextoAcao } from '@/features/planoAcao/hooksDetalhes';
import { aviso, confirmar } from '@/shared/feedback';
import { cn, hojeLocal, logErro } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Checkbox, Field, Input, Select, Textarea } from '@/shared/ui/Campos';
import { Janela } from '@/shared/ui/Janela';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

export function JanelaNovaAcao({ ctx, clientePadrao, aoFechar, aoSalvar }: { ctx: ContextoAcao; clientePadrao: string; aoFechar: () => void; aoSalvar: (dados: Partial<NovaAcaoItem> & { descricao: string }) => Promise<void> }) {
    const [form, setForm] = useState({ descricao: '', responsavel: '', cliente: '', data_inicio: '', data_fim: '', prioridade: 'Alta' });
    const [salvando, setSalvando] = useState(false);
    const alterar = (campo: keyof typeof form, valor: string) => setForm((atual) => ({ ...atual, [campo]: valor }));

    const enviar = async (evento: FormEvent) => {
        evento.preventDefault();
        if (!form.descricao.trim()) return aviso('Descreva a ação.');
        if (form.data_inicio && form.data_fim && form.data_fim < form.data_inicio) return aviso('O fim previsto não pode ser anterior ao início.');
        setSalvando(true);
        await aoSalvar({ ...form, descricao: form.descricao.trim(), responsavel: form.responsavel || null, cliente: form.cliente || null, data_inicio: form.data_inicio || null, data_fim: form.data_fim || null });
        setSalvando(false);
        return undefined;
    };

    return (
        <Janela titulo="Nova ação" larguraClasse="w-[620px]" aoFechar={aoFechar}>
            <form onSubmit={enviar} className="flex flex-col gap-3.5">
                {ctx.rotulo && <p className="m-0 text-[13px] text-text-2"><Icon n={ctx.id_unidade ? 'building' : 'grid'} /> {ctx.id_unidade ? 'Unidade' : 'Etapa'}: <b className="text-ink">{ctx.rotulo}</b> {ctx.modulo && <TagModulo>{ctx.modulo}</TagModulo>}</p>}
                <Field rotulo="O que será feito?" htmlFor="na-descricao" obrigatorio><Textarea id="na-descricao" rows={3} maxLength={1000} placeholder="Descreva a ação a ser realizada" value={form.descricao} onChange={(e) => alterar('descricao', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3.5">
                    <Field rotulo="Responsável" htmlFor="na-resp">
                        <Select id="na-resp" value={form.responsavel} onChange={(e) => alterar('responsavel', e.target.value)}>
                            <option value="">-</option>
                            {OPCOES_RESPONSAVEL.map((opcao: string) => <option key={opcao}>{opcao}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Cliente" htmlFor="na-cliente"><Input id="na-cliente" maxLength={200} placeholder={clientePadrao || 'Cliente do plano'} value={form.cliente} onChange={(e) => alterar('cliente', e.target.value)} /></Field>
                    <Field rotulo="Início previsto" htmlFor="na-inicio"><Input id="na-inicio" type="date" min="1900-01-01" max="2100-12-31" value={form.data_inicio} onChange={(e) => alterar('data_inicio', e.target.value)} /></Field>
                    <Field rotulo="Fim previsto" htmlFor="na-fim"><Input id="na-fim" type="date" max="2100-12-31" min={form.data_inicio || undefined} value={form.data_fim} onChange={(e) => alterar('data_fim', e.target.value)} /></Field>
                </div>
                <div role="radiogroup" aria-label="Prioridade" className="flex items-center gap-2">
                    <span className="mr-1 text-[12.5px] font-medium text-text">Prioridade</span>
                    {OPCOES_PRIORIDADE.map((opcao: string) => <Button key={opcao} size="sm" role="radio" aria-checked={form.prioridade === opcao} variant={form.prioridade === opcao ? 'primary' : 'secondary'} onClick={() => alterar('prioridade', opcao)}>{opcao}</Button>)}
                </div>
                <div className="flex justify-end gap-2.5">
                    <Button variant="secondary" onClick={aoFechar}>Cancelar</Button>
                    <Button type="submit" isLoading={salvando}><Icon n="plus" /> Incluir ação</Button>
                </div>
            </form>
        </Janela>
    );
}

export function JanelaEquipe({ item, disponiveis, editavel, aoFechar, aoAplicar }: { item: ItemPlano; disponiveis: PessoaEquipe[]; editavel: boolean; aoFechar: () => void; aoAplicar: (lista: PessoaEquipe[]) => void }) {
    const [selecionados, setSelecionados] = useState(() => new Map((item.equipe ?? []).map((pessoa) => [pessoa.id_usuario, pessoa])));
    const [busca, setBusca] = useState('');
    const [soAtivos, setSoAtivos] = useState(true);
    const termo = busca.toLowerCase();
    const lista = disponiveis.filter((pessoa) => (!soAtivos || pessoa.ativo !== false || selecionados.has(pessoa.id_usuario))
        && (!busca || nomeCurto(pessoa.nome_completo).toLowerCase().includes(termo) || (pessoa.nome_funcao ?? '').toLowerCase().includes(termo)));

    const alternar = (pessoa: PessoaEquipe) => setSelecionados((atual) => {
        const proximo = new Map(atual);
        if (proximo.has(pessoa.id_usuario)) proximo.delete(pessoa.id_usuario);
        else proximo.set(pessoa.id_usuario, { id_usuario: pessoa.id_usuario, nome_completo: nomeCurto(pessoa.nome_completo) });
        return proximo;
    });

    return (
        <Janela
            titulo="Equipe da ação"
            aoFechar={aoFechar}
            rodape={editavel ? (
                <>
                    <span className="mr-auto self-center text-[13px] text-text-2">{selecionados.size} selecionada(s)</span>
                    <Button variant="secondary" onClick={aoFechar}>Cancelar</Button>
                    <Button onClick={() => aoAplicar([...selecionados.values()])}>Aplicar</Button>
                </>
            ) : undefined}
        >
            <p className="m-0 mb-3 text-[13px] text-text-2">{item.descricao}</p>
            {editavel ? (
                <>
                    <div className="mb-3 flex items-center gap-3">
                        <Input aria-label="Buscar por nome ou função" className="flex-1" placeholder="Buscar por nome ou função..." value={busca} onChange={(e) => setBusca(e.target.value)} />
                        <Checkbox className="m-0" rotulo="Só ativos" checked={soAtivos} onChange={(e) => setSoAtivos(e.target.checked)} />
                    </div>
                    <div className="flex max-h-[340px] flex-col gap-1 overflow-y-auto">
                        {lista.map((pessoa) => (
                            <label key={pessoa.id_usuario} className={cn('m-0 flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px]', selecionados.has(pessoa.id_usuario) ? 'bg-tint' : 'hover:bg-surface-2')}>
                                <input type="checkbox" className="m-0 accent-pine" checked={selecionados.has(pessoa.id_usuario)} onChange={() => alternar(pessoa)} />
                                <Avatar nome={nomeCurto(pessoa.nome_completo)} />
                                <span>{nomeCurto(pessoa.nome_completo)}<small className="block text-xs text-text-2">{[pessoa.nome_funcao, pessoa.ativo === false ? 'inativo' : null].filter(Boolean).join(' · ')}</small></span>
                            </label>
                        ))}
                        {!lista.length && <p className="m-0 p-4 text-center text-sm text-text-2">Ninguém encontrado.</p>}
                    </div>
                </>
            ) : (
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {(item.equipe ?? []).map((pessoa) => <li key={pessoa.id_usuario} className="flex items-center gap-2.5 text-[13.5px]"><Avatar nome={nomeCurto(pessoa.nome_completo)} /> {nomeCurto(pessoa.nome_completo)}</li>)}
                    {!item.equipe?.length && <li className="p-4 text-center text-sm text-text-2">Sem equipe definida.</li>}
                </ul>
            )}
        </Janela>
    );
}

interface JanelaHorasProps {
    item: ItemPlano;
    equipe: PessoaEquipe[];
    editavel: boolean;
    podeApontar: boolean;
    idUsuario: number;
    aoFechar: (mudou: boolean) => void;
}

export function JanelaHoras({ item, equipe, editavel, podeApontar, idUsuario, aoFechar }: JanelaHorasProps) {
    const [lista, setLista] = useState<Apontamento[] | null>(null);
    const [mudou, setMudou] = useState(false);
    const [versao, setVersao] = useState(0);
    const [form, setForm] = useState({ data_execucao: hojeLocal(), horas: '', descricao: '', id_usuario: idUsuario });
    const fechar = useCallback(() => aoFechar(mudou), [aoFechar, mudou]);
    const total = (lista ?? []).reduce((soma, apontamento) => soma + (apontamento.minutos || 0), 0);

    useEffect(() => {
        let ativo = true;
        planoApi.listarApontamentos(item.id_item)
            .then((dados) => { if (ativo) setLista(dados); })
            .catch((falha: unknown) => {
                logErro('Erro ao listar apontamentos', falha);
                if (ativo) setLista([]);
            });
        return () => { ativo = false; };
    }, [item.id_item, versao]);

    const atualizado = () => {
        setMudou(true);
        setVersao((atual) => atual + 1);
    };

    const apontar = async (evento: FormEvent) => {
        evento.preventDefault();
        const minutos = hhmmParaMin(form.horas);
        if (!minutos) return aviso('Informe as horas no formato hh:mm.');
        try {
            await planoApi.apontarHoras(item.id_item, { data_execucao: form.data_execucao, minutos, descricao: form.descricao, id_usuario: form.id_usuario });
            setForm((atual) => ({ ...atual, horas: '', descricao: '' }));
            atualizado();
        } catch (falha) {
            erroHtml(falha, undefined, 'Não foi possível apontar');
        }
        return undefined;
    };

    const excluir = async (apontamento: Apontamento) => {
        if (!await confirmar('Excluir apontamento?', { rotulo: 'Excluir' })) return;
        try {
            await planoApi.excluirApontamento(apontamento.id_apontamento);
            atualizado();
        } catch (falha) {
            erroHtml(falha);
        }
    };

    return (
        <Janela titulo="Horas trabalhadas" larguraClasse="w-[720px]" aoFechar={fechar}>
            <p className="m-0 mb-1.5 text-[13px] text-text-2">{item.descricao}</p>
            <p className="m-0 mb-3 text-sm text-ink">Total apontado: <b>{fmtMin(total)}</b>{item.tempo_previsto ? <> · previsto <b>{fmtMin(item.tempo_previsto)}</b></> : null}</p>
            {podeApontar && (
                <form onSubmit={apontar} className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-solid border-line bg-surface-2 p-2.5">
                    {editavel && (
                        <Select aria-label="Pessoa" className="w-44" value={form.id_usuario} onChange={(e) => setForm((atual) => ({ ...atual, id_usuario: Number(e.target.value) }))}>
                            {equipe.filter((pessoa) => pessoa.ativo !== false).map((pessoa) => <option key={pessoa.id_usuario} value={pessoa.id_usuario}>{nomeCurto(pessoa.nome_completo)}</option>)}
                        </Select>
                    )}
                    <Input aria-label="Data" type="date" required min="1900-01-01" max={hojeLocal()} className="w-40" value={form.data_execucao} onChange={(e) => setForm((atual) => ({ ...atual, data_execucao: e.target.value }))} />
                    <Input aria-label="Horas" required inputMode="numeric" placeholder="hh:mm" maxLength={5} className="w-20" value={form.horas} onChange={(e) => setForm((atual) => ({ ...atual, horas: mascararHora(e.target.value) }))} />
                    <Input aria-label="Descrição" className="min-w-40 flex-1" maxLength={500} placeholder="O que foi executado (opcional)" value={form.descricao} onChange={(e) => setForm((atual) => ({ ...atual, descricao: e.target.value }))} />
                    <Button type="submit"><Icon n="plus" /> Apontar</Button>
                </form>
            )}
            <Tabela cabecalho={<><Th>Data</Th><Th>Pessoa</Th><Th centro>Tempo</Th><Th>Descrição</Th><Th aria-label="Ações" /></>}>
                {lista === null && <LinhaVazia colunas={5}>Carregando...</LinhaVazia>}
                {lista?.length === 0 && <LinhaVazia colunas={5}>Nenhum apontamento.</LinhaVazia>}
                {lista?.map((apontamento) => (
                    <tr key={apontamento.id_apontamento}>
                        <Td className="tabular-nums">{dataBR(apontamento.data_execucao)}</Td>
                        <Td>{nomeCurto(apontamento.nome_completo)}</Td>
                        <Td centro className="font-semibold tabular-nums">{minParaHHMM(apontamento.minutos)}</Td>
                        <Td>{apontamento.descricao || '-'}</Td>
                        <Td>{podeApontar && (editavel || apontamento.id_usuario === idUsuario || apontamento.registrado_por === idUsuario) && <BotaoIcone perigo icone="trash" titulo="Excluir" onClick={() => excluir(apontamento)} />}</Td>
                    </tr>
                ))}
            </Tabela>
        </Janela>
    );
}

export function JanelaDadosPlano({ cabecalho, aoFechar, aoSalvar }: { cabecalho: CabecalhoPlano; aoFechar: () => void; aoSalvar: (dados: DadosPlano) => Promise<boolean> }) {
    const [form, setForm] = useState({
        titulo: cabecalho.titulo ?? '', cliente: cabecalho.cliente ?? '', descricao: cabecalho.descricao ?? '',
        data_inicio_prevista: soData(cabecalho.data_inicio_prevista), data_fim_prevista: soData(cabecalho.data_fim_prevista)
    });
    const [salvando, setSalvando] = useState(false);
    const alterar = (campo: keyof typeof form, valor: string) => setForm((atual) => ({ ...atual, [campo]: valor }));

    const salvar = async (evento: FormEvent) => {
        evento.preventDefault();
        if (form.data_inicio_prevista && form.data_fim_prevista && form.data_fim_prevista < form.data_inicio_prevista) return aviso('O término previsto não pode ser anterior ao início.');
        setSalvando(true);
        const salvou = await aoSalvar({ ...form, data_inicio_prevista: form.data_inicio_prevista || null, data_fim_prevista: form.data_fim_prevista || null });
        setSalvando(false);
        if (salvou) aoFechar();
        return undefined;
    };

    return (
        <Janela titulo="Dados do plano" larguraClasse="w-[640px]" aoFechar={aoFechar}>
            <form onSubmit={salvar} className="grid grid-cols-2 gap-3.5">
                <Field rotulo="Título" htmlFor="dp-titulo" obrigatorio className="col-span-2"><Input id="dp-titulo" required maxLength={300} value={form.titulo} onChange={(e) => alterar('titulo', e.target.value)} /></Field>
                <Field rotulo="Cliente" htmlFor="dp-cliente" className="col-span-2"><Input id="dp-cliente" maxLength={200} value={form.cliente} onChange={(e) => alterar('cliente', e.target.value)} /></Field>
                <Field rotulo="Início previsto" htmlFor="dp-inicio"><Input id="dp-inicio" type="date" min="1900-01-01" max="2100-12-31" value={form.data_inicio_prevista} onChange={(e) => alterar('data_inicio_prevista', e.target.value)} /></Field>
                <Field rotulo="Término previsto" htmlFor="dp-fim"><Input id="dp-fim" type="date" max="2100-12-31" min={form.data_inicio_prevista || undefined} value={form.data_fim_prevista} onChange={(e) => alterar('data_fim_prevista', e.target.value)} /></Field>
                <Field rotulo="Objetivo / escopo" htmlFor="dp-descricao" className="col-span-2"><Textarea id="dp-descricao" rows={3} maxLength={1000} value={form.descricao} onChange={(e) => alterar('descricao', e.target.value)} /></Field>
                <div className="col-span-2 flex justify-end gap-2.5">
                    <Button variant="secondary" onClick={aoFechar}>Cancelar</Button>
                    <Button type="submit" isLoading={salvando}>Salvar</Button>
                </div>
            </form>
        </Janela>
    );
}
