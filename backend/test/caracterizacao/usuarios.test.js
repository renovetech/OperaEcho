/* Usuários: cadastro, aprovação de acesso, exclusão, listas e contato. Cada rota continua gerando as mesmas consultas.
 * GET /implantadores e GET /usuarios/:id/lotacoes têm o SQL idêntico ao da consulta de sessão do apoio (que não é
 * registrada); essas duas ficam em usuariosConsultas.test.js. O autocadastro anônimo tem no máximo 5 pedidos por hora. */
const { caracterizar } = require('../apoio/caracterizacao');

const CONSULTA_REGRAS = /FROM tab_regras_acesso WHERE nome_perfil = @p/;
const CONSULTA_LOGIN_EM_USO = /SELECT 1 AS x FROM tab_usuarios WHERE usuario = @u AND id_usuario <> @id/;
const CONSULTA_CPF_MATRICULA = /SELECT id_usuario FROM tab_usuarios WHERE cpf = @cpf OR matricula = @mat/;
const CONSULTA_SETOR = /SELECT nome_setor FROM tab_setores/;
const CONSULTA_FUNCAO = /SELECT nome_funcao FROM tab_funcoes WHERE id_funcao = @idf/;
const CONSULTA_PERFIL_ATUAL = /SELECT perfil_acesso FROM tab_usuarios WHERE id_usuario = @id/;
const CONSULTA_LOTACAO_ATUAL = /SELECT id_lotacao FROM tab_usuarios WHERE id_usuario = @id/;
const CONSULTA_ATIVACAO = /SELECT ativo, data_ativacao FROM tab_usuarios WHERE id_usuario=@id/;
const CONSULTA_INSERCAO = /INSERT INTO tab_usuarios/;
const CONSULTA_PERFIL_EXISTE = /SELECT 1 AS x FROM tab_perfis WHERE nome_perfil = @p/;
const CONSULTA_ALVO = /SELECT id_lotacao, perfil_acesso FROM tab_usuarios WHERE id_usuario = @id/;

const regra = (nomeModulo, extra) => ({ nome_modulo: nomeModulo, pode_acessar: true, pode_novo: true, pode_editar: true, ...extra });
const REGRAS_GESTOR = [CONSULTA_REGRAS, [regra('usuarios'), regra('notificacoes_acesso')]];
const REGRAS_APOIO = [CONSULTA_REGRAS, [regra('usuarios', { pode_editar: false })]];
const REGRAS_VAZIAS = [CONSULTA_REGRAS, []];
const GESTOR = { perfil: 'Gestor', id: 4, respostas: [REGRAS_GESTOR] };

const livres = [[CONSULTA_LOGIN_EM_USO, []], [CONSULTA_CPF_MATRICULA, []], [CONSULTA_SETOR, [{ nome_setor: 'Tecnologia' }]], [CONSULTA_FUNCAO, [{ nome_funcao: 'Analista' }]], [CONSULTA_INSERCAO, [{ id_usuario: 55 }]]];

const novoUsuario = {
    id_usuario: null, nome_completo: 'Maria Souza', cpf: '12345678901', data_nascimento: '1990-05-10', data_admissao: '2026-01-02', sexo: 'F',
    celular: '21987654321', celular_whatsapp: true, email: ' Maria@Exemplo.com ', matricula: 'M100', usuario: 'maria.souza', id_setor: 3, id_funcao: 4, id_lotacao: 2,
    ativo: true, perfil_acesso: 'Analista', produtos: [1, 2], lotacoes: [2, 5], responsavel_acao: 'Admin', senha_hash: 'Eco123'
};
const edicao = { ...novoUsuario, id_usuario: 9, senha_hash: undefined };
const autocadastro = {
    nome_completo: 'João Lima', cpf: '98765432100', data_nascimento: '', data_admissao: '2026-02-01', sexo: '', celular: '21987654321',
    celular_whatsapp: false, email: '', matricula: 'M200', usuario: 'joao.lima', id_setor: 3, id_funcao: 4, id_lotacao: 2,
    senha_hash: 'Eco123', ativo: false, perfil_acesso: 'Solicitante'
};

const salvar = (nome, corpo, opcoes = {}) => ({ nome: `salvar: ${nome}`, metodo: 'POST', url: '/usuarios/salvar', corpo, ...opcoes, respostas: [...(opcoes.respostas || []), ...livres] });
const anonimo = (nome, corpo, respostas) => salvar(`anônimo ${nome}`, corpo, { anonimo: true, respostas });
const perfilAtual = (perfil) => [CONSULTA_PERFIL_ATUAL, [{ perfil_acesso: perfil }]];
const ativacaoAtual = (linha) => [CONSULTA_ATIVACAO, linha ? [linha] : []];

