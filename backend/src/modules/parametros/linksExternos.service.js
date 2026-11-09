/* Regras do endereço de um link externo. */
const { TAMANHO_URL } = require('./linksExternos.repository');

const COM_ESQUEMA = /^[a-z][a-z0-9+.-]*:/i;
const SO_HTTP = /^https?:\/\//i;
const DOMINIO_SIMPLES = /^[^\s<>"']+$/;

/** Só http(s) ou domínio simples - bloqueia javascript:, data:, vbscript: etc. */
const urlValida = (url) => {
    const texto = String(url || '').trim();
    if (!texto || texto.length > TAMANHO_URL) return false;
    if (COM_ESQUEMA.test(texto)) return SO_HTTP.test(texto);
    return DOMINIO_SIMPLES.test(texto);
};

const temProdutoEEndereco = ({ id_produto: idProduto, url }) => Boolean(idProduto && url && typeof url === 'string' && url.trim());

module.exports = { urlValida, temProdutoEEndereco };
