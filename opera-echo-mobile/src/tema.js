/* ARQUIVO: src/tema.js
   Tokens de design do aplicativo. Fonte única de cores, espaçamentos, raios,
   sombras e tipografia - qualquer ajuste visual global se faz aqui.
   Padrão dos sistemas Renove: telas sem fundo nem caixas, Arial e filete de destaque. */

import { Platform } from 'react-native';

export const fonte = Platform.select({ ios: 'Arial', android: 'sans-serif', default: 'Arial, Helvetica, sans-serif' });

export const cores = {
    // Marca
    primaria: '#2E8B57',
    primariaEscura: '#1A5D3A',
    primariaClara: '#E8F5ED',
    destaque: '#C7A96A',

    // Módulos (mantém a identidade de cada tela)
    atividades: '#2E8B57',
    escalas: '#7B2FBE',
    escalasClara: '#F3E8FB',
    ferias: '#1565C0',
    feriasClara: '#E3F2FD',
    horas: '#E06C00',
    horasClara: '#FFF3E0',
    sigtap: '#00796B',
    sigtapClara: '#E0F2F1',

    // Superfícies
    fundo: '#FFFFFF',
    superficie: '#FFFFFF',
    superficieAlt: '#F7F9FB',
    borda: '#E6EAF0',
    bordaForte: '#D3DAE4',

    // Texto
    texto: '#131A22',
    textoMedio: '#5A6675',
    textoFraco: '#8B95A3',
    textoInverso: '#FFFFFF',

    // Semânticas
    sucesso: '#17864B',
    sucessoClara: '#E6F5EC',
    alerta: '#C77700',
    alertaClara: '#FFF6E5',
    erro: '#C62828',
    erroClara: '#FDECEC',
    info: '#0F6FCF',
    infoClara: '#E7F1FC',

    overlay: 'rgba(11, 18, 27, 0.55)'
};

export const espaco = {
    xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 36
};

export const raio = {
    sm: 10, md: 14, lg: 20, xl: 28, pill: 999
};

export const tipo = {
    titulo:    { fontFamily: fonte, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
    subtitulo: { fontFamily: fonte, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
    corpo:     { fontFamily: fonte, fontSize: 15, fontWeight: '500' },
    corpoForte:{ fontFamily: fonte, fontSize: 15, fontWeight: '700' },
    legenda:   { fontFamily: fonte, fontSize: 13, fontWeight: '500' },
    micro:     { fontFamily: fonte, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }
};

/* Sombras suaves e consistentes (iOS + Android). */
export const sombra = {
    nenhuma: {},
    leve: {
        shadowColor: '#0B121B', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
    },
    media: {
        shadowColor: '#0B121B', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08, shadowRadius: 16, elevation: 5
    },
    forte: {
        shadowColor: '#0B121B', shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.14, shadowRadius: 24, elevation: 12
    }
};

/* Alturas mínimas de toque - alvos maiores, mais confortáveis. */
export const toque = {
    minimo: 48,
    botao: 54,
    campo: 54,
    item: 60
};

export default { cores, espaco, raio, tipo, sombra, toque };
