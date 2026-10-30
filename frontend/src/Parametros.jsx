/* ARQUIVO: src/Parametros.js
 * Menu PARÂMETROS - regras gerais do sistema, divididas por módulo
 * (Implantação / Projetos). As telas e o app leem /parametros e o servidor
 * aplica a mesma regra ao gravar.
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useMemo } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';
import './Parametros.css';
import SigtapImportacao from './SigtapImportacao';
import ParametrosWhatsapp from './ParametrosWhatsapp';

// Catálogo dos parâmetros exibidos (novos parâmetros entram aqui + utils/parametros.js no backend).
// Cada módulo tem as suas chaves (sufixo _implantacao / _projetos): regras independentes.
const ITENS_REGISTRO = (sufixo) => [
    {
        chave: `anexo_obrigatorio_${sufixo}`,
        titulo: 'Anexo obrigatório no Registro de Atividades',
        ajuda: 'Ligado: exige ao menos um anexo (exceto "Apoio ao Projeto"). Desligado: o anexo fica opcional em qualquer motivo da visita.'
    },
    {
        chave: `horas_obrigatorias_${sufixo}`,
        titulo: 'Horas trabalhadas (Tempo Gasto) obrigatórias',
        ajuda: 'Ligado: o Tempo Gasto (hh:mm) deve ser informado em todo lançamento. Desligado: fica opcional - quando informado, continua validado no formato hh:mm.'
    },
    {
        chave: `equipe_apoio_obrigatoria_${sufixo}`,
        titulo: 'Equipe do Projeto obrigatória no "Apoio ao Projeto"',
        ajuda: 'Ligado: ao marcar "Apoio ao Projeto" é preciso incluir ao menos um profissional na Equipe do Projeto. Desligado: a equipe fica opcional.'
    }
];
const CATALOGO = [
    { modulo: 'implantacao', titulo: 'Implantação', icone: 'build', itens: ITENS_REGISTRO('implantacao') },
    { modulo: 'projetos', titulo: 'Projetos', icone: 'folder', itens: ITENS_REGISTRO('projetos') },
    // Aba especial: importação da Tabela Unificada (base da Operações > Consulta SIGTAP)
    { modulo: 'sigtap', titulo: 'SIGTAP', icone: 'stethoscope', itens: [] },
    // Aba especial: integração WhatsApp (Evolution API) e mensagens automáticas
    { modulo: 'whatsapp', titulo: 'WhatsApp', icone: 'bell', itens: [] }
];

const ligado = (v) => v === '1' || v === 'true' || v === true;

export default function Parametros({ aoVoltar, abaInicial }) {
    const [aba, setAba] = useState(abaInicial || 'implantacao');
    const [valores, setValores] = useState({});
    const [originais, setOriginais] = useState({});
    const [auditoria, setAuditoria] = useState({});
    const [podeEditar, setPodeEditar] = useState(false);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        const usuario = (() => { try { return JSON.parse(sessionStorage.getItem('usuario_opera')) || {}; } catch (e) { return {}; } })();
        if (usuario.perfil_acesso === 'Administrador') setPodeEditar(true);
        else if (usuario.perfil_acesso) {
            api.get(`/regras/${usuario.perfil_acesso}`)
                .then(r => setPodeEditar(!!(r.data || []).find(x => x.nome_modulo === 'parametros')?.pode_editar))
                .catch(() => setPodeEditar(false));
        }
        carregar();
    }, []);

    const carregar = async () => {
        try {
            const r = await api.get('/parametros/detalhes');
            const v = {}, a = {};
            (r.data || []).forEach(p => { v[p.chave] = ligado(p.valor); a[p.chave] = p; });
            setValores(v); setOriginais(v); setAuditoria(a);
        } catch (e) {
            Swal.fire('Erro', e.response?.data?.erro || 'Não foi possível carregar os parâmetros.', 'error');
        }
    };

    const alterados = useMemo(() => Object.keys(valores).filter(k => valores[k] !== originais[k]), [valores, originais]);

    const salvar = async () => {
        if (!alterados.length) return;
        setSalvando(true);
        try {
            await api.post('/parametros/salvar', { parametros: alterados.map(chave => ({ chave, valor: valores[chave] })) });
            Swal.fire({ icon: 'success', title: 'Salvo!', text: 'Parâmetros atualizados.', timer: 1500, showConfirmButton: false });
            carregar();
        } catch (e) {
            Swal.fire('Erro', e.response?.data?.erro || 'Não foi possível salvar.', 'error');
        } finally { setSalvando(false); }
    };

    const grupo = CATALOGO.find(g => g.modulo === aba);

    return (
        <div className="cadastro-container">
            <div className="page-header">
                <div className="header-title">
                    <span className="icon"><Icon n="settings" /></span><h2>Parâmetros do Sistema</h2>
                </div>
                <div>
                    {CATALOGO.map(g => (
                        <button key={g.modulo} className={`btn-tab ${aba === g.modulo ? 'ativo' : ''}`} onClick={() => setAba(g.modulo)}>
                            <Icon n={g.icone} /> {g.titulo}
                        </button>
                    ))}
                    <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
                </div>
            </div>

            {aba === 'whatsapp' ? (
                <ParametrosWhatsapp podeEditar={podeEditar} />
            ) : aba === 'sigtap' ? (
                <div className="form-card">
                    <h3>Importação SIGTAP</h3>
                    <SigtapImportacao podeEditar={podeEditar} />
                </div>
            ) : (
            <div className="form-card">
                <h3>{grupo.titulo}</h3>

                {grupo.itens.map(p => {
                    const on = !!valores[p.chave];
                    const aud = auditoria[p.chave];
                    return (
                        <div key={p.chave} className={`par-item ${on ? 'on' : ''}`}>
                            <div className="par-texto">
                                <strong>{p.titulo}</strong>
                                <p>{p.ajuda}</p>
                                {aud?.data_alteracao && <small>Última alteração: {aud.data_alteracao}{aud.usuario_alteracao ? ` · ${aud.usuario_alteracao}` : ''}</small>}
                            </div>
                            <label className={`par-switch ${!podeEditar ? 'bloqueado' : ''}`} title={podeEditar ? '' : 'Sem permissão para editar'}>
                                <input type="checkbox" checked={on} disabled={!podeEditar}
                                    onChange={e => setValores(prev => ({ ...prev, [p.chave]: e.target.checked }))} />
                                <span className="par-trilho"><span className="par-bola" /></span>
                                <span className="par-estado">{on ? 'Obrigatório' : 'Opcional'}</span>
                            </label>
                        </div>
                    );
                })}

                <div className="form-actions">
                    {podeEditar ? (
                        <button className="btn-salvar" onClick={salvar} disabled={!alterados.length || salvando}>
                            {salvando ? 'Salvando...' : alterados.length ? `Salvar (${alterados.length})` : 'Salvar'}
                        </button>
                    ) : <span style={{ color: '#999', fontStyle: 'italic' }}>Somente leitura.</span>}
                </div>
            </div>
            )}
        </div>
    );
}
