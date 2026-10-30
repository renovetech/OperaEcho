/* ARQUIVO: app/projetos/atividades/cadastro.js
   Wrapper do módulo PROJETOS. Força o contexto de módulo na tela
   compartilhada, independentemente dos params de navegação. */
import React from 'react';
import CadastroAtividade from '../../atividades/cadastro';
import { MODULO } from '../../../src/escopo';

export default function ProjetosCadastroAtividade() {
  return <CadastroAtividade modulo={MODULO.PROJETOS} />;
}