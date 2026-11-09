import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import * as atividadesApi from '@/features/atividades/api';
import { MOTIVO_APOIO, MOTIVO_VISITA } from '@/features/atividades/api';
import type { Atividade, FiltrosAtividade, FormAtividade, Pessoa, RegrasRegistro } from '@/features/atividades/api';
import { useAuth } from '@/shared/auth/AuthContext';
import { listarProjetosAtivos, listarUnidadesDoProjeto, type ProjetoResumo } from '@/shared/catalogos';
import { aviso, confirmar, erro, mensagemDeErro, sucesso } from '@/shared/feedback';
import { useListaPorCodigo, useParametrosUrl } from '@/shared/hooks';
import { hojeLocal, logErro } from '@/shared/lib';

const MOTIVOS_COM_PROFISSIONAIS = ['Implantação', 'Treinamento'];
const HORA_CURTA = /^\d:\d{2}$/;
const HORA_VALIDA = /^\d{2,4}:[0-5]\d$/;
const DIGITOS_TEMPO = 6;
const FILTROS_VAZIOS: FiltrosAtividade = { dataInicio: '', dataFim: '', id_implantador: '', id_projeto: '', id_unidade: '', motivo: '', termo: '' };
const REGRAS_PADRAO: RegrasRegistro = { anexo: true, horas: true, equipeApoio: true };

export interface OrigemAtividade {
    modulo: string;
    apiBase: string;
    lotacao?: string;
}

const soData = (valor?: string | null) => (valor ? valor.split('T')[0] ?? '' : '');
const formatarData = (iso: string) => iso.split('-').reverse().join('/');

export function formatarPeriodo(inicio?: string | null, fim?: string | null): string {
    const dataInicio = soData(inicio);
    if (!dataInicio) return '-';
    const dataFim = soData(fim);
    return !dataFim || dataFim === dataInicio ? formatarData(dataInicio) : `${formatarData(dataInicio)} até ${formatarData(dataFim)}`;
}

export function nomesDaEquipe(atividade: Atividade): string {
    const primeiroNome = (nome: string) => nome.split(' ')[0];
    if (atividade.lista_implantadores?.length) return atividade.lista_implantadores.map((pessoa) => primeiroNome(pessoa.nome_completo)).join(', ');
    return atividade.nome_implantador ? primeiroNome(atividade.nome_implantador) ?? '-' : '-';
}

