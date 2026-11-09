import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { celularValido, emailValido, mascaraCelular, soDigitos } from '@/shared/celular';
import {
    buscarUsuarioPorId, buscarUsuarios, buscarVinculosDoUsuario, carregarOpcoes, salvarUsuario,
    type FormUsuario, type OpcoesUsuario, type UsuarioCadastro
} from '@/features/cadastros/usuarios/api';
import { useAuth } from '@/shared/auth/AuthContext';
import { aviso, erro, mensagemDeErro, sucesso } from '@/shared/feedback';
import { logErro } from '@/shared/lib';

const MODULO = 'usuarios';
const ROTA_LISTA = '/system/cadastros/usuarios';
const PERFIL_ADMIN = 'Administrador';
const LOGIN_ADMIN = 'admin';
export const LOTACAO_SEDE = '0';
/** Senha inicial de quem é criado aqui; o sistema obriga a troca no primeiro acesso. */
const SENHA_PADRAO = 'Eco123';

const FORM_VAZIO: FormUsuario = {
    id_usuario: '', nome_completo: '', cpf: '', data_nascimento: '', data_admissao: '', sexo: '', celular: '', celular_whatsapp: false,
    email: '', matricula: '', usuario: '', perfil_acesso: '', ativo: false, id_setor: '', id_funcao: '', id_lotacao: ''
};

const OPCOES_VAZIAS: OpcoesUsuario = { perfis: [], produtos: [], lotacoes: [], setores: [], funcoes: [] };

