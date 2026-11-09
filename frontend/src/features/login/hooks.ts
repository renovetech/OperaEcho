/* Lógica da tela de entrada. Cada fluxo tem o próprio hook; a tela só decide qual mostrar. */
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as loginApi from '@/features/login/api';
import { iniciarSessao } from '@/shared/auth/session';
import { celularValido, emailValido, mascaraCelular, soDigitos } from '@/shared/celular';
import { aviso, mensagemDeErro, sucesso, sucessoHtml } from '@/shared/feedback';
import { logErro } from '@/shared/lib';
import { calcularForca, FORCA_MAXIMA } from '@/shared/senha';

/* A senha inicial é trocada obrigatoriamente no primeiro acesso. */
const SENHA_INICIAL = 'Eco123';
const DURACAO_SAIDA_MS = 650;
const TAMANHO_CODIGO = 6;
const LOTACAO_SEDE = '0';

export type TelaLogin = 'LOGIN' | 'RECUPERAR' | 'PRIMEIRO_ACESSO' | 'SOLICITAR';
export type EtapaRecuperacao = 'IDENTIFICAR' | 'CANAL' | 'CODIGO';

const aguardar = (ms: number) => new Promise((resolver) => { setTimeout(resolver, ms); });
const erroDeRede = (falha: unknown) => (falha as { code?: string })?.code === 'ERR_NETWORK';

export interface EstadoFormulario {
    erro: string;
    setErro: (mensagem: string) => void;
    carregando: boolean;
    setCarregando: (carregando: boolean) => void;
}

export function useEntrada(form: EstadoFormulario, aoExigirTroca: (tokenReset: string | null) => void) {
    const navigate = useNavigate();
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');
    const [saindo, setSaindo] = useState(false);

    const enviar = async (evento: FormEvent) => {
        evento.preventDefault();
        form.setErro('');
        form.setCarregando(true);
        try {
            const resposta = await loginApi.entrar(usuario, senha);
            if (resposta.trocar_senha) {
                form.setCarregando(false);
                aoExigirTroca(resposta.token_reset ?? null);
                void aviso('Para sua segurança, é necessário alterar sua senha padrão no primeiro acesso.', 'Atualização de segurança');
                return;
            }
            iniciarSessao(resposta.token, resposta.usuario);
            setSaindo(true);
            await aguardar(DURACAO_SAIDA_MS);
            void navigate('/system');
        } catch (falha) {
            form.setCarregando(false);
            form.setErro(erroDeRede(falha) ? 'Erro de conexão.' : mensagemDeErro(falha, 'Erro ao tentar realizar login.'));
        }
    };

    const limpar = () => { setUsuario(''); setSenha(''); };
    return { usuario, setUsuario, senha, setSenha, saindo, enviar, limpar };
}

export function useRecuperacao(form: EstadoFormulario, aoAutorizar: (tokenReset: string | null) => void) {
    const [etapa, setEtapa] = useState<EtapaRecuperacao>('IDENTIFICAR');
    const [usuario, setUsuario] = useState('');
    const [matricula, setMatricula] = useState('');
    const [canais, setCanais] = useState<loginApi.CanalRecuperacao[]>([]);
    const [canal, setCanal] = useState('');
    const [destino, setDestino] = useState('');
    const [codigo, setCodigoBruto] = useState('');

    const identificacao = () => ({ usuario: usuario.trim(), matricula: matricula.trim() });

    /** Roda um passo com o estado de carregamento e a mensagem de erro padrão dele. */
    const executar = async (passo: () => Promise<void>, padrao: string) => {
        form.setCarregando(true);
        form.setErro('');
        try {
            await passo();
        } catch (falha) {
            form.setErro(mensagemDeErro(falha, padrao));
        } finally {
            form.setCarregando(false);
        }
    };

    const identificar = (evento: FormEvent) => {
        evento.preventDefault();
        void executar(async () => {
            const lista = await loginApi.listarCanais(identificacao());
            setCanais(lista);
            setCanal(lista[0]?.canal ?? '');
            setEtapa('CANAL');
        }, 'Dados não conferem ou usuário inativo.');
    };

    const reenviar = () => executar(async () => {
        setDestino(await loginApi.enviarCodigo(identificacao(), canal));
        setCodigoBruto('');
        setEtapa('CODIGO');
    }, 'Não foi possível enviar o código.');

    const enviarCodigo = (evento: FormEvent) => {
        evento.preventDefault();
        void reenviar();
    };

    const confirmarCodigo = (evento: FormEvent) => {
        evento.preventDefault();
        void executar(async () => {
            const resposta = await loginApi.verificarCodigo(identificacao(), codigo);
            aoAutorizar(resposta.token_reset ?? null);
        }, 'Código inválido.');
    };

    const reiniciar = () => {
        setEtapa('IDENTIFICAR');
        setCanais([]);
        setCanal('');
        setDestino('');
        setCodigoBruto('');
    };

    const voltarPara = (anterior: EtapaRecuperacao) => { setEtapa(anterior); form.setErro(''); };
    const setCodigo = (valor: string) => setCodigoBruto(valor.replace(/\D/g, '').slice(0, TAMANHO_CODIGO));

    return {
        etapa, usuario, setUsuario, matricula, setMatricula, canais, canal, setCanal, destino, codigo, setCodigo,
        codigoCompleto: codigo.length === TAMANHO_CODIGO, identificar, enviarCodigo, reenviar, confirmarCodigo, reiniciar, voltarPara
    };
}