export function anexosDe(atividade: Atividade): string[] {
    const { caminho_arquivo: caminho } = atividade;
    if (Array.isArray(caminho)) return caminho;
    return caminho ? caminho.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

export const nomeDoAnexo = (caminho: string) => caminho.split('?')[0]?.split('/').pop() || 'Anexo';

/** Listas usadas tanto na pesquisa quanto no formulário. */
export function useListasAtividade(lotacao?: string) {
    const [projetos, setProjetos] = useState<ProjetoResumo[]>([]);
    const [equipe, setEquipe] = useState<Pessoa[]>([]);
    const [motivos, setMotivos] = useState<string[]>([]);

    useEffect(() => {
        listarProjetosAtivos(lotacao).then(setProjetos).catch((falha: unknown) => logErro('Erro ao listar projetos', falha));
        atividadesApi.listarEquipe(lotacao).then(setEquipe).catch((falha: unknown) => logErro('Erro ao listar a equipe', falha));
        atividadesApi.listarMotivos().then(setMotivos).catch((falha: unknown) => logErro('Erro ao listar motivos', falha));
    }, [lotacao]);

    return { projetos, equipe, motivos };
}

export type ListasAtividade = ReturnType<typeof useListasAtividade>;

export function useListaAtividades({ modulo, apiBase, lotacao }: OrigemAtividade) {
    const { usuario, nomeExibicao, podeAcao } = useAuth();
    const [parametros, alterarUrl] = useParametrosUrl();
    const aplicados = useMemo<FiltrosAtividade>(() => ({
        dataInicio: parametros.get('dataInicio') ?? '',
        dataFim: parametros.get('dataFim') ?? '',
        id_implantador: parametros.get('id_implantador') ?? '',
        // A lotação escolhida em Projetos trava a busca; nada de outra lotação aparece.
        id_projeto: lotacao ?? parametros.get('id_projeto') ?? '',
        id_unidade: parametros.get('id_unidade') ?? '',
        motivo: parametros.get('motivo') ?? '',
        termo: parametros.get('termo') ?? ''
    }), [parametros, lotacao]);
    const pagina = Number(parametros.get('pagina') ?? 1);
    const [rascunho, setRascunho] = useState(aplicados);
    const [resultado, setResultado] = useState<{ chave: string; dados: Atividade[]; total: number; totalPaginas: number }>({ chave: '', dados: [], total: 0, totalPaginas: 1 });
    const [versao, setVersao] = useState(0);
    const unidades = useListaPorCodigo(rascunho.id_projeto, listarUnidadesDoProjeto, 'Erro ao listar unidades');
    const chave = JSON.stringify({ aplicados, pagina, versao });

    useEffect(() => {
        let ativo = true;
        atividadesApi.buscarAtividades(apiBase, aplicados, pagina)
            .then((resposta) => { if (ativo) setResultado({ chave, ...resposta }); })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setResultado({ chave, dados: [], total: 0, totalPaginas: 1 });
                erro(mensagemDeErro(falha, 'Não foi possível buscar as atividades.'));
            });
        return () => { ativo = false; };
    }, [apiBase, aplicados, pagina, chave]);

    const aplicar = (filtros: FiltrosAtividade) => alterarUrl({ ...filtros, id_projeto: lotacao ? null : filtros.id_projeto, pagina: null });

    return {
        rascunho, unidades, pagina,
        atividades: resultado.dados,
        total: resultado.total,
        totalPaginas: resultado.totalPaginas,
        carregando: resultado.chave !== chave,
        podeNovo: podeAcao(modulo, 'pode_novo'),
        podeEditar: podeAcao(modulo, 'pode_editar'),
        alterarFiltro: (evento: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            const { name, value } = evento.target;
            setRascunho((atual) => ({ ...atual, [name]: value, ...(name === 'id_projeto' && { id_unidade: '' }) }));
        },
        pesquisar: (evento: FormEvent) => {
            evento.preventDefault();
            aplicar(rascunho);
        },
        limpar: () => {
            const vazio = { ...FILTROS_VAZIOS, id_projeto: lotacao ?? '' };
            setRascunho(vazio);
            aplicar(vazio);
        },
        irParaPagina: (nova: number) => alterarUrl({ pagina: nova > 1 ? String(nova) : null }),
        abrirRegistro: (registro: string) => alterarUrl({ registro }, { empilhar: true }),
        excluir: async (atividade: Atividade) => {
            if (!await confirmar('Excluir esta atividade?', { texto: 'Esta exclusão não pode ser desfeita.', rotulo: 'Sim, excluir' })) return;
            try {
                await atividadesApi.excluirAtividade(apiBase, atividade, formatarPeriodo(atividade.data_inicio, atividade.data_fim), usuario.nome_completo || nomeExibicao);
                sucesso('Registro excluído');
                setVersao((atual) => atual + 1);
            } catch (falha) {
                erro(mensagemDeErro(falha, 'Não foi possível excluir o registro.'));
            }
        }
    };
}

/** Carrega o registro aberto pela URL: "novo" ou o id de uma atividade. */
export function useRegistroAberto(apiBase: string, registro: string) {
    const novo = registro === 'novo';
    const [estado, setEstado] = useState<{ atividade: Atividade | null; carregando: boolean }>({ atividade: null, carregando: !novo });

    useEffect(() => {
        if (novo) return undefined;
        let ativo = true;
        atividadesApi.buscarAtividade(apiBase, registro)
            .then((atividade) => { if (ativo) setEstado({ atividade, carregando: false }); })
            .catch((falha: unknown) => {
                logErro('Erro ao abrir a atividade', falha);
                if (ativo) setEstado({ atividade: null, carregando: false });
            });
        return () => { ativo = false; };
    }, [apiBase, registro, novo]);

    return { novo, ...estado };
}

