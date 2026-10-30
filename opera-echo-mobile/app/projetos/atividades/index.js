/* ARQUIVO: app/projetos/atividades/index.js
   Wrapper do módulo PROJETOS. Força o contexto de módulo na tela
   compartilhada, independentemente dos params de navegação. */
import React from 'react';
import ListaAtividades from '../../atividades/index';
import { MODULO } from '../../../src/escopo';

export default function ProjetosAtividades() {
  return <ListaAtividades modulo={MODULO.PROJETOS} />;
}