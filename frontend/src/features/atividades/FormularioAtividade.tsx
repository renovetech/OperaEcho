import Icon from '@/shared/ui/Icon';
import type { Atividade, Pessoa } from '@/features/atividades/api';
import { nomeDoAnexo, useFormAtividade, type ListasAtividade, type OrigemAtividade } from '@/features/atividades/hooks';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, GrupoSelecao, Input, Select } from '@/shared/ui/Campos';
import { FormCard, FormSecao } from '@/shared/ui/Pagina';

interface SeletorEquipeProps {
    id: string;
    rotulo: string;
    obrigatorio?: boolean;
    placeholder: string;
    disabled?: boolean;
    opcoes: Pessoa[];
    selecionados: number[];
    nomeDe: (id: number) => string;
    aoAlternar: (id: number) => void;
}

/** Escolher na lista já adiciona; cada pessoa escolhida vira uma etiqueta removível. */
function SeletorEquipe({ id, rotulo, obrigatorio, placeholder, disabled, opcoes, selecionados, nomeDe, aoAlternar }: SeletorEquipeProps) {
    return (
        <Field rotulo={rotulo} htmlFor={id} obrigatorio={obrigatorio}>
            <Select id={id} value="" disabled={disabled} onChange={(evento) => { if (evento.target.value) aoAlternar(Number(evento.target.value)); }}>
                <option value="">{placeholder}</option>
                {opcoes.filter((pessoa) => !selecionados.includes(pessoa.id_usuario)).map((pessoa) => <option key={pessoa.id_usuario} value={pessoa.id_usuario}>{pessoa.nome_completo}</option>)}
            </Select>
            {selecionados.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-2">
                    {selecionados.map((pessoa) => (
                        <span key={pessoa} className="inline-flex items-center gap-1.5 rounded-full bg-tint py-1 pr-1.5 pl-3 text-[13px] font-medium text-pine-800">
                            {nomeDe(pessoa)}
                            <button type="button" aria-label={`Remover ${nomeDe(pessoa)}`} onClick={() => aoAlternar(pessoa)} className="cursor-pointer border-0 bg-transparent p-0 px-1 text-sm leading-none text-current">×</button>
                        </span>
                    ))}
                </div>
            )}
        </Field>
    );
}

function LinhaAnexo({ icone, nome, rotulo, aoRemover }: { icone: string; nome: string; rotulo: string; aoRemover: () => void }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-md border border-solid border-line bg-white px-3 py-2 text-[13px] text-ink">
            <span className="min-w-0 truncate"><Icon n={icone} /> {nome}</span>
            <Button variant="ghost" size="sm" className="shrink-0 text-danger" onClick={aoRemover}><Icon n="x" /> {rotulo}</Button>
        </div>
    );
}

interface FormularioProps extends OrigemAtividade {
    atividade: Atividade | null;
    listas: ListasAtividade;
    aoSair: () => void;
    aoConcluir: () => void;
}