function formInicial(atividade: Atividade | null, lotacao?: string): FormAtividade {
    if (!atividade) {
        return {
            id_atividade: null, data_inicio: hojeLocal(), data_fim: '', redmine: '', profissionais_env: '', tempo_gasto: '',
            implantadores_ids: [], equipe_projeto_ids: [], motivos: [], id_projeto: lotacao ?? '', id_unidade: '', produtos: [], arquivos: [], anexosMantidos: []
        };
    }
    const implantadores = atividade.lista_implantadores?.length
        ? atividade.lista_implantadores.map((pessoa) => pessoa.id_usuario)
        : [atividade.id_implantador].filter((id): id is number => Boolean(id));
    return {
        id_atividade: atividade.id_atividade,
        data_inicio: soData(atividade.data_inicio),
        data_fim: soData(atividade.data_fim),
        redmine: String(atividade.redmine ?? ''),
        profissionais_env: String(atividade.profissionais_env ?? ''),
        tempo_gasto: atividade.tempo_gasto ?? '',
        implantadores_ids: implantadores,
        equipe_projeto_ids: atividade.lista_equipe_projeto?.map((pessoa) => pessoa.id_usuario) ?? [],
        motivos: atividade.motivos ? atividade.motivos.split(', ') : [],
        id_projeto: String(atividade.id_projeto ?? ''),
        id_unidade: String(atividade.id_unidade ?? ''),
        produtos: atividade.produtos_trabalhados ? atividade.produtos_trabalhados.split(', ') : [],
        arquivos: [],
        anexosMantidos: anexosDe(atividade)
    };
}

/** Máscara h:mm: os 2 últimos dígitos são os minutos. */
function mascararTempo(valor: string): string {
    const digitos = valor.replace(/\D/g, '').slice(0, DIGITOS_TEMPO);
    return digitos.length >= 3 ? `${digitos.slice(0, -2)}:${digitos.slice(-2)}` : digitos;
}

const completarHora = (tempo: string) => (HORA_CURTA.test(tempo) ? `0${tempo}` : tempo);

interface FormProps extends OrigemAtividade {
    atividade: Atividade | null;
    aoConcluir: () => void;
}

