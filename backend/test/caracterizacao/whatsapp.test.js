/* WhatsApp (Parâmetros > WhatsApp): configuração, conexão com a Evolution, fila, trilha de envios e ações.
 * A rede da Evolution é substituída (chamadas registradas em `externos`), mas a leitura da configuração e a
 * formatação de números usam o código real: a configuração vem do banco falso (`respostas`). */
const path = require('node:path');
const { caracterizar } = require('../apoio/caracterizacao');

const FONTE = path.join(__dirname, '..', '..', 'src');
const caminhoDe = (relativo) => require.resolve(path.join(FONTE, relativo));

/* Cifra determinística: a real usa IV aleatório e a base não repetiria. */
const cripto = caminhoDe('shared/crypto.js');
require.cache[cripto] = { id: cripto, filename: cripto, loaded: true, exports: { encryptTagged: (v) => (v ? `cifrado(${v})` : null), decryptTagged: (v) => v } };

const caminhoEvolucao = caminhoDe('modules/whatsapp/evolution.js');
const registrada = require(caminhoEvolucao); // o apoio já pôs aqui o substituto que registra em `externos`
delete require.cache[caminhoEvolucao];
const real = require(caminhoEvolucao);

const INSTANCIA_ABERTA = 'instancia-aberta';
const INSTANCIA_FALHA = 'instancia-falha';
const registrando = (nome, resposta) => (cx, ...resto) => { registrada[nome](cx, ...resto); return resposta(cx); };
const falhaSeInstanciaFalha = (cx, valor) => (cx.inst === INSTANCIA_FALHA ? Promise.reject(new Error('503 fora do ar')) : Promise.resolve(valor));
const evolucaoDeTeste = {
    ...real,
    conexao: (c) => (!c || !c.url_api || !c.instancia || !c.token_acesso ? null : { base: c.url_api, inst: c.instancia, apikey: 'chave' }),
    estado: registrando('estado', (cx) => (cx ? (cx.inst === INSTANCIA_ABERTA ? 'open' : 'close') : 'NAO_CONFIGURADO')),
    qrcode: registrando('qrcode', (cx) => falhaSeInstanciaFalha(cx, { base64: 'imagem', code: 'codigo', pairingCode: 'ABCD-1234' })),
    desconectar: registrando('desconectar', (cx) => falhaSeInstanciaFalha(cx, undefined)),
    enviarTexto: registrando('enviarTexto', () => Promise.resolve({ enviado: true, messageId: 'm1', erro: null }))
};
require.cache[caminhoEvolucao].exports = evolucaoDeTeste;

const CONFIG = {
    ativo: true, url_api: 'https://evolution.exemplo.com', instancia: INSTANCIA_ABERTA, token_acesso: 'cifrado(segredo)',
    limite_inicial: 80, crescimento_semanal: 30, limite_maximo: 1000, max_por_minuto: 12, pausa_min_seg: 2, pausa_max_seg: 5,
    hora_envio_inicio: '08:00', hora_envio_fim: '08:00', // início = fim: sempre dentro da janela, sem depender do relógio
    escala_semanal_ativa: true, escala_semanal_dia: 1, escala_semanal_hora: new Date('1970-01-01T18:00:00.000Z'), escala_semanal_referencia: 'ATUAL',
    escala_alteracao_ativa: true, escala_alteracao_espera: 15, ferias_ativa: true, codigo_senha_ativa: false,
    msg_escala_semanal: 'Olá {primeiroNome}, sua escala:\n{escala}', data_atualizacao: '2026-10-01T10:00:00', usuario_alteracao: 'Ana Admin'
};
const CONFIG_COM_AQUECIMENTO = { ...CONFIG, inicio_aquecimento: new Date('2026-09-01T00:00:00.000Z'), escala_semanal_ultima: new Date('2026-10-12T00:00:00.000Z') };
const CONFIG_SEM_TOKEN = { ...CONFIG, token_acesso: null };