export function FormularioAtividade({ modulo, apiBase, lotacao, atividade, listas, aoSair, aoConcluir }: FormularioProps) {
    const f = useFormAtividade({ modulo, apiBase, lotacao, atividade, aoConcluir });
    const { form, obrigatorio } = f;
    // Quem já saiu da lista de ativos continua identificado no registro antigo.
    const conhecidos = [...listas.equipe, ...f.equipeDoProjeto, ...(atividade?.lista_implantadores ?? []), ...(atividade?.lista_equipe_projeto ?? [])];
    const nomeDe = (id: number) => conhecidos.find((pessoa) => pessoa.id_usuario === id)?.nome_completo ?? `ID ${id}`;

    let ajudaAnexo = '(opcional)';
    if (obrigatorio.anexo) ajudaAnexo = '(mantenha ou envie ao menos um)';
    else if (f.regras.anexo) ajudaAnexo = '(opcional para Apoio ao Projeto)';

    return (
        <FormCard
            aoEnviar={f.salvar}
            rodape={(
                <>
                    <Button variant="secondary" onClick={aoSair}>Cancelar</Button>
                    {f.podeSalvar
                        ? <Button type="submit" isLoading={f.salvando}>{form.id_atividade ? 'Salvar alterações' : 'Salvar registro'}</Button>
                        : <span className="text-[13px] text-text-2">Sem permissão para salvar.</span>}
                </>
            )}
        >
            <FormSecao titulo="Período e horas">
                <div className="grid grid-cols-5 gap-3.5">
                    <Field rotulo="Data início" htmlFor="at-inicio" obrigatorio><Input id="at-inicio" type="date" min="1900-01-01" max="2100-12-31" name="data_inicio" value={form.data_inicio} onChange={f.alterarCampo} required /></Field>
                    <Field rotulo="Data fim" htmlFor="at-fim"><Input id="at-fim" type="date" min="1900-01-01" max="2100-12-31" name="data_fim" value={form.data_fim} onChange={f.alterarCampo} /></Field>
                    <Field rotulo="Redmine" htmlFor="at-redmine"><Input id="at-redmine" type="number" name="redmine" placeholder="140794" value={form.redmine} onChange={f.alterarCampo} /></Field>
                    <Field rotulo="Profissionais" htmlFor="at-prof" obrigatorio={obrigatorio.profissionais}><Input id="at-prof" type="number" name="profissionais_env" placeholder={f.semProfissionais ? 'N/A' : 'Qtd'} disabled={f.semProfissionais} value={form.profissionais_env} onChange={f.alterarCampo} /></Field>
                    <Field rotulo={obrigatorio.horas ? 'Tempo gasto' : 'Tempo gasto (opcional)'} htmlFor="at-tempo" obrigatorio={obrigatorio.horas}><Input id="at-tempo" placeholder="hh:mm" maxLength={7} inputMode="numeric" value={form.tempo_gasto} onChange={(e) => f.alterarTempo(e.target.value)} onBlur={f.completarTempo} /></Field>
                </div>
            </FormSecao>

            <FormSecao titulo="Motivo e local">
                <p className="m-0 mb-2 text-[12.5px] font-medium text-text">Motivo da visita (selecione um)<span className="ml-0.5 text-danger">*</span></p>
                <div role="radiogroup" aria-label="Motivo da visita" className="mb-4 flex flex-wrap gap-2">
                    {listas.motivos.map((motivo) => {
                        const ativo = form.motivos.includes(motivo);
                        return (
                            <button key={motivo} type="button" role="radio" aria-checked={ativo} onClick={() => f.selecionarMotivo(motivo)} className={cn('cursor-pointer rounded-lg border border-solid px-4 py-2 font-sans text-[13.5px] transition-colors', ativo ? 'border-pine bg-tint font-semibold text-pine-800' : 'border-line bg-white text-text hover:bg-surface-2')}>
                                {motivo}
                            </button>
                        );
                    })}
                </div>
                <div className="grid grid-cols-2 gap-3.5">
                    <Field rotulo="Projeto" htmlFor="at-projeto" obrigatorio>
                        <Select id="at-projeto" required disabled={Boolean(lotacao)} value={form.id_projeto} onChange={(e) => f.alterarProjeto(e.target.value)}>
                            <option value="">Selecione...</option>
                            {listas.projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                        </Select>
                    </Field>
                    <Field rotulo="Unidade" htmlFor="at-unidade" obrigatorio>
                        <Select id="at-unidade" required disabled={!form.id_projeto} value={form.id_unidade} onChange={(e) => f.alterarUnidade(e.target.value)}>
                            <option value="">Selecione...</option>
                            {f.unidades.map((unidade) => <option key={unidade.id_unidade} value={unidade.id_unidade}>{unidade.nome_unidade}</option>)}
                        </Select>
                    </Field>
                </div>
                {f.produtos.length > 0 && (
                    <div className="mt-4 rounded-lg border border-solid border-brass-soft bg-brass-tint p-3.5">
                        <p className="m-0 mb-2.5 text-[12.5px] font-semibold text-brass">Produtos trabalhados<span className="ml-0.5 text-danger">*</span></p>
                        <GrupoSelecao
                            itens={f.produtos.map((produto) => ({ id: produto.id_produto, nome: produto.nome_produto }))}
                            selecionados={f.produtos.filter((produto) => form.produtos.includes(produto.nome_produto)).map((produto) => produto.id_produto)}
                            aoAlternar={(id) => f.alternarProduto(f.produtos.find((produto) => produto.id_produto === id)?.nome_produto ?? '')}
                        />
                    </div>
                )}
            </FormSecao>

            <FormSecao titulo="Equipe">
                <div className={cn('grid gap-3.5', f.apoio && 'grid-cols-2')}>
                    <SeletorEquipe id="at-equipe" rotulo="Equipe da ação" obrigatorio placeholder="Selecione para adicionar..." opcoes={listas.equipe} selecionados={form.implantadores_ids} nomeDe={nomeDe} aoAlternar={(id) => f.alternar('implantadores_ids', id)} />
                    {f.apoio && (
                        <SeletorEquipe
                            id="at-equipe-projeto"
                            rotulo={obrigatorio.equipeApoio ? 'Equipe do projeto' : 'Equipe do projeto (opcional)'}
                            obrigatorio={obrigatorio.equipeApoio}
                            placeholder={form.id_projeto ? 'Selecione para adicionar...' : 'Selecione o projeto primeiro...'}
                            disabled={!form.id_projeto}
                            opcoes={f.equipeDoProjeto}
                            selecionados={form.equipe_projeto_ids}
                            nomeDe={nomeDe}
                            aoAlternar={(id) => f.alternar('equipe_projeto_ids', id)}
                        />
                    )}
                </div>
            </FormSecao>

            <FormSecao titulo={`Anexos ${ajudaAnexo}`}>
                <div className="flex flex-col gap-2">
                    {form.anexosMantidos.map((caminho) => <LinhaAnexo key={caminho} icone="file" nome={nomeDoAnexo(caminho)} rotulo="Remover" aoRemover={() => f.removerAnexoSalvo(caminho)} />)}
                    {form.arquivos.map((arquivo, indice) => <LinhaAnexo key={`${arquivo.name}-${indice}`} icone="plus" nome={arquivo.name} rotulo="Cancelar" aoRemover={() => f.removerArquivo(indice)} />)}
                    <div>
                        <label className="m-0 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-4 py-2.5 text-sm font-medium text-text hover:border-pine">
                            <Icon n="upload" /> Adicionar arquivos
                            <input type="file" multiple className="hidden" onChange={(e) => { f.adicionarArquivos(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
                        </label>
                    </div>
                </div>
            </FormSecao>
        </FormCard>
    );
}
