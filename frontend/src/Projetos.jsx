/* ARQUIVO: src/Projetos.js
   Submenu OPERAÇÕES > PROJETOS.
   Telas isoladas por lotação: Registro de Atividades, Lançar Hora Extra,
   Gerador de Escalas. O usuário escolhe a lotação (quando tem mais de uma)
   e a tela opera travada naquela lotação. O isolamento real é garantido
   pelo backend (middleware de escopo). */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from './api';
import './Projetos.css';

import RegistroAtividades from './RegistroAtividades';
import LancamentoHoraExtra from './LancamentoHoraExtra';
import GeradorEscalas from './GeradorEscalas';
import RegistroFerias from './RegistroFerias';

// Mapeamento das telas com a respectiva chave de permissão (módulo) cadastrada no banco
const TELAS = {
    proj_registro: { titulo: 'Registro de Atividades', icone: '', Comp: RegistroAtividades, modulo: 'proj_registro_atividades' },
    proj_hora:     { titulo: 'Lançar Hora Extra',      icone: '', Comp: LancamentoHoraExtra, modulo: 'proj_hora_extra' },
    proj_escala:   { titulo: 'Gerador de Escalas',     icone: '', Comp: GeradorEscalas, modulo: 'proj_escala' },
    proj_ferias:   { titulo: 'Solicitação de Férias',  icone: '', Comp: RegistroFerias, modulo: 'proj_ferias_solicitacao' },
};

export default function Projetos({ tela = 'proj_registro', aoVoltar, lotacaoSel, setLotacaoSel }) {
    const [lotacoes, setLotacoes] = useState([]);
    const [global, setGlobal] = useState(false);
    const [carregando, setCarregando] = useState(true);

    // --- Lógica de Permissões Isoladas ---
    const usuarioLogado = useMemo(() => {
        try { return JSON.parse(sessionStorage.getItem('usuario_opera')) || null; } catch (e) { return null; }
    }, []);
    const isAdmin = usuarioLogado?.usuario === 'admin' || usuarioLogado?.perfil_acesso === 'Administrador';
    
    const [permissaoNovo, setPermissaoNovo] = useState(isAdmin);
    const [permissaoEditar, setPermissaoEditar] = useState(isAdmin);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const r = await api.get('/projetos/minhas-lotacoes');
            const lista = r.data?.lotacoes || [];
            setLotacoes(lista);
            setGlobal(!!r.data?.global);
            // Auto-seleciona quando há exatamente uma lotação
            if (!lotacaoSel && lista.length === 1) {
                setLotacaoSel(String(lista[0].id_projeto));
            }
        } catch (e) {
            setLotacoes([]);
        } finally {
            setCarregando(false);
        }
    }, [lotacaoSel, setLotacaoSel]);

    useEffect(() => { carregar(); }, [carregar]);

    // Busca das permissões específicas para a tela renderizada
    useEffect(() => {
        const carregarPermissoes = async () => {
            if (isAdmin) { setPermissaoNovo(true); setPermissaoEditar(true); return; }
            if (usuarioLogado && usuarioLogado.perfil_acesso) {
                try {
                    const res = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                    const moduloAtual = TELAS[tela]?.modulo;
                    const regra = res.data.find(r => r.nome_modulo === moduloAtual);
                    
                    if (regra) {
                        setPermissaoNovo(regra.pode_novo);
                        setPermissaoEditar(regra.pode_editar);
                    } else {
                        setPermissaoNovo(false);
                        setPermissaoEditar(false);
                    }
                } catch (error) {
                    console.error("Erro ao carregar permissões", error);
                }
            }
        };
        carregarPermissoes();
    }, [tela, isAdmin, usuarioLogado]);

    const cfg = TELAS[tela] || TELAS.proj_registro;
    const Comp = cfg.Comp;

    return (
        <div className="projetos-wrap">
            <div className="projetos-header">
                <div className="projetos-titulo">
                    <span className="projetos-icone">{cfg.icone}</span>
                    <div>
                        <h2>{cfg.titulo}</h2>
                    </div>
                </div>
                <div className="projetos-seletor">
                    <label>Lotação</label>
                    <select
                        className="form-control"
                        value={lotacaoSel || ''}
                        onChange={e => setLotacaoSel(e.target.value)}
                    >
                        <option value="">Selecione a lotação...</option>
                        {lotacoes.map(l => (
                            <option key={l.id_projeto} value={l.id_projeto}>{l.nome_projeto}</option>
                        ))}
                    </select>
                </div>
            </div>

            {carregando ? (
                <div className="projetos-aviso">Carregando lotações...</div>
            ) : lotacoes.length === 0 ? (
                <div className="projetos-aviso erro">
                    Nenhuma lotação vinculada ao seu acesso. Procure um Gerente ou Coordenador de Implantação.
                </div>
            ) : !lotacaoSel ? (
                <div className="projetos-aviso">
                    Selecione a lotação acima para começar.
                    {global && <span className="projetos-tag">Você tem visão global</span>}
                </div>
            ) : (
                <div className="projetos-conteudo">
                    <Comp 
                        key={`${tela}-${lotacaoSel}`} 
                        apiBase="/projetos"
                        lotacaoFixa={lotacaoSel} 
                        moduloAcesso={cfg.modulo}
                        permissaoNovo={permissaoNovo}
                        permissaoEditar={permissaoEditar}
                        aoVoltar={aoVoltar} 
                    />
                </div>
            )}
        </div>
    );
}