export function cpfValido(valor: string): boolean {
    const cpf = valor.replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const digito = (tamanho: number) => {
        const soma = [...cpf.slice(0, tamanho)].reduce((total, numero, i) => total + Number(numero) * (tamanho + 1 - i), 0);
        const resto = 11 - (soma % 11);
        return resto >= 10 ? 0 : resto;
    };
    return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

function usePermissoesUsuarios() {
    const { usuario, podeAcao } = useAuth();
    const isLoginAdmin = usuario.usuario === LOGIN_ADMIN;
    return {
        isLoginAdmin,
        podeNovo: isLoginAdmin || podeAcao(MODULO, 'pode_novo'),
        podeEditar: isLoginAdmin || podeAcao(MODULO, 'pode_editar')
    };
}

export function useListaUsuarios() {
    const { podeNovo, podeEditar } = usePermissoesUsuarios();
    const [parametros, setParametros] = useSearchParams();
    const termoDaUrl = parametros.get('termo') ?? '';
    const [termo, setTermo] = useState(termoDaUrl);
    const [usuarios, setUsuarios] = useState<UsuarioCadastro[]>([]);
    const [buscando, setBuscando] = useState(true);

    useEffect(() => {
        let ativo = true;
        buscarUsuarios(termoDaUrl)
            .then((lista) => { if (ativo) setUsuarios(lista); })
            .catch((falha: unknown) => {
                logErro('Erro ao buscar usuários', falha);
                erro('Falha ao buscar usuários.');
            })
            .finally(() => { if (ativo) setBuscando(false); });
        return () => { ativo = false; };
    }, [termoDaUrl]);

    const pesquisar = (evento: FormEvent) => {
        evento.preventDefault();
        if (termo === termoDaUrl) return;
        setBuscando(true);
        setParametros((atuais) => {
            const proximos = new URLSearchParams(atuais);
            if (termo) proximos.set('termo', termo);
            else proximos.delete('termo');
            return proximos;
        }, { replace: true });
    };

    return { termo, setTermo, usuarios, buscando, pesquisar, podeNovo, podeEditar };
}

function paraFormulario(usuario: UsuarioCadastro): FormUsuario {
    return {
        id_usuario: usuario.id_usuario,
        nome_completo: usuario.nome_completo,
        cpf: usuario.cpf,
        data_nascimento: usuario.data_nascimento?.split('T')[0] ?? '',
        data_admissao: usuario.data_admissao?.split('T')[0] ?? '',
        sexo: usuario.sexo ?? '',
        celular: mascaraCelular(usuario.celular || ''),
        celular_whatsapp: Boolean(usuario.celular_whatsapp),
        email: usuario.email ?? '',
        matricula: usuario.matricula,
        usuario: usuario.usuario,
        perfil_acesso: usuario.perfil_acesso,
        ativo: Boolean(usuario.ativo),
        id_setor: usuario.id_setor ?? '',
        id_funcao: usuario.id_funcao ?? '',
        id_lotacao: usuario.id_lotacao === null || usuario.id_lotacao === undefined ? LOTACAO_SEDE : usuario.id_lotacao
    };
}

function validar(form: FormUsuario, isLoginAdmin: boolean): string | null {
    if (form.perfil_acesso === PERFIL_ADMIN && !isLoginAdmin) return 'Apenas o usuário "admin" pode atribuir ou editar o perfil Administrador.';
    if (!form.nome_completo || !form.cpf || !form.usuario || !form.perfil_acesso || !form.matricula || !form.id_setor || !form.id_funcao || !form.data_admissao) {
        return 'Preencha todos os campos obrigatórios (*)';
    }
    if (form.id_lotacao === '') return 'Selecione a Lotação (ou SEDE - GD).';
    if (!cpfValido(form.cpf)) return 'CPF inválido.';
    if (!celularValido(form.celular)) return 'Informe o celular com WhatsApp: DDD + 9 dígitos (ex.: (21) 98765-4321).';
    if (!emailValido(form.email)) return 'E-mail inválido.';
    return null;
}

async function mensagemDeDuplicidade(form: FormUsuario): Promise<string | null> {
    const outros = (await buscarUsuarios('')).filter((usuario) => usuario.id_usuario !== form.id_usuario);
    if (outros.some((usuario) => usuario.cpf === form.cpf)) return 'Este CPF já está cadastrado para outro usuário.';
    if (outros.some((usuario) => usuario.matricula === form.matricula)) return 'Esta Matrícula já está em uso.';
    return null;
}

const alternarItem = (lista: number[], id: number) => (lista.includes(id) ? lista.filter((item) => item !== id) : [...lista, id]);

export function useFormUsuario(idUsuario?: number) {
    const { nomeExibicao } = useAuth();
    const { isLoginAdmin, podeNovo, podeEditar } = usePermissoesUsuarios();
    const navigate = useNavigate();
    const [form, setForm] = useState<FormUsuario>(FORM_VAZIO);
    const [opcoes, setOpcoes] = useState<OpcoesUsuario>(OPCOES_VAZIAS);
    const [produtos, setProdutos] = useState<number[]>([]);
    const [lotacoesExtras, setLotacoesExtras] = useState<number[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [naoEncontrado, setNaoEncontrado] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const podeSalvar = idUsuario !== undefined ? podeEditar : podeNovo;

    useEffect(() => {
        let ativo = true;
        const carregar = async () => {
            const [listas, usuario, vinculos] = await Promise.all([
                carregarOpcoes(),
                idUsuario !== undefined ? buscarUsuarioPorId(idUsuario) : undefined,
                idUsuario !== undefined ? buscarVinculosDoUsuario(idUsuario) : undefined
            ]);
            if (!ativo) return;
            setOpcoes(listas);
            if (idUsuario !== undefined && !usuario) { setNaoEncontrado(true); return; }
            if (usuario) setForm(paraFormulario(usuario));
            if (vinculos) {
                setProdutos(vinculos.produtos);
                setLotacoesExtras(vinculos.lotacoes);
            }
        };
        carregar()
            .catch((falha: unknown) => {
                logErro('Erro ao abrir usuário', falha);
                erro('Não foi possível carregar os dados do usuário.');
            })
            .finally(() => { if (ativo) setCarregando(false); });
        return () => { ativo = false; };
    }, [idUsuario]);

    const alterarCampo = useCallback((evento: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = evento.target;
        const marcado = (evento.target as HTMLInputElement).type === 'checkbox' ? (evento.target as HTMLInputElement).checked : undefined;
        setForm((atual) => {
            if (name === 'cpf') {
                const cpf = value.replace(/\D/g, '');
                return { ...atual, cpf, usuario: cpf };
            }
            if (name === 'nome_completo') return { ...atual, nome_completo: value.toUpperCase() };
            if (name === 'celular') return { ...atual, celular: mascaraCelular(value) };
            return { ...atual, [name]: marcado ?? value };
        });
    }, []);

    const salvar = async (evento: FormEvent) => {
        evento.preventDefault();
        if (!podeSalvar) { erro('Sem permissão para salvar.'); return; }
        const problema = validar(form, isLoginAdmin);
        if (problema) { aviso(problema); return; }
        setSalvando(true);
        try {
            const duplicidade = await mensagemDeDuplicidade(form);
            if (duplicidade) { erro(duplicidade); return; }
            const isNovo = !form.id_usuario;
            await salvarUsuario({
                id_usuario: form.id_usuario || null,
                nome_completo: form.nome_completo,
                cpf: form.cpf,
                data_nascimento: form.data_nascimento || null,
                data_admissao: form.data_admissao || null,
                sexo: form.sexo,
                celular: soDigitos(form.celular),
                celular_whatsapp: form.celular_whatsapp,
                email: form.email.trim(),
                matricula: form.matricula,
                usuario: form.usuario,
                id_setor: Number(form.id_setor),
                id_funcao: Number(form.id_funcao),
                id_lotacao: form.id_lotacao === LOTACAO_SEDE ? null : Number(form.id_lotacao),
                ativo: form.ativo,
                perfil_acesso: form.perfil_acesso,
                produtos,
                lotacoes: lotacoesExtras,
                responsavel_acao: nomeExibicao,
                ...(isNovo && { senha_hash: SENHA_PADRAO })
            });
            sucesso(isNovo ? 'Cadastro realizado' : 'Atualizado', isNovo ? `Usuário cadastrado! A senha padrão é "${SENHA_PADRAO}".` : 'Dados atualizados com sucesso!');
            navigate(ROTA_LISTA);
        } catch (falha) {
            logErro('Erro ao salvar usuário', falha);
            erro(mensagemDeErro(falha, 'Erro ao salvar usuário. Verifique duplicidade.'));
        } finally {
            setSalvando(false);
        }
    };

    return {
        form, opcoes, produtos, lotacoesExtras, carregando, naoEncontrado, salvando, podeSalvar, isLoginAdmin, alterarCampo, salvar,
        alternarProduto: (id: number) => setProdutos((lista) => alternarItem(lista, id)),
        alternarLotacaoExtra: (id: number) => setLotacoesExtras((lista) => alternarItem(lista, id))
    };
}
