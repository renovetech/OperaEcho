import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Macro } from '@/features/cadastros/regioes/api';
import type { Produto } from '@/features/cadastros/produtos/api';
import type { Projeto } from '@/features/cadastros/projetos/api';
import {
    buscarUnidadePorId, buscarUnidades, importarCoordenadas, listarCidades, listarProdutosAtivos, listarProdutosDaUnidade,
    listarProjetosAtivos, listarRegioes, listarTiposDeUnidade, salvarUnidade,
    type Cidade, type FiltrosUnidade, type FormUnidade, type LinhaCoordenada, type TipoUnidade, type Unidade
} from '@/features/cadastros/unidades/api';
import { useAuth } from '@/shared/auth/AuthContext';
import { aviso, erro, mensagemDeErro, resultadoComDetalhes, sucesso } from '@/shared/feedback';
import { logErro } from '@/shared/lib';

const MODULO = 'unidades';
const ROTA_LISTA = '/system/cadastros/unidades';
const STATUS_PADRAO = 'true';
const TAMANHO_CNES = 7;
const MAXIMO_ERROS_EXIBIDOS = 200;
const FORM_VAZIO: FormUnidade = {
    id_unidade: '', nome_unidade: '', cnes: '', id_projeto: '', uf: '', id_cidade: '', latitude: '', longitude: '',
    id_macro: '', id_micro: '', id_tipo_unidade: '', ativo: true
};

export const ESTADOS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

/** "-7.119495, -34.845011" (copiado do Google Maps) ou "-7,1194; -34,8450" */
const PAR_COORDENADAS = /^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*(?:,\s+|;\s*|\s+|,(?=-))\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/;
const numeroCoordenada = (valor: string): number | null => (valor.trim() === '' ? null : Number(valor.trim().replace(',', '.')));
const coordenadaValida = (valor: number, limite: number) => Number.isFinite(valor) && Math.abs(valor) <= limite;