export function useNovaSenha(form: EstadoFormulario, tokenReset: string | null, aoConcluir: () => void) {
    const [novaSenha, setNovaSenha] = useState('');
    const [confirmacao, setConfirmacao] = useState('');
    const forca = calcularForca(novaSenha);

    const enviar = async (evento: FormEvent) => {
        evento.preventDefault();
        if (forca < FORCA_MAXIMA) {
            form.setErro('A senha não atende aos requisitos de segurança.');
            return;
        }
        if (novaSenha !== confirmacao) {
            form.setErro('As senhas não coincidem.');
            return;
        }
        form.setErro('');
        form.setCarregando(true);
        try {
            await loginApi.confirmarNovaSenha(tokenReset, novaSenha);
            void sucesso('Senha atualizada!', 'Faça login novamente.');
            setNovaSenha('');
            setConfirmacao('');
            aoConcluir();
        } catch (falha) {
            form.setErro(mensagemDeErro(falha, 'Erro ao alterar senha.'));
        } finally {
            form.setCarregando(false);
        }
    };

    return { novaSenha, setNovaSenha, confirmacao, setConfirmacao, forca, senhaForte: forca === FORCA_MAXIMA, percentualForca: (forca / FORCA_MAXIMA) * 100, enviar };
}

const CADASTRO_VAZIO = {
    nome_completo: '', cpf: '', data_nascimento: '', data_admissao: '', sexo: '', celular: '', celular_whatsapp: false, email: '',
    matricula: '', id_setor: '', id_funcao: '', id_lotacao: '', usuario: '', perfil_acesso: 'Solicitante', ativo: false
};

function pendenciaDoCadastro(c: typeof CADASTRO_VAZIO): string | null {
    if (!c.nome_completo || !c.cpf || !c.matricula || !c.id_setor || !c.id_funcao || !c.data_admissao || c.id_lotacao === '') return 'Preencha todos os campos obrigatórios (*).';
    if (!celularValido(c.celular)) return 'Informe um celular válido com DDD e 9 dígitos (ex.: (21) 98765-4321).';
    if (!emailValido(c.email)) return 'E-mail inválido.';
    return null;
}

export function useSolicitacao(form: EstadoFormulario, ativa: boolean, aoConcluir: () => void) {
    const [cadastro, setCadastro] = useState(CADASTRO_VAZIO);
    const [opcoes, setOpcoes] = useState<Awaited<ReturnType<typeof loginApi.listarOpcoesDeCadastro>>>({ setores: [], funcoes: [], lotacoes: [] });
    const { setErro } = form;

    useEffect(() => {
        if (!ativa) return undefined;
        let vigente = true;
        loginApi.listarOpcoesDeCadastro()
            .then((lista) => { if (vigente) setOpcoes(lista); })
            .catch((falha: unknown) => {
                logErro('Erro ao carregar as listas do cadastro', falha);
                if (vigente) setErro('Não foi possível carregar as listas de cadastro.');
            });
        return () => { vigente = false; };
    }, [ativa, setErro]);

    const alterar = ({ target: { name, value } }: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setCadastro((atual) => {
            if (name === 'celular') return { ...atual, celular: mascaraCelular(value) };
            if (name === 'cpf') return { ...atual, cpf: value, usuario: value.replace(/\D/g, '') };
            if (name === 'nome_completo') return { ...atual, nome_completo: value.toUpperCase() };
            return { ...atual, [name]: value };
        });
    };

    const enviar = async (evento: FormEvent) => {
        evento.preventDefault();
        const pendencia = pendenciaDoCadastro(cadastro);
        if (pendencia) {
            form.setErro(pendencia);
            return;
        }
        form.setErro('');
        form.setCarregando(true);
        try {
            await loginApi.solicitarAcesso({
                ...cadastro,
                celular: soDigitos(cadastro.celular),
                id_setor: Number.parseInt(cadastro.id_setor, 10),
                id_funcao: Number.parseInt(cadastro.id_funcao, 10),
                id_lotacao: cadastro.id_lotacao === LOTACAO_SEDE ? null : Number.parseInt(cadastro.id_lotacao, 10),
                senha_hash: SENHA_INICIAL
            });
            void sucessoHtml('Solicitação enviada', `Seu cadastro está aguardando aprovação na lotação selecionada. Sua senha inicial será <b>${SENHA_INICIAL}</b>.<br><br><small>Se você já tem cadastro, use "Esqueci minha senha" ou procure o administrador.</small>`);
            setCadastro(CADASTRO_VAZIO);
            aoConcluir();
        } catch (falha) {
            form.setErro(mensagemDeErro(falha, 'Erro ao solicitar acesso.'));
        } finally {
            form.setCarregando(false);
        }
    };

    return { cadastro, opcoes, alterar, enviar, sedeEscolhida: cadastro.id_lotacao === LOTACAO_SEDE, LOTACAO_SEDE };
}
