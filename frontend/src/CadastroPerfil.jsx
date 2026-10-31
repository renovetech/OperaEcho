/* ARQUIVO: src/CadastroPerfil.js */
import React, { useState, useEffect } from 'react';
import Icon from './components/Icon';
import api from './api';
import './CadastroPerfil.css';
import Swal from 'sweetalert2';

function CadastroPerfil({ aoVoltar }) {
  
  const modulosDoSistema = [
    // --- GRUPO CADASTROS ---
    { key: 'usuarios', label: 'Cadastro de Usuários', categoria: 'Cadastros', temNovo: true, temEditar: true },
    { key: 'produtos', label: 'Cadastro de Produtos', categoria: 'Cadastros', temNovo: true, temEditar: true },
    { key: 'projetos', label: 'Cadastro de Projetos', categoria: 'Cadastros', temNovo: true, temEditar: true },
    { key: 'unidades', label: 'Cadastro de Unidades', categoria: 'Cadastros', temNovo: true, temEditar: true },
    { key: 'regioes', label: 'Macro e Micro Regiões', categoria: 'Cadastros', temNovo: true, temEditar: true },
    { key: 'perfis', label: 'Perfis de Acesso', categoria: 'Cadastros', temNovo: false, temEditar: true },

    // --- GRUPO IMPLANTAÇÃO ---
    { key: 'registro_atividades', label: 'Registro de Atividades', categoria: 'Implantação', temNovo: true, temEditar: true },
    { key: 'hora_extra', label: 'Lançar Hora Extra', categoria: 'Implantação', temNovo: true, temEditar: true },
    { key: 'escala', label: 'Gerador de Escalas', categoria: 'Implantação', temNovo: false, temEditar: true },
    { key: 'painel_consolidado', label: 'Painel: Implantações Consolidadas', categoria: 'Implantação', temNovo: false, temEditar: false },
    { key: 'painel_prod_ind', label: 'Painel: Produtividade Individual', categoria: 'Implantação', temNovo: false, temEditar: false },
    { key: 'painel_prod_uni', label: 'Painel: Produtividade por Unidade', categoria: 'Implantação', temNovo: false, temEditar: false },
    { key: 'painel_metricas', label: 'Painel: Métricas da Implantação', categoria: 'Implantação', temNovo: false, temEditar: false },
    { key: 'painel_plano_acao', label: 'Painel: Plano de Ação', categoria: 'Operacional', temNovo: false, temEditar: false },

    // Submenu Operações > Projetos (telas isoladas por lotação)
    { key: 'proj_registro_atividades', label: 'Registro de Atividades', categoria: 'Projetos', temNovo: true, temEditar: true },
    { key: 'proj_hora_extra', label: 'Lançar Hora Extra', categoria: 'Projetos', temNovo: true, temEditar: true },
    { key: 'proj_escala', label: 'Gerador de Escalas', categoria: 'Projetos', temNovo: false, temEditar: true },

    // --- GRUPO OPERACIONAL ---
    { key: 'plano_acao', label: 'Plano de Ação', categoria: 'Operacional', temNovo: true, temEditar: true },
    { key: 'links_externos', label: 'Links Externos', categoria: 'Operacional', temNovo: true, temEditar: true },
    { key: 'sigtap', label: 'Consulta SIGTAP', categoria: 'Operacional', temNovo: false, temEditar: false },
    { key: 'faturamento_lancar', label: 'Lançar Faturamento', categoria: 'Operacional', temNovo: true, temEditar: true },
    { key: 'painel_faturamento', label: 'Painel: Faturamento Consolidado', categoria: 'Operacional', temNovo: false, temEditar: false },

    // --- GRUPO FÉRIAS ---
    { key: 'ferias_solicitacao', label: 'Solicitação de Férias (Implantação)', categoria: 'Férias', temNovo: true, temEditar: false },
    { key: 'proj_ferias_solicitacao', label: 'Solicitação de Férias (Projetos)', categoria: 'Férias', temNovo: true, temEditar: false },
    { key: 'ferias_gestao', label: 'Aprovação de Férias', categoria: 'Férias', temNovo: false, temEditar: true },

    // --- GRUPO RELATÓRIOS ---
    { key: 'rel_estatisticas', label: 'Estatísticas da Atividade', categoria: 'Relatórios', temNovo: false, temEditar: false },
    { key: 'rel_estatisticas_projetos', label: 'Estatística dos Projetos', categoria: 'Relatórios', temNovo: false, temEditar: false },
    { key: 'rel_auditoria_loc', label: 'Auditoria de Localização', categoria: 'Relatórios', temNovo: false, temEditar: false },
    { key: 'rel_presenca_implantador', label: 'Presença por Implantador', categoria: 'Relatórios', temNovo: false, temEditar: false },
    { key: 'rel_presenca_equipe', label: 'Presença por Equipe', categoria: 'Relatórios', temNovo: false, temEditar: false },
    { key: 'rel_tempo_medio', label: 'Tempo Médio de Ação', categoria: 'Relatórios', temNovo: false, temEditar: false },
    { key: 'rel_plano_acao', label: 'Plano de Ação - Status e Execução', categoria: 'Relatórios', temNovo: false, temEditar: false },
    { key: 'rel_projetos_ativos', label: 'Projetos Ativos', categoria: 'Relatórios', temNovo: false, temEditar: false },
    { key: 'rel_mapa_unidades', label: 'Mapa de Unidades', categoria: 'Relatórios', temNovo: false, temEditar: false },

    // --- GRUPO SISTEMA / OUTROS ---
    { key: 'parametros', label: 'Parâmetros do Sistema', categoria: 'Sistema', temNovo: false, temEditar: true },
    { key: 'notificacoes_acesso', label: 'Aprovar Acessos (Notificações)', categoria: 'Sistema', temNovo: false, temEditar: true } 
  ];

  const [perfilSelecionado, setPerfilSelecionado] = useState('Administrador');
  const [regras, setRegras] = useState({});
  const [loading, setLoading] = useState(false);
  const [listaPerfis, setListaPerfis] = useState([]); 

  useEffect(() => {
    carregarPerfisDB();
  }, []);

  useEffect(() => {
    carregarRegras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilSelecionado]);

  const carregarPerfisDB = async () => {
    try {
      const res = await api.get('/perfis');
      if (res.data && Array.isArray(res.data)) {
        setListaPerfis(res.data.map(p => ({ id: p.id_perfil, nome: p.nome_perfil })));
      } else {
        throw new Error("Formato de dados inválido");
      }
    } catch (error) {
      console.error("Erro ao carregar perfis da tabela:", error);
      setListaPerfis([
        { id: 1, nome: 'Administrador' },
        { id: 2, nome: 'Assistente' },
        { id: 3, nome: 'Gestor' },
        { id: 4, nome: 'Implantador' },
        { id: 5, nome: 'Líder de Projeto' },
        { id: 6, nome: 'Operador de Sistemas' }
      ]);
    }
  };

  const carregarRegras = async () => {
    setLoading(true);
    try {
      const regrasIniciais = {};
      modulosDoSistema.forEach(m => {
        regrasIniciais[m.key] = { pode_acessar: false, pode_novo: false, pode_editar: false };
      });

      const res = await api.get(`/regras/${perfilSelecionado}`);
      
      if (res.data && res.data.length > 0) {
        res.data.forEach(r => {
          if (regrasIniciais[r.nome_modulo]) {
            regrasIniciais[r.nome_modulo] = {
              pode_acessar: r.pode_acessar,
              pode_novo: r.pode_novo,
              pode_editar: r.pode_editar
            };
          }
        });
      }
      setRegras(regrasIniciais);
    } catch (error) {
      console.error("Erro ao carregar regras:", error);
      Swal.fire('Erro', 'Não foi possível carregar as permissões.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = (modulo, campo) => {
    setRegras(prev => {
      const novoEstadoModulo = { ...prev[modulo] };
      novoEstadoModulo[campo] = !novoEstadoModulo[campo];

      if ((campo === 'pode_novo' || campo === 'pode_editar') && novoEstadoModulo[campo]) {
        novoEstadoModulo.pode_acessar = true;
      }
      if (campo === 'pode_acessar' && !novoEstadoModulo.pode_acessar) {
        novoEstadoModulo.pode_novo = false;
        novoEstadoModulo.pode_editar = false;
      }

      return { ...prev, [modulo]: novoEstadoModulo };
    });
  };

  const handleSalvar = async () => {
    const arrayRegras = Object.keys(regras).map(key => ({
      modulo: key,
      pode_acessar: regras[key].pode_acessar,
      pode_novo: regras[key].pode_novo,
      // A CORREÇÃO FOI APLICADA NA LINHA ABAIXO
      pode_editar: regras[key].pode_editar
    }));

    try {
      await api.post('/regras/salvar', {
        perfil: perfilSelecionado,
        regras: arrayRegras
      });
      Swal.fire({
        title: 'Sucesso!',
        text: `Permissões de ${perfilSelecionado} atualizadas.`,
        icon: 'success',
        confirmButtonColor: '#4f46e5'
      });
    } catch (error) {
      console.error(error);
      Swal.fire('Erro', 'Falha ao salvar as permissões.', 'error');
    }
  };

  let ultimaCategoria = '';

  return (
    <div className="cadastro-container fadeIn">
      
      <div className="page-header">
        <div className="header-title">
            <h2><Icon n="lock"/> Gestão de Acessos</h2>
        </div>
        <button onClick={aoVoltar} className="btn-voltar">
            <Icon n="arrow-left"/> Voltar
        </button>
      </div>

      <div className="card-selecao">
        <div className="input-group">
            <label>Perfil Selecionado</label>
            <div className="select-wrapper">
                <select 
                    value={perfilSelecionado} 
                    onChange={(e) => setPerfilSelecionado(e.target.value)}
                    className="select-perfil"
                    disabled={loading}
                >
                    {listaPerfis.map(p => (
                        <option key={p.id} value={p.nome}>
                            {p.nome}
                        </option>
                    ))}
                </select>
            </div>
        </div>
      </div>

      <div className={`tabela-container ${loading ? 'loading-opacity' : ''}`}>
        <table className="tabela-permissoes">
            <thead>
                <tr>
                    <th className="col-modulo">Módulo / Funcionalidade</th>
                    <th className="center col-acao">Acesso</th>
                    <th className="center col-acao">Novo</th>
                    <th className="center col-acao">Editar / Excluir</th>
                </tr>
            </thead>
            <tbody>
                {modulosDoSistema.map(mod => {
                    const mostrarCategoria = mod.categoria !== ultimaCategoria;
                    ultimaCategoria = mod.categoria;

                    return (
                        <React.Fragment key={mod.key}>
                            {mostrarCategoria && (
                                <tr className="linha-categoria">
                                    <td colSpan="4">{mod.categoria}</td>
                                </tr>
                            )}
                            <tr className={`linha-dados ${regras[mod.key]?.pode_acessar ? 'linha-ativa' : ''}`}>
                                <td className="nome-modulo">
                                    <span className="bullet-point"></span>
                                    {mod.label}
                                </td>
                                
                                <td className="center">
                                    <label className="switch">
                                        <input 
                                            type="checkbox" 
                                            checked={regras[mod.key]?.pode_acessar || false}
                                            onChange={() => handleCheck(mod.key, 'pode_acessar')}
                                        />
                                        <span className="slider"></span>
                                    </label>
                                </td>

                                <td className="center">
                                    {mod.temNovo ? (
                                        <label className="checkbox-custom">
                                            <input 
                                                type="checkbox" 
                                                checked={regras[mod.key]?.pode_novo || false}
                                                onChange={() => handleCheck(mod.key, 'pode_novo')}
                                                disabled={!regras[mod.key]?.pode_acessar} 
                                            />
                                            <span className="checkmark"></span>
                                        </label>
                                    ) : <span className="dash-disabled">•</span>}
                                </td>

                                <td className="center">
                                    {mod.temEditar ? (
                                        <label className="checkbox-custom">
                                            <input 
                                                type="checkbox" 
                                                checked={regras[mod.key]?.pode_editar || false}
                                                onChange={() => handleCheck(mod.key, 'pode_editar')}
                                                disabled={!regras[mod.key]?.pode_acessar}
                                            />
                                            <span className="checkmark"></span>
                                        </label>
                                    ) : <span className="dash-disabled">•</span>}
                                </td>
                            </tr>
                        </React.Fragment>
                    );
                })}
            </tbody>
        </table>
      </div>

      <div className="rodape-salvar">
        <button onClick={handleSalvar} className="btn-salvar">
            Salvar Alterações
        </button>
      </div>
    </div>
  );
}

export default CadastroPerfil;