/* Guia de Indicadores APS 2026. Fontes: Guias de Bolso CONASEMS e Notas Metodológicas do Ministério da Saúde (atualizadas em 02/10/2026).
   Só dados; arquivo grande por natureza (um bloco por indicador). */

export interface Profissional {
    id: string;
    label: string;
    cor: string;
    desc: string;
}

export interface Bloco {
    id: string;
    label: string;
    full: string;
    cor: string;
    desc: string;
}

export interface Pratica {
    letra: string;
    texto: string;
    pontos: number;
}

export interface Codigos {
    cbo?: [string, string][];
    proc?: [string, string][];
    vacina?: [string, string][];
    cid?: string;
    ciap?: string;
}

export interface Indicador {
    cod: string;
    bloco: string;
    titulo: string;
    subtitulo: string;
    objetivo: string;
    formula: { num: string; den: string };
    metas: { regular: string; suficiente: string; bom: string; otimo: string };
    /** Quanto menor, melhor. */
    invertido?: boolean;
    praticas?: Pratica[];
    codigos: Codigos;
    registro: string;
    acoes: Record<string, string[]>;
}

export const PROFISSIONAIS: Profissional[] = [
  { id:"acs",    label:"ACS / TACS",             cor:"#2e7d32", desc:"Agente Comunitário de Saúde" },
  { id:"tec",    label:"Técnico de Enfermagem",  cor:"#1565c0", desc:"Técnico / Auxiliar de Enfermagem" },
  { id:"enf",    label:"Enfermeiro(a)",          cor:"#6a1b9a", desc:"Enfermeiro(a) da Equipe" },
  { id:"med",    label:"Médico(a)",              cor:"#e65100", desc:"Médico(a) de Família e Comunidade" },
  { id:"den",    label:"Cirurgião-Dentista",     cor:"#00838f", desc:"Cirurgião-Dentista / eSB" },
  { id:"tsb",    label:"TSB / ASB",              cor:"#2e7d32", desc:"Técnico/Auxiliar em Saúde Bucal" },
  { id:"emulti", label:"eMulti",                 cor:"#bf360c", desc:"Equipe Multiprofissional" },
];

export const BLOCOS: Bloco[] = [
  { id:"C",  label:"eSF / eAP",   full:"Equipes de Saúde da Família e Atenção Primária", cor:"#1565c0",
    desc:"Equipes de Saúde da Família e de Atenção Primária - atendem a população geral do território adscrito. Indicadores C1 a C7." },
  { id:"R",  label:"eSFR",        full:"Equipe de Saúde da Família Ribeirinha",           cor:"#00838f",
    desc:"Equipe de Saúde da Família Ribeirinha - atua em territórios ribeirinhos, costeiros e marítimos, com parâmetros adaptados à logística fluvial. Indicadores R1 a R6." },
  { id:"M",  label:"eMulti",      full:"Equipe Multiprofissional",                        cor:"#bf360c",
    desc:"Equipe Multiprofissional - apoio especializado e ações compartilhadas com as equipes de referência (matriciamento, PTS). Indicadores M1 e M2." },
  { id:"P",  label:"eAPP",        full:"Equipe de Atenção Primária Prisional",            cor:"#6a1b9a",
    desc:"Equipe de Atenção Primária Prisional - cuidado das pessoas privadas de liberdade no sistema prisional. Indicadores P1 a P6." },
  { id:"CR", label:"eCR",         full:"Equipe de Consultório na Rua",                    cor:"#00695c",
    desc:"Equipe de Consultório na Rua - cuidado da população em situação de rua, com ações itinerantes no território. Indicadores CR1 a CR4." },
  { id:"B",  label:"eSB",         full:"Equipe de Saúde Bucal",                           cor:"#00838f",
    desc:"Equipe de Saúde Bucal - atenção odontológica na APS: primeira consulta, resolutividade, prevenção e procedimentos. Indicadores B1 a B6." },
];