const casosAutocadastro = [
    anonimo('cria solicitação', autocadastro),
    anonimo('não escala perfil nem lotações', { ...autocadastro, perfil_acesso: 'Administrador', ativo: true, senha_hash: 'Outra@123', lotacoes: [1], produtos: [3], matricula: 'M201', usuario: 'joao.dois' }),
    anonimo('campo que não é texto', { ...autocadastro, nome_completo: { a: 1 } }),
    anonimo('sem campos obrigatórios', { ...autocadastro, matricula: '' }),
    anonimo('não edita usuário existente', { ...autocadastro, id_usuario: 9 })
];

const casosSalvarNovo = [
    salvar('novo como administrador', novoUsuario),
    salvar('novo sem lotação nem listas', { ...novoUsuario, id_lotacao: '0', lotacoes: undefined, produtos: [], id_setor: null, id_funcao: '', data_nascimento: '', email: '', ativo: false }),
    salvar('login em formato inválido', { ...novoUsuario, usuario: 'a b' }),
    salvar('campo comprido demais', { ...novoUsuario, sexo: 'x'.repeat(151) }),
    salvar('sem celular', { ...novoUsuario, celular: '' }),
    salvar('celular com código do país', { ...novoUsuario, celular: '+55 (21) 98765-4321', matricula: 'M101', usuario: 'maria.dois' }),
    salvar('e-mail inválido', { ...novoUsuario, email: 'abc' }),
    salvar('senha fraca', { ...novoUsuario, senha_hash: 'fraca' }),
    salvar('senha forte definida pelo gestor', { ...novoUsuario, senha_hash: 'Forte@123', usuario: 'maria.tres' }),
    salvar('login já em uso', novoUsuario, { respostas: [[CONSULTA_LOGIN_EM_USO, [{ x: 1 }]]] }),
    salvar('CPF ou matrícula já cadastrados', novoUsuario, { respostas: [[CONSULTA_CPF_MATRICULA, [{ id_usuario: 3 }]]] }),
    salvar('perfil Administrador por quem não é o admin', { ...novoUsuario, perfil_acesso: 'Administrador' })
];

const casosSalvarEdicao = [
    salvar('edita e ativa quem estava inativo', { ...edicao, senha_hash: 'Nova@1234' }, { respostas: [perfilAtual('Analista'), ativacaoAtual({ ativo: false, data_ativacao: null })] }),
    salvar('edita e inativa quem estava ativo', { ...edicao, ativo: false }, { respostas: [perfilAtual('Analista'), ativacaoAtual({ ativo: true, data_ativacao: '2026-01-01' })] }),
    salvar('edita ativo que já tinha ativação', edicao, { respostas: [perfilAtual('Analista'), ativacaoAtual({ ativo: true, data_ativacao: '2026-01-01' })] }),
    salvar('edita inativo que continua inativo', { ...edicao, ativo: false }, { respostas: [perfilAtual('Analista'), ativacaoAtual({ ativo: false, data_ativacao: null })] }),
    salvar('edita sem registro anterior', edicao, { respostas: [perfilAtual('Analista'), ativacaoAtual(undefined)] }),
    salvar('login antigo fora do formato segue editável', { ...edicao, usuario: 'ab' }, { respostas: [perfilAtual('Analista'), ativacaoAtual({ ativo: true, data_ativacao: '2026-01-01' })] }),
    salvar('não edita um Administrador', edicao, { respostas: [perfilAtual('Administrador')] })
];

const novoNoEscopo = { ...novoUsuario, lotacoes: [2] };
const edicaoNoEscopo = { ...edicao, lotacoes: [2] };

