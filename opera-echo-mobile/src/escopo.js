/* ARQUIVO: src/escopo.js
   Espelha no aplicativo o modelo de isolamento do sistema web
   (middlewares/lotacao.js):
     - lotação = projeto com gera_lotacao = 1
     - visão global vem da FUNÇÃO / perfil Administrador
     - o backend é a fonte de verdade; aqui só controlamos a navegação e os
       seletores para o usuário não tentar operar fora do escopo dele. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import api from './api';
import { getUsuario } from './sessao';

export const MODULO = {
    IMPLANTACAO: 'IMPLANTACAO',
    PROJETOS: 'PROJETOS'
};

/* Normaliza nome de função para comparação (sem acento, maiúsculo). */
export const normFuncao = (s) => (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase();

/* Funções vinculadas à lotação - mesma lista usada no backend. */
export const FUNCOES_LOTACAO = ['ANALISTA', 'LIDER DE PROJETO', 'OPERADOR'];

/* ============================================================
   useEscopo(): lotações do usuário logado + visão global.
   ============================================================ */
export function useEscopo() {
    const usuario = getUsuario();
    const [lotacoes, setLotacoes] = useState([]);
    const [global, setGlobal] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState(null);

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            const r = await api.get('/projetos/minhas-lotacoes');
            setLotacoes(Array.isArray(r.data?.lotacoes) ? r.data.lotacoes : []);
            setGlobal(!!r.data?.global);
        } catch (e) {
            // Fallback: monta a lotação-home a partir do usuário da sessão.
            try {
                const rp = await api.get('/projetos');
                const idHome = usuario?.id_lotacao;
                const lista = Array.isArray(rp.data)
                    ? rp.data.filter(p => p.ativo && p.id_projeto === idHome)
                    : [];
                setLotacoes(lista);
                setGlobal(usuario?.perfil_acesso === 'Administrador');
            } catch (e2) {
                setLotacoes([]);
                setErro('Não foi possível carregar suas lotações.');
            }
        } finally {
            setCarregando(false);
        }
    }, [usuario]);

    useEffect(() => { carregar(); }, [carregar]);

    const funcao = normFuncao(usuario?.nome_funcao);
    const isAdmin = usuario?.perfil_acesso === 'Administrador' || usuario?.usuario === 'admin';

    /* O módulo Projetos só faz sentido para quem tem lotação (ou é global). */
    const podeAcessarProjetos = useMemo(
        () => global || isAdmin || lotacoes.length > 0,
        [global, isAdmin, lotacoes]
    );

    return {
        usuario,
        lotacoes,
        global,
        isAdmin,
        funcao,
        podeAcessarProjetos,
        carregando,
        erro,
        recarregar: carregar
    };
}

/* ============================================================
   useEquipe(): lista de pessoas selecionáveis na "Equipe da ação".

   Regra idêntica ao web (RegistroAtividades.js):
     - Módulo PROJETOS  -> /implantadores?id_projeto=<lotação travada>
       (isolado: só a equipe daquela lotação)
     - Módulo IMPLANTAÇÃO -> /implantadores (sem parâmetro)
       O backend decide pela FUNÇÃO do usuário logado:
         Implantador / Coord. de Implantação -> todos os implantadores ativos
         Analista / Líder / Operador          -> apenas a própria lotação
         Administrador                        -> todos
   ============================================================ */
export function useEquipe({ modulo = MODULO.IMPLANTACAO, idProjeto = null } = {}) {
    const [equipe, setEquipe] = useState([]);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState(null);

    const carregar = useCallback(async () => {
        // No módulo Projetos a lista depende da lotação escolhida.
        if (modulo === MODULO.PROJETOS && !idProjeto) {
            setEquipe([]);
            return;
        }
        setCarregando(true);
        setErro(null);
        try {
            const url = (modulo === MODULO.PROJETOS || idProjeto)
                ? `/implantadores?id_projeto=${idProjeto}`
                : '/implantadores';
            const r = await api.get(url);
            const lista = Array.isArray(r.data) ? r.data.filter(u => u.ativo) : [];
            setEquipe(lista);
            if (lista.length === 0) {
                setErro('Nenhum membro ativo encontrado para o seu escopo.');
            }
        } catch (e) {
            setEquipe([]);
            setErro(e?.response?.status === 401
                ? 'Sessão expirada. Faça login novamente.'
                : 'Falha ao carregar a equipe.');
        } finally {
            setCarregando(false);
        }
    }, [modulo, idProjeto]);

    useEffect(() => { carregar(); }, [carregar]);

    return { equipe, carregando, erro, recarregar: carregar };
}

/* ============================================================
   useEquipeProjeto(): equipe da lotação para o motivo "Apoio ao Projeto".
   Sempre por projeto, em qualquer módulo (igual ao web).
   ============================================================ */
export function useEquipeProjeto(idProjeto, ativo = true) {
    const [profissionais, setProfissionais] = useState([]);
    const [carregando, setCarregando] = useState(false);

    const carregar = useCallback(async () => {
        if (!ativo || !idProjeto) { setProfissionais([]); return; }
        setCarregando(true);
        try {
            const r = await api.get(`/implantadores?id_projeto=${idProjeto}`);
            setProfissionais(Array.isArray(r.data) ? r.data.filter(u => u.ativo) : []);
        } catch (e) {
            setProfissionais([]);
        } finally {
            setCarregando(false);
        }
    }, [idProjeto, ativo]);

    useEffect(() => { carregar(); }, [carregar]);

    return { profissionais, carregando, recarregar: carregar };
}

/* Prefixo de rota da API conforme o módulo ativo. */
export function apiBaseDoModulo(modulo) {
    return modulo === MODULO.PROJETOS ? '/projetos' : '';
}