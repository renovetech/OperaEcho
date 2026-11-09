/*
 * Endereço público do painel do projeto: operaecho.com/<slug>.
 * O slug ocupa a raiz do site, então não pode colidir com rotas do SPA,
 * da API ou com pastas estáticas. */
const RESERVADOS = new Set([
    'api', 'app', 'system', 'admin', 'dashboard', 'login', 'logout', 'publico', 'painel', 'painel-plano-acao',
    'indicadoresaps', 'dark', 'download', 'downloads', 'uploads', 'static', 'assets', 'public',
    'app-version', 'rastreio-background', 'recuperar-senha', 'indicadores', 'gerador',
    'projetos', 'produtos', 'unidades', 'usuarios', 'cidades', 'setores', 'funcoes', 'motivos',
    'regras', 'perfis', 'atividades', 'escalas', 'ferias', 'hora-extra', 'relatorios', 'plano-acao',
    'parametros', 'regioes', 'sigtap', 'faturamento','tipos-unidade', 'links-externos', 'favicon.ico', 'manifest.json', 'robots.txt', 'logo192.png', 'logo512.png', 'logo.png'
]);

const FORMATO = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

/** "Projeto Paraíba" -> "paraiba" (remove prefixos Projeto/Cliente e acentos). */
function gerarSlug(nome) {
    return String(nome || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/^\s*(projeto|cliente)\s+/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/g, '');
}

/** Retorna mensagem de erro ou null se o slug é utilizável. */
function validarSlug(slug) {
    if (!slug) return 'Informe o endereço público do painel.';
    if (!FORMATO.test(slug)) return 'Endereço inválido: use letras minúsculas, números e hífen (2 a 60 caracteres).';
    if (slug.length < 2) return 'Endereço muito curto.';
    if (RESERVADOS.has(slug)) return `O endereço "/${slug}" é reservado pelo sistema. Escolha outro.`;
    return null;
}

module.exports = { gerarSlug, validarSlug, FORMATO };