export const INDICADORES: Indicador[] = [
  /* ===================== eSF / eAP  (C1 .. C7) ===================== */
  {
    cod:"C1", bloco:"C", titulo:"Mais Acesso à APS",
    subtitulo:"Equilíbrio entre demanda programada e espontânea",
    objetivo:"Verifica a relação entre atendimentos de demanda programada realizados pelos profissionais da APS e o total de atendimentos realizados.",
    formula:{ num:"Nº de atendimentos por demanda programada (consulta agendada programada; cuidado continuado; consulta agendada).",
              den:"Nº total de atendimentos por todos os tipos de demanda (espontâneas e programadas)." },
    metas:{ regular:"≤10 ou >70", suficiente:">10 e ≤30", bom:">30 e ≤50", otimo:">50 e ≤70" },
    codigos:{
      cbo:[["2251-42","Médico da Estratégia de Saúde da Família"],["2251-70","Médico Generalista"],["2251-30","Médico de Família e Comunidade"],["2251-25","Médico Clínico"],["2252-50","Médico Ginecologista e Obstetra"],["2235-65","Enfermeiro da Estratégia de Saúde da Família"],["2235-05","Enfermeiro"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[], vacina:[]
    },
    registro:"Selecionar corretamente o tipo de atendimento no PEC: 'consulta agendada/programada' ou 'cuidado continuado' contam como demanda programada; 'demanda espontânea' entra apenas no denominador.",
    acoes:{
      acs:["Agendar visitas domiciliares com antecedência e registrá-las como programadas","Identificar famílias que precisam de consulta regular e encaminhar para agendamento","Orientar a comunidade a agendar consultas, não só ir na demanda espontânea","Busca ativa de pacientes que não comparecem às consultas programadas"],
      tec:["Organizar agenda separando consultas programadas das espontâneas","Registrar no PEC o tipo correto de atendimento na triagem","Realizar procedimentos agendados (curativos, vacinas, aferições) dentro dos programados"],
      enf:["Organizar fluxo de agenda buscando manter os programados entre 50% e 70% do total","Realizar consultas de enfermagem programadas para crônicos, gestantes e crianças","Supervisionar o preenchimento correto do tipo de atendimento no PEC","Monitorar mensalmente o percentual de atendimentos programados via SISAB"],
      med:["Programar retornos de pacientes crônicos na própria consulta","Selecionar 'atendimento programado' ao agendar retornos no PEC","Contribuir para manter a proporção de programados na faixa ótima (>50% e ≤70%)"],
    }
  },
  {
    cod:"C2", bloco:"C", titulo:"Cuidado no Desenvolvimento Infantil",
    subtitulo:"Crianças de 0-2 anos - boas práticas pontuadas",
    objetivo:"Avalia o acesso e o monitoramento efetivo das crianças até dois anos, incentivando captação precoce e acompanhamento coordenado e contínuo na APS.",
    formula:{ num:"Somatório das boas práticas pontuadas para cada criança com até 2 anos de vida durante o acompanhamento do desenvolvimento infantil.",
              den:"Nº total de crianças com até 2 anos de vida vinculadas à equipe no período." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"1ª consulta presencial por médica(o) ou enfermeira(o) até o 30º dia de vida.", pontos:20 },
      { letra:"B", texto:"Pelo menos 9 consultas presenciais ou remotas por médica(o) ou enfermeira(o) até os 2 anos.", pontos:20 },
      { letra:"C", texto:"Pelo menos 9 registros simultâneos de peso e altura até os 2 anos.", pontos:20 },
      { letra:"D", texto:"Pelo menos 2 visitas domiciliares por ACS/TACS: a 1ª até 30 dias e a 2ª até os 6 meses de vida.", pontos:20 },
      { letra:"E", texto:"Vacinas registradas com todas as doses recomendadas (difteria, tétano, coqueluche, hepatite B, Hib, poliomielite, tríplice viral e pneumocócica).", pontos:20 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros"],["2231/2251/2252/2253","Médicos"],["2232","Cirurgiões-dentistas"],["2234","Farmacêuticos"],["2236","Fisioterapeutas"],["2238","Fonoaudiólogos"],["2237","Nutricionistas"],["2241","Profissionais de Educação Física"],["3222","Técnico/auxiliar de enfermagem"],["2239","Terapeutas ocupacionais e afins"],["5151-05","Agente Comunitário de Saúde"],["3222-55","Técnico em ACS"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["01.01.04.002-4","Avaliação antropométrica"],["01.01.04.008-3","Medição de peso"],["01.01.04.007-5","Medição de altura"],["03.01.01.026-9","Avaliação do crescimento na puericultura"],["03.01.01.027-7","Avaliação do desenvolvimento na puericultura"],["03.01.01.025-0","Teleconsulta na atenção primária"]],
      vacina:[["09","Hepatite B (HepB)"],["17","Haemophilus influenzae b (Hib)"],["29","Penta acelular (DTPa/VIP/Hib)"],["39","Tetra (DTP/Hib)"],["42","Penta (DTP/HepB/Hib)"],["43","Hexa (DTPa/HepB/VIP/Hib)"],["46","DTP"],["47","DTPa infantil"],["58","Tetra acelular (DTPa/VIP)"],["22","Pólio injetável (VIP)"],["24","SCR (sarampo, caxumba, rubéola)"],["56","SCRV (+ varicela)"],["26","Pneumo 10 (VPC10)"],["59","Pneumo 13 (VPC13)"],["106","Pneumocócica 15-valente (VPC15)"],["107","Pneumo 20 (VPC20)"]]
    },
    registro:"Puericultura no PEC com antropometria, vacinas e desenvolvimento preenchidos. Cada boa prática (A-E) é pontuada separadamente e vale 20 pontos. Selecionar o Problema/Condição Avaliada 'Puericultura' no atendimento. Vale o registro da vacina ou a transcrição, com todas as doses recomendadas.",
    acoes:{
      acs:["Visitar TODAS as crianças 0-2 anos da microárea - a 1ª visita até 30 dias e a 2ª até 6 meses","Registrar as visitas no e-SUS com público-alvo 'Criança' e data correta","Verificar a caderneta de vacinação e alertar sobre doses em atraso","Monitorar peso/crescimento e reportar casos de desnutrição à equipe","Busca ativa de crianças que não comparecem às consultas"],
      tec:["Pesar, medir e registrar no PEC a cada consulta (contribui para os 9 registros)","Aplicar as vacinas do calendário infantil e registrar no e-SUS e na caderneta","Manter o calendário vacinal de 0-2 anos atualizado"],
      enf:["Realizar a 1ª consulta até 30 dias e as consultas de puericultura (mínimo 9 até 2 anos)","Avaliar o desenvolvimento neuropsicomotor e registrar no PEC","Solicitar exames de triagem neonatal quando necessário","Supervisionar o preenchimento da puericultura pela equipe","Programar retornos e organizar a agenda de puericultura"],
      med:["Realizar a 1ª consulta até 30 dias e consultas de puericultura registrando o desenvolvimento","Avaliar curva de crescimento e marcos e encaminhar quando necessário","Solicitar triagem neonatal e acompanhar resultados"],
    }
  },
  {
    cod:"C3", bloco:"C", titulo:"Cuidado na Gestação e Puerpério",
    subtitulo:"Pré-natal e puerpério - redução da morbimortalidade",
    objetivo:"Avalia o acesso e o monitoramento efetivo durante a gestação e o puerpério, com captação precoce e acompanhamento coordenado e contínuo na APS.",
    formula:{ num:"Somatório das boas práticas pontuadas para a pessoa gestante e puérpera, durante cada gestação.",
              den:"Nº total de gestantes e puérperas vinculadas à equipe no período." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"1ª consulta (presencial ou remota) por médica(o)/enfermeira(o) até a 12ª semana de gestação.", pontos:10 },
      { letra:"B", texto:"Pelo menos 7 consultas de pré-natal presenciais ou remotas durante a gestação.", pontos:9 },
      { letra:"C", texto:"Pelo menos 7 registros de aferição de pressão arterial durante a gestação.", pontos:9 },
      { letra:"D", texto:"Pelo menos 7 registros simultâneos de peso e altura durante a gestação.", pontos:9 },
      { letra:"E", texto:"Pelo menos 3 visitas domiciliares por ACS/TACS após a 1ª consulta de pré-natal.", pontos:9 },
      { letra:"F", texto:"Vacina dTpa registrada a partir da 20ª semana de cada gestação.", pontos:9 },
      { letra:"G", texto:"Testes rápidos/exames para sífilis, HIV e hepatites B e C no 1º trimestre.", pontos:9 },
      { letra:"H", texto:"Testes rápidos/exames para sífilis e HIV no 3º trimestre.", pontos:9 },
      { letra:"I", texto:"Pelo menos 1 consulta de puerpério (presencial ou remota) por médica(o)/enfermeira(o).", pontos:9 },
      { letra:"J", texto:"Pelo menos 1 visita domiciliar por ACS/TACS durante o puerpério.", pontos:9 },
      { letra:"K", texto:"Pelo menos 1 atividade em saúde bucal por dentista/TSB durante a gestação.", pontos:9 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros"],["2231/2251/2252/2253","Médicos"],["2232","Cirurgiões-dentistas"],["2234","Farmacêuticos"],["2236","Fisioterapeutas"],["2238","Fonoaudiólogos"],["2237","Nutricionistas"],["2241","Profissionais de Educação Física"],["3222","Técnico/auxiliar de enfermagem"],["2239","Terapeutas ocupacionais e afins"],["5151-05","Agente Comunitário de Saúde"],["3222-55","Técnico em ACS"],["3224","Técnico em Saúde Bucal (TSB)"]],
      cid:"Gestação: O10-O16, O20-O36, O40, O41, O43, O44, O46-O48, O75.2, O75.3, O98, O99.0-O99.7, Z32.1, Z33, Z34, Z35, Z36, Z64.0. Puerpério: F53(.0-.9), M83.0, O10, O15.2, O26.6, O72.2, O72.3, O85-O87, O90-O92, O94, O98, O99, Z37, Z38, Z39. Exclusão: O02, O02.1, O03-O06, Z30.3.",
      ciap:"Gestação: W03, W78, W79, W81, W84, W85. Puerpério: 48, 49, P29, W18, W19, W70, W90-W96. Exclusão: W82, W83.",
      proc:[["01.01.04.002-4","Avaliação antropométrica"],["01.01.04.008-3","Medição de peso"],["01.01.04.007-5","Medição de altura"],["03.01.10.003-9","Aferição da pressão arterial"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.011-0","Consulta pré-natal"],["03.01.01.012-9","Consulta puerperal"],["03.01.01.013-7","Consulta/atendimento domiciliar"],["03.01.01.025-0","Teleconsulta na atenção primária"],["02.14.01.004-0","Teste rápido HIV (gestante ou parceiro)"],["02.14.01.007-4","Teste rápido para sífilis"],["02.14.01.009-0","Teste rápido hepatite C"],["02.14.01.010-4","Teste rápido HBV"],["02.02.03.109-8","Teste treponêmico p/ sífilis"],["02.14.01.027-9","teste rápido para detecção de anticorpos anti-HIV em gestante"],["02.14.01.005-8","Teste rápido para detecção de anticorpos anti-HIV para população geral (exceto gestante, parceiro ou parceria)"],["02.14.01.008-2","Teste rápido para sífilis na gestante ou pai/parceiro"],["02.14.01.025-2","Teste rápido treponêmico (sífilis) em gestante"],["02.14.01.030-9","Teste rápido para detecção de anticorpos contra o vírus da hepatite C em gestante"],["02.14.01.023-6","Teste rápido para detecção do antígeno de superfície do vírus da hepatite B - HBV (HBSAG) em gestante"],["02.13.01.078-0","Detecção rápida da carga viral do HIV"],["02.13.01.050-0","Quantificação da carga viral do HIV (RNA)"],["02.02.03.111-0","Teste não treponêmico para detecção de sífilis"],["02.02.03.117-9","Teste não treponêmico para detecção de sífilis em gestante"],["02.02.03.078-4","Pesquisa de anticorpos IgG e IgM contra o antígeno central do vírus da hepatite B (anti-HBC total)"],["02.02.03.097-0","Pesquisa de antígeno de superfície do vírus da hepatite B (HBsAG)"],["02.13.01.020-8","Identificação do vírus da hepatite B por PCR (quantitativo)"],["02.02.03.005-9","Detecção de RNA do vírus da hepatite C (qualitativo)"],["02.02.03.067-9","Pesquisa de anticorpos contra o vírus da hepatite C (anti-HCV)"],["02.02.03.030-0","Pesquisa de Anticorpos Anti-Hiv-1 + Hiv-2 (Elisa)"],["02.02.03.031-8","Pesquisa de Anticorpos Anti-Htlv-1 + Htlv-2 i) Esquema de dose:"]],
      vacina:[["57","dTpa adulto"]]
    },
    registro:"Cadastrar a gestação assim que confirmada. Registrar pré-natal e puerpério com todos os campos obrigatórios; cada boa prática (A-K) pontua de forma independente. Preencher o campo 'Data de desfecho da gestação'.",
    acoes:{
      acs:["Identificar e cadastrar gestantes assim que confirmada a gravidez","Realizar visita domiciliar mensal na gestação (mínimo 3 após 1ª consulta) e ≥1 no puerpério","Monitorar comparecimento às consultas e acionar busca ativa em faltas","Verificar consulta odontológica e vacinas (dTpa, influenza) e orientar agendamento"],
      tec:["Aferir PA, peso e altura e registrar no PEC em todas as consultas","Aplicar dTpa (a partir da 20ª semana) e influenza e registrar","Auxiliar na coleta dos testes rápidos e exames do pré-natal","Agendar e confirmar retornos de pré-natal e puerpério"],
      enf:["Realizar 1ª consulta até 12ª semana e no mínimo 7 consultas de pré-natal","Solicitar/avaliar testes de sífilis, HIV e hepatites no 1º e 3º trimestres","Realizar consulta de puerpério (presencial ou remota) e registrar","Encaminhar para avaliação odontológica durante a gestação","Cadastrar a gestação no sistema assim que identificada"],
      med:["Realizar consultas de pré-natal preenchendo todos os campos obrigatórios","Solicitar e avaliar exames do 1º e 3º trimestre","Realizar consulta de puerpério e registrar","Encaminhar gestantes de risco ao pré-natal de alto risco"],
      den:["Realizar ≥1 atividade em saúde bucal na gestação - pontua no C3","Priorizar o agendamento de gestantes encaminhadas pela equipe","Registrar a atividade de saúde bucal da gestante no SISAB"],
    }
  },
  {
    cod:"C4", bloco:"C", titulo:"Cuidado da Pessoa com Diabetes",
    subtitulo:"Acompanhamento longitudinal - boas práticas acumuladas",
    objetivo:"Avalia o acesso e o monitoramento efetivo do cuidado integral à saúde das pessoas com diabetes, com incentivo à captação precoce e acompanhamento coordenado e contínuo na APS.",
    formula:{ num:"Somatório das boas práticas pontuadas para a pessoa com diabetes no período.",
              den:"Nº total de pessoas com diabetes vinculadas à equipe no período." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 1 consulta (presencial ou remota) por médica(o)/enfermeira(o) nos últimos 6 meses.", pontos:20 },
      { letra:"B", texto:"Pelo menos 1 registro de aferição de pressão arterial nos últimos 6 meses.", pontos:15 },
      { letra:"C", texto:"Pelo menos 1 registro simultâneo de peso e altura nos últimos 12 meses.", pontos:15 },
      { letra:"D", texto:"Pelo menos 2 visitas domiciliares por ACS/TACS (intervalo mínimo 30 dias) nos últimos 12 meses.", pontos:20 },
      { letra:"E", texto:"Pelo menos 1 solicitação/avaliação de hemoglobina glicada nos últimos 12 meses.", pontos:15 },
      { letra:"F", texto:"Pelo menos 1 avaliação dos pés nos últimos 12 meses.", pontos:15 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros"],["2231/2251/2252/2253","Médicos"],["2232","Cirurgiões-dentistas"],["2234","Farmacêuticos"],["2236","Fisioterapeutas"],["2238","Fonoaudiólogos"],["2237","Nutricionistas"],["2241","Profissionais de Educação Física"],["3222","Técnico/auxiliar de enfermagem"],["2239","Terapeutas ocupacionais e afins"],["5151-05","Agente Comunitário de Saúde"],["3222-55","Técnico em ACS"],["3224","Técnicos em Saúde Bucal"]],
      cid:"E10; E11; E14.",
      ciap:"T89; T90.",
      proc:[["01.01.04.002-4","Avaliação antropométrica"],["01.01.04.008-3","Medição de peso"],["01.01.04.007-5","Medição de altura"],["03.01.10.003-9","Aferição da pressão arterial"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.025-0","Teleconsulta na atenção primária"],["03.01.04.009-5","Exame do pé diabético"],["02.02.01.050-3","Dosagem de hemoglobina glicosilada"],["ABEX008","Hemoglobina glicosilada (registro de avaliação)"]],
      vacina:[]
    },
    registro:"Cada boa prática é registrada independentemente: consulta, aferição de PA, visita ACS, HbA1c, avaliação dos pés, peso/altura. Marcar a condição 'Diabetes' no atendimento. Na visita do ACS/TACS, todas as opções do campo 'Desfecho' são consideradas.",
    acoes:{
      acs:["Visitar TODOS os diabéticos - mínimo 2x com intervalo ≥30 dias a cada 12 meses","Registrar visitas no e-SUS com condição 'Diabetes' identificada","Verificar adesão à medicação e orientar sobre riscos do abandono","Encaminhar pacientes sem consulta há mais de 6 meses"],
      tec:["Aferir PA e registrar no PEC em todo atendimento de diabético","Pesar e medir e registrar (mínimo 1x/ano)","Realizar glicemia capilar quando solicitado e registrar","Coletar exames (incluindo HbA1c) e garantir o registro da solicitação"],
      enf:["Realizar consulta de enfermagem a cada 6 meses","Realizar e registrar a avaliação dos pés (inspeção, pulso, sensibilidade)","Solicitar HbA1c e demais exames conforme protocolo","Coordenar grupo de diabetes e acionar ACS para busca ativa"],
      med:["Consultar diabéticos com intervalo máximo de 6 meses e registrar","Solicitar HbA1c e registrar a avaliação do resultado","Realizar e documentar a avaliação dos pés","Ajustar tratamento conforme metas glicêmicas"],
    }
  },
  {
    cod:"C5", bloco:"C", titulo:"Cuidado da Pessoa com Hipertensão",
    subtitulo:"Acompanhamento longitudinal de hipertensos",
    objetivo:"Avalia o acesso e o monitoramento efetivo do cuidado integral à saúde das pessoas com hipertensão, com incentivo à captação precoce e acompanhamento coordenado e contínuo na APS.",
    formula:{ num:"Somatório das boas práticas pontuadas para a pessoa com hipertensão no período.",
              den:"Nº total de pessoas com hipertensão vinculadas à equipe no período." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 1 consulta (presencial ou remota) por médica(o)/enfermeira(o) nos últimos 6 meses.", pontos:25 },
      { letra:"B", texto:"Pelo menos 1 registro de aferição de pressão arterial nos últimos 6 meses.", pontos:25 },
      { letra:"C", texto:"Pelo menos 1 registro simultâneo de peso e altura nos últimos 12 meses.", pontos:25 },
      { letra:"D", texto:"Pelo menos 2 visitas domiciliares por ACS/TACS (intervalo mínimo 30 dias) nos últimos 12 meses.", pontos:25 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros"],["2231/2251/2252/2253","Médicos"],["2232","Cirurgiões-dentistas"],["2234","Farmacêuticos"],["2236","Fisioterapeutas"],["2238","Fonoaudiólogos"],["2237","Nutricionistas"],["2241","Profissionais de Educação Física"],["3222","Técnico/auxiliar de enfermagem"],["2239","Terapeutas ocupacionais e afins"],["5151-05","Agente Comunitário de Saúde"],["3222-55","Técnico em ACS"],["3224","Técnicos em Saúde Bucal"]],
      cid:"I10; I11(.0/.9); I12(.0/.9); I13(.0/.1/.2/.9); I15(.0/.1/.2/.8/.9); O10(.0-.4/.9); O11.",
      ciap:"K86; K87.",
      proc:[["01.01.04.002-4","Avaliação antropométrica"],["01.01.04.008-3","Medição de peso"],["01.01.04.007-5","Medição de altura"],["03.01.10.003-9","Aferição da pressão arterial"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.025-0","Teleconsulta na atenção primária"]],
      vacina:[]
    },
    registro:"A aferição de PA deve ser registrada no PEC - ela pontua mesmo sem consulta formal. Marcar a condição 'Hipertensão' no atendimento.",
    acoes:{
      acs:["Visitar TODOS os hipertensos - mínimo 2x com intervalo ≥30 dias a cada 12 meses","Registrar visitas no e-SUS com condição 'Hipertensão' marcada","Verificar adesão à medicação e orientar sobre riscos do abandono","Identificar pacientes sem consulta há mais de 6 meses e mobilizar"],
      tec:["Aferir PA em todo atendimento de hipertenso e registrar no PEC","Registrar a aferição com data correta - pontua mesmo sem consulta formal","Garantir que o registro de PA esteja vinculado ao paciente correto"],
      enf:["Realizar consulta de enfermagem a cada 6 meses","Organizar grupo de hipertensão com aferição coletiva de PA","Monitorar a lista de hipertensos e identificar os sem atendimento recente","Solicitar exames laboratoriais conforme protocolo e registrar"],
      med:["Consultar hipertensos com intervalo máximo de 6 meses","Avaliar controle pressórico e ajustar tratamento","Solicitar exames de rastreio cardiovascular e registrar o risco"],
    }
  },
  {
    cod:"C6", bloco:"C", titulo:"Cuidado da Pessoa Idosa",
    subtitulo:"≥60 anos - avaliação e continuidade do cuidado",
    objetivo:"Avalia o acesso e o acompanhamento efetivo das pessoas idosas em relação aos episódios de cuidado necessários, com captação precoce e acompanhamento contínuo.",
    formula:{ num:"Somatório das boas práticas pontuadas para cada pessoa idosa (60 anos ou mais) durante o acompanhamento.",
              den:"Nº total de pessoas idosas (60+ anos) vinculadas à equipe no período." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 1 consulta (presencial ou remota) por médica(o)/enfermeira(o) nos últimos 12 meses.", pontos:25 },
      { letra:"B", texto:"Pelo menos 1 registro simultâneo (no mesmo dia) de peso e altura nos últimos 12 meses.", pontos:25 },
      { letra:"C", texto:"Pelo menos 2 visitas domiciliares por ACS/TACS (intervalo mínimo 30 dias) nos últimos 12 meses.", pontos:25 },
      { letra:"D", texto:"Registro de 1 dose da vacina contra influenza nos últimos 12 meses.", pontos:25 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros e afins"],["2231/2251/2252/2253","Médicos"],["2232","Cirurgiões-dentistas"],["2234","Farmacêuticos"],["2236","Fisioterapeutas"],["2238","Fonoaudiólogos"],["2237","Nutricionistas"],["2241","Profissionais de Educação Física"],["3222","Técnicos/auxiliares de enfermagem"],["2239-05","Terapeutas ocupacionais"],["5151-05","Agente Comunitário de Saúde"],["3222-55","Técnico em ACS"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["01.01.04.002-4","Avaliação antropométrica"],["01.01.04.008-3","Medição de peso"],["01.01.04.007-5","Medição de altura"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.025-0","Teleconsulta na atenção primária"]],
      vacina:[["33","Influenza trivalente"],["77","Influenza tetravalente"]]
    },
    registro:"Registrar a consulta e o peso/altura no mesmo dia. Vincular a vacina de influenza ao idoso no sistema.",
    acoes:{
      acs:["Visitar TODOS os idosos (≥60 anos) regularmente e registrar no e-SUS","Verificar moradia, isolamento social e necessidade de cuidador","Alertar a equipe sobre idosos acamados para visita domiciliar médica","Verificar situação vacinal (influenza) e acionar para campanha","Identificar sinais de violência/negligência e notificar ao enfermeiro"],
      tec:["Aplicar vacina de influenza em idosos e registrar no PEC","Realizar aferições (PA, peso, altura) e registrar","Apoiar na coleta de exames e no preparo das consultas"],
      enf:["Realizar consulta de enfermagem para idosos anualmente","Aplicar/registrar instrumentos de avaliação multidimensional","Identificar idosos frágeis e planejar cuidado com médico e eMulti","Coordenar grupo de idosos na UBS"],
      med:["Consulta médica de idosos ao menos 1x/ano e registrar no PEC","Avaliar polifarmácia, risco de queda, cognição e funcionalidade","Registrar avaliação multidimensional no prontuário","Realizar visita domiciliar a idosos impossibilitados de ir à UBS"],
    }
  },
  {
    cod:"C7", bloco:"C", titulo:"Cuidado da Mulher na Prevenção do Câncer",
    subtitulo:"Mulheres e homens trans - rastreamento e prevenção",
    objetivo:"Avalia o acesso e o monitoramento efetivo das mulheres e dos homens transgênero em relação aos cuidados de prevenção do câncer de colo do útero e de mama.",
    formula:{ num:"Somatório da boa prática para cada mulher/homem transgênero na faixa etária avaliada.",
              den:"Nº total de mulheres/homens transgênero na faixa etária avaliada e vinculados à equipe no período." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"≥1 exame de rastreamento do câncer de colo do útero (25-64 anos) nos últimos 36 meses (60 meses para exame molecular de HPV).", pontos:20 },
      { letra:"B", texto:"≥1 dose da vacina HPV para meninas de 9-14 anos.", pontos:30 },
      { letra:"C", texto:"≥1 atendimento (presencial ou remoto) sobre saúde sexual e reprodutiva, de 14 a 69 anos, nos últimos 12 meses.", pontos:30 },
      { letra:"D", texto:"≥1 exame de rastreamento do câncer de mama (50-69 anos) solicitado/avaliado nos últimos 24 meses.", pontos:20 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros"],["2231/2251/2252/2253","Médicos"],["2516-05","Assistente Social"],["2234-45","Farmacêutico Hospitalar e Clínico"],["2236-05","Fisioterapeuta"],["2238-10","Fonoaudiólogo(a)"],["2237-10","Nutricionista"],["2515-10","Psicólogo(a)"],["2239-05","Terapeuta Ocupacional"],["3222","Técnico/auxiliar de enfermagem"]],
      cid:"N80-N98 (afecções do trato genital feminino), O03, O04, R10.2, T74.2, Y05, Z12.3, Z12.4, Z20.5, Z20.6, Z30-Z32, Z64.0, Z70, Z71.7, Z72.5 e correlatos.",
      ciap:"B25; W02; W10-W15; W79; W82; X01-X13; X23; X24; X82; X89; Y14.",
      proc:[["02.04.03.003-0","Mamografia"],["02.04.03.018-8","Mamografia bilateral p/ rastreamento"],["02.01.02.003-3","Coleta de citopatológico de colo uterino"],["02.03.01.008-6","Exame citopatológico cérvico-vaginal (rastreamento)"],["02.03.01.001-9","Exame citopatológico cérvico-vaginal/microflora"],["02.01.02.007-6","Coleta de material p/ exame molecular de HPV"],["02.01.02.008-4","Entrega de material (autocoleta) p/ HPV"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.025-0","Teleconsulta na atenção primária"],["02.02.10.025-1","Exame molecular de detecção de HPV"]],
      vacina:[["67","HPV quadrivalente"],["93","HPV nonavalente"]]
    },
    registro:"Vacina HPV registrada no e-SUS. Citopatológico e mamografia registrados com os procedimentos corretos. Atendimento de saúde sexual/reprodutiva registrado no PEC. O exame molecular de HPV (02.02.10.025-1) passou a contar a partir da competência janeiro/2026, com janela de 60 meses.",
    acoes:{
      acs:["Identificar meninas de 9-14 anos e verificar a vacina HPV","Orientar responsáveis sobre HPV e encaminhar à UBS","Verificar mulheres de 25-64 anos com Papanicolau atrasado","Orientar mulheres de 50-69 anos sobre mamografia e encaminhar","Busca ativa de mulheres sem rastreamento nos prazos"],
      tec:["Aplicar vacina HPV em meninas de 9-14 anos e registrar no PEC","Auxiliar na coleta de citopatológico dentro das competências","Organizar a agenda de coleta com o enfermeiro"],
      enf:["Realizar coleta de citopatológico em mulheres de 25-64 anos","Solicitar mamografia para mulheres de 50-69 anos","Realizar atendimento de saúde sexual/reprodutiva (14-69 anos) e registrar","Monitorar a lista de mulheres com exames atrasados"],
      med:["Solicitar mamografia (50-69 anos) e registrar no PEC","Avaliar Papanicolau alterado e encaminhar quando necessário","Realizar atendimento de saúde da mulher e registrar"],
    }
  },

  /* ===================== eSFR  (R1 .. R6) ===================== */
  {
    cod:"R1", bloco:"R", titulo:"Mais Acesso à eSFR",
    subtitulo:"Demanda programada em territórios ribeirinhos",
    objetivo:"Verifica o percentual de atendimentos de demanda programada em relação ao total na Equipe de Saúde da Família Ribeirinha, permitindo analisar variações geográficas e temporais na oferta programada.",
    formula:{ num:"Nº total de atendimentos na eSFR por demanda programada (consulta agendada programada; cuidado continuado; consulta agendada).",
              den:"Nº total de atendimentos na eSFR por todos os tipos de demanda (espontâneas e programadas)." },
    metas:{ regular:"≤10 ou >70", suficiente:">10 e ≤30", bom:">30 e ≤50", otimo:">50 e ≤70" },
    codigos:{
      cbo:[["2251-42","Médica(o) da Estratégia de Saúde da Família"],["2251-70","Médica(o) Generalista"],["2251-30","Médica(o) de Família e Comunidade"],["2235-65","Enfermeira(o) da Estratégia de Saúde da Família"],["2235-05","Enfermeira(o)"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[], vacina:[]
    },
    registro:"Selecionar o tipo de atendimento correto no PEC (programado x espontâneo). Não há boas práticas específicas neste indicador.",
    acoes:{
      acs:["Programar visitas e atendimentos com antecedência considerando a logística fluvial/ribeirinha","Registrar as ações como programadas quando aplicável","Organizar a captação da comunidade em roteiros de deslocamento planejados"],
      enf:["Organizar a agenda buscando manter a faixa ótima (>50% e ≤70%) de programados","Realizar consultas de enfermagem programadas nos roteiros da eSFR","Monitorar o percentual de programados considerando sazonalidade do território"],
      med:["Programar retornos considerando o próximo roteiro da equipe","Selecionar 'atendimento programado' no PEC ao agendar"],
    }
  },
  {
    cod:"R2", bloco:"R", titulo:"Desenvolvimento Infantil (eSFR)",
    subtitulo:"Crianças de 0-2 anos em territórios ribeirinhos",
    objetivo:"Avalia o acesso e o acompanhamento efetivo das crianças até 2 anos, com captação precoce e continuidade em territórios ribeirinhos, costeiros e marítimos.",
    formula:{ num:"Somatório das boas práticas pontuadas para cada criança com até 2 anos durante o acompanhamento do desenvolvimento infantil.",
              den:"Nº total de crianças com até 2 anos cadastradas na equipe no período." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 6 consultas presenciais ou remotas por médica(o)/enfermeira(o) até os 2 anos.", pontos:25 },
      { letra:"B", texto:"Pelo menos 6 registros simultâneos de peso e altura até os 2 anos.", pontos:25 },
      { letra:"C", texto:"Pelo menos 6 visitas domiciliares por ACS/TACS: a 1ª até 30 dias e a 2ª até os 6 meses.", pontos:25 },
      { letra:"D", texto:"Vacinas registradas com todas as doses recomendadas (difteria, tétano, coqueluche, hepatite B, Hib, poliomielite, tríplice viral e pneumocócica).", pontos:25 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros"],["2231/2251/2252/2253","Médicos"],["2232","Cirurgiãs(ões)-dentistas"],["2234","Farmacêuticas(os)"],["2236","Fisioterapeutas"],["2238","Fonoaudiólogas(os)"],["2237","Nutricionistas"],["2241","Profissionais de Educação Física"],["3222","Técnica(o)/auxiliar de enfermagem"],["2239","Terapeutas ocupacionais e afins"],["5151-05","Agente Comunitário de Saúde"],["3222-55","Técnica(o) em ACS"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["01.01.04.002-4","Avaliação antropométrica"],["01.01.04.008-3","Medição de peso"],["01.01.04.007-5","Medição de altura"],["03.01.01.026-9","Avaliação do crescimento na puericultura"],["03.01.01.027-7","Avaliação do desenvolvimento na puericultura"],["03.01.01.025-0","Teleconsulta na atenção primária"]],
      vacina:[["09","Hepatite B (HepB)"],["17","Haemophilus influenzae b (Hib)"],["29","Penta acelular (DTPa/VIP/Hib)"],["39","Tetra (DTP/Hib)"],["42","Penta (DTP/HepB/Hib)"],["43","Hexa (DTPa/HepB/VIP/Hib)"],["46","DTP"],["47","DTPa infantil"],["58","Tetra acelular (DTPa/VIP)"],["22","Pólio injetável (VIP)"],["24","SCR"],["56","SCRV"],["26","Pneumo 10"],["59","Pneumo 13"],["106","Pneumocócica 15-valente"],["107","Pneumo 20"]]
    },
    registro:"Parâmetros adaptados à realidade ribeirinha (6 consultas/registros/visitas). Cada boa prática (A-D) vale 25 pontos.",
    acoes:{
      acs:["Visitar as crianças 0-2 anos considerando a logística do território (mínimo 6 visitas, 1ª até 30 dias, 2ª até 6 meses)","Registrar as visitas no e-SUS com público 'Criança'","Verificar caderneta de vacinação e alertar sobre atrasos"],
      enf:["Realizar consultas de puericultura (mínimo 6 até 2 anos) e registrar","Avaliar desenvolvimento e crescimento e registrar no PEC","Organizar agenda de puericultura conforme roteiros da eSFR"],
      med:["Realizar consultas de puericultura registrando o desenvolvimento","Avaliar curva de crescimento e encaminhar quando necessário"],
    }
  },
  {
    cod:"R3", bloco:"R", titulo:"Gestação e Puerpério (eSFR)",
    subtitulo:"Pré-natal e puerpério em territórios ribeirinhos",
    objetivo:"Avalia o acesso e o monitoramento efetivo na gestação e no puerpério em territórios ribeirinhos, costeiros e marítimos, assegurando cuidado longitudinal.",
    formula:{ num:"Somatório das boas práticas pontuadas para pessoas em processo gestacional e puerperal, durante cada gestação.",
              den:"Nº total de pessoas em processo gestacional e puerperal cadastradas na equipe no período." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 5 consultas de pré-natal presenciais ou remotas durante a gestação.", pontos:15 },
      { letra:"B", texto:"Pelo menos 5 registros de aferição de pressão arterial durante a gestação.", pontos:10 },
      { letra:"C", texto:"Pelo menos 5 registros simultâneos de peso e altura durante a gestação.", pontos:10 },
      { letra:"D", texto:"Pelo menos 3 visitas domiciliares por ACS/TACS (intervalo mínimo 30 dias) após a 1ª consulta.", pontos:10 },
      { letra:"E", texto:"Testes rápidos/exames para sífilis, HIV e hepatites B e C no 1º trimestre.", pontos:10 },
      { letra:"F", texto:"Testes rápidos/exames para sífilis e HIV no 3º trimestre.", pontos:10 },
      { letra:"G", texto:"Pelo menos 1 consulta de puerpério (presencial ou remota) por médica(o)/enfermeira(o).", pontos:10 },
      { letra:"H", texto:"Pelo menos 1 visita domiciliar por ACS/TACS durante o puerpério.", pontos:10 },
      { letra:"I", texto:"Pelo menos 1 atividade em saúde bucal por dentista/TSB durante a gestação.", pontos:15 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiras(os)"],["2231/2251/2252/2253","Médicas(os)"],["2232","Cirurgiãs(ões)-dentistas"],["2234","Farmacêuticas(os)"],["2236","Fisioterapeutas"],["2238","Fonoaudiólogas(os)"],["2237","Nutricionistas"],["2241","Profissionais de Educação Física"],["3222","Técnica(o)/auxiliar de enfermagem"],["2239","Terapeutas ocupacionais e afins"],["5151-05","Agente Comunitário de Saúde"],["3222-55","Técnica(o) em ACS"],["3224","Técnica(o) em Saúde Bucal"]],
      cid:"Gestação e puerpério: ampla lista de códigos O10-O48, O75.2/.3, O85-O92, O94, O98, O99, Z32-Z39, Z64.0 (ver Guia eSFR). Exclusão: O02, O02.1, O03-O06, Z30.3.",
      ciap:"Gestação: W78, W79, W81, W84, W85. Puerpério: 48, 49, P29, W18, W19, W70, W90-W96. Exclusão: W82, W83.",
      proc:[["01.01.04.002-4","Avaliação antropométrica"],["01.01.04.008-3","Medição de peso"],["01.01.04.007-5","Medição de altura"],["03.01.10.003-9","Aferição da pressão arterial"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.011-0","Consulta pré-natal"],["03.01.01.012-9","Consulta puerperal"],["03.01.01.013-7","Consulta/atendimento domiciliar"],["03.01.01.025-0","Teleconsulta na atenção primária"],["02.14.01.004-0","Teste rápido HIV (gestante/parceiro)"],["02.14.01.007-4","Teste rápido para sífilis"],["02.14.01.009-0","Teste rápido hepatite C"],["02.14.01.010-4","Teste rápido HBV"],["02.14.01.025-2","Teste rápido treponêmico (sífilis) em gestante"],["02.02.03.078-4","Pesquisa de anticorpos IgG e IgM contra o antígeno central do vírus da hepatite B (anti-HBC total)"],["02.02.03.097-0","Pesquisa de antígeno de superfície do vírus da hepatite B (HBsAG)"],["02.13.01.020-8","Identificação do vírus da hepatite B por PCR (quantitativo)"],["02.02.03.005-9","Detecção de RNA do vírus da hepatite C (qualitativo)"],["02.02.03.067-9","Pesquisa de anticorpos contra o vírus da hepatite C (anti-HCV)"]],
      vacina:[]
    },
    registro:"Parâmetros adaptados (5 consultas/registros de PA/peso). Registrar pré-natal e puerpério com todos os campos; cada boa prática (A-I) pontua de forma independente.",
    acoes:{
      acs:["Cadastrar gestantes assim que confirmada a gravidez","Realizar visitas domiciliares (mínimo 3 após 1ª consulta) e ≥1 no puerpério","Monitorar comparecimento e acionar busca ativa considerando a logística fluvial"],
      tec:["Aferir PA, peso e altura e registrar no PEC (mínimo 5 registros na gestação)","Auxiliar na coleta dos testes rápidos e exames do pré-natal"],
      enf:["Realizar consultas de pré-natal (mínimo 5) e a consulta de puerpério","Solicitar/avaliar testes de sífilis, HIV e hepatites no 1º e 3º trimestres","Encaminhar para avaliação odontológica na gestação"],
      med:["Realizar consultas de pré-natal e de puerpério registrando corretamente","Solicitar e avaliar exames do 1º e 3º trimestre","Encaminhar gestantes de risco"],
      den:["Realizar ≥1 atividade em saúde bucal na gestação - pontua no R3","Registrar a atividade no SISAB"],
    }
  },
  {
    cod:"R4", bloco:"R", titulo:"Pessoa com Diabetes (eSFR)",
    subtitulo:"Acompanhamento em territórios ribeirinhos",
    objetivo:"Avalia o acesso e o acompanhamento efetivo das pessoas com diabetes, com captação precoce e prevenção de complicações, considerando as especificidades de territórios ribeirinhos.",
    formula:{ num:"Somatório das boas práticas pontuadas para a pessoa com diabetes no período.",
              den:"Nº total de pessoas com diabetes cadastradas na equipe no período." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 1 consulta (presencial ou remota) por médica(o)/enfermeira(o) nos últimos 6 meses.", pontos:20 },
      { letra:"B", texto:"Pelo menos 1 registro de aferição de pressão arterial nos últimos 6 meses.", pontos:15 },
      { letra:"C", texto:"Pelo menos 1 registro de peso e altura nos últimos 12 meses.", pontos:15 },
      { letra:"D", texto:"Pelo menos 2 visitas domiciliares por ACS/TACS (intervalo mínimo 30 dias) nos últimos 12 meses.", pontos:20 },
      { letra:"E", texto:"Pelo menos 1 registro de hemoglobina glicada solicitada/avaliada nos últimos 12 meses.", pontos:15 },
      { letra:"F", texto:"Pelo menos 1 registro de avaliação dos pés nos últimos 12 meses.", pontos:15 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiras(os)"],["2231/2251/2252/2253","Médicas(os)"],["2232","Cirurgiãs(ões)-dentistas"],["2234","Farmacêuticas(os)"],["2236","Fisioterapeutas"],["2238","Fonoaudiólogas(os)"],["2237","Nutricionistas"],["2241","Profissionais de Educação Física"],["3222","Técnica(o)/auxiliar de enfermagem"],["2239","Terapeutas ocupacionais e afins"],["5151-05","Agente Comunitário de Saúde"],["3222-55","Técnica(o) em ACS"],["3224","Técnica(o) em Saúde Bucal"]],
      cid:"E10(.0-.9); E11(.0-.9); E14(.0-.9).",
      ciap:"T89; T90.",
      proc:[["01.01.04.002-4","Avaliação antropométrica"],["01.01.04.008-3","Medição de peso"],["01.01.04.007-5","Medição de altura"],["03.01.10.003-9","Aferição da pressão arterial"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.025-0","Teleconsulta na atenção primária"],["03.01.04.009-5","Exame do pé diabético"],["02.02.01.050-3","Dosagem de hemoglobina glicosilada"],["ABEX008","Hemoglobina glicosilada (registro de avaliação)"]],
      vacina:[]
    },
    registro:"Cada boa prática é registrada de forma independente. Marcar a condição 'Diabetes' e registrar HbA1c e avaliação dos pés.",
    acoes:{
      acs:["Visitar todos os diabéticos (mínimo 2x, intervalo ≥30 dias) considerando a logística do território","Registrar visitas com condição 'Diabetes'","Verificar adesão à medicação"],
      tec:["Aferir PA e registrar em todo atendimento","Realizar glicemia capilar quando solicitado","Coletar HbA1c e registrar a solicitação"],
      enf:["Realizar consulta de enfermagem e a avaliação dos pés","Solicitar HbA1c e demais exames","Organizar a lista de diabéticos por roteiro da eSFR"],
      med:["Consultar com intervalo máximo de 6 meses","Solicitar e avaliar HbA1c","Documentar a avaliação dos pés"],
    }
  },
  {
    cod:"R5", bloco:"R", titulo:"Pessoa com Hipertensão (eSFR)",
    subtitulo:"Cuidado integral em territórios ribeirinhos",
    objetivo:"Avalia o acesso e o monitoramento efetivo do cuidado integral às pessoas com hipertensão em territórios ribeirinhos, costeiros e marítimos.",
    formula:{ num:"Somatório das boas práticas pontuadas para a pessoa com hipertensão no período.",
              den:"Nº total de pessoas com hipertensão cadastradas na equipe no período." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 1 consulta (presencial ou remota) por médica(o)/enfermeira(o) nos últimos 6 meses.", pontos:25 },
      { letra:"B", texto:"Pelo menos 1 registro de aferição de pressão arterial nos últimos 6 meses.", pontos:25 },
      { letra:"C", texto:"Pelo menos 1 registro simultâneo de peso e altura nos últimos 12 meses.", pontos:25 },
      { letra:"D", texto:"Pelo menos 2 visitas domiciliares por ACS/TACS (intervalo mínimo 30 dias) nos últimos 12 meses.", pontos:25 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiras(os)"],["2231/2251/2252/2253","Médicas(os)"],["2232","Cirurgiãs(ões)-dentistas"],["2234","Farmacêuticas(os)"],["2236","Fisioterapeutas"],["2238","Fonoaudiólogas(os)"],["2237","Nutricionistas"],["2241","Profissionais de Educação Física"],["3222","Técnica(o)/auxiliar de enfermagem"],["2239","Terapeutas ocupacionais e afins"],["5151-05","Agente Comunitário de Saúde"],["3222-55","Técnica(o) em ACS"],["3224","Técnica(o) em Saúde Bucal"]],
      cid:"I10; I11(.0/.9); I12(.0/.9); I13(.0/.1/.2/.9); I15(.0/.1/.2/.8/.9); O10(.0-.4/.9); O11.",
      ciap:"K86; K87.",
      proc:[["01.01.04.002-4","Avaliação antropométrica"],["01.01.04.008-3","Medição de peso"],["01.01.04.007-5","Medição de altura"],["03.01.10.003-9","Aferição da pressão arterial"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.025-0","Teleconsulta na atenção primária"]],
      vacina:[]
    },
    registro:"A aferição de PA registrada no PEC pontua de forma independente. Marcar a condição 'Hipertensão'.",
    acoes:{
      acs:["Visitar todos os hipertensos (mínimo 2x, intervalo ≥30 dias) por roteiro do território","Registrar visitas com condição 'Hipertensão'","Verificar adesão à medicação"],
      tec:["Aferir PA em todo atendimento e registrar (pontua sozinha)","Vincular a aferição ao paciente correto"],
      enf:["Realizar consulta de enfermagem a cada 6 meses","Organizar grupo de hipertensão com aferição coletiva","Monitorar a lista de hipertensos"],
      med:["Consultar com intervalo máximo de 6 meses","Avaliar controle pressórico e ajustar tratamento"],
    }
  },
  {
    cod:"R6", bloco:"R", titulo:"Prevenção do Câncer (eSFR)",
    subtitulo:"Rastreamento em territórios ribeirinhos",
    objetivo:"Avalia o acesso e o monitoramento efetivo das mulheres e homens transgênero na prevenção do câncer em territórios ribeirinhos, costeiros e marítimos.",
    formula:{ num:"Somatório da boa prática para cada mulher/homem transgênero na faixa etária avaliada.",
              den:"Nº total de mulheres/homens transgênero na faixa etária avaliada e vinculados à equipe no período." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"≥1 exame de rastreamento do câncer de colo do útero (25-64 anos) nos últimos 36 meses.", pontos:50 },
      { letra:"B", texto:"≥1 dose da vacina HPV para meninas de 9-14 anos.", pontos:50 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiras(os)"],["2231/2251/2252/2253","Médicas(os)"],["3222","Técnica(o)/auxiliar de enfermagem"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["02.01.02.003-3","Coleta de citopatológico de colo uterino"],["02.03.01.008-6","Exame citopatológico cérvico-vaginal (rastreamento)"],["02.03.01.001-9","Exame citopatológico cérvico-vaginal/microflora"],["02.01.02.007-6","Coleta de material p/ exame molecular de HPV"],["02.01.02.008-4","Entrega de material (autocoleta) p/ HPV"],["ABEX001","Citopatológico"],["ABP022","Rastreamento de câncer do colo do útero"]],
      vacina:[["67","HPV quadrivalente"],["93","HPV nonavalente"]]
    },
    registro:"Versão ribeirinha simplificada (2 boas práticas de 50 pontos): rastreamento de colo do útero e vacina HPV.",
    acoes:{
      acs:["Identificar meninas de 9-14 anos e verificar a vacina HPV","Verificar mulheres de 25-64 anos com Papanicolau atrasado e encaminhar"],
      tec:["Aplicar vacina HPV em meninas de 9-14 anos e registrar","Auxiliar na coleta de citopatológico dentro das competências"],
      enf:["Realizar coleta de citopatológico em mulheres de 25-64 anos","Monitorar a lista de mulheres sem rastreamento no território"],
      med:["Avaliar Papanicolau alterado e encaminhar quando necessário"],
    }
  },

  /* ===================== eMulti  (M1 .. M2) ===================== */
  {
    cod:"M1", bloco:"M", titulo:"Média de Atendimentos por Pessoa (eMulti)",
    subtitulo:"Acesso da população às ações da eMulti",
    objetivo:"Mensura a média de atendimentos por pessoa realizados pela eMulti, expressando o acesso da população às ações de assistência (individual ou coletiva).",
    formula:{ num:"Nº de atendimentos individuais e coletivos realizados pela eMulti.",
              den:"Total de pessoas (CPF ou CNS válido) com pelo menos 1 atendimento individual ou participação em atividade coletiva da eMulti (Nota Técnica nº 30/2025-CGESCO/DESCO/SAPS/MS)." },
    metas:{ regular:"≤1", suficiente:">1 e ≤2", bom:">2 e ≤3", otimo:">3" },
    codigos:{
      cbo:[["5153-05","Arte Educador"],["2516-05","Assistente social"],["2234-45","Farmacêutico(a) hospitalar e clínico"],["2234-05","Farmacêutico"],["2236-05","Fisioterapeuta"],["2238-10","Fonoaudiólogo(a)"],["2251-05","Médico(a) acupunturista"],["2251-20","Médico(a) cardiologista"],["2251-25","Médico(a) paliativista"],["2251-35","Médico(a) dermatologista"],["2251-55","Médico(a) endocrinologista"],["2251-80","Médico(a) geriatra"],["2252-50","Médico(a) ginecologista / obstetra"],["2251-35","Médico(a) hansenologista"],["2251-95","Médico(a) homeopata"],["2251-03","Médico(a) infectologista"],["2251-24","Médico(a) pediatra"],["2251-33","Médico(a) psiquiatra"],["2233-05","Médico(a) veterinário(a)"],["2235-05","Enfermeiro(a)"],["2235-80","Enfermeiro(a) estomaterapeuta"],["2235-45","Enfermeiro(a) obstétrico(a)"],["2235-55","Enfermeiro(a) puericultor e pedriátrico"],["2237-10","Nutricionista"],["2241-40","Profissional de educação física na saúde"],["2515-10","Psicólogo(a)"],["1312-25","Sanitarista"],["2239-05","Terapeuta ocupacional"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[], vacina:[]
    },
    registro:"Registrar TODOS os atendimentos individuais e coletivos no PEC e-SUS APS. Grupos terapêuticos contam como atendimentos coletivos. A mesma pessoa deve retornar para elevar a média.",
    acoes:{
      emulti:["Registrar TODOS os atendimentos individuais e coletivos no PEC e-SUS APS","Garantir continuidade - os mesmos pacientes devem retornar e ter múltiplos atendimentos","Programar retornos ao finalizar cada atendimento","Realizar grupos terapêuticos e registrá-los como atendimentos coletivos","Articular com eSF/eAP/eSFR para identificar pessoas que precisam de acompanhamento continuado"],
    }
  },
  {
    cod:"M2", bloco:"M", titulo:"Ações Interprofissionais da eMulti",
    subtitulo:"Proporção de ações compartilhadas sobre o total",
    objetivo:"Monitora a proporção de ações de cuidado centrado na pessoa realizadas pela eMulti de forma compartilhada com outros profissionais no âmbito da APS.",
    formula:{ num:"Soma de ações compartilhadas da eMulti: atendimentos individuais compartilhados, atividades coletivas compartilhadas e compartilhamento de cuidado no PEC.",
              den:"Nº total de ações da eMulti: atendimentos individuais (específicos e compartilhados), atividades coletivas (específicas e compartilhadas) e ações do módulo Compartilhamento do Cuidado do PEC." },
    metas:{ regular:"≤1", suficiente:">1 e ≤2,5", bom:">2,5 e ≤5", otimo:">5" },
    codigos:{
      cbo:[["5153-05","Arte Educador"],["2516-05","Assistente social"],["2234-45","Farmacêutico(a) hospitalar e clínico"],["2234-05","Farmacêutico"],["2236-05","Fisioterapeuta"],["2238-10","Fonoaudiólogo(a)"],["2251-05","Médico(a) acupunturista"],["2251-20","Médico(a) cardiologista"],["2251-25","Médico(a) paliativista"],["2251-35","Médico(a) dermatologista"],["2251-55","Médico(a) endocrinologista"],["2251-80","Médico(a) geriatra"],["2252-50","Médico(a) ginecologista / obstetra"],["2251-35","Médico(a) hansenologista"],["2251-95","Médico(a) homeopata"],["2251-03","Médico(a) infectologista"],["2251-24","Médico(a) pediatra"],["2251-33","Médico(a) psiquiatra"],["2233-05","Médico(a) veterinário(a)"],["2235-05","Enfermeiro(a)"],["2235-80","Enfermeiro(a) estomaterapeuta"],["2235-45","Enfermeiro(a) obstétrico(a)"],["2235-55","Enfermeiro(a) puericultor e pedriátrico"],["2237-10","Nutricionista"],["2241-40","Profissional de educação física na saúde"],["2515-10","Psicólogo(a)"],["1312-25","Sanitarista"],["2239-05","Terapeuta ocupacional"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[], vacina:[]
    },
    registro:"Para contabilizar como ação compartilhada, ao menos 1 CNS de profissional eMulti deve constar como principal ou secundário. Selecionar SEMPRE 'ação compartilhada' no PEC. Vale o compartilhamento com eSF, eSFR, eCR, eAP, UBSF, eSB ou qualquer profissional da APS com CNS/CPF identificado.",
    acoes:{
      emulti:["Realizar interconsultas compartilhadas com médico/enfermeiro e registrar como 'ação compartilhada'","Participar de visitas domiciliares conjuntas com a eSF/eSFR e registrar no PEC","Realizar reuniões de matriciamento com as equipes de referência e documentar","Construir Projetos Terapêuticos Singulares (PTS) em conjunto com as equipes","Selecionar SEMPRE 'ação compartilhada' ao registrar no PEC (1 CNS eMulti como principal/secundário)"],
      enf:["Solicitar apoio da eMulti para casos complexos e participar das interconsultas","Registrar a participação nas ações compartilhadas no PEC","Participar dos PTS e das reuniões de matriciamento"],
      med:["Solicitar apoio da eMulti para casos complexos e participar das interconsultas","Registrar a participação nas ações compartilhadas no PEC","Participar dos PTS e das reuniões de matriciamento"],
    }
  },

  /* ===================== eAPP - Atenção Primária Prisional (P1 .. P6) ===================== */
  {
    cod:"P1", bloco:"P", titulo:"Mais Acesso à APS Prisional",
    subtitulo:"Acesso das pessoas privadas de liberdade à APS",
    objetivo:"Avalia o acesso das pessoas privadas de liberdade aos atendimentos na APS no sistema prisional, medindo a proporção de pessoas atendidas em relação ao total identificado pela eAPP, para acompanhar a capacidade do serviço, identificar barreiras e orientar ações que ampliem a cobertura.",
    formula:{ num:"Nº de pessoas com atendimento individual realizado por médica(o), enfermeira(o) e cirurgiã(ão)-dentista nos últimos 6 meses.",
              den:"Nº total de pessoas privadas de liberdade identificadas pela eAPP nos últimos 12 meses." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    codigos:{
      cbo:[["2251","Médicos clínicos"],["2232","Cirurgiões-dentistas"],["2235","Enfermeiros e afins"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[], vacina:[]
    },
    registro:"Registrar o atendimento individual das pessoas privadas de liberdade no PEC. Não há boas práticas nem procedimentos específicos - o indicador mede a proporção de acesso.",
    acoes:{
      enf:["Realizar atendimentos individuais das pessoas privadas de liberdade e registrar no PEC","Organizar a agenda para ampliar a cobertura de atendimentos na unidade prisional","Identificar e cadastrar as pessoas privadas de liberdade do território prisional","Monitorar quem ainda não foi atendido nos últimos 6 meses"],
      med:["Realizar consultas individuais e registrar corretamente no PEC","Priorizar quem nunca foi atendido para ampliar o acesso"],
      den:["Realizar atendimentos odontológicos individuais e registrar no PEC"],
    }
  },
  {
    cod:"P2", bloco:"P", titulo:"Cuidado na Gestação (eAPP)",
    subtitulo:"Pré-natal de pessoas privadas de liberdade",
    objetivo:"Avalia o acesso oportuno de pessoas privadas de liberdade durante a gestação identificadas pela eAPP, possibilitando o monitoramento do pré-natal e fortalecendo a coordenação do cuidado das gestações em situação de vulnerabilidade.",
    formula:{ num:"Somatório das boas práticas pontuadas para cada pessoa durante a gestação.",
              den:"Nº total de pessoas gestantes identificadas nas eAPP nos últimos 12 meses." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 3 consultas presenciais ou remotas por médica(o)/enfermeira(o), com no mínimo 1 em cada trimestre da gestação.", pontos:40 },
      { letra:"B", texto:"Registro dos testes rápidos realizados ou dos exames avaliados para sífilis, HIV e hepatites B e C durante a gestação.", pontos:20 },
      { letra:"C", texto:"Registro de uma vacina dTpa a partir da 20ª semana de cada gestação.", pontos:15 },
      { letra:"D", texto:"Pelo menos 3 registros de aferição de pressão arterial durante a gestação.", pontos:15 },
      { letra:"E", texto:"Pelo menos 1 atividade em saúde bucal realizada durante a gestação.", pontos:10 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros e afins"],["2251/2252/2253","Médicos clínicos, cirúrgicos e diagnóstico/terapêutica"],["2232","Cirurgiões-dentistas"],["2237","Nutricionistas"],["2515","Psicólogos e psicanalistas"],["3222","Técnicos e auxiliares de enfermagem"],["2239-05","Terapeutas ocupacionais"],["3224","Técnico em Saúde Bucal (TSB)"]],
      cid:"Gestação: O10-O16, O20-O26, O28-O36, O40, O41, O43, O44, O46, O47, O98, O99, O75, Z32-Z36, Z64. Exclusão: O02, O02.1, O03-O06, Z30.3.",
      ciap:"Gestação: W78, W79, W81, W84, W85. Exclusão: W82, W83.",
      proc:[["03.01.10.003-9","Aferição da pressão arterial"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.011-0","Consulta pré-natal"],["03.01.01.025-0","Teleconsulta na atenção primária"],["02.14.01.004-0","Teste rápido HIV (gestante ou parceiro)"],["02.14.01.008-2","Teste rápido sífilis (gestante ou parceiro)"],["02.14.01.009-0","Teste rápido hepatite C"],["02.14.01.010-4","Teste rápido HBV"],["02.13.01.078-0","Detecção rápida da carga viral do HIV"],["02.02.03.109-8","Teste treponêmico p/ sífilis"],["02.02.03.117-9","Teste não treponêmico sífilis em gestante"],["02.13.01.050-0","Quantificação da carga viral do HIV (RNA)"],["02.02.03.078-4","Pesquisa de anticorpos IgG e IgM contra o antígeno central do vírus da hepatite B (anti-HBC total)"],["02.02.03.097-0","Pesquisa de antígeno de superfície do vírus da hepatite B (HBsAG)"],["02.13.01.020-8","Identificação do vírus da hepatite B por PCR (quantitativo)"],["02.02.03.005-9","Detecção de RNA do vírus da hepatite C (qualitativo)"],["02.02.03.067-9","Pesquisa de anticorpos contra o vírus da hepatite C (anti-HCV)"],["02.14.01.027-9","teste rápido para detecção de anticorpos anti-HIV em gestante"],["02.14.01.025-2","Teste rápido treponêmico (sífilis) em gestante"],["02.14.01.030-9","Teste rápido para detecção de anticorpos contra o vírus da hepatite C em gestante"],["02.14.01.023-6","Teste rápido para detecção do antígeno de superfície do vírus da hepatite B - HBV (HBSAG) em gestante"],["02.02.03.139-0","Teste treponêmico laboratorial p/ detecção de sífilis em gestante"],["02.02.03.145-4","Pesquisa laboratorial de antígeno de superfície do vírus da hepatite B (HBSAG) em gestante"],["02.02.03.148-9","Pesquisa laboratorial de anticorpos contra o vírus da hepatite C (ANTI-HCV) em gestante i) Esquema de dose:"]],
      vacina:[["57","dTpa adulto"]]
    },
    registro:"Cadastrar a gestação assim que confirmada. Cada boa prática (A-E) pontua de forma independente. Registrar consultas, testes rápidos, dTpa, aferições de PA e a atividade de saúde bucal.",
    acoes:{
      enf:["Realizar consultas de pré-natal (mínimo 3, 1 por trimestre) e registrar","Solicitar/avaliar testes rápidos de sífilis, HIV e hepatites","Aferir e registrar PA (mínimo 3 registros) na gestação","Aplicar dTpa a partir da 20ª semana e registrar"],
      med:["Realizar consultas de pré-natal registrando todos os campos","Avaliar exames e conduzir gestações de risco"],
      den:["Realizar ≥1 atividade em saúde bucal na gestação - pontua no P2","Registrar a atividade no SISAB"],
    }
  },
  {
    cod:"P3", bloco:"P", titulo:"Diabetes e/ou Hipertensão (eAPP)",
    subtitulo:"Cuidado integral de crônicos no sistema prisional",
    objetivo:"Avalia o acesso e o monitoramento efetivo do cuidado integral das pessoas privadas de liberdade com diabetes e/ou hipertensão, promovendo cuidado coordenado e acompanhamento contínuo pela eAPP.",
    formula:{ num:"Somatório das boas práticas pontuadas para cada pessoa com hipertensão e/ou diabetes identificada pela eAPP.",
              den:"Nº total de pessoas com hipertensão e/ou diabetes identificadas pela eAPP nos últimos 12 meses." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 1 consulta presencial ou remota por médica(o)/enfermeira(o) nos últimos 6 meses.", pontos:50 },
      { letra:"B", texto:"Pelo menos 1 registro de aferição de pressão arterial nos últimos 6 meses.", pontos:20 },
      { letra:"C", texto:"Pelo menos 1 registro de peso e altura nos últimos 12 meses.", pontos:15 },
      { letra:"D", texto:"Pelo menos 1 registro de hemoglobina glicada, solicitada ou avaliada, nos últimos 12 meses, se diabetes.", pontos:15 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros e afins"],["2251/2252/2253","Médicos clínicos, cirúrgicos e diagnóstico/terapêutica"],["2232","Cirurgiões-dentistas"],["2237","Nutricionistas"],["2515","Psicólogos e psicanalistas"],["3222","Técnicos e auxiliares de enfermagem"],["2239-05","Terapeutas ocupacionais"],["3224","Técnicos de odontologia"]],
      cid:"Diabetes: E10; E11; E14 (subcategorias). Hipertensão: I10; I11; I12; I13; I15 (subcategorias); O10; O11.",
      ciap:"T89; T90; K86; K87.",
      proc:[["01.01.04.002-4","Avaliação antropométrica"],["01.01.04.008-3","Medição de peso"],["01.01.04.007-5","Medição de altura"],["03.01.10.003-9","Aferição da pressão arterial"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.025-0","Teleconsulta na atenção primária"],["02.02.01.050-3","Dosagem de hemoglobina glicosilada"],["ABEX008","Hemoglobina glicosilada (registro de avaliação)"]],
      vacina:[]
    },
    registro:"Marcar a condição 'Diabetes' e/ou 'Hipertensão'. Cada boa prática pontua de forma independente. A HbA1c só é exigida para diabéticos.",
    acoes:{
      enf:["Realizar consulta de enfermagem a crônicos nos últimos 6 meses e registrar","Aferir e registrar PA","Solicitar HbA1c para diabéticos e registrar","Registrar peso e altura"],
      med:["Consultar crônicos com intervalo máximo de 6 meses","Solicitar/avaliar HbA1c e ajustar tratamento"],
      tec:["Aferir PA, peso e altura e registrar","Coletar HbA1c quando solicitado"],
    }
  },
  {
    cod:"P4", bloco:"P", titulo:"Rastreio de IST (eAPP)",
    subtitulo:"Sífilis, HIV e hepatites B e C no sistema prisional",
    objetivo:"Avalia o acesso à realização oportuna do rastreio de sífilis, HIV e hepatites B e C, promovendo diagnóstico e tratamento precoce e o acompanhamento coordenado e contínuo pela eAPP.",
    formula:{ num:"Somatório das boas práticas de rastreio de IST para cada pessoa identificada pela eAPP.",
              den:"Nº total de pessoas identificadas pela eAPP nos últimos 12 meses." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Registro do teste rápido realizado ou exame avaliado para sífilis.", pontos:25 },
      { letra:"B", texto:"Registro do teste rápido realizado ou exame avaliado para HIV.", pontos:25 },
      { letra:"C", texto:"Registro do teste rápido realizado ou exame avaliado para hepatite B.", pontos:25 },
      { letra:"D", texto:"Registro do teste rápido realizado ou exame avaliado para hepatite C.", pontos:25 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros e afins"],["2251/2252/2253","Médicos clínicos, cirúrgicos e diagnóstico/terapêutica"],["2232","Cirurgiões-dentistas"],["2237","Nutricionistas"],["3222","Técnicos e auxiliares de enfermagem"],["2239-05","Terapeutas ocupacionais"],["2234","Farmacêuticos"],["2236","Fisioterapeutas"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["02.14.01.007-4","Teste rápido treponêmico (sífilis) - pop. geral"],["02.14.01.008-2","Teste rápido para sífilis em gestante"],["02.14.01.005-8","Teste rápido anti-HIV - pop. geral"],["02.13.01.078-0","Detecção rápida da carga viral do HIV"],["02.13.01.050-0","Quantificação da carga viral do HIV (RNA)"],["02.14.01.010-4","Teste rápido hepatite B"],["02.14.01.009-0","Teste rápido hepatite C"],["02.02.03.078-4","Anti-HBC total (IgG/IgM)"],["02.02.03.097-0","HBsAg (antígeno de superfície HBV)"],["02.02.03.067-9","Anti-HCV (anticorpos hepatite C)"],["02.02.03.005-9","RNA do vírus da hepatite C (qualitativo)"],["02.02.03.138-1","Teste treponêmico laboratorial para detecção de sífilis para população geral (exceto gestante, parceiro ou parceria)"],["02.02.03.150-0","Pesquisa laboratorial de antígenos de hiv e/ou anticorpos anti-HIV-1 ou anti-HIV-2 para população geral (exceto gestante, parceiro ou parceria)"],["02.14.01.022-8","Teste rápido para detecção do antígeno de superfície do vírus da hepatite B - HBV (HBSAG) para população geral (exceto gestante, parceiro ou parceria)"],["02.14.01.023-6","Teste rápido para detecção do antígeno de superfície do vírus da hepatite B - HBV (HBSAG) em gestante"],["02.14.01.024-4","Teste rápido para detecção do antígeno de superfície do vírus da hepatite B (HBV) (HBSAG) em parceiro ou parceria de gestante"],["02.02.03.144-6","Pesquisa laboratorial de antígeno de superfície do vírus da hepatite B (HBSAG) para população geral (exceto gestante, parceiro ou parceria)"],["02.02.03.145-4","Pesquisa laboratorial de antígeno de superfície do vírus da hepatite B (HBSAG) em gestante"],["02.02.03.146-2","Pesquisa laboratorial de antígeno de superfície do vírus da hepatite B (HBSAG) em parceiro ou parceria de gestante"],["02.13.01.020-8","Identificação do vírus da hepatite B por PCR (quantitativo)"],["02.14.01.029-5","Teste rápido para detecção de anticorpos contra o vírus da hepatite c para população geral (exceto gestante, parceiro ou parceria)"],["02.14.01.030-9","Teste rápido para detecção de anticorpos contra o vírus da hepatite C em gestante"],["02.14.01.031-7","Teste rápido para detecção de anticorpos contra o vírus da hepatite C em parceiro ou parceria de gestante"],["02.02.03.147-0","Pesquisa laboratorial de anticorpos contra o vírus da hepatite c (anti-hcv) para população geral (exceto gestante, parceiro ou parceria)"],["02.02.03.148-9","Pesquisa laboratorial de anticorpos contra o vírus da hepatite C (ANTI-HCV) em gestante i) Esquema de dose:"],["02.02.03.149-7","Pesquisa laboratorial de anticorpos contra o vírus da hepatite C (ANTI-HCV) em parceiro ou parceria de gestante"]],
      vacina:[]
    },
    registro:"Cada teste rápido/exame (sífilis, HIV, hepatite B, hepatite C) vale 25 pontos e é registrado de forma independente no PEC.",
    acoes:{
      enf:["Realizar os 4 testes rápidos (sífilis, HIV, hepatites B e C) e registrar cada um","Organizar campanhas de testagem na unidade prisional","Encaminhar casos reagentes para tratamento e acompanhamento"],
      med:["Avaliar exames laboratoriais de IST e registrar","Conduzir tratamento e acompanhamento dos casos positivos"],
      tec:["Executar os testes rápidos conforme competência e registrar","Auxiliar na coleta de exames laboratoriais"],
    }
  },
  {
    cod:"P5", bloco:"P", titulo:"Cuidado da Pessoa com Tuberculose (eAPP)",
    subtitulo:"Diagnóstico e acompanhamento no sistema prisional",
    objetivo:"Avalia o acesso e o monitoramento do cuidado integral das pessoas privadas de liberdade com tuberculose, incentivando o acompanhamento coordenado e contínuo pela eAPP.",
    formula:{ num:"Somatório das boas práticas pontuadas para cada pessoa identificada com tuberculose pela eAPP.",
              den:"Nº total de pessoas identificadas com tuberculose pela eAPP nos últimos 6 meses." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 4 consultas presenciais ou remotas por médica(o)/enfermeira(o) nos últimos 6 meses.", pontos:40 },
      { letra:"B", texto:"Pelo menos 1 registro de baciloscopia, teste rápido molecular ou cultura solicitados ou avaliados nos últimos 6 meses.", pontos:25 },
      { letra:"C", texto:"Registro de radiografia de tórax, exame solicitado ou avaliado, nos últimos 6 meses.", pontos:10 },
      { letra:"D", texto:"Registro de teste rápido realizado ou exame avaliado para HIV nos últimos 6 meses.", pontos:25 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros e afins"],["2251/2252/2253","Médicos clínicos, cirúrgicos e diagnóstico/terapêutica"],["2232","Cirurgiões-dentistas"],["2234","Farmacêuticos"],["2236","Fisioterapeutas"],["2237","Nutricionistas"],["2515","Psicólogos e Psicanalistas"],["2239-05","Terapeutas ocupacionais e afins"],["3222","Técnicos e auxiliares de enfermagem"]],
      cid:"A15; A15.0; A15.1; A15.2; A15.3; A16; A16.0; A16.1; A16.2.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["03.01.01.002-1","Consulta com identificação de casos novos de TB"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.04.019-2","Acompanhamento em TDO da tuberculose"],["02.14.01.005-8","Teste rápido para detecção de infecção pelo HIV"],["02.02.08.006-4","Baciloscopia direta p/ BAAR TB (controle)"],["02.02.08.004-8","Baciloscopia direta p/ BAAR TB (diagnóstica)"],["02.04.03.017-0","Radiografia de tórax (PA)"],["02.02.09.036-1","Teste molecular para detecção de TB"],["02.02.08.011-0","Cultura sólida para micobactérias"],["02.14.01.019-8","Teste rápido LF-LAM para tuberculose"],["03.01.01.003-0","Consulta de profissionais de nível superior na atenção primária (exceto médica(o))"],["03.01.01.025-0","Teleconsulta na atenção primária g) Esquema de doses:"],["02.13.01.075-5","Teste de Hibridização de Sonda em Linha de 1ª Linha para Tuberculose (LPA 1ª linha)"],["02.04.03.015-3","Radiografia de tórax (PA e perfil)"]],
      vacina:[]
    },
    registro:"Denominador considera casos identificados nos últimos 6 meses. Registrar consultas (mínimo 4), exames diagnósticos (baciloscopia/TRM/cultura), radiografia e teste de HIV.",
    acoes:{
      enf:["Realizar consultas de acompanhamento da TB (mínimo 4 em 6 meses)","Solicitar baciloscopia, teste rápido molecular ou cultura","Realizar teste rápido de HIV e registrar","Coordenar o TDO (tratamento diretamente observado)"],
      med:["Consultar e conduzir o tratamento da TB registrando no PEC","Solicitar e avaliar exames diagnósticos e radiografia de tórax","Avaliar coinfecção TB-HIV"],
      tec:["Executar baciloscopia/coletas conforme competência","Aplicar teste rápido de HIV e registrar","Apoiar o TDO diário"],
    }
  },
  {
    cod:"P6", bloco:"P", titulo:"Prevenção do Câncer (eAPP)",
    subtitulo:"Rastreamento de câncer do colo do útero no sistema prisional",
    objetivo:"Avalia o acesso e o acompanhamento efetivo das mulheres e dos homens transgênero em relação ao rastreamento do câncer do colo do útero, com incentivo à captação precoce e acompanhamento coordenado e contínuo pela APS prisional.",
    formula:{ num:"Nº total de mulheres e homens transgênero entre 25 e 64 anos com pelo menos uma avaliação para câncer do colo do útero nos últimos 36 meses.",
              den:"Nº total de mulheres e homens transgênero entre 25 e 64 anos identificados pela eAPP nos últimos 12 meses." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 1 exame de rastreamento para câncer do colo do útero (mulheres e homens transgênero de 25 a 64 anos), coletado, solicitado ou avaliado nos últimos 36 meses.", pontos:100 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros e afins"],["2251/2252/2253","Médicos clínicos, cirúrgicos e diagnóstico/terapêutica"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["02.01.02.003-3","Coleta de citopatológico de colo uterino"],["02.03.01.008-6","Exame citopatológico cérvico-vaginal (rastreamento)"],["02.03.01.001-9","Exame citopatológico cérvico-vaginal/microflora"],["02.01.02.007-6","Coleta de material p/ exame molecular de HPV"],["02.01.02.008-4","Entrega de material (autocoleta) p/ HPV"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.025-0","Teleconsulta na atenção primária"],["ABEX001","Citopatológico"],["ABP022","Rastreamento de câncer do colo do útero"]],
      vacina:[]
    },
    registro:"Uma única boa prática de 100 pontos: exame de rastreamento do câncer do colo do útero (25-64 anos) nos últimos 36 meses, coletado, solicitado ou avaliado.",
    acoes:{
      enf:["Realizar coleta de citopatológico em pessoas de 25-64 anos","Monitorar a lista de quem está sem rastreamento no período","Organizar campanhas de coleta na unidade prisional"],
      med:["Solicitar/avaliar o exame de rastreamento e registrar","Avaliar Papanicolau alterado e encaminhar quando necessário"],
    }
  },

  /* ===================== eCR - Consultório na Rua (CR1 .. CR4) ===================== */
  {
    cod:"CR1", bloco:"CR", titulo:"Mais Acesso à eCR",
    subtitulo:"Acesso da população em situação de rua à APS",
    objetivo:"Avalia o acesso da população em situação de rua às consultas na APS, medindo a proporção de pessoas atendidas em relação ao total identificado pela eCR, para acompanhar a capacidade do serviço, identificar barreiras e orientar ações que ampliem a cobertura.",
    formula:{ num:"Nº total de pessoas com atendimento individual por médica(o)/enfermeira(o)/cirurgiã(ão)-dentista da APS nos últimos 6 meses.",
              den:"Nº total de pessoas identificadas pelas eCR nos últimos 12 meses." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    codigos:{
      cbo:[["2235-05","Enfermeiro"],["2235-65","Enfermeiro da Estratégia Saúde da Família"],["2251","Médicos Clínicos"],["2232","Cirurgiões-dentistas"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[], vacina:[]
    },
    registro:"Registrar o atendimento individual das pessoas em situação de rua no PEC. Não há boas práticas nem procedimentos específicos - o indicador mede a proporção de acesso.",
    acoes:{
      acs:["Identificar e cadastrar as pessoas em situação de rua do território","Busca ativa de pessoas que não acessam a UBS","Orientar e acompanhar até o atendimento na equipe"],
      enf:["Realizar atendimentos individuais das pessoas em situação de rua e registrar","Organizar itinerários da equipe para ampliar a cobertura","Monitorar quem ainda não foi atendido nos últimos 6 meses"],
      med:["Realizar consultas individuais e registrar corretamente no PEC"],
      den:["Realizar atendimentos odontológicos individuais e registrar"],
    }
  },
  {
    cod:"CR2", bloco:"CR", titulo:"Cuidado na Gestação (eCR)",
    subtitulo:"Pré-natal de pessoas em situação de rua",
    objetivo:"Avalia o acesso oportuno durante a gestação de pessoas em situação de rua identificadas pelas eCR, possibilitando o monitoramento do pré-natal e fortalecendo a coordenação do cuidado das pessoas em situação de vulnerabilidade.",
    formula:{ num:"Somatório das boas práticas pontuadas para a pessoa durante cada gestação.",
              den:"Nº total de pessoas gestantes identificadas nas eCR." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 3 consultas, com no mínimo 1 em cada trimestre da gestação.", pontos:30 },
      { letra:"B", texto:"Registro dos testes rápidos ou exames avaliados para sífilis, HIV e hepatites B e C durante cada gestação.", pontos:20 },
      { letra:"C", texto:"Registro de uma dose de dTpa a partir da 20ª semana de cada gestação.", pontos:20 },
      { letra:"D", texto:"Pelo menos 3 registros de pressão arterial durante a gestação.", pontos:20 },
      { letra:"E", texto:"Pelo menos 1 atividade em saúde bucal por cirurgião-dentista ou TSB durante a gestação.", pontos:10 },
    ],
    codigos:{
      cbo:[["2235-05","Enfermeiro"],["2235-65","Enfermeiro da ESF"],["2231/2251/2252/2253","Médicos"],["2232","Cirurgiões-dentistas"],["2234","Farmacêuticos"],["2236","Fisioterapeutas"],["2238","Fonoaudiólogos"],["2237","Nutricionistas"],["2241","Profissionais de Educação Física"],["3222","Técnicos e auxiliares de enfermagem"],["2239","Terapeutas ocupacionais e afins"],["3224-05","Técnico em Saúde Bucal"],["3224-25","TSB da ESF"],["3222-55","Técnico em ACS"]],
      cid:"Gestação: O10-O16, O20-O26, O28-O36, O40, O41, O43, O44, O46, O47, O98, O99, O75, Z32-Z36, Z64. Exclusão: O02, O02.1, O03-O06, Z30.3.",
      ciap:"Gestação: W78, W79, W81, W84, W85. Exclusão: W82, W83.",
      proc:[["03.01.10.003-9","Aferição da pressão arterial"],["03.01.01.003-0","Consulta prof. nível superior (exceto médico)"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.01.011-0","Consulta pré-natal"],["03.01.01.013-7","Consulta/atendimento domiciliar"],["03.01.01.025-0","Teleconsulta na atenção primária"],["02.14.01.004-0","Teste rápido HIV (gestante/parceiro)"],["02.14.01.008-2","Teste rápido sífilis (gestante/parceiro)"],["02.14.01.009-0","Teste rápido hepatite C"],["02.14.01.010-4","Teste rápido HBV"],["02.13.01.078-0","Detecção rápida da carga viral do HIV"],["02.02.03.109-8","Teste treponêmico p/ sífilis"],["02.14.01.027-9","teste rápido para detecção de anticorpos anti-HIV em gestante"],["02.14.01.005-8","Teste rápido para detecção de anticorpos anti-HIV para população geral (exceto gestante, parceiro ou parceria)"],["02.14.01.007-4","Teste rápido treponêmico (Sífilis) para população geral (exceto gestante, parceiro ou parceria)"],["02.14.01.026-0","Teste rápido treponêmico (sífilis) em parceiro ou parceria de gestante"],["02.14.01.030-9","Teste rápido para detecção de anticorpos contra o vírus da hepatite C em gestante"],["02.14.01.023-6","Teste rápido para detecção do antígeno de superfície do vírus da hepatite B - HBV (HBSAG) em gestante"],["02.13.01.050-0","Quantificação da carga viral do HIV (RNA)"],["02.02.03.139-0","Teste treponêmico laboratorial p/ detecção de sífilis em gestante"],["02.02.03.111-0","Teste não treponêmico para detecção de sífilis"],["02.02.03.117-9","Teste não treponêmico para detecção de sífilis em gestante"],["02.02.03.078-4","Pesquisa de anticorpos IgG e IgM contra o antígeno central do vírus da hepatite B (anti-HBC total)"],["02.02.03.097-0","Pesquisa de antígeno de superfície do vírus da hepatite B (HBsAG)"],["02.02.03.145-4","Pesquisa laboratorial de antígeno de superfície do vírus da hepatite B (HBSAG) em gestante"],["02.13.01.020-8","Identificação do vírus da hepatite B por PCR (quantitativo)"],["02.02.03.005-9","Detecção de RNA do vírus da hepatite C (qualitativo)"],["02.02.03.067-9","Pesquisa de anticorpos contra o vírus da hepatite C (anti-HCV)"],["02.02.03.148-9","Pesquisa laboratorial de anticorpos contra o vírus da hepatite C (ANTI-HCV) em gestante i) Esquema de dose:"],["02.14.01.025-2","Teste rápido treponêmico (sífilis) em gestante"]],
      vacina:[["57","dTpa adulto"]]
    },
    registro:"Cadastrar a gestação assim que confirmada. Cada boa prática (A-E) pontua de forma independente. Registrar consultas, testes, dTpa, aferições de PA e a atividade de saúde bucal.",
    acoes:{
      acs:["Identificar e cadastrar gestantes em situação de rua","Acompanhar comparecimento às consultas e acionar busca ativa"],
      enf:["Realizar consultas de pré-natal (mínimo 3, 1 por trimestre) e registrar","Solicitar/avaliar testes rápidos de sífilis, HIV e hepatites","Aferir e registrar PA (mínimo 3) e aplicar dTpa após a 20ª semana"],
      med:["Realizar consultas de pré-natal registrando todos os campos","Avaliar exames e conduzir gestações de risco"],
      den:["Realizar ≥1 atividade em saúde bucal na gestação - pontua no CR2","Registrar a atividade no SISAB"],
    }
  },
  {
    cod:"CR3", bloco:"CR", titulo:"Rastreio de IST (eCR)",
    subtitulo:"Sífilis, HIV e hepatites B e C na população em situação de rua",
    objetivo:"Avalia o acesso à realização oportuna do rastreio de sífilis, HIV e hepatites B e C, promovendo diagnóstico e tratamento precoce e o acompanhamento coordenado e contínuo das pessoas em situação de rua na APS.",
    formula:{ num:"Somatório das boas práticas de rastreio de IST para cada pessoa identificada pelas eCR.",
              den:"Nº total de pessoas identificadas pelas eCR nos últimos 12 meses." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Registro do teste rápido realizado ou exame avaliado para sífilis, nos últimos 12 meses.", pontos:25 },
      { letra:"B", texto:"Registro do teste rápido realizado ou exame avaliado para HIV, nos últimos 12 meses.", pontos:25 },
      { letra:"C", texto:"Registro do teste rápido realizado ou avaliado para hepatite B, nos últimos 12 meses.", pontos:25 },
      { letra:"D", texto:"Registro do teste rápido realizado ou exame avaliado para hepatite C, nos últimos 12 meses.", pontos:25 },
    ],
    codigos:{
      cbo:[["2235","Enfermeiros e afins"],["2251/2252/2253","Médicos clínicos, cirúrgicos e diagnóstico/terapêutica"],["2232","Cirurgiões-dentistas"],["2234","Farmacêuticos"],["2236","Fisioterapeutas"],["2238","Fonoaudiólogos"],["2237","Nutricionistas"],["3222","Técnicos e auxiliares de enfermagem"],["2239","Terapeutas ocupacionais"],["2515","Psicólogos e psicanalistas"],["2241","Profissionais da educação física"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["02.14.01.007-4","Teste rápido treponêmico (sífilis) - pop. geral"],["02.02.03.116-0","Teste rápido para diagnóstico da sífilis"],["02.14.01.005-8","Teste rápido anti-HIV - pop. geral"],["02.13.01.078-0","Detecção rápida da carga viral do HIV"],["02.13.01.050-0","Quantificação da carga viral do HIV (RNA)"],["02.14.01.010-4","Teste rápido hepatite B"],["02.14.01.009-0","Teste rápido hepatite C"],["02.02.03.097-0","HBsAg (antígeno de superfície HBV)"],["02.02.03.067-9","Anti-HCV (anticorpos hepatite C)"],["02.02.03.005-9","RNA do vírus da hepatite C (qualitativo)"],["02.02.03.138-1","Teste treponêmico laboratorial para detecção de sífilis para população geral (exceto gestante, parceiro ou parceria)"],["02.14.01.008-2","Teste rápido para sífilis na gestante ou pai/parceiro"],["02.02.03.150-0","Pesquisa laboratorial de antígenos de hiv e/ou anticorpos anti-HIV-1 ou anti-HIV-2 para população geral (exceto gestante, parceiro ou parceria)"],["02.14.01.022-8","Teste rápido para detecção do antígeno de superfície do vírus da hepatite B - HBV (HBSAG) para população geral (exceto gestante, parceiro ou parceria)"],["02.14.01.023-6","Teste rápido para detecção do antígeno de superfície do vírus da hepatite B - HBV (HBSAG) em gestante"],["02.14.01.024-4","Teste rápido para detecção do antígeno de superfície do vírus da hepatite B (HBV) (HBSAG) em parceiro ou parceria de gestante"],["02.02.03.078-4","Pesquisa de anticorpos IgG e IgM contra o antígeno central do vírus da hepatite B (anti-HBC total)"],["02.02.03.144-6","Pesquisa laboratorial de antígeno de superfície do vírus da hepatite B (HBSAG) para população geral (exceto gestante, parceiro ou parceria)"],["02.02.03.145-4","Pesquisa laboratorial de antígeno de superfície do vírus da hepatite B (HBSAG) em gestante"],["02.02.03.146-2","Pesquisa laboratorial de antígeno de superfície do vírus da hepatite B (HBSAG) em parceiro ou parceria de gestante"],["02.13.01.020-8","Identificação do vírus da hepatite B por PCR (quantitativo)"],["02.14.01.029-5","Teste rápido para detecção de anticorpos contra o vírus da hepatite c para população geral (exceto gestante, parceiro ou parceria)"],["02.14.01.030-9","Teste rápido para detecção de anticorpos contra o vírus da hepatite C em gestante"],["02.14.01.031-7","Teste rápido para detecção de anticorpos contra o vírus da hepatite C em parceiro ou parceria de gestante"],["02.02.03.147-0","Pesquisa laboratorial de anticorpos contra o vírus da hepatite c (anti-hcv) para população geral (exceto gestante, parceiro ou parceria)"],["02.02.03.148-9","Pesquisa laboratorial de anticorpos contra o vírus da hepatite C (ANTI-HCV) em gestante i) Esquema de dose:"],["02.02.03.149-7","Pesquisa laboratorial de anticorpos contra o vírus da hepatite C (ANTI-HCV) em parceiro ou parceria de gestante"]],
      vacina:[]
    },
    registro:"Cada teste rápido/exame (sífilis, HIV, hepatite B, hepatite C) vale 25 pontos e é registrado de forma independente no PEC, nos últimos 12 meses.",
    acoes:{
      acs:["Orientar e mobilizar pessoas em situação de rua para a testagem","Busca ativa de quem está sem rastreio"],
      enf:["Realizar os 4 testes rápidos (sífilis, HIV, hepatites B e C) e registrar cada um","Organizar ações de testagem itinerantes","Encaminhar casos reagentes para tratamento"],
      med:["Avaliar exames de IST e conduzir tratamento dos casos positivos"],
      tec:["Executar os testes rápidos conforme competência e registrar"],
    }
  },
  {
    cod:"CR4", bloco:"CR", titulo:"Cuidado da Pessoa com Tuberculose (eCR)",
    subtitulo:"Diagnóstico e acompanhamento na população em situação de rua",
    objetivo:"Avalia o acesso e o monitoramento do cuidado integral das pessoas com tuberculose identificadas pelas eCR, incentivando o cuidado coordenado e o acompanhamento contínuo na APS.",
    formula:{ num:"Somatório das boas práticas pontuadas para cada pessoa identificada com tuberculose nas eCR.",
              den:"Nº total de pessoas identificadas com tuberculose nas eCR nos últimos 6 meses." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    praticas:[
      { letra:"A", texto:"Pelo menos 4 consultas presenciais ou remotas por médica(o)/enfermeira(o) nos últimos 6 meses.", pontos:25 },
      { letra:"B", texto:"Pelo menos 1 registro de baciloscopia, solicitada ou avaliada, nos últimos 6 meses.", pontos:25 },
      { letra:"C", texto:"Registro de radiografia de tórax, realizada ou avaliada, nos últimos 6 meses.", pontos:25 },
      { letra:"D", texto:"Registro de teste rápido para HIV, realizado ou exame avaliado, nos últimos 6 meses.", pontos:25 },
    ],
    codigos:{
      cbo:[["2235-05","Enfermeiro"],["2235-65","Enfermeiro da ESF"],["2251/2252/2253","Médicos clínicos, cirúrgicos e diagnóstico/terapêutica"],["2232","Cirurgiões-dentistas"],["3222","Técnicos e auxiliares de enfermagem"],["2515","Psicólogos e Psicanalistas"],["2241-40","Prof. de educação física na saúde"],["2239-05","Terapeuta ocupacional"]],
      cid:"A15; A15.0; A15.1; A15.2; A15.3; A16; A16.0; A16.1; A16.2; A17.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["03.01.01.002-1","Consulta com identificação de casos novos de TB"],["03.01.01.006-4","Consulta médica em atenção primária"],["03.01.04.019-2","Acompanhamento em TDO da tuberculose"],["02.14.01.005-8","Teste rápido para detecção de infecção pelo HIV"],["02.02.08.006-4","Baciloscopia direta p/ BAAR TB (controle)"],["02.02.08.004-8","Baciloscopia direta p/ BAAR TB (diagnóstica)"],["02.04.03.017-0","Radiografia de tórax (PA)"],["02.02.09.036-1","Teste molecular para detecção de TB"],["02.02.08.011-0","Cultura sólida para micobactérias"],["03.01.05.013-9","Busca ativa"],["03.01.04.020-6","Avaliação de contatos de pessoa com TB"],["03.01.01.003-0","Consulta de profissionais de nível superior na atenção primária (exceto médica(o))"],["03.01.01.025-0","Teleconsulta na atenção primária g) Esquema de doses:"],["02.13.01.075-5","Teste de Hibridização de Sonda em Linha de 1ª Linha para Tuberculose (LPA 1ª linha)"],["02.14.01.019-8","Teste rápido LF-LAM para tuberculose"],["02.04.03.015-3","Radiografia de tórax (PA e perfil)"],["02.02.03.150-0","Pesquisa laboratorial de antígenos de hiv e/ou anticorpos anti-HIV-1 ou anti-HIV-2 para população geral (exceto gestante, parceiro ou parceria)"]],
      vacina:[]
    },
    registro:"Denominador considera casos identificados nos últimos 6 meses. Registrar consultas (mínimo 4), baciloscopia, radiografia de tórax e teste de HIV.",
    acoes:{
      acs:["Realizar busca ativa e avaliação de contatos das pessoas com TB","Apoiar o TDO no território e a adesão ao tratamento"],
      enf:["Realizar consultas de acompanhamento da TB (mínimo 4 em 6 meses)","Solicitar baciloscopia e radiografia de tórax","Realizar teste rápido de HIV e registrar","Coordenar o TDO"],
      med:["Consultar e conduzir o tratamento da TB registrando no PEC","Solicitar e avaliar exames diagnósticos e radiografia","Avaliar coinfecção TB-HIV"],
    }
  },

  /* ===================== eSB - Saúde Bucal (B1 .. B6) ===================== */
  {
    cod:"B1", bloco:"B", titulo:"Primeira Consulta Programada",
    subtitulo:"Captação precoce em saúde bucal",
    objetivo:"Avalia o acesso e o monitoramento efetivo da população em relação aos cuidados necessários de saúde bucal, com incentivo à captação precoce e ao acompanhamento coordenado e contínuo na APS.",
    formula:{ num:"Nº total de pessoas com primeira consulta odontológica programada realizada pela eSB, independente da vinculação à eSF/eAP. O usuário é contabilizado uma única vez por dentista no período de 12 meses (a partir da conclusão do tratamento ou da 1ª consulta programada).",
              den:"Nº total de pessoas vinculadas à eSF/eAP de referência da eSB (Nota Técnica nº 30/2025-CGESCO/DESCO/SAPS/MS). Para eSB de 20h vinculadas a 1 eSF, considera-se o total de pessoas vinculadas dividido por 2." },
    metas:{ regular:"≤0,25", suficiente:">0,25 e ≤0,75", bom:">0,75 e ≤1,25", otimo:">1,25" },
    codigos:{
      cbo:[["2232-08","Cirurgião-Dentista Clínico Geral"],["2232-93","Cirurgião-Dentista da ESF"],["2232-72","Cirurgião-Dentista de Saúde Coletiva"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["03.01.01.015-3","Primeira consulta odontológica programada"]],
      vacina:[]
    },
    registro:"Registrar a primeira consulta odontológica programada (03.01.01.015-3). O parâmetro é uma razão (não percentual): meta Ótimo >1,25. O usuário conta uma vez por dentista em 12 meses.",
    acoes:{
      den:["Realizar e registrar a primeira consulta odontológica programada (03.01.01.015-3)","Elaborar o plano preventivo-terapêutico na 1ª consulta","Captar precocemente usuários vinculados que ainda não iniciaram tratamento"],
      tsb:["Organizar a agenda de primeiras consultas programadas","Apoiar o acolhimento e o registro dos usuários"],
      acs:["Identificar e encaminhar usuários sem acompanhamento odontológico","Orientar a comunidade sobre a importância da 1ª consulta programada"],
    }
  },
  {
    cod:"B2", bloco:"B", titulo:"Tratamento Concluído",
    subtitulo:"Resolutividade da eSB",
    objetivo:"Avalia a resolutividade da eSB inserida na APS para garantir acesso oportuno e intervir na demanda que se apresenta a ela.",
    formula:{ num:"Nº total de pessoas com tratamento odontológico concluído pela eSB, previsto no plano preventivo-terapêutico registrado pelo cirurgião-dentista.",
              den:"Nº total de pessoas com primeira consulta odontológica programada realizada pela eSB (usuário contabilizado uma vez por dentista em 12 meses)." },
    metas:{ regular:"≤25", suficiente:">25 e ≤50", bom:">50 e ≤75", otimo:">75 e ≤100" },
    codigos:{
      cbo:[["2232-08","Cirurgião-Dentista Clínico Geral"],["2232-93","Cirurgião-Dentista da ESF"],["2232-72","Cirurgião-Dentista de Saúde Coletiva"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["03.01.01.015-3","Primeira consulta odontológica programada"]],
      vacina:[]
    },
    registro:"Registrar a conclusão do tratamento previsto no plano preventivo-terapêutico. O denominador é a primeira consulta programada (B1); mantenha os dois registros coerentes.",
    acoes:{
      den:["Registrar a conclusão do tratamento no plano preventivo-terapêutico","Concluir os tratamentos iniciados evitando abandono","Reagendar faltosos para finalizar o plano de cuidado"],
      tsb:["Acompanhar a agenda de retornos para conclusão do tratamento","Realizar busca ativa de usuários com tratamento em aberto"],
    }
  },
  {
    cod:"B3", bloco:"B", titulo:"Taxa de Exodontia",
    subtitulo:"Menos extrações, mais prevenção (quanto menor, melhor)",
    objetivo:"Avalia se a eSB tem conseguido agir no início da história da doença, ofertando menos procedimentos curativos/exodontia em relação ao total de procedimentos individuais ofertados pela equipe.",
    invertido:true,
    formula:{ num:"Nº total de exodontias realizadas pelo cirurgião-dentista da eSB.",
              den:"Nº total de procedimentos individuais preventivos, curativos e exodontias realizados pela eSB." },
    metas:{ regular:"<3 ou ≥14", suficiente:"≥12 e <14", bom:"≥10 e <12", otimo:"≥3 e <10" },
    codigos:{
      cbo:[["2232-08","Cirurgião-Dentista Clínico Geral"],["2232-93","Cirurgião-Dentista da ESF"],["2232-72","Cirurgião-Dentista de Saúde Coletiva"],["3224-05","Técnico em Saúde Bucal"],["3224-25","TSB da ESF"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["04.14.02.013-8","Exodontia de dente permanente (numerador)"],["04.14.02.014-6","Exodontia múltipla c/ alveoloplastia por sextante (numerador)"],["01.01.02.005-8","Aplicação de cariostático (denominador)"],["01.01.02.006-6","Aplicação de selante (denominador)"],["01.01.02.007-4","Aplicação tópica de flúor (denominador)"],["03.07.01.007-4","Tratamento restaurador atraumático - TRA/ART (denominador)"],["03.07.03.004-0","Profilaxia/remoção de placa bacteriana (denominador)"],["01.01.02.008-2","Evidenciação de placa bacteriana"],["01.01.02.009-0","Selamento provisório de cavidade dentária"],["01.01.02.012-0","Orientação de higienização de próteses dentárias"],["03.07.01.001-5","Capeamento pulpar"],["03.07.01.003-1","Restauração de dente permanente anterior com resina composta"],["03.07.01.006-6","Tratamento inicial do dente traumatizado"],["03.07.01.008-2","Restauração de dente decíduo posterior com resina composta"],["03.07.01.010-4","Restauração de dente decíduo posterior com ionômero de vidro"],["03.07.01.011-2","Restauração de dente decíduo anterior com resina composta"],["03.07.01.012-0","Restauração de dente permanente posterior com resina composta"],["03.07.02.001-0","Acesso à polpa dentária e medicação (por dente)"],["03.07.02.002-9","Curativo de demora c/ ou s/ preparo biomecanico"],["03.07.02.007-0","Pulpotomia dentária"],["03.07.03.002-4","Raspagem e alisamento subgengivais (por sextante)"],["03.07.03.005-9","Raspagem, alisamento e polimento supragengivais (por sextante)"],["03.07.03.006-7","Tratamento de gengivite ulcerativa necrosante aguda (guna)"],["03.07.03.007-5","Tratamento de lesões da mucosa oral"],["03.07.03.008-3","Tratamento de pericoronarite"],["03.07.05.001-7","Fotobiomodulação a laser de baixa potência para o tratamento da mucosite oral"]],
      vacina:[]
    },
    registro:"Indicador INVERTIDO: quanto menor a taxa, melhor (Ótimo ≥3 e <10). Registre corretamente exodontias (numerador) e todos os procedimentos preventivos/curativos (denominador) para não distorcer a taxa.",
    acoes:{
      den:["Priorizar tratamentos conservadores (restaurações, TRA) em vez de extrações","Registrar corretamente todos os procedimentos preventivos e curativos","Agir precocemente na cárie para reduzir a necessidade de exodontia"],
      tsb:["Realizar e registrar procedimentos preventivos (selante, flúor, profilaxia)","Reforçar orientação de higiene para reduzir agravos"],
    }
  },
  {
    cod:"B4", bloco:"B", titulo:"Escovação Supervisionada",
    subtitulo:"Ação coletiva para crianças de 6 a 12 anos",
    objetivo:"Avalia a proporção de crianças de 6 a 12 anos beneficiadas pela ação coletiva de escovação dental supervisionada pela eSB.",
    formula:{ num:"Crianças de 6 a 12 anos participantes da ação coletiva de escovação dental supervisionada pela eSB, independente da vinculação à eSF/eAP.",
              den:"Nº total de crianças de 6 a 12 anos vinculadas à eSF/eAP de referência da eSB (Nota Técnica nº 30/2025). Para eSB de 20h vinculadas a 1 eSF, considera-se o total dividido por 2." },
    metas:{ regular:"≤0,25", suficiente:">0,25 e ≤0,5", bom:">0,5 e ≤1", otimo:">1" },
    codigos:{
      cbo:[["2232-08","Cirurgião-Dentista Clínico Geral"],["2232-93","Cirurgião-Dentista da ESF"],["2232-72","Cirurgião-Dentista de Saúde Coletiva"],["3224-05","Técnico em Saúde Bucal"],["3224-25","TSB da ESF"],["3224-15","Auxiliar em Saúde Bucal"],["3224-30","ASB da ESF"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["01.01.02.003-1","Ação coletiva de escovação dental supervisionada"]],
      vacina:[]
    },
    registro:"Registrar a ação coletiva de escovação dental supervisionada (01.01.02.003-1) para cada criança de 6 a 12 anos. O parâmetro é uma razão: meta Ótimo >1.",
    acoes:{
      den:["Planejar e conduzir as ações coletivas de escovação supervisionada","Registrar cada criança participante (6-12 anos)"],
      tsb:["Realizar a escovação supervisionada em escolas e na UBS","Registrar a ação coletiva (01.01.02.003-1) no e-SUS"],
      acs:["Mobilizar crianças de 6-12 anos e famílias para as ações coletivas","Articular ações em escolas do território"],
    }
  },
  {
    cod:"B5", bloco:"B", titulo:"Procedimentos Odontológicos Preventivos",
    subtitulo:"Proporção de prevenção sobre o total de procedimentos",
    objetivo:"Mensura o total de procedimentos odontológicos individuais preventivos em relação ao total de procedimentos odontológicos individuais realizados pela eSB.",
    formula:{ num:"Nº total de procedimentos odontológicos preventivos individuais realizados pela eSB.",
              den:"Nº total de procedimentos odontológicos individuais realizados pela eSB." },
    metas:{ regular:"<40 ou >85", suficiente:"≥40 e <55", bom:"≥55 e <65", otimo:"≥65 e ≤85" },
    codigos:{
      cbo:[["2232-08","Cirurgião-Dentista Clínico Geral"],["2232-93","Cirurgião-Dentista da ESF"],["2232-72","Cirurgião-Dentista de Saúde Coletiva"],["3224-05","Técnico em Saúde Bucal"],["3224-25","TSB da ESF"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["01.01.02.005-8","Aplicação de cariostático (preventivo)"],["01.01.02.006-6","Aplicação de selante (preventivo)"],["01.01.02.007-4","Aplicação tópica de flúor (preventivo)"],["01.01.02.008-2","Evidenciação de placa bacteriana (preventivo)"],["01.01.02.010-4","Orientação de higiene bucal (preventivo)"],["03.07.03.004-0","Profilaxia/remoção da placa bacteriana (preventivo)"],["04.14.02.013-8","Exodontia de dente permanente (denominador)"],["03.07.01.007-4","TRA/ART (denominador)"],["01.01.02.012-0","Orientação de higienização de próteses dentárias"],["01.01.02.009-0","Selamento provisório de cavidade dentária"],["03.07.01.001-5","Capeamento pulpar"],["03.07.01.003-1","Restauração de dente permanente anterior com resina composta"],["03.07.01.006-6","Tratamento inicial do dente traumatizado"],["03.07.01.008-2","Restauração de dente decíduo posterior com resina composta"],["03.07.01.010-4","Restauração de dente decíduo posterior com ionômero de vidro"],["03.07.01.011-2","Restauração de dente decíduo anterior com resina composta"],["03.07.01.012-0","Restauração de dente permanente posterior com resina composta"],["03.07.01.015-5","Adequação do comportamento de crianças"],["03.07.02.001-0","Acesso à polpa dentária e medicação (por dente)"],["03.07.02.002-9","Curativo de demora c/ ou s/ preparo biomecanico"],["03.07.02.007-0","Pulpotomia dentária"],["03.07.03.002-4","Raspagem e alisamento subgengivais (por sextante)"],["03.07.03.005-9","Raspagem, alisamento e polimento supragengivais (por sextante)"],["03.07.03.006-7","Tratamento de gengivite ulcerativa necrosante aguda (guna)"],["03.07.03.007-5","Tratamento de lesões da mucosa oral"],["03.07.03.008-3","Tratamento de pericoronarite"],["03.07.05.001-7","Fotobiomodulação a laser de baixa potência para o tratamento da mucosite oral"]],
      vacina:[]
    },
    registro:"Faixa ótima entre ≥65 e ≤85 (nem baixo demais, nem excessivo). Registre corretamente os procedimentos preventivos (numerador) e todos os individuais (denominador).",
    acoes:{
      den:["Equilibrar procedimentos preventivos e curativos no plano de cuidado","Registrar corretamente todos os procedimentos individuais realizados"],
      tsb:["Realizar e registrar procedimentos preventivos (selante, flúor, profilaxia, orientação)","Manter proporção adequada de prevenção na agenda"],
    }
  },
  {
    cod:"B6", bloco:"B", titulo:"Tratamento Restaurador Atraumático (ART)",
    subtitulo:"Proporção de ART sobre o total de restaurações",
    objetivo:"Mede a proporção de procedimentos de Tratamento Restaurador Atraumático (ART) em relação ao total de procedimentos restauradores realizados pela eSB.",
    formula:{ num:"Nº total de procedimentos 'Tratamento Restaurador Atraumático' realizados pela eSB.",
              den:"Nº total de procedimentos restauradores realizados pela eSB." },
    metas:{ regular:"≤3", suficiente:">3 e ≤6", bom:">6 e ≤8", otimo:">8" },
    codigos:{
      cbo:[["2232-08","Cirurgião-Dentista Clínico Geral"],["2232-93","Cirurgião-Dentista da ESF"],["2232-72","Cirurgião-Dentista de Saúde Coletiva"]],
      cid:"Não se aplicam regras específicas de CID-10.",
      ciap:"Não se aplicam regras específicas de CIAP-2.",
      proc:[["03.07.01.007-4","Tratamento restaurador atraumático - TRA/ART (numerador)"],["03.07.01.003-1","Restauração dente permanente anterior c/ resina (denominador)"],["03.07.01.008-2","Restauração dente decíduo posterior c/ resina (denominador)"],["03.07.01.010-4","Restauração dente decíduo posterior c/ ionômero (denominador)"],["03.07.01.011-2","Restauração dente decíduo anterior c/ resina (denominador)"],["03.07.01.012-0","Restauração dente permanente posterior c/ resina (denominador)"]],
      vacina:[]
    },
    registro:"Registrar o ART (03.07.01.007-4) no numerador e todas as restaurações no denominador. Meta Ótimo >8.",
    acoes:{
      den:["Empregar a técnica ART quando indicada e registrar corretamente","Registrar todas as restaurações para manter a proporção fiel"],
      tsb:["Apoiar a realização do ART conforme competência","Organizar materiais e insumos para a técnica atraumática"],
    }
  },
];