const LEITURA = /^SELECT \* FROM tab_whatsapp_config WHERE id = 1$/;
const comConfig = (linha) => [LEITURA, linha ? [linha] : []];
const NOME_USUARIO = [/^SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id$/, [{ nome_completo: 'Ana Admin' }]];
const DESTINATARIO = (extra = {}) => [/SELECT id_usuario, nome_completo, celular, celular_whatsapp, ativo FROM tab_usuarios/, [{ id_usuario: 1, nome_completo: 'ANA ADMIN', celular: '21987654321', celular_whatsapp: true, ativo: true, ...extra }]];

/* A fila acorda sozinha depois de alguns eventos: sem isto o laço de envio não terminaria com as linhas padrão. */
const GUARDA_DA_FILA = [[/WITH prox AS/, []], [/AGUARDANDO' AND liberar_em <= GETDATE\(\)/, []]];

const perfilLeitura = { perfil: 'Leitor WhatsApp', respostasPerfil: [[/FROM tab_regras_acesso/, [{ nome_modulo: 'parametros', pode_acessar: true, pode_novo: false, pode_editar: false }]]] };
const perfilSemAcesso = { perfil: 'Sem acesso WhatsApp', respostasPerfil: [[/FROM tab_regras_acesso/, []]] };
const como = (perfil, respostas = []) => ({ perfil: perfil.perfil, respostas: [...perfil.respostasPerfil, ...respostas] });
const comGuarda = (...respostas) => ({ respostas: [...respostas, ...GUARDA_DA_FILA] });

const textosPersonalizados = { ESCALA_SEMANAL: 'Olá {primeiroNome}, sua escala:\n{escala}', ESCALA_ALTERACAO: '', CODIGO_SENHA: 'Código {codigo}' };
const configuracao = {
    ativo: true, url_api: 'https://evolution.exemplo.com', instancia: 'minha-instancia', token_acesso: 'segredo-novo',
    eventos: { escala_semanal_ativa: true, escala_semanal_dia: 1, escala_semanal_hora: '18:00', escala_semanal_referencia: 'ATUAL', escala_alteracao_ativa: true, escala_alteracao_espera: 15, ferias_ativa: true, codigo_senha_ativa: false },
    fila: { inicioAquecimento: '2026-09-01', limiteInicial: 80, crescimentoSemanal: '30', limiteMaximo: 1000, maxPorMinuto: 12, pausaMinima: 2, pausaMaxima: 5, horaInicio: '08:00', horaFim: '20:00' },
    textos: textosPersonalizados
};
const salvar = (nome, corpo, extra = {}) => ({ nome: `salvar: ${nome}`, metodo: 'POST', url: '/integracoes/whatsapp', corpo, ...extra });
const salvarInvalido = (nome, alteracao) => salvar(nome, { ...configuracao, ...alteracao }, comGuarda(comConfig(CONFIG)));

const envios = [
    { id_envio: 9, id_usuario: 1, nome_completo: 'Ana Admin', numero: '5521987654321', tipo_evento: 'ESCALA_SEMANAL', modulo: 'IMPLANTACAO', status: 'FALHA', motivo: null, erro: 'timeout', prioridade: 5, usuario_origem: 'Ana', mensagem: 'Olá', data_criacao: '01/10/2026 10:00', data_envio: null, liberar_em: null },
    { id_envio: 8, id_usuario: 2, nome_completo: 'Bia', numero: null, tipo_evento: 'CODIGO_SENHA', modulo: null, status: 'NAO_ENVIADO', motivo: 'CELULAR_INVALIDO', erro: null, prioridade: 1, usuario_origem: null, mensagem: '(código de senha oculto)', data_criacao: '01/10/2026 09:00', data_envio: '01/10/2026 09:01', liberar_em: null }
];
const linhaDeEscala = { data_escala: new Date('2026-10-26T00:00:00.000Z'), tipo: 'TRABALHO', turno: 'DIURNO', redmine: '1234', nome_projeto: 'Projeto X', nome_unidade: 'UPA Centro', produtos: 'A, B' };
const escalaEnfileirada = (extraDestinatario = {}) => [
    comConfig(CONFIG),
    [/SELECT DISTINCT e\.id_usuario FROM/, [{ id_usuario: 7 }]],
    [/FROM tab_whatsapp_envios WHERE id_usuario = @u AND tipo_evento = 'ESCALA_SEMANAL'/, []],
    [/SELECT e\.data_escala, e\.tipo/, [linhaDeEscala]],
    DESTINATARIO({ id_usuario: 7, nome_completo: 'MARIA SILVA', ...extraDestinatario }),
    NOME_USUARIO
];

const casos = [
    // configuração
    { nome: 'config: ler', url: '/integracoes/whatsapp', respostas: [comConfig(CONFIG_COM_AQUECIMENTO)] },
    { nome: 'config: ler sem registro', url: '/integracoes/whatsapp', respostas: [comConfig(null)] },
    { nome: 'config: ler com perfil de leitura', url: '/integracoes/whatsapp', ...como(perfilLeitura, [comConfig(CONFIG)]) },
    { nome: 'config: ler sem permissão', url: '/integracoes/whatsapp', ...como(perfilSemAcesso) },
    { nome: 'config: ler sem login', url: '/integracoes/whatsapp', anonimo: true },
    salvar('completo', configuracao, comGuarda(comConfig(CONFIG), NOME_USUARIO)),
    salvar('ativando com apikey já gravada', { ...configuracao, token_acesso: undefined }, comGuarda(comConfig(CONFIG), NOME_USUARIO)),
    salvar('desativando e sem blocos opcionais', { ativo: false }, comGuarda(comConfig(CONFIG), NOME_USUARIO)),
    salvar('corpo vazio', {}, comGuarda(comConfig(CONFIG), NOME_USUARIO)),
    salvar('referência desconhecida e texto longo', { ...configuracao, eventos: { escala_semanal_referencia: 'OUTRA' }, textos: { ESCALA_SEMANAL: 'x'.repeat(2100), CODIGO_SENHA: null } }, comGuarda(comConfig(CONFIG), NOME_USUARIO)),
    salvar('perfil de leitura', configuracao, como(perfilLeitura)),
    salvar('sem login', configuracao, { anonimo: true }),
    salvar('ativar sem apikey', { ...configuracao, token_acesso: undefined }, comGuarda(comConfig(CONFIG_SEM_TOKEN))),
    salvar('ativar sem URL', { ...configuracao, url_api: '' }, comGuarda(comConfig(CONFIG))),
    salvarInvalido('URL inválida', { url_api: 'ftp://evolution' }),
    salvarInvalido('instância inválida', { instancia: 'nome com espaço' }),
    salvarInvalido('limite fora da faixa', { fila: { ...configuracao.fila, limiteInicial: 9000 } }),
    salvarInvalido('limite não numérico', { fila: { ...configuracao.fila, maxPorMinuto: 'abc' } }),
    salvarInvalido('pausa mínima maior que a máxima', { fila: { ...configuracao.fila, pausaMinima: 10, pausaMaxima: 5 } }),
    salvarInvalido('limite inicial acima do teto', { fila: { ...configuracao.fila, limiteInicial: 500, limiteMaximo: 100 } }),
    salvarInvalido('hora de início inválida', { fila: { ...configuracao.fila, horaInicio: '25:00' } }),
    salvarInvalido('hora da escala semanal inválida', { eventos: { ...configuracao.eventos, escala_semanal_hora: '6pm' } }),
    salvarInvalido('dia da escala fora da faixa', { eventos: { ...configuracao.eventos, escala_semanal_dia: 9 } }),
    salvarInvalido('aquecimento no futuro', { fila: { ...configuracao.fila, inicioAquecimento: '2999-01-01' } }),
    salvarInvalido('aquecimento em formato inválido', { fila: { ...configuracao.fila, inicioAquecimento: '01/09/2026' } }),

    // conexão
    { nome: 'status: conectado', url: '/integracoes/whatsapp/status', respostas: [comConfig({ ...CONFIG })] },
    { nome: 'status: sem configuração', url: '/integracoes/whatsapp/status', respostas: [comConfig(null)] },
    { nome: 'status: sem permissão', url: '/integracoes/whatsapp/status', ...como(perfilSemAcesso) },
    { nome: 'qrcode: ok', url: '/integracoes/whatsapp/qrcode', respostas: [comConfig(CONFIG)] },
    { nome: 'qrcode: sem configuração', url: '/integracoes/whatsapp/qrcode', respostas: [comConfig(null)] },
    { nome: 'qrcode: Evolution fora do ar', url: '/integracoes/whatsapp/qrcode', respostas: [comConfig({ ...CONFIG, instancia: INSTANCIA_FALHA })] },
    { nome: 'qrcode: perfil de leitura', url: '/integracoes/whatsapp/qrcode', ...como(perfilLeitura) },
    { nome: 'desconectar: ok', metodo: 'POST', url: '/integracoes/whatsapp/desconectar', respostas: [comConfig(CONFIG)] },
    { nome: 'desconectar: sem configuração', metodo: 'POST', url: '/integracoes/whatsapp/desconectar', respostas: [comConfig(null)] },
    { nome: 'desconectar: Evolution fora do ar', metodo: 'POST', url: '/integracoes/whatsapp/desconectar', respostas: [comConfig({ ...CONFIG, instancia: INSTANCIA_FALHA })] },
    { nome: 'desconectar: perfil de leitura', metodo: 'POST', url: '/integracoes/whatsapp/desconectar', ...como(perfilLeitura) },

    // fila e trilha
    { nome: 'fila: situação com integração ativa', url: '/integracoes/whatsapp/fila', respostas: [comConfig(CONFIG)] },
    { nome: 'fila: integração inativa', url: '/integracoes/whatsapp/fila', respostas: [comConfig(null)] },
    { nome: 'fila: sem permissão', url: '/integracoes/whatsapp/fila', ...como(perfilSemAcesso) },
    { nome: 'envios: listar', url: '/integracoes/whatsapp/envios', respostas: [[/FROM tab_whatsapp_envios e LEFT JOIN tab_usuarios u/, envios]] },
    { nome: 'envios: filtros', url: '/integracoes/whatsapp/envios?status=FALHA&tipo=ESCALA_SEMANAL&termo=ana&limite=5', respostas: [[/FROM tab_whatsapp_envios e LEFT JOIN tab_usuarios u/, envios]] },
    { nome: 'envios: limite fora da faixa', url: '/integracoes/whatsapp/envios?limite=9999', respostas: [[/FROM tab_whatsapp_envios e LEFT JOIN tab_usuarios u/, []]] },
    { nome: 'envios: sem permissão', url: '/integracoes/whatsapp/envios', ...como(perfilSemAcesso) },
    { nome: 'reenviar: ok', metodo: 'POST', url: '/integracoes/whatsapp/envios/9/reenviar', ...comGuarda(comConfig(CONFIG)) },
    { nome: 'reenviar: nada a reenviar', metodo: 'POST', url: '/integracoes/whatsapp/envios/9/reenviar', respostas: [[/UPDATE tab_whatsapp_envios SET status = 'PENDENTE'/, []]] },
    { nome: 'reenviar: perfil de leitura', metodo: 'POST', url: '/integracoes/whatsapp/envios/9/reenviar', ...como(perfilLeitura) },

    // ações
    { nome: 'teste: enfileirado', metodo: 'POST', url: '/integracoes/whatsapp/teste', ...comGuarda(comConfig(CONFIG), NOME_USUARIO, DESTINATARIO()) },
    { nome: 'teste: usuário inexistente', metodo: 'POST', url: '/integracoes/whatsapp/teste', respostas: [comConfig(CONFIG), NOME_USUARIO, [/SELECT id_usuario, nome_completo, celular/, []]] },
    { nome: 'teste: usuário inativo', metodo: 'POST', url: '/integracoes/whatsapp/teste', respostas: [comConfig(CONFIG), NOME_USUARIO, DESTINATARIO({ ativo: false })] },
    { nome: 'teste: celular inválido', metodo: 'POST', url: '/integracoes/whatsapp/teste', respostas: [comConfig(CONFIG), NOME_USUARIO, DESTINATARIO({ celular: '123' })] },
    { nome: 'teste: perfil de leitura', metodo: 'POST', url: '/integracoes/whatsapp/teste', ...como(perfilLeitura) },
    { nome: 'escala semanal: enfileirada', metodo: 'POST', url: '/integracoes/whatsapp/escala-semanal/enviar', corpo: { semana: '2026-10-26' }, ...comGuarda(...escalaEnfileirada()) },
    { nome: 'escala semanal: módulo e forçar', metodo: 'POST', url: '/integracoes/whatsapp/escala-semanal/enviar', corpo: { semana: '2026-10-28', modulos: ['PROJETOS', 'INEXISTENTE'], forcar: true }, ...comGuarda(...escalaEnfileirada()) },
    { nome: 'escala semanal: lista de módulos vazia usa todos', metodo: 'POST', url: '/integracoes/whatsapp/escala-semanal/enviar', corpo: { semana: '2026-10-26', modulos: [] }, ...comGuarda(...escalaEnfileirada()) },
    { nome: 'escala semanal: colaborador sem WhatsApp', metodo: 'POST', url: '/integracoes/whatsapp/escala-semanal/enviar', corpo: { semana: '2026-10-26' }, ...comGuarda(...escalaEnfileirada({ celular: '123' })) },
    { nome: 'escala semanal: já enviada', metodo: 'POST', url: '/integracoes/whatsapp/escala-semanal/enviar', corpo: { semana: '2026-10-26' }, respostas: [comConfig(CONFIG), [/SELECT DISTINCT e\.id_usuario FROM/, [{ id_usuario: 7 }]], [/FROM tab_whatsapp_envios WHERE id_usuario = @u AND tipo_evento = 'ESCALA_SEMANAL'/, [{ x: 1 }]], NOME_USUARIO] },
    { nome: 'escala semanal: integração inativa', metodo: 'POST', url: '/integracoes/whatsapp/escala-semanal/enviar', corpo: { semana: '2026-10-26' }, respostas: [comConfig({ ...CONFIG, ativo: false }), NOME_USUARIO] },
    { nome: 'escala semanal: semana inválida', metodo: 'POST', url: '/integracoes/whatsapp/escala-semanal/enviar', corpo: { semana: '26/10/2026' } },
    { nome: 'escala semanal: sem semana', metodo: 'POST', url: '/integracoes/whatsapp/escala-semanal/enviar', corpo: {} },
    { nome: 'escala semanal: perfil de leitura', metodo: 'POST', url: '/integracoes/whatsapp/escala-semanal/enviar', corpo: { semana: '2026-10-26' }, ...como(perfilLeitura) },
    { nome: 'prévia: modelo configurado', metodo: 'POST', url: '/integracoes/whatsapp/previa', corpo: { evento: 'ESCALA_SEMANAL' }, respostas: [comConfig(CONFIG)] },
    { nome: 'prévia: modelo padrão sem configuração', metodo: 'POST', url: '/integracoes/whatsapp/previa', corpo: { evento: 'FERIAS_APROVADA' }, respostas: [comConfig(null)] },
    { nome: 'prévia: texto em edição', metodo: 'POST', url: '/integracoes/whatsapp/previa', corpo: { evento: 'CODIGO_SENHA', texto: 'Seu código: {codigo} por {validade} min' } },
    { nome: 'prévia: perfil de leitura', metodo: 'POST', url: '/integracoes/whatsapp/previa', corpo: { evento: 'ESCALA_ALTERACAO', texto: '  ' }, ...como(perfilLeitura, [comConfig(CONFIG)]) },
    { nome: 'prévia: evento inválido', metodo: 'POST', url: '/integracoes/whatsapp/previa', corpo: { evento: 'NADA' } },
    { nome: 'prévia: sem evento', metodo: 'POST', url: '/integracoes/whatsapp/previa', corpo: {} },
    { nome: 'prévia: sem permissão', metodo: 'POST', url: '/integracoes/whatsapp/previa', corpo: { evento: 'ESCALA_SEMANAL' }, ...como(perfilSemAcesso) }
];

caracterizar('whatsapp', casos);
