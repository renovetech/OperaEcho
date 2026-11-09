import api from '@/shared/api';

export interface ParametroDetalhe {
    chave: string;
    valor: string | boolean;
    data_alteracao?: string;
    usuario_alteracao?: string;
}

export interface EventosWhatsapp {
    escala_semanal_ativa: boolean;
    escala_semanal_dia: number;
    escala_semanal_hora: string;
    escala_semanal_referencia: string;
    escala_semanal_ultima?: string;
    escala_alteracao_ativa: boolean;
    escala_alteracao_espera: number | string;
    ferias_ativa: boolean;
    codigo_senha_ativa: boolean;
}

export interface FilaWhatsapp {
    inicioAquecimento?: string;
    limiteInicial: number | string;
    crescimentoSemanal: number | string;
    limiteMaximo: number | string;
    maxPorMinuto: number | string;
    pausaMinima: number | string;
    pausaMaxima: number | string;
    horaInicio: string;
    horaFim: string;
}

export interface TextoEvento {
    personalizado?: string;
    padrao: string;
    variaveis: string[];
}

export interface ConfigWhatsapp {
    ativo: boolean;
    url_api: string;
    instancia: string;
    tem_token: boolean;
    data_atualizacao?: string;
    usuario_alteracao?: string;
    eventos: EventosWhatsapp;
    fila: FilaWhatsapp;
    textos: Record<string, TextoEvento>;
}

export interface SituacaoFila {
    proximaAcao?: string;
    enviadosHoje: number;
    limiteHoje: number;
    pendentes: number;
    aguardandoAgrupamento: number;
    ultimoMinuto: number;
    semana: number;
    dentroDoHorario: boolean;
}

export interface EnvioWhatsapp {
    id_envio: number;
    data_criacao?: string;
    nome_completo?: string;
    tipo_evento: string;
    modulo?: string;
    numero?: string;
    status: string;
    motivo?: string;
    erro?: string;
    liberar_em?: string;
    data_envio?: string;
    mensagem?: string;
}

export interface FiltroEnvios {
    status: string;
    tipo: string;
    termo: string;
}

export interface QrCode {
    base64?: string;
    pairingCode?: string;
}

const BASE = '/integracoes/whatsapp';

export async function listarParametros(): Promise<ParametroDetalhe[]> {
    const { data } = await api.get<ParametroDetalhe[]>('/parametros/detalhes');
    return data || [];
}

export async function salvarParametros(parametros: { chave: string; valor: boolean }[]): Promise<void> {
    await api.post('/parametros/salvar', { parametros });
}

export async function buscarConfig(): Promise<ConfigWhatsapp> {
    const { data } = await api.get<ConfigWhatsapp>(BASE);
    return data;
}

export async function salvarConfig(config: ConfigWhatsapp, token: string, textos: Record<string, string>): Promise<void> {
    await api.post(BASE, {
        ativo: config.ativo,
        url_api: config.url_api,
        instancia: config.instancia,
        token_acesso: token || undefined,
        eventos: config.eventos,
        fila: config.fila,
        textos
    });
}

export async function buscarStatus(): Promise<string> {
    const { data } = await api.get<{ status: string }>(`${BASE}/status`);
    return data.status;
}

export async function buscarSituacao(): Promise<SituacaoFila> {
    const { data } = await api.get<SituacaoFila>(`${BASE}/fila`);
    return data;
}

export async function listarEnvios(filtro: FiltroEnvios): Promise<EnvioWhatsapp[]> {
    const { data } = await api.get<EnvioWhatsapp[]>(`${BASE}/envios`, { params: { ...filtro, limite: 150 } });
    return data || [];
}

export async function buscarPrevia(evento: string, texto: string): Promise<string> {
    const { data } = await api.post<{ previa: string }>(`${BASE}/previa`, { evento, texto });
    return data.previa;
}

export async function buscarQrCode(): Promise<QrCode> {
    const { data } = await api.get<QrCode>(`${BASE}/qrcode`);
    return data;
}

export const desconectarNumero = () => api.post(`${BASE}/desconectar`);

export async function enviarTeste(): Promise<string | undefined> {
    const { data } = await api.post<{ mensagem?: string }>(`${BASE}/teste`);
    return data.mensagem;
}

export async function enviarEscalaSemanal(semana: string): Promise<string | undefined> {
    const { data } = await api.post<{ mensagem?: string }>(`${BASE}/escala-semanal/enviar`, { semana });
    return data.mensagem;
}

export const reenviarEnvio = (id: number) => api.post(`${BASE}/envios/${id}/reenviar`);
