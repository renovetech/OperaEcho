import { useEffect, useMemo, useState } from 'react';
import {
    buscarConfig, buscarPrevia, buscarQrCode, buscarSituacao, buscarStatus, desconectarNumero, enviarEscalaSemanal, enviarTeste,
    listarEnvios, listarParametros, reenviarEnvio, salvarConfig, salvarParametros,
    type ConfigWhatsapp, type EnvioWhatsapp, type EventosWhatsapp, type FilaWhatsapp, type FiltroEnvios, type ParametroDetalhe, type QrCode, type SituacaoFila
} from '@/features/parametros/api';
import { aviso, confirmar, erro, mensagemDeErro, sucesso, verTexto } from '@/shared/feedback';
import { logErro } from '@/shared/lib';

const ligado = (valor: unknown): boolean => valor === '1' || valor === 'true' || valor === true;
const INTERVALO_QR_MS = 4000;
const ESPERA_PREVIA_MS = 400;
const ESPERA_TESTE_MS = 3000;
const DIAS_POR_SEMANA = 7;

export const NOME_EVENTO: Record<string, string> = {
    ESCALA_SEMANAL: 'Escala semanal', ESCALA_ALTERACAO: 'Alteração de escala', FERIAS_APROVADA: 'Férias aprovadas',
    FERIAS_RECUSADA: 'Férias recusadas', CODIGO_SENHA: 'Código de senha', TESTE: 'Teste'
};

export function useParametrosGerais() {
    const [valores, setValores] = useState<Record<string, boolean>>({});
    const [originais, setOriginais] = useState<Record<string, boolean>>({});
    const [auditoria, setAuditoria] = useState<Record<string, ParametroDetalhe>>({});
    const [salvando, setSalvando] = useState(false);
    const [versao, setVersao] = useState(0);

    useEffect(() => {
        listarParametros()
            .then((lista) => {
                const proximos = Object.fromEntries(lista.map((item) => [item.chave, ligado(item.valor)]));
                setValores(proximos);
                setOriginais(proximos);
                setAuditoria(Object.fromEntries(lista.map((item) => [item.chave, item])));
            })
            .catch((falha: unknown) => erro(mensagemDeErro(falha, 'Não foi possível carregar os parâmetros.')));
    }, [versao]);

    const alterados = useMemo(() => Object.keys(valores).filter((chave) => valores[chave] !== originais[chave]), [valores, originais]);

    const salvar = async () => {
        if (!alterados.length) return;
        setSalvando(true);
        try {
            await salvarParametros(alterados.map((chave) => ({ chave, valor: Boolean(valores[chave]) })));
            sucesso('Salvo!', 'Parâmetros atualizados.');
            setVersao((atual) => atual + 1);
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Não foi possível salvar.'));
        } finally {
            setSalvando(false);
        }
    };

    const alternar = (chave: string) => setValores((atuais) => ({ ...atuais, [chave]: !atuais[chave] }));

    return { valores, auditoria, alterados, salvando, salvar, alternar };
}

