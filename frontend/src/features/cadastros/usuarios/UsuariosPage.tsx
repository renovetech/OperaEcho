import { Link, useNavigate, useParams } from 'react-router-dom';
import type { UsuarioCadastro } from '@/features/cadastros/usuarios/api';
import { LOTACAO_SEDE, useFormUsuario, useListaUsuarios } from '@/features/cadastros/usuarios/hooks';
import { useVoltar } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { Checkbox, Field, GrupoSelecao, Input, Select } from '@/shared/ui/Campos';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { useFiltrosLista, type CampoFiltro } from '@/shared/ui/FiltrosLista';
import { Card, FormCard, FormSecao, PageHeader } from '@/shared/ui/Pagina';
import { AcaoEditar, LinhaVazia, StatusBadge, Tabela, Td, Th } from '@/shared/ui/Tabela';

const PERFIL_ADMIN = 'Administrador';
const DATA_MINIMA = '1900-01-01';
const DATA_MAXIMA = '2100-12-31';

const CAMPOS_FILTRO: CampoFiltro<UsuarioCadastro>[] = [
    { chave: 'funcao', rotulo: 'Função', valor: (u) => u.nome_funcao || u.funcao },
    { chave: 'setor', rotulo: 'Setor', valor: (u) => u.nome_setor || u.setor },
    { chave: 'perfil', rotulo: 'Perfil', valor: (u) => u.perfil_acesso },
    { chave: 'status', rotulo: 'Status', valor: (u) => (u.ativo ? 'Ativo' : 'Inativo') }
];

export function ListaUsuariosPage() {
    const navigate = useNavigate();
    const voltar = useVoltar();
    const { termo, setTermo, usuarios, buscando, pesquisar, podeNovo, podeEditar } = useListaUsuarios();
    const [filtrados, barraFiltros] = useFiltrosLista(usuarios, CAMPOS_FILTRO);

    return (
        <>
            <PageHeader
                titulo="Usuários"
                acoes={(
                    <>
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                        {podeNovo && <Link to="novo" className="no-underline"><Button>Novo usuário</Button></Link>}
                    </>
                )}
            />
            <Card className="mb-3.5 px-4 py-3.5">
                <form onSubmit={pesquisar} className="flex items-end gap-2.5">
                    <Field rotulo="Buscar" htmlFor="busca-usuario" className="w-96">
                        <Input id="busca-usuario" placeholder="Nome ou CPF..." value={termo} onChange={(e) => setTermo(e.target.value)} />
                    </Field>
                    <Button type="submit" variant="secondary" isLoading={buscando}>Pesquisar</Button>
                </form>
            </Card>
            {barraFiltros}
            <Tabela cabecalho={<><Th>Nome</Th><Th>Login</Th><Th>Função</Th><Th>Setor</Th><Th>Perfil</Th><Th centro>Status</Th><Th centro>Ação</Th></>}>
                {buscando && <LinhaVazia colunas={7}>Carregando dados...</LinhaVazia>}
                {!buscando && filtrados.length === 0 && <LinhaVazia colunas={7}>Nenhum usuário encontrado.</LinhaVazia>}
                {!buscando && filtrados.map((usuario) => (
                    <tr key={usuario.id_usuario}>
                        <Td className="font-medium">{usuario.nome_completo}</Td>
                        <Td className="tabular-nums">{usuario.usuario}</Td>
                        <Td>{usuario.nome_funcao || usuario.funcao}</Td>
                        <Td>{usuario.nome_setor || usuario.setor}</Td>
                        <Td>{usuario.perfil_acesso}</Td>
                        <Td centro><StatusBadge ativo={Boolean(usuario.ativo)} /></Td>
                        <Td centro><AcaoEditar podeEditar={podeEditar} aoEditar={() => navigate(String(usuario.id_usuario))} /></Td>
                    </tr>
                ))}
            </Tabela>
        </>
    );
}