const casosSalvarPermissao = [
    salvar('sem permissão para novo', novoUsuario, { perfil: 'Operador', id: 6, respostas: [REGRAS_VAZIAS] }),
    salvar('perfil com permissão só de novo cria', novoNoEscopo, { perfil: 'Apoio', id: 5, respostas: [REGRAS_APOIO] }),
    salvar('perfil com permissão só de novo não edita', edicaoNoEscopo, { perfil: 'Apoio', id: 5, respostas: [REGRAS_APOIO] }),
    salvar('gestor cria na própria lotação', novoNoEscopo, GESTOR),
    salvar('gestor sem lotação informada', { ...novoUsuario, id_lotacao: null, lotacoes: undefined }, GESTOR),
    salvar('gestor em lotação fora do escopo', { ...novoUsuario, id_lotacao: 9 }, GESTOR),
    salvar('gestor com lotação extra fora do escopo', { ...novoUsuario, lotacoes: [2, 9] }, GESTOR),
    salvar('gestor edita usuário de outra lotação', edicaoNoEscopo, { ...GESTOR, respostas: [REGRAS_GESTOR, [CONSULTA_LOTACAO_ATUAL, [{ id_lotacao: 9 }]]] }),
    salvar('gestor edita usuário da própria lotação', edicaoNoEscopo, { ...GESTOR, respostas: [REGRAS_GESTOR, [CONSULTA_LOTACAO_ATUAL, [{ id_lotacao: 2 }]], perfilAtual('Analista'), ativacaoAtual({ ativo: true, data_ativacao: '2026-01-01' })] })
];

const ativar = (nome, corpo, opcoes = {}) => ({ nome: `ativar: ${nome}`, metodo: 'POST', url: '/usuarios/ativar', corpo, ...opcoes });
const alvo = (linha) => [CONSULTA_ALVO, [linha]];
const perfilExiste = [CONSULTA_PERFIL_EXISTE, [{ x: 1 }]];

const casosAtivar = [
    ativar('sem identificação', { perfil: 'Analista' }),
    ativar('perfil que não é texto', { id_usuario: 9, perfil: 3 }),
    ativar('sem permissão', { id_usuario: 9, perfil: 'Analista' }, { perfil: 'Operador', id: 6, respostas: [REGRAS_VAZIAS] }),
    ativar('perfil Administrador por quem não é o admin', { id_usuario: 9, perfil: 'Administrador' }),
    ativar('perfil inexistente', { id_usuario: 9, perfil: 'Fantasma' }, { respostas: [[CONSULTA_PERFIL_EXISTE, []]] }),
    ativar('usuário não encontrado', { id_usuario: 9, perfil: 'Analista' }, { respostas: [perfilExiste, [CONSULTA_ALVO, []]] }),
    ativar('o próprio acesso', { id_usuario: 1, perfil: 'Analista' }, { respostas: [perfilExiste, alvo({ id_lotacao: 2, perfil_acesso: 'Solicitante' })] }),
    ativar('alterar um Administrador', { id_usuario: 9, perfil: 'Analista' }, { respostas: [perfilExiste, alvo({ id_lotacao: 2, perfil_acesso: 'Administrador' })] }),
    ativar('lotação fora do escopo', { id_usuario: 9, perfil: 'Analista' }, { ...GESTOR, respostas: [REGRAS_GESTOR, perfilExiste, alvo({ id_lotacao: 9, perfil_acesso: 'Solicitante' })] }),
    ativar('gestor aprova na própria lotação', { id_usuario: 9, perfil: 'Analista' }, { ...GESTOR, respostas: [REGRAS_GESTOR, perfilExiste, alvo({ id_lotacao: 2, perfil_acesso: 'Solicitante' })] }),
    ativar('administrador aprova usando id', { id: 9, perfil: 'Analista' }, { respostas: [perfilExiste, alvo({ id_lotacao: 9, perfil_acesso: 'Solicitante' })] })
];

const excluir = (nome, id, opcoes = {}) => ({ nome: `excluir: ${nome}`, metodo: 'DELETE', url: `/usuarios/${id}`, ...opcoes });

const casosExcluir = [
    excluir('sem permissão', 9, { perfil: 'Operador', id: 6, respostas: [REGRAS_VAZIAS] }),
    excluir('id inválido', 'abc'),
    excluir('o próprio usuário', 1),
    excluir('usuário não encontrado', 9, { respostas: [[CONSULTA_ALVO, []]] }),
    excluir('um Administrador', 9, { respostas: [alvo({ id_lotacao: 2, perfil_acesso: 'Administrador' })] }),
    excluir('fora do escopo', 9, { ...GESTOR, respostas: [REGRAS_GESTOR, alvo({ id_lotacao: 9, perfil_acesso: 'Analista' })] }),
    excluir('gestor exclui na própria lotação', 9, { ...GESTOR, respostas: [REGRAS_GESTOR, alvo({ id_lotacao: 2, perfil_acesso: 'Analista' })] }),
    excluir('administrador exclui', 9, { respostas: [alvo({ id_lotacao: 9, perfil_acesso: 'Analista' })] })
];

