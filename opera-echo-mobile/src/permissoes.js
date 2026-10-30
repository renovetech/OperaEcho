/* ARQUIVO: src/permissoes.js
   Permissões por módulo (tab_regras_acesso), iguais às do sistema web:
     Implantação -> registro_atividades | hora_extra | ferias_solicitacao
     Projetos    -> proj_registro_atividades | proj_hora_extra | proj_ferias_solicitacao
   Administrador sempre pode tudo. A regra do perfil é lida uma vez por sessão.
   (O backend continua sendo a barreira real; aqui só escondemos o que o
   usuário não pode fazer, como o web já faz.) */

import { useEffect, useState } from 'react';
import api from './api';
import { MODULO } from './escopo';
import { getPerfil, getUsuario } from './sessao';

export const CHAVES = {
    atividades: { [MODULO.IMPLANTACAO]: 'registro_atividades', [MODULO.PROJETOS]: 'proj_registro_atividades' },
    horaExtra:  { [MODULO.IMPLANTACAO]: 'hora_extra',          [MODULO.PROJETOS]: 'proj_hora_extra' },
    ferias:     { [MODULO.IMPLANTACAO]: 'ferias_solicitacao',  [MODULO.PROJETOS]: 'proj_ferias_solicitacao' }
};

let _cache = { perfil: null, regras: null, promessa: null };

async function regrasDoPerfil(perfil) {
    if (_cache.perfil === perfil && _cache.regras) return _cache.regras;
    if (_cache.perfil === perfil && _cache.promessa) return _cache.promessa;
    _cache = { perfil, regras: null, promessa: null };
    _cache.promessa = api.get(`/regras/${encodeURIComponent(perfil)}`)
        .then(r => { _cache.regras = Array.isArray(r.data) ? r.data : []; return _cache.regras; })
        .catch(() => { _cache.promessa = null; return []; });
    return _cache.promessa;
}

export function ehAdministrador() {
    const u = getUsuario();
    return u?.perfil_acesso === 'Administrador' || u?.usuario === 'admin';
}

export function ehGestorHE() {
    return ['Administrador', 'Gestor'].includes(getPerfil());
}

/* Hook: { podeAcessar, podeNovo, podeEditar, carregando } do módulo informado. */
export function usePermissoes(chaveModulo) {
    const admin = ehAdministrador();
    const [estado, setEstado] = useState({
        podeAcessar: admin, podeNovo: admin, podeEditar: admin, carregando: !admin
    });

    useEffect(() => {
        if (admin || !chaveModulo) return;
        let vivo = true;
        const perfil = getPerfil();
        if (!perfil) { setEstado(e => ({ ...e, carregando: false })); return; }
        regrasDoPerfil(perfil).then(regras => {
            if (!vivo) return;
            const r = regras.find(x => x.nome_modulo === chaveModulo);
            setEstado({
                podeAcessar: !!r?.pode_acessar,
                podeNovo: !!r?.pode_novo,
                podeEditar: !!r?.pode_editar,
                carregando: false
            });
        });
        return () => { vivo = false; };
    }, [admin, chaveModulo]);

    return estado;
}

export function limparCachePermissoes() {
    _cache = { perfil: null, regras: null, promessa: null };
}
