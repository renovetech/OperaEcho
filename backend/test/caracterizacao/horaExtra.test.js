/* Hora Extra: nos dois módulos, cada rota continua gerando as mesmas consultas. Serve de modelo para os demais módulos. */
const { caracterizar } = require('../apoio/caracterizacao');

const dia = { dia: 1, dataObj: '2026-10-01T03:00:00.000Z', entrada: '08:00', saida: '19:00', intervalo: '01:00', isFeriado: false, isFolga: false, isFDS: false, he50: 120, he100: 0, adNoturno: 0, id_unidade: 5, id_projeto: 2 };
const lancamento = { id_lancamento: null, id_usuario: 1, id_projeto: 2, id_unidade: 5, mes_referencia: '2026-10', detalhes_dias: [dia], totais: { he50: 120, he100: 0, adNoturno: 0 } };

const casos = ['', '/projetos'].flatMap((prefixo) => {
    const modulo = prefixo ? 'projetos' : 'implantacao';
    return [
        { nome: `${modulo}: listar como gestão`, url: `${prefixo}/hora-extra/buscar?mes=2026-10&id_projeto=2` },
        { nome: `${modulo}: listar como implantador vê só os seus`, url: `${prefixo}/hora-extra/buscar`, perfil: 'Implantador', id: 7 },
        { nome: `${modulo}: detalhes`, url: `${prefixo}/hora-extra/detalhes/3` },
        { nome: `${modulo}: criar`, metodo: 'POST', url: `${prefixo}/hora-extra/salvar`, corpo: lancamento },
        { nome: `${modulo}: editar`, metodo: 'POST', url: `${prefixo}/hora-extra/salvar`, corpo: { ...lancamento, id_lancamento: 3 } },
        { nome: `${modulo}: lançar para outro sem ser gestão`, metodo: 'POST', url: `${prefixo}/hora-extra/salvar`, corpo: lancamento, perfil: 'Implantador', id: 7 },
        { nome: `${modulo}: corpo inválido`, metodo: 'POST', url: `${prefixo}/hora-extra/salvar`, corpo: { ...lancamento, mes_referencia: '10/2026' } },
        { nome: `${modulo}: excluir`, metodo: 'DELETE', url: `${prefixo}/hora-extra/3` }
    ];
});

caracterizar('horaExtra', casos);