const usuarioListado = { id_usuario: 3, nome_completo: 'Ana Lima', cpf: '11122233344', senha_hash: 'segredo', nome_setor: 'TI', nome_funcao: 'Analista', id_lotacao: 2 };
const CONSULTA_BUSCA = /SELECT u\.\*, s\.nome_setor, f\.nome_funcao/;
const buscar = (nome, url, opcoes = {}) => ({ ...opcoes, nome: `buscar: ${nome}`, url, respostas: [...(opcoes.respostas || []), [CONSULTA_BUSCA, [usuarioListado]]] });

const casosBuscar = [
    buscar('administrador sem filtro', '/usuarios/buscar'),
    buscar('por termo e id', '/usuarios/buscar?termo=Ana&id=3'),
    buscar('lotação informada pelo administrador', '/usuarios/buscar?id_projeto=9'),
    buscar('lotação Todos', '/usuarios/buscar?lotacao=Todos', { ...GESTOR, respostas: [REGRAS_GESTOR] }),
    buscar('gestor sem filtro fica nas suas lotações', '/usuarios/buscar?termo=a', { ...GESTOR }),
    buscar('gestor em lotação do escopo', '/usuarios/buscar?lotacao=2', { ...GESTOR }),
    buscar('gestor em lotação fora do escopo', '/usuarios/buscar?id_projeto=9', { ...GESTOR })
];

const contato = (extra) => ({ celular: '21987654321', celular_whatsapp: true, email: 'maria@exemplo.com', ...extra });
const CONSULTA_CONTATO = /SELECT celular, celular_whatsapp, email FROM tab_usuarios/;

const casosAuxiliares = [
    { nome: 'produtos: sem o módulo', url: '/usuarios/9/produtos', perfil: 'Visitante', id: 7, respostas: [[/FROM tab_regras_acesso/, []]] },
    { nome: 'produtos: os próprios sem o módulo', url: '/usuarios/7/produtos', perfil: 'Visitante', id: 7, respostas: [[/FROM tab_regras_acesso/, []]] },
    { nome: 'lotações: sem o módulo', url: '/usuarios/9/lotacoes', perfil: 'Visitante', id: 7, respostas: [[/FROM tab_regras_acesso/, []]] },
    { nome: 'produtos do usuário', url: '/usuarios/9/produtos', respostas: [[/FROM tab_usuario_produtos/, [{ id_produto: 1 }, { id_produto: 4 }]]] },
    { nome: 'perfis', url: '/perfis', respostas: [[/FROM tab_perfis/, [{ id_perfil: 1, nome_perfil: 'Analista' }]]] },
    { nome: 'setores sem login', url: '/setores', anonimo: true, respostas: [[/FROM tab_setores/, [{ id_setor: 3, nome_setor: 'Tecnologia' }]]] },
    { nome: 'funções sem login', url: '/funcoes', anonimo: true, respostas: [[/FROM tab_funcoes ORDER/, [{ id_funcao: 4, nome_funcao: 'Analista' }]]] },
    { nome: 'meu contato', url: '/meu-cadastro/contato', respostas: [[CONSULTA_CONTATO, [contato()]]] },
    { nome: 'meu contato sem cadastro', url: '/meu-cadastro/contato', respostas: [[CONSULTA_CONTATO, []]] },
    { nome: 'atualiza meu contato', metodo: 'PUT', url: '/meu-cadastro/contato', corpo: contato({ celular: '(21) 98765-4321', email: ' Maria@Exemplo.com ' }) },
    { nome: 'atualiza meu contato sem e-mail', metodo: 'PUT', url: '/meu-cadastro/contato', corpo: { celular: '5521987654321' } },
    { nome: 'meu contato sem celular', metodo: 'PUT', url: '/meu-cadastro/contato', corpo: contato({ celular: '' }) },
    { nome: 'meu contato com e-mail inválido', metodo: 'PUT', url: '/meu-cadastro/contato', corpo: contato({ email: 'abc' }) },
    { nome: 'meu contato com e-mail comprido demais', metodo: 'PUT', url: '/meu-cadastro/contato', corpo: contato({ email: `${'a'.repeat(95)}@x.com` }) }
];

caracterizar('usuarios', [
    ...casosAutocadastro,
    ...casosSalvarNovo,
    ...casosSalvarEdicao,
    ...casosSalvarPermissao,
    ...casosAtivar,
    ...casosExcluir,
    ...casosBuscar,
    ...casosAuxiliares
]);