function useListas() {
    const [projetos, setProjetos] = useState<Projeto[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [tipos, setTipos] = useState<TipoUnidade[]>([]);

    useEffect(() => {
        listarProjetosAtivos().then(setProjetos).catch((falha: unknown) => logErro('Erro ao listar projetos', falha));
        listarProdutosAtivos().then(setProdutos).catch((falha: unknown) => logErro('Erro ao listar produtos', falha));
        listarTiposDeUnidade().then(setTipos).catch((falha: unknown) => logErro('Erro ao listar tipos de unidade', falha));
    }, []);

    return { projetos, produtos, tipos };
}

function useCidades(uf: string): Cidade[] {
    const [porUf, setPorUf] = useState<Record<string, Cidade[]>>({});
    useEffect(() => {
        if (!uf) return;
        listarCidades(uf)
            .then((lista) => setPorUf((atual) => ({ ...atual, [uf]: lista })))
            .catch((falha: unknown) => logErro('Erro ao listar cidades', falha));
    }, [uf]);
    return uf ? (porUf[uf] ?? []) : [];
}

export function useListaUnidades() {
    const { podeAcao } = useAuth();
    const { projetos } = useListas();
    const [parametros, setParametros] = useSearchParams();
    const filtrosAplicados = useMemo<FiltrosUnidade>(() => ({
        termo: parametros.get('termo') ?? '',
        projeto: parametros.get('projeto') ?? '',
        uf: parametros.get('uf') ?? '',
        id_cidade: parametros.get('id_cidade') ?? '',
        status: parametros.get('status') ?? STATUS_PADRAO,
        pagina: Number(parametros.get('pagina') ?? 1)
    }), [parametros]);
    const [rascunho, setRascunho] = useState(filtrosAplicados);
    const [unidades, setUnidades] = useState<Unidade[]>([]);
    const [totais, setTotais] = useState({ total: 0, totalPaginas: 1 });
    const [carregando, setCarregando] = useState(true);
    const [versao, setVersao] = useState(0);
    const cidades = useCidades(rascunho.uf);

    useEffect(() => {
        let ativo = true;
        buscarUnidades(filtrosAplicados)
            .then((resposta) => {
                if (!ativo) return;
                setUnidades(resposta.dados);
                setTotais({ total: resposta.total, totalPaginas: resposta.totalPaginas });
            })
            .catch((falha: unknown) => logErro('Erro ao buscar unidades', falha))
            .finally(() => { if (ativo) setCarregando(false); });
        return () => { ativo = false; };
    }, [filtrosAplicados, versao]);

    const aplicar = (filtros: FiltrosUnidade) => {
        setCarregando(true);
        setParametros((atuais) => {
            const proximos = new URLSearchParams(atuais);
            Object.entries(filtros).forEach(([chave, valor]) => {
                if (valor && !(chave === 'pagina' && valor === 1) && !(chave === 'status' && valor === STATUS_PADRAO)) proximos.set(chave, String(valor));
                else proximos.delete(chave);
            });
            return proximos;
        }, { replace: true });
    };

    const alterarRascunho = (evento: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = evento.target;
        setRascunho((atual) => ({ ...atual, [name]: value, ...(name === 'uf' && { id_cidade: '' }) }));
    };

    const filtrar = (evento: FormEvent) => {
        evento.preventDefault();
        aplicar({ ...rascunho, pagina: 1 });
    };

    const limpar = () => {
        const vazio: FiltrosUnidade = { termo: '', projeto: '', uf: '', id_cidade: '', status: 'Todos', pagina: 1 };
        setRascunho(vazio);
        aplicar(vazio);
    };

    return {
        projetos, unidades, totais, carregando, rascunho, cidades, alterarRascunho, filtrar, limpar,
        pagina: filtrosAplicados.pagina,
        mudarPagina: (pagina: number) => aplicar({ ...filtrosAplicados, pagina }),
        recarregar: () => setVersao((atual) => atual + 1),
        podeNovo: podeAcao(MODULO, 'pode_novo'),
        podeEditar: podeAcao(MODULO, 'pode_editar')
    };
}

const IMPORTACAO_VAZIA = { aberto: false, idProjeto: '', linhas: [] as LinhaCoordenada[], arquivo: '', enviando: false };

/** Coordenadas por planilha (colunas CNES, LATITUDE e LONGITUDE). A biblioteca só carrega quando usada. */
export function useImportacaoCoordenadas(aoConcluir: () => void) {
    const [importacao, setImportacao] = useState(IMPORTACAO_VAZIA);

    const baixarModelo = async () => {
        const XLSX = await import('xlsx');
        const planilha = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(planilha, XLSX.utils.aoa_to_sheet([['CNES', 'LATITUDE', 'LONGITUDE'], ['2399717', -7.119495, -34.845011]]), 'Coordenadas');
        XLSX.writeFile(planilha, 'Modelo_Coordenadas_Unidades.xlsx');
    };

    const lerPlanilha = async (evento: ChangeEvent<HTMLInputElement>) => {
        const arquivo = evento.target.files?.[0];
        evento.target.value = '';
        if (!arquivo) return;
        try {
            const XLSX = await import('xlsx');
            const livro = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
            const nomeAba = livro.SheetNames[0] ?? '';
            const brutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(livro.Sheets[nomeAba] ?? {}, { defval: '', raw: false });
            const coluna = (linha: Record<string, unknown>, nomes: string[]) => {
                const chave = Object.keys(linha).find((nome) => nomes.includes(nome.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()));
                return chave ? String(linha[chave]).trim() : '';
            };
            const linhas = brutas
                .map((linha) => ({ cnes: coluna(linha, ['CNES']), latitude: coluna(linha, ['LATITUDE', 'LAT']), longitude: coluna(linha, ['LONGITUDE', 'LONG', 'LNG', 'LON']) }))
                .filter((linha) => linha.cnes || linha.latitude || linha.longitude);
            if (!linhas.length) { aviso('Nenhuma linha encontrada. Use as colunas CNES, LATITUDE e LONGITUDE.'); return; }
            setImportacao((atual) => ({ ...atual, linhas, arquivo: arquivo.name }));
        } catch (falha) {
            logErro('Erro ao ler planilha', falha);
            erro('Não foi possível ler a planilha.');
        }
    };

    const enviar = async () => {
        if (!importacao.linhas.length) { aviso('Selecione a planilha.'); return; }
        setImportacao((atual) => ({ ...atual, enviando: true }));
        try {
            const { atualizadas, resultado } = await importarCoordenadas(importacao.idProjeto, importacao.linhas);
            const falhas = resultado.filter((linha) => linha.status === 'ERRO');
            const detalhes = falhas.slice(0, MAXIMO_ERROS_EXIBIDOS).map((linha) => `Linha ${linha.linha} - CNES ${linha.cnes || '(vazio)'}: ${linha.motivo}`).join('<br/>');
            resultadoComDetalhes(
                falhas.length ? 'warning' : 'success',
                `${atualizadas} unidade(s) atualizada(s)`,
                falhas.length ? `<b>${falhas.length} linha(s) com erro:</b><div style="max-height:220px;overflow:auto;text-align:left;font-size:.82rem">${detalhes}</div>` : 'Todas as linhas foram importadas.'
            );
            setImportacao(IMPORTACAO_VAZIA);
            aoConcluir();
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha na importação.'));
            setImportacao((atual) => ({ ...atual, enviando: false }));
        }
    };

    return {
        importacao, baixarModelo, lerPlanilha, enviar,
        abrir: () => setImportacao((atual) => ({ ...atual, aberto: true })),
        cancelar: () => setImportacao(IMPORTACAO_VAZIA),
        selecionarProjeto: (idProjeto: string) => setImportacao((atual) => ({ ...atual, idProjeto }))
    };
}

function paraFormulario(unidade: Unidade): FormUnidade {
    return {
        id_unidade: unidade.id_unidade,
        nome_unidade: unidade.nome_unidade,
        cnes: unidade.cnes || '',
        id_projeto: unidade.id_projeto,
        uf: unidade.uf || unidade.estado_sigla || '',
        id_cidade: unidade.id_cidade || '',
        latitude: unidade.latitude != null ? String(Number(unidade.latitude)) : '',
        longitude: unidade.longitude != null ? String(Number(unidade.longitude)) : '',
        id_macro: unidade.id_macro || '',
        id_micro: unidade.id_micro || '',
        id_tipo_unidade: unidade.id_tipo_unidade || '',
        ativo: Boolean(unidade.ativo)
    };
}

function problemaNoFormulario(form: FormUnidade): string | null {
    if (!form.nome_unidade || !form.id_projeto) return 'Preencha Nome e Projeto.';
    if (!form.cnes) return 'O campo CNES é obrigatório.';
    const latitude = numeroCoordenada(form.latitude);
    const longitude = numeroCoordenada(form.longitude);
    if ((latitude === null) !== (longitude === null)) return 'Informe latitude e longitude juntas (ou deixe as duas em branco).';
    if (latitude !== null && longitude !== null && (!coordenadaValida(latitude, 90) || !coordenadaValida(longitude, 180))) {
        return 'Coordenadas inválidas. Latitude entre -90 e 90 e longitude entre -180 e 180.';
    }
    return null;
}

export function useFormUnidade(idUnidade?: number) {
    const { podeAcao, nomeExibicao } = useAuth();
    const navigate = useNavigate();
    const { projetos, produtos, tipos } = useListas();
    const [form, setForm] = useState<FormUnidade>(FORM_VAZIO);
    const [produtosSelecionados, setProdutosSelecionados] = useState<number[]>([]);
    const [regioes, setRegioes] = useState<Macro[]>([]);
    const [chaveCentro, setChaveCentro] = useState(0);
    const [carregando, setCarregando] = useState(idUnidade !== undefined);
    const [naoEncontrado, setNaoEncontrado] = useState(false);
    const cidades = useCidades(form.uf);
    const podeSalvar = podeAcao(MODULO, idUnidade !== undefined ? 'pode_editar' : 'pode_novo');

    useEffect(() => {
        if (idUnidade === undefined) return;
        Promise.all([buscarUnidadePorId(idUnidade), listarProdutosDaUnidade(idUnidade)])
            .then(([unidade, idsProdutos]) => {
                if (!unidade) { setNaoEncontrado(true); return; }
                setForm(paraFormulario(unidade));
                setProdutosSelecionados(idsProdutos);
                setChaveCentro((atual) => atual + 1);
            })
            .catch((falha: unknown) => logErro('Erro ao abrir unidade', falha))
            .finally(() => setCarregando(false));
    }, [idUnidade]);

    useEffect(() => {
        if (!form.id_projeto) return;
        listarRegioes(form.id_projeto).then(setRegioes).catch((falha: unknown) => logErro('Erro ao listar regiões', falha));
    }, [form.id_projeto]);

    const alterarCampo = useCallback((evento: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = evento.target;
        const alvo = evento.target as HTMLInputElement;
        if (name === 'latitude' || name === 'longitude') {
            const par = value.match(PAR_COORDENADAS);
            if (par) {
                setForm((atual) => ({ ...atual, latitude: (par[1] ?? '').replace(',', '.'), longitude: (par[2] ?? '').replace(',', '.') }));
                setChaveCentro((atual) => atual + 1);
                return;
            }
            setForm((atual) => ({ ...atual, [name]: value.replace(/[^\d.,-]/g, '') }));
            return;
        }
        setForm((atual) => {
            if (name === 'cnes') return { ...atual, cnes: value.replace(/\D/g, '').slice(0, TAMANHO_CNES) };
            if (name === 'uf') return { ...atual, uf: value, id_cidade: '' };
            // Regiões pertencem ao projeto; trocar o projeto ou a macro limpa o nível abaixo.
            if (name === 'id_projeto') return { ...atual, id_projeto: value, id_macro: '', id_micro: '' };
            if (name === 'id_macro') return { ...atual, id_macro: value, id_micro: '' };
            return { ...atual, [name]: alvo.type === 'checkbox' ? alvo.checked : value };
        });
    }, []);

    const cidadeAtual = cidades.find((cidade) => String(cidade.id_cidade) === String(form.id_cidade));

    const usarCentroDoMunicipio = () => {
        if (cidadeAtual?.latitude == null || cidadeAtual.longitude == null) { aviso('Selecione um município com coordenada cadastrada.'); return; }
        setForm((atual) => ({ ...atual, latitude: String(Number(cidadeAtual.latitude)), longitude: String(Number(cidadeAtual.longitude)) }));
        setChaveCentro((atual) => atual + 1);
    };

    const salvar = async (evento: FormEvent) => {
        evento.preventDefault();
        if (!podeSalvar) { erro('Você não tem permissão para salvar.', 'Sem permissão'); return; }
        const problema = problemaNoFormulario(form);
        if (problema) { aviso(problema); return; }
        try {
            await salvarUnidade({
                ...form,
                latitude: numeroCoordenada(form.latitude),
                longitude: numeroCoordenada(form.longitude),
                produtos: produtosSelecionados,
                responsavel_acao: nomeExibicao
            });
            sucesso('Salvo!', 'Unidade salva com sucesso.');
            navigate(ROTA_LISTA);
        } catch (falha) {
            logErro('Erro ao salvar unidade', falha);
            erro(mensagemDeErro(falha, 'Erro ao salvar unidade.'));
        }
    };

    return {
        form, projetos, produtos, tipos, cidades, cidadeAtual, regioes: form.id_projeto ? regioes : [], produtosSelecionados, chaveCentro, carregando, naoEncontrado, podeSalvar,
        alterarCampo, salvar, usarCentroDoMunicipio,
        recentralizar: () => setChaveCentro((atual) => atual + 1),
        marcarNoMapa: (latitude: number, longitude: number) => setForm((atual) => ({ ...atual, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) })),
        limparCoordenadas: () => setForm((atual) => ({ ...atual, latitude: '', longitude: '' })),
        alternarProduto: (id: number) => setProdutosSelecionados((lista) => (lista.includes(id) ? lista.filter((item) => item !== id) : [...lista, id]))
    };
}