export function useFormAtividade({ modulo, apiBase, lotacao, atividade, aoConcluir }: FormProps) {
    const { usuario, nomeExibicao, podeAcao } = useAuth();
    const [form, setForm] = useState(() => formInicial(atividade, lotacao));
    const [regras, setRegras] = useState(REGRAS_PADRAO);
    const [salvando, setSalvando] = useState(false);
    const apoio = form.motivos.includes(MOTIVO_APOIO);
    const semProfissionais = form.motivos.includes(MOTIVO_VISITA);
    const unidades = useListaPorCodigo(form.id_projeto, listarUnidadesDoProjeto, 'Erro ao listar unidades');
    const produtos = useListaPorCodigo(form.id_unidade, atividadesApi.listarProdutosDaUnidade, 'Erro ao listar produtos');
    const buscarEquipeDoProjeto = useCallback((idProjeto: string) => atividadesApi.listarEquipe(idProjeto), []);
    const equipeDoProjeto = useListaPorCodigo(apoio ? form.id_projeto : '', buscarEquipeDoProjeto, 'Erro ao listar a equipe do projeto');

    useEffect(() => {
        atividadesApi.buscarRegras(apiBase === '/projetos' ? 'projetos' : 'implantacao')
            .then(setRegras)
            .catch((falha: unknown) => logErro('Erro ao carregar as regras; mantendo obrigatório', falha));
    }, [apiBase]);

    const obrigatorio = {
        profissionais: !semProfissionais && form.motivos.some((motivo) => MOTIVOS_COM_PROFISSIONAIS.includes(motivo)),
        horas: regras.horas,
        anexo: regras.anexo && !apoio,
        equipeApoio: regras.equipeApoio && apoio
    };
    const podeSalvar = podeAcao(modulo, form.id_atividade ? 'pode_editar' : 'pode_novo');

    /** Primeiro problema do formulário, na ordem em que os campos aparecem. */
    const problema = (): string | null => {
        const tempo = completarHora(form.tempo_gasto.trim());
        if (!form.data_inicio || !form.id_unidade) return 'Preencha Data Início e Unidade.';
        if (!form.implantadores_ids.length) return 'Adicione pelo menos um da equipe.';
        if (!form.motivos.length) return 'Selecione um Motivo.';
        if (!tempo && obrigatorio.horas) return 'Informe o Tempo Gasto (hh:mm).';
        if (tempo && !HORA_VALIDA.test(tempo)) return 'Tempo Gasto inválido. Use o formato hh:mm (minutos de 00 a 59).';
        if (form.data_fim && form.data_fim < form.data_inicio) return 'Data Fim menor que Data Início.';
        if (obrigatorio.profissionais && !form.profissionais_env) return 'Informe a quantidade de Profissionais.';
        if (obrigatorio.equipeApoio && !form.equipe_projeto_ids.length) return 'Selecione pelo menos um profissional na Equipe do Projeto.';
        if (produtos.length && !form.produtos.length) return 'Selecione pelo menos um Produto Trabalhado.';
        if (obrigatorio.anexo && !form.arquivos.length && !form.anexosMantidos.length) return 'É obrigatório manter ou anexar pelo menos um arquivo para este motivo.';
        return null;
    };

    const alternar = (lista: 'implantadores_ids' | 'equipe_projeto_ids', id: number) => setForm((atual) => ({
        ...atual,
        [lista]: atual[lista].includes(id) ? atual[lista].filter((item) => item !== id) : [...atual[lista], id]
    }));

    return {
        form, unidades, produtos, equipeDoProjeto, obrigatorio, regras, apoio, semProfissionais, podeSalvar, salvando, alternar,
        alterarCampo: (evento: ChangeEvent<HTMLInputElement>) => {
            const { name, value } = evento.target;
            setForm((atual) => ({ ...atual, [name]: value }));
        },
        alterarTempo: (valor: string) => setForm((atual) => ({ ...atual, tempo_gasto: mascararTempo(valor) })),
        completarTempo: () => setForm((atual) => ({ ...atual, tempo_gasto: completarHora(atual.tempo_gasto.trim()) })),
        alterarProjeto: (id_projeto: string) => setForm((atual) => ({ ...atual, id_projeto, id_unidade: '', produtos: [], equipe_projeto_ids: [] })),
        alterarUnidade: (id_unidade: string) => setForm((atual) => ({ ...atual, id_unidade, produtos: [] })),
        selecionarMotivo: (motivo: string) => setForm((atual) => ({
            ...atual,
            motivos: [motivo],
            profissionais_env: motivo === MOTIVO_VISITA ? '' : atual.profissionais_env,
            equipe_projeto_ids: motivo === MOTIVO_APOIO ? atual.equipe_projeto_ids : []
        })),
        alternarProduto: (nome: string) => setForm((atual) => ({
            ...atual,
            produtos: atual.produtos.includes(nome) ? atual.produtos.filter((item) => item !== nome) : [...atual.produtos, nome]
        })),
        adicionarArquivos: (arquivos: File[]) => setForm((atual) => ({ ...atual, arquivos: [...atual.arquivos, ...arquivos] })),
        removerArquivo: (indice: number) => setForm((atual) => ({ ...atual, arquivos: atual.arquivos.filter((_, posicao) => posicao !== indice) })),
        removerAnexoSalvo: (caminho: string) => setForm((atual) => ({ ...atual, anexosMantidos: atual.anexosMantidos.filter((item) => item !== caminho) })),
        salvar: async (evento: FormEvent) => {
            evento.preventDefault();
            const encontrado = problema();
            if (encontrado) {
                aviso(encontrado);
                return;
            }
            setSalvando(true);
            try {
                await atividadesApi.salvarAtividade(apiBase, form, completarHora(form.tempo_gasto.trim()), usuario.nome_completo || nomeExibicao);
                sucesso('Salvo com sucesso!');
                aoConcluir();
            } catch (falha) {
                erro(mensagemDeErro(falha, 'Falha ao salvar o registro.'));
            } finally {
                setSalvando(false);
            }
        }
    };
}
