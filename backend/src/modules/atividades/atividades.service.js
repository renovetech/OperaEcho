/* Regras do Registro de Atividades, comuns aos dois módulos; o que difere vem das opções de atividades.modulos.js. */
const fs = require('fs');
const path = require('path');
const { regrasRegistro, HORA_VALIDA } = require('../parametros/parametros.service');
const { assinarLista, caminhosMantidos, removerAnexos, trechoSeguro } = require('../../shared/arquivos');
const repositorio = require('./atividades.repository');

const LIMITE_MAXIMO = 1000;
const LIMITE_PADRAO = 50;
const MOTIVO_APOIO = 'Apoio ao Projeto';
const MARCA_SEM_USUARIO = '-Colaborador-';
const PASTA_DOS_ANEXOS = 'uploads/atividades/';

const recusa = (status, erro) => ({ recusa: { status, erro } });

/* ---------------------------------------------------------------- busca */

/** O isolamento na leitura é por função na Implantação e sempre em Projetos. */
function isolaNaLeitura(modulo, escopo) {
    if (!modulo.funcoesIsoladasNaLeitura) return true;
    const funcao = ((escopo && escopo.nome_funcao) || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
    return modulo.funcoesIsoladasNaLeitura.includes(funcao);
}

const paraResposta = (linha) => ({
    ...linha,
    caminho_arquivo: assinarLista(linha.caminho_arquivo),
    lista_implantadores: linha.lista_implantadores ? JSON.parse(linha.lista_implantadores) : [],
    lista_equipe_projeto: linha.lista_equipe_projeto ? JSON.parse(linha.lista_equipe_projeto) : []
});

async function buscar(modulo, consulta, escopo) {
    const pagina = Math.max(1, parseInt(consulta.pagina) || 1);
    const limite = Math.min(LIMITE_MAXIMO, Math.max(1, parseInt(consulta.limite) || LIMITE_PADRAO));
    const paginacao = { limite, offset: (pagina - 1) * limite };
    const lotacao = { isolar: isolaNaLeitura(modulo, escopo), escopo };
    const { total, linhas } = await repositorio.listar(modulo.tabelas, consulta, lotacao, paginacao);
    return { total, pagina, totalPaginas: Math.ceil(total / limite), dados: linhas.map(paraResposta) };
}

/* ---------------------------------------------------------------- campos do multipart */

/** Lista de ids como veio do cliente: JSON em texto (web e app), lista ou número; texto solto vira um número só. */
function lerListaDeIds(valor) {
    if (!valor) return [];
    try {
        if (typeof valor === 'string') {
            const lido = JSON.parse(valor);
            return typeof lido === 'number' ? [lido] : lido;
        }
        if (Array.isArray(valor)) return valor.map((id) => parseInt(id)).filter((id) => !isNaN(id));
        return typeof valor === 'number' ? [valor] : [];
    } catch (e) {
        const numero = parseInt(valor);
        return isNaN(numero) ? [] : [numero];
    }
}

/** Inteiros únicos maiores que zero. */
function normalizarIds(lista) {
    const numeros = (Array.isArray(lista) ? lista : []).map((id) => parseInt(id)).filter((id) => !isNaN(id) && id > 0);
    return [...new Set(numeros)];
}

const ehMotivoDeApoio = (motivos) => String(motivos || '').split(',').map((motivo) => motivo.trim()).includes(MOTIVO_APOIO);

function lerEquipe(modulo, corpo, ehApoio) {
    if (modulo.equipeSomenteNoApoio && !ehApoio) return [];
    return normalizarIds(lerListaDeIds(corpo.equipe_projeto_ids));
}

function validarObrigatorios(modulo, corpo) {
    const lidos = lerListaDeIds(corpo.implantadores_ids);
    if (!corpo.data_inicio || !corpo.id_unidade || !corpo.motivos || !Array.isArray(lidos) || lidos.length === 0) {
        return recusa(400, 'Preencha os campos obrigatórios. É obrigatório selecionar pelo menos um implantador na Equipe - o sistema NÃO atrela automaticamente o usuário que está criando o registro.');
    }
    if (corpo.data_fim && new Date(corpo.data_fim) < new Date(corpo.data_inicio)) return recusa(400, 'A data final não pode ser anterior à data inicial.');
    const implantadores = normalizarIds(lidos);
    if (implantadores.length === 0) return recusa(400, 'Lista de implantadores inválida. Selecione pelo menos um implantador válido.');
    const ehApoio = ehMotivoDeApoio(corpo.motivos);
    return { implantadores, ehApoio, equipe: lerEquipe(modulo, corpo, ehApoio), tempo: String(corpo.tempo_gasto || '').trim() };
}

/* ---------------------------------------------------------------- passos da gravação */

function projetoPermitido(escopo, idProjeto) {
    if (!escopo) return false;
    if (escopo.global) return true;
    if (!Array.isArray(escopo.lotacoes) || escopo.lotacoes.length === 0) return false;
    return escopo.lotacoes.includes(parseInt(idProjeto));
}

function conferirProjetoNoEscopo(modulo, req) {
    if (!modulo.escopoNaEscrita) return {};
    if (!req.body.id_projeto) return recusa(400, 'Projeto (lotação) é obrigatório.');
    if (!projetoPermitido(req.escopo, req.body.id_projeto)) return recusa(403, 'Você não possui lotação neste projeto.');
    return {};
}

async function lerAnexosAtuais(modulo, req) {
    const { id_atividade: idAtividade } = req.body;
    if (!idAtividade) return { anexosAtuais: '' };
    const linhas = await repositorio.buscarAnexos(modulo.tabelas, parseInt(idAtividade));
    if (modulo.registroObrigatorioNosAnexos && linhas.length === 0) return recusa(404, 'Registro não encontrado.');
    return { anexosAtuais: (linhas[0] && linhas[0].caminho_arquivo) || '' };
}

/** Troca a marca "sem usuário" do nome do arquivo; se o disco falhar, mantém o nome recebido. */
function nomeFinalDoAnexo(arquivo, req) {
    if (!arquivo.filename.includes(MARCA_SEM_USUARIO)) return arquivo.filename;
    // Sanitizado: o nome entra no caminho do arquivo.
    const nomeReal = trechoSeguro(req.body.nome_usuario_upload || req.usuario.usuario);
    const novoNome = arquivo.filename.replace(MARCA_SEM_USUARIO, `-${nomeReal}-`);
    try {
        const destino = path.join(arquivo.destination, novoNome);
        fs.renameSync(arquivo.path, destino);
        // Uma recusa adiante precisa achar o arquivo pelo nome novo para descartá-lo.
        arquivo.path = destino;
        return novoNome;
    } catch (e) {
        return arquivo.filename;
    }
}

function montarCaminhos(modulo, req, dados) {
    const mantidos = caminhosMantidos(req.body.arquivos_antigos_mantidos, dados.anexosAtuais);
    const novos = (req.files || []).map((arquivo) => PASTA_DOS_ANEXOS + nomeFinalDoAnexo(arquivo, req));
    return { caminhos: [...mantidos, ...novos] };
}

async function conferirRegras(modulo, req, dados) {
    const regras = await regrasRegistro(modulo.moduloParametros);
    if (regras.equipeApoio && dados.ehApoio && dados.equipe.length === 0) return recusa(400, 'Para o motivo "Apoio ao Projeto" é obrigatório informar a Equipe do Projeto.');
    if (regras.horas && !dados.tempo) return recusa(400, 'Informe o Tempo Gasto (hh:mm).');
    if (dados.tempo && !HORA_VALIDA.test(dados.tempo)) return recusa(400, 'Tempo Gasto inválido. Use o formato hh:mm.');
    return { regras };
}

/** Anexo obrigatório quando o parâmetro está ligado, exceto no motivo de apoio. */
function conferirAnexo(modulo, req, dados) {
    const temAnexo = dados.caminhos.some((caminho) => caminho && caminho.trim());
    if (dados.regras.anexo && !dados.ehApoio && !temAnexo) return recusa(400, 'É obrigatório anexar pelo menos um arquivo para este motivo.');
    return {};
}

async function registroNoEscopo(modulo, escopo, id) {
    const linhas = await repositorio.buscarProjeto(modulo.tabelas, id);
    if (linhas.length === 0) return recusa(404, 'Registro não encontrado.');
    if (!projetoPermitido(escopo, linhas[0].id_projeto)) return recusa(403, 'Registro fora da sua lotação.');
    return {};
}

function conferirRegistroNoEscopo(modulo, req) {
    if (!modulo.escopoNaEscrita || !req.body.id_atividade) return {};
    return registroNoEscopo(modulo, req.escopo, parseInt(req.body.id_atividade));
}

const passosDaGravacao = (modulo) => [
    conferirProjetoNoEscopo,
    ...(modulo.regrasAntesDosAnexos
        ? [conferirRegras, lerAnexosAtuais, montarCaminhos]
        : [lerAnexosAtuais, montarCaminhos, conferirRegras]),
    conferirAnexo,
    conferirRegistroNoEscopo
];

/** Roda as regras na ordem do módulo. Devolve { recusa } ou { dados } para a gravação. */
async function prepararGravacao(modulo, req) {
    const validados = validarObrigatorios(modulo, req.body);
    if (validados.recusa) return validados;
    let dados = validados;
    for (const passo of passosDaGravacao(modulo)) {
        const resultado = await passo(modulo, req, dados);
        if (resultado.recusa) return resultado;
        dados = { ...dados, ...resultado };
    }
    return { dados };
}

async function gravar(modulo, corpo, dados) {
    await repositorio.gravar(modulo.tabelas, {
        idAtividade: corpo.id_atividade ? parseInt(corpo.id_atividade) : null,
        dataInicio: corpo.data_inicio,
        dataFim: corpo.data_fim || corpo.data_inicio,
        redmine: corpo.redmine || null,
        profissionais: corpo.profissionais_env ? parseInt(corpo.profissionais_env) : null,
        tempo: dados.tempo || null,
        implantadores: dados.implantadores,
        equipe: dados.equipe,
        motivos: corpo.motivos,
        idProjeto: parseInt(corpo.id_projeto),
        idUnidade: parseInt(corpo.id_unidade),
        produtos: corpo.produtos_trabalhados || '',
        caminhos: dados.caminhos.join(',')
    });
    // Só depois de gravar: o que saiu da lista não fica mais órfão no disco.
    const mantidos = new Set(dados.caminhos);
    removerAnexos(String(dados.anexosAtuais || '').split(',').filter((caminho) => !mantidos.has(caminho.trim())));
}

/** Devolve { recusa } quando a exclusão não é permitida. */
async function excluir(modulo, escopo, id) {
    if (modulo.escopoNaEscrita) {
        const conferido = await registroNoEscopo(modulo, escopo, id);
        if (conferido.recusa) return conferido;
    }
    const [registro] = await repositorio.buscarAnexos(modulo.tabelas, id);
    await repositorio.excluir(modulo.tabelas, id);
    removerAnexos(String((registro && registro.caminho_arquivo) || '').split(','));
    return {};
}

module.exports = { buscar, prepararGravacao, gravar, excluir };
