/* ARQUIVO: app/projetos/escalas/index.js
   Wrapper do módulo PROJETOS. Força o contexto de módulo na tela
   compartilhada, independentemente dos params de navegação.
   Consome /projetos/escalas (tab_proj_escalas), isolado por lotação. */
import React from 'react';
import MinhaEscala from '../../escalas/index';
import { MODULO } from '../../../src/escopo';

export default function ProjetosEscalas() {
  return <MinhaEscala modulo={MODULO.PROJETOS} />;
}