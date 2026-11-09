/* Regras de emissão de cada relatório, conferidas em backend/routes/relatorios.js. */

const LIMITE_PERIODO = 'O período pode ter até 365 dias.';
const ATIVIDADE_NO_PERIODO = 'Atividade de vários dias entra se qualquer dia dela tocar o período filtrado.';
const PRESENCA = 'A presença vem da Escala, não do Registro de Atividades: conta só os dias lançados como trabalho, por projeto e unidade.';
const FILTRO_MOTIVO = 'Com motivo escolhido, ficam só os dias em que a pessoa também tem atividade com esse motivo, no mesmo projeto, unidade e data.';

export const REGRAS_RELATORIOS: Record<string, string> = {
    estatistica_atividades: `Lista as atividades do Registro de Atividades da Implantação, agrupadas por motivo, projeto e unidade.\nO período é obrigatório. ${LIMITE_PERIODO}\n${ATIVIDADE_NO_PERIODO}\nMotivo, projeto e unidade são opcionais. As opções "Mostrar" só escolhem as colunas exibidas.`,
    estatistica_projetos: `Lista as atividades do Registro de Atividades do módulo Projetos, agrupadas por motivo, projeto e unidade.\nO período é obrigatório. ${LIMITE_PERIODO}\n${ATIVIDADE_NO_PERIODO}\nVocê vê apenas os projetos da sua lotação.`,
    tempo_medio_acao: `Compara o tempo previsto com o tempo gasto nas ações dos Planos de Ação, informados em hh:mm na grade do plano.\nO período é obrigatório e considera a data de criação do plano. ${LIMITE_PERIODO}\nEstourado: gastou mais de 10% acima do previsto.\nNo prazo: gastou mais de 10% abaixo do previsto.\nNa média: dentro da tolerância de 10%.\nSem dados: ação sem previsto ou sem gasto preenchido; não entra nas médias.`,
    plano_acao_status: `Situação e execução dos Planos de Ação. As datas são opcionais, mas precisam ser informadas juntas. ${LIMITE_PERIODO}\nExecução: média do % de execução das ações (ação fechada = 100%).\nEsperado: % de ações cujo prazo previsto já venceu.\nDesvio: realizado − esperado, em pontos percentuais.\nAderência: ações fechadas dentro do prazo ÷ ações fechadas que tinham prazo.\nSaúde: CRÍTICO com mais de 20% atrasado, término do plano vencido ou desvio até −25 p.p. ATENÇÃO com atraso, desvio até −10 p.p. ou entregas vencendo em 7 dias. NO PRAZO nos demais casos.`,
    auditoria_localizacao: `Pontos de GPS gravados pelo aplicativo, do mais recente para o mais antigo.\nData inicial e final são obrigatórias. ${LIMITE_PERIODO}\nTipo de registro: cadastro de atividade, hora extra ou segundo plano. Usuário e tipo são opcionais.`,
    presenca_implantador: `${PRESENCA}\nAgrupa por projeto e unidade, listando as datas de cada pessoa.\n${FILTRO_MOTIVO}\n${LIMITE_PERIODO}`,
    presenca_equipe: `${PRESENCA}\nAgrupa por projeto e unidade, listando quem estava presente em cada data.\n${FILTRO_MOTIVO}\n${LIMITE_PERIODO}`,
    projetos_ativos: `Considera só projetos ativos e, neles, as unidades ativas.\nGeorreferenciadas: unidades ativas com coordenada.\nAtividades: soma do registro da Implantação e do módulo Projetos. Sem período preenchido, fica zerada. ${ATIVIDADE_NO_PERIODO}\nAs datas filtram só as atividades, não a lista de projetos. ${LIMITE_PERIODO}`,
    mapa_unidades: 'Mostra cada unidade no mapa pela coordenada do cadastro. É preciso escolher um projeto.\nCoordenada exata: a própria unidade tem latitude e longitude.\nAproximada: sem coordenada, usa o centro do município.\nUnidade sem coordenada e sem município georreferenciado fica fora do mapa e é listada à parte.\nClique em um produto da legenda do mapa para ocultá-lo ou exibi-lo.'
};