export function FormUsuarioPage() {
    const { id } = useParams();
    const voltar = useVoltar();
    const idUsuario = id ? Number(id) : undefined;
    const {
        form, opcoes, produtos, lotacoesExtras, carregando, naoEncontrado, salvando, podeSalvar, isLoginAdmin,
        alterarCampo, salvar, alternarProduto, alternarLotacaoExtra
    } = useFormUsuario(idUsuario);

    if (carregando) return <Carregando />;
    if (naoEncontrado) return <Aviso titulo="Usuário não encontrado" />;

    const lotacoesAdicionais = opcoes.lotacoes.filter((lotacao) => String(lotacao.id) !== String(form.id_lotacao));
    // "Administrador" só aparece para o login admin; mantém o valor ao abrir um administrador existente.
    const perfisVisiveis = opcoes.perfis.filter((perfil) => perfil !== PERFIL_ADMIN || isLoginAdmin || form.perfil_acesso === PERFIL_ADMIN);

    return (
        <>
            <PageHeader titulo={idUsuario ? 'Editar usuário' : 'Novo usuário'} />
            <FormCard
                aoEnviar={salvar}
                rodape={(
                    <>
                        <Button variant="secondary" onClick={voltar}>Cancelar</Button>
                        {podeSalvar && <Button type="submit" isLoading={salvando}>Salvar usuário</Button>}
                    </>
                )}
            >
                <FormSecao titulo="Dados pessoais">
                    <div className="grid grid-cols-12 gap-x-[18px] gap-y-4">
                        <Field rotulo="Nome completo" htmlFor="nome_completo" obrigatorio className="col-span-6">
                            <Input id="nome_completo" name="nome_completo" value={form.nome_completo} onChange={alterarCampo} required />
                        </Field>
                        <Field rotulo="CPF (preenche o login)" htmlFor="cpf" obrigatorio className="col-span-3">
                            <Input id="cpf" name="cpf" inputMode="numeric" value={form.cpf} placeholder="Apenas números" maxLength={11} onChange={alterarCampo} required />
                        </Field>
                        <Field rotulo="Sexo" htmlFor="sexo" className="col-span-3">
                            <Select id="sexo" name="sexo" value={form.sexo} onChange={alterarCampo}>
                                <option value="">Selecione...</option>
                                <option value="Masculino">Masculino</option>
                                <option value="Feminino">Feminino</option>
                            </Select>
                        </Field>
                        <Field rotulo="Data de nascimento" htmlFor="data_nascimento" className="col-span-3">
                            <Input id="data_nascimento" type="date" min={DATA_MINIMA} max={DATA_MAXIMA} name="data_nascimento" value={form.data_nascimento} onChange={alterarCampo} />
                        </Field>
                        <Field rotulo="Celular (WhatsApp)" htmlFor="celular" obrigatorio className="col-span-3">
                            <Input id="celular" type="tel" name="celular" value={form.celular} placeholder="(21) 98765-4321" onChange={alterarCampo} required />
                        </Field>
                        <Field rotulo="E-mail" htmlFor="email" className="col-span-6">
                            <Input id="email" type="email" name="email" value={form.email} placeholder="Opcional (redefinição de senha)" onChange={alterarCampo} />
                        </Field>
                    </div>
                </FormSecao>

                <FormSecao titulo="Vínculo">
                    <div className="grid grid-cols-12 gap-x-[18px] gap-y-4">
                        <Field rotulo="Matrícula" htmlFor="matricula" obrigatorio className="col-span-3">
                            <Input id="matricula" name="matricula" value={form.matricula} onChange={alterarCampo} required />
                        </Field>
                        <Field rotulo="Data de admissão" htmlFor="data_admissao" obrigatorio className="col-span-3">
                            <Input id="data_admissao" type="date" min={DATA_MINIMA} max={DATA_MAXIMA} name="data_admissao" value={form.data_admissao} onChange={alterarCampo} required />
                        </Field>
                        <Field rotulo="Setor" htmlFor="id_setor" obrigatorio className="col-span-3">
                            <Select id="id_setor" name="id_setor" value={form.id_setor} onChange={alterarCampo} required>
                                <option value="">Selecione...</option>
                                {opcoes.setores.map((setor) => <option key={setor.id} value={setor.id}>{setor.nome}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Função" htmlFor="id_funcao" obrigatorio className="col-span-3">
                            <Select id="id_funcao" name="id_funcao" value={form.id_funcao} onChange={alterarCampo} required>
                                <option value="">Selecione...</option>
                                {opcoes.funcoes.map((funcao) => <option key={funcao.id} value={funcao.id}>{funcao.nome}</option>)}
                            </Select>
                        </Field>
                    </div>
                </FormSecao>

                <FormSecao titulo="Acesso ao sistema">
                    <div className="grid grid-cols-12 gap-x-[18px] gap-y-4">
                        <Field rotulo="Login (usuário)" htmlFor="usuario" obrigatorio ajuda="Preenchido pelo CPF." className="col-span-3">
                            <Input id="usuario" name="usuario" value={form.usuario} readOnly />
                        </Field>
                        <Field rotulo="Perfil de acesso" htmlFor="perfil_acesso" obrigatorio className="col-span-3">
                            <Select id="perfil_acesso" name="perfil_acesso" value={form.perfil_acesso} onChange={alterarCampo} required disabled={!isLoginAdmin && form.perfil_acesso === PERFIL_ADMIN}>
                                <option value="">Selecione...</option>
                                {perfisVisiveis.map((perfil) => <option key={perfil} value={perfil}>{perfil}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Lotação (acesso a dados)" htmlFor="id_lotacao" obrigatorio className="col-span-6">
                            <Select id="id_lotacao" name="id_lotacao" value={form.id_lotacao} onChange={alterarCampo} className={String(form.id_lotacao) === LOTACAO_SEDE ? 'bg-tint font-semibold text-pine-800' : undefined}>
                                <option value="">Selecione...</option>
                                <option value={LOTACAO_SEDE}>SEDE - GD (Acesso Total)</option>
                                {opcoes.lotacoes.map((lotacao) => <option key={lotacao.id} value={lotacao.id}>{lotacao.nome}</option>)}
                            </Select>
                        </Field>
                        <Field rotulo="Lotações adicionais" className="col-span-12">
                            <GrupoSelecao itens={lotacoesAdicionais} selecionados={lotacoesExtras} aoAlternar={alternarLotacaoExtra} vazio="Nenhuma lotação disponível." />
                        </Field>
                        <Checkbox className="col-span-12" name="ativo" rotulo="Usuário ativo no sistema" checked={form.ativo} onChange={alterarCampo} />
                    </div>
                </FormSecao>

                <FormSecao titulo="Expertise do colaborador" ajuda="Produtos que o colaborador domina.">
                    <GrupoSelecao itens={opcoes.produtos} selecionados={produtos} aoAlternar={alternarProduto} vazio="Nenhum produto cadastrado." />
                </FormSecao>
            </FormCard>
        </>
    );
}
