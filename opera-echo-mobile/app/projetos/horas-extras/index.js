/* ARQUIVO: app/projetos/horas-extras/index.js
   Wrapper do módulo PROJETOS. Força o contexto de módulo na tela
   compartilhada, independentemente dos params de navegação.
   Consome /projetos/hora-extra/* (tab_proj_hora_extra_*), isolado por lotação. */
import React from 'react';
import HorasExtras from '../../horas-extras/index';
import { MODULO } from '../../../src/escopo';

export default function ProjetosHorasExtras() {
  return <HorasExtras modulo={MODULO.PROJETOS} />;
}