function segundaDaSemana(deslocamento: number): string {
    const data = new Date();
    const dia = data.getDay();
    data.setDate(data.getDate() + (dia === 0 ? -6 : 1 - dia) + deslocamento * DIAS_POR_SEMANA);
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

const dataBr = (iso: string): string => iso.split('-').reverse().join('/');

export function useWhatsapp() {
    const [config, setConfig] = useState<ConfigWhatsapp | null>(null);
    const [token, setToken] = useState('');
    const [textos, setTextos] = useState<Record<string, string>>({});
    const [eventoTexto, setEventoTexto] = useState('ESCALA_SEMANAL');
    const [previa, setPrevia] = useState('');
    const [estado, setEstado] = useState<string | null>(null);
    const [qr, setQr] = useState<QrCode | null>(null);
    const [situacao, setSituacao] = useState<SituacaoFila | null>(null);
    const [envios, setEnvios] = useState<EnvioWhatsapp[]>([]);
    const [filtro, setFiltro] = useState<FiltroEnvios>({ status: '', tipo: '', termo: '' });
    const [semanaEnvio, setSemanaEnvio] = useState(() => segundaDaSemana(1));
    const [salvando, setSalvando] = useState(false);
    const [versaoConfig, setVersaoConfig] = useState(0);
    const [versaoSituacao, setVersaoSituacao] = useState(0);
    const [versaoEnvios, setVersaoEnvios] = useState(0);

    const atualizarSituacao = () => setVersaoSituacao((atual) => atual + 1);
    const atualizarEnvios = () => setVersaoEnvios((atual) => atual + 1);

    useEffect(() => {
        buscarConfig()
            .then((dados) => {
                setConfig(dados);
                setTextos(Object.fromEntries(Object.entries(dados.textos || {}).map(([evento, texto]) => [evento, texto.personalizado || texto.padrao])));
            })
            .catch((falha: unknown) => erro(mensagemDeErro(falha, 'Não foi possível carregar a configuração do WhatsApp.')));
    }, [versaoConfig]);

    useEffect(() => {
        Promise.all([buscarSituacao(), buscarStatus()])
            .then(([dados, status]) => {
                setSituacao(dados);
                setEstado(status);
            })
            .catch((falha: unknown) => logErro('Erro ao consultar a situação do WhatsApp', falha));
    }, [versaoSituacao]);

    useEffect(() => {
        listarEnvios(filtro).then(setEnvios).catch((falha: unknown) => logErro('Erro ao listar envios', falha));
    }, [filtro, versaoEnvios]);

    // Enquanto o QR Code está na tela, confere a conexão (fecha ao conectar)
    useEffect(() => {
        if (!qr) return undefined;
        const verificacao = setInterval(() => {
            buscarStatus()
                .then((status) => {
                    setEstado(status);
                    if (status !== 'open') return;
                    setQr(null);
                    setVersaoSituacao((atual) => atual + 1);
                    sucesso('WhatsApp conectado!');
                })
                .catch((falha: unknown) => logErro('Erro ao conferir a conexão', falha));
        }, INTERVALO_QR_MS);
        return () => clearInterval(verificacao);
    }, [qr]);

    const textoAtual = textos[eventoTexto];
    useEffect(() => {
        if (textoAtual === undefined) return undefined;
        const espera = setTimeout(() => {
            buscarPrevia(eventoTexto, textoAtual).then(setPrevia).catch(() => setPrevia(''));
        }, ESPERA_PREVIA_MS);
        return () => clearTimeout(espera);
    }, [eventoTexto, textoAtual]);

    const alterarConfig = <C extends keyof ConfigWhatsapp>(campo: C, valor: ConfigWhatsapp[C]) => setConfig((atual) => (atual ? { ...atual, [campo]: valor } : atual));
    const alterarEvento = <C extends keyof EventosWhatsapp>(campo: C, valor: EventosWhatsapp[C]) => setConfig((atual) => (atual ? { ...atual, eventos: { ...atual.eventos, [campo]: valor } } : atual));
    const alterarFila = <C extends keyof FilaWhatsapp>(campo: C, valor: FilaWhatsapp[C]) => setConfig((atual) => (atual ? { ...atual, fila: { ...atual.fila, [campo]: valor } } : atual));
    const alterarTexto = (valor: string) => setTextos((atuais) => ({ ...atuais, [eventoTexto]: valor }));

    const salvar = async () => {
        if (!config) return;
        setSalvando(true);
        try {
            await salvarConfig(config, token, textos);
            setToken('');
            sucesso('Salvo!');
            setVersaoConfig((atual) => atual + 1);
            atualizarSituacao();
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Não foi possível salvar.'));
        } finally {
            setSalvando(false);
        }
    };

    const lerQr = async () => {
        try {
            const dados = await buscarQrCode();
            if (!dados.base64 && !dados.pairingCode) {
                atualizarSituacao();
                aviso('A Evolution não devolveu QR Code (o número pode já estar conectado).');
                return;
            }
            setQr(dados);
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Não foi possível obter o QR Code. Salve a configuração antes.'));
        }
    };

    const desconectar = async () => {
        if (!await confirmar('Desconectar o número?', { texto: 'As mensagens ficam na fila até um novo QR Code ser lido.', rotulo: 'Desconectar' })) return;
        try {
            await desconectarNumero();
            atualizarSituacao();
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha ao desconectar.'));
        }
    };

    const testar = async () => {
        try {
            sucesso('Teste enviado para a fila', await enviarTeste());
            setTimeout(() => {
                atualizarEnvios();
                atualizarSituacao();
            }, ESPERA_TESTE_MS);
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha no teste.'));
        }
    };

    const enviarEscala = async () => {
        const texto = `Cada colaborador com escala na semana de ${dataBr(semanaEnvio)} recebe a sua escala. Quem já recebeu essa semana não recebe de novo.`;
        if (!await confirmar('Enviar a escala agora?', { texto, rotulo: 'Enviar' })) return;
        try {
            sucesso('Pronto', await enviarEscalaSemanal(semanaEnvio));
            atualizarEnvios();
            atualizarSituacao();
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha ao enviar a escala.'));
        }
    };

    const reenviar = async (id: number) => {
        try {
            await reenviarEnvio(id);
            atualizarEnvios();
            atualizarSituacao();
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Não foi possível reenviar.'));
        }
    };

    const verMensagem = (envio: EnvioWhatsapp) => verTexto(NOME_EVENTO[envio.tipo_evento] ?? envio.tipo_evento, envio.mensagem || '(ainda não montada)');

    const atualizarTudo = () => {
        atualizarEnvios();
        atualizarSituacao();
    };

    return {
        config, token, setToken, textos, eventoTexto, setEventoTexto, previa, estado, qr, setQr, situacao, envios, filtro, setFiltro,
        semanaEnvio, setSemanaEnvio, salvando, alterarConfig, alterarEvento, alterarFila, alterarTexto,
        salvar, lerQr, desconectar, testar, enviarEscala, reenviar, verMensagem, atualizarSituacao, atualizarTudo
    };
}

export type ControleWhatsapp = ReturnType<typeof useWhatsapp>;
