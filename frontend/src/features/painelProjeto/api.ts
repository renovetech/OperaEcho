import type { FeatureCollection } from 'geojson';
import api from '@/shared/api';

export interface MicroRegiao {
    id_micro: number;
    id_macro: number;
    nome_micro: string;
    sigla?: string | null;
    cor?: string | null;
}

export interface MacroRegiao {
    id_macro: number;
    nome_macro: string;
    cor?: string | null;
    micros: MicroRegiao[];
}

export interface UnidadePainel {
    id_unidade: number;
    nome_unidade: string;
    cnes?: string | null;
    id_macro?: number | null;
    id_micro?: number | null;
    id_cidade?: number | null;
    nome_cidade?: string | null;
    uf?: string | null;
    id_tipo_unidade?: number | null;
    latitude: number | null;
    longitude: number | null;
    aproximada: boolean;
    produtos: number[];
}

export interface ProdutoPainel { id_produto: number; nome_produto: string }
export interface TipoUnidade { id_tipo_unidade: number; nome_tipo: string; sigla: string }

/** [id_unidade, início, fim, origem (0 implantação / 1 projetos), motivos, produtos, minutos] */
export type AtividadePainel = [number, string, string | null, number, string[], string[], number];

export interface DadosPainelProjeto {
    projeto: { nome: string; slug: string; uf: string | null };
    gerado_em: string;
    regioes: MacroRegiao[];
    produtos: ProdutoPainel[];
    tipos: TipoUnidade[];
    unidades: UnidadePainel[];
    atividades: AtividadePainel[];
}

export interface MalhaMunicipal {
    malha: FeatureCollection;
    nomes: { id: string; nome: string }[];
}

const UF_IBGE: Record<string, number> = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };

export async function buscarPainelProjeto(slug: string): Promise<DadosPainelProjeto> {
    const { data } = await api.get<DadosPainelProjeto>(`/publico/painel-projeto/${encodeURIComponent(slug.toLowerCase())}`);
    return data;
}

function lerCacheMalha(chave: string): MalhaMunicipal | null {
    try {
        const salvo = localStorage.getItem(chave);
        return salvo ? JSON.parse(salvo) as MalhaMunicipal : null;
    } catch {
        return null;
    }
}

function gravarCacheMalha(chave: string, dados: MalhaMunicipal) {
    try {
        localStorage.setItem(chave, JSON.stringify(dados));
    } catch {
        // Cota cheia: segue sem cache, a malha é baixada de novo na próxima visita.
    }
}

/** Malha municipal e nomes do IBGE, com cache no navegador. */
export async function carregarMalhaIbge(uf: string): Promise<MalhaMunicipal | null> {
    const codigo = UF_IBGE[uf];
    if (!codigo) return null;
    const chave = `oe_malha_${codigo}_v1`;
    const salvo = lerCacheMalha(chave);
    if (salvo) return salvo;
    const [respostaMalha, respostaNomes] = await Promise.all([
        fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/estados/${codigo}?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima`),
        fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${codigo}/municipios`)
    ]);
    if (!respostaMalha.ok || !respostaNomes.ok) throw new Error('IBGE indisponível');
    const malha = await respostaMalha.json() as FeatureCollection;
    const nomes = await respostaNomes.json() as { id: number; nome: string }[];
    const dados = { malha, nomes: nomes.map((municipio) => ({ id: String(municipio.id), nome: municipio.nome })) };
    gravarCacheMalha(chave, dados);
    return dados;
}
