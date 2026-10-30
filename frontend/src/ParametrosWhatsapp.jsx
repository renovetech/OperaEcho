/* ARQUIVO: src/ParametrosWhatsapp.js
 * Parâmetros > WhatsApp - integração com a Evolution API (mesmas regras do Renove Saúde):
 * conexão do número (QR Code), eventos (escala semanal, alteração de escala, férias,
 * código de senha), proteção do número (aquecimento, ritmo, janela de horário),
 * textos das mensagens e trilha de envios. A apikey nunca volta ao navegador. */
import React, { useState, useEffect, useCallback } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const EVENTOS_TEXTO = [
    { id: 'ESCALA_SEMANAL', nome: 'Escala da semana' },
    { id: 'ESCALA_ALTERACAO', nome: 'Alteração de escala' },
    { id: 'FERIAS_APROVADA', nome: 'Férias aprovadas' },
    { id: 'FERIAS_RECUSADA', nome: 'Férias recusadas' },
    { id: 'CODIGO_SENHA', nome: 'Código de senha' }
];
const NOME_EVENTO = { ESCALA_SEMANAL: 'Escala semanal', ESCALA_ALTERACAO: 'Alteração de escala', FERIAS_APROVADA: 'Férias aprovadas', FERIAS_RECUSADA: 'Férias recusadas', CODIGO_SENHA: 'Código de senha', TESTE: 'Teste' };
const COR_STATUS = { ENVIADO: '#2e7d32', PENDENTE: '#b26a00', AGUARDANDO: '#6d5bd0', ENVIANDO: '#0277bd', FALHA: '#c62828', NAO_ENVIADO: '#757575', CANCELADO: '#9e9e9e' };
const MOTIVOS = {
    SEM_WHATSAPP_CONFIRMADO: 'Sem WhatsApp confirmado no cadastro', CELULAR_INVALIDO: 'Celular inválido', USUARIO_INATIVO: 'Usuário inativo',
    EXPIRADO: 'Venceu antes de sair', DATAS_PASSADAS: 'Datas já passaram', EVENTO_DESLIGADO: 'Evento desligado', NOVO_CODIGO: 'Substituído por novo código'
};
const ESTADOS = { open: ['Conectado', '#2e7d32'], connecting: ['Conectando...', '#b26a00'], close: ['Desconectado', '#c62828'], NAO_CONFIGURADO: ['Não configurado', '#757575'], ERRO: ['Evolution não respondeu', '#c62828'], INATIVO: ['Integração inativa', '#757575'] };

const segundaDaSemana = (offset = 0) => {
    const d = new Date(); const dia = d.getDay();
    d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia) + offset * 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Switch({ ligado, onChange, desabilitado, rotulos = ['Ligado', 'Desligado'] }) {
    return (
        <label className={`par-switch ${desabilitado ? 'bloqueado' : ''}`}>
            <input type="checkbox" checked={!!ligado} disabled={desabilitado} onChange={e => onChange(e.target.checked)} />
            <span className="par-trilho"><span className="par-bola" /></span>
            <span className="par-estado">{ligado ? rotulos[0] : rotulos[1]}</span>
        </label>
    );
}

export default function ParametrosWhatsapp({ podeEditar }) {
    const [cfg, setCfg] = useState(null);
    const [token, setToken] = useState('');
    const [textos, setTextos] = useState({});
    const [eventoTexto, setEventoTexto] = useState('ESCALA_SEMANAL');
    const [previa, setPrevia] = useState('');
    const [estado, setEstado] = useState(null);
    const [qr, setQr] = useState(null);
    const [situacao, setSituacao] = useState(null);
    const [envios, setEnvios] = useState([]);
    const [filtro, setFiltro] = useState({ status: '', tipo: '', termo: '' });
    const [semanaEnvio, setSemanaEnvio] = useState(segundaDaSemana(1));
    const [salvando, setSalvando] = useState(false);

    const erro = (e, padrao) => Swal.fire('Erro', e.response?.data?.erro || padrao, 'error');

    const carregar = useCallback(async () => {
        try {
            const r = await api.get('/integracoes/whatsapp');
            setCfg(r.data);
            const t = {};
            Object.entries(r.data.textos || {}).forEach(([k, v]) => { t[k] = v.personalizado || v.padrao; });
            setTextos(t);
        } catch (e) { erro(e, 'Não foi possível carregar a configuração do WhatsApp.'); }
    }, []);

    const carregarSituacao = useCallback(async () => {
        try {
            const [s, st] = await Promise.all([api.get('/integracoes/whatsapp/fila'), api.get('/integracoes/whatsapp/status')]);
            setSituacao(s.data); setEstado(st.data.status);
        } catch (e) { /* silencioso */ }
    }, []);

    const carregarEnvios = useCallback(async () => {
        try {
            const r = await api.get('/integracoes/whatsapp/envios', { params: { ...filtro, limite: 150 } });
            setEnvios(r.data || []);
        } catch (e) { /* silencioso */ }
    }, [filtro]);

    useEffect(() => { carregar(); carregarSituacao(); }, [carregar, carregarSituacao]);
    useEffect(() => { carregarEnvios(); }, [carregarEnvios]);

    // Enquanto o QR Code está na tela, confere a conexão a cada 4 s (fecha ao conectar)
    useEffect(() => {
        if (!qr) return undefined;
        const t = setInterval(async () => {
            try {
                const st = await api.get('/integracoes/whatsapp/status');
                setEstado(st.data.status);
                if (st.data.status === 'open') { setQr(null); carregarSituacao(); Swal.fire({ icon: 'success', title: 'WhatsApp conectado!', timer: 1800, showConfirmButton: false }); }
            } catch (e) { /* tenta de novo */ }
        }, 4000);
        return () => clearInterval(t);
    }, [qr, carregarSituacao]);

    useEffect(() => {
        if (!eventoTexto || textos[eventoTexto] === undefined) return undefined;
        const t = setTimeout(() => {
            api.post('/integracoes/whatsapp/previa', { evento: eventoTexto, texto: textos[eventoTexto] })
                .then(r => setPrevia(r.data.previa)).catch(() => setPrevia(''));
        }, 400);
        return () => clearTimeout(t);
    }, [eventoTexto, textos]);

    if (!cfg) return <div className="wpp-tela"><div className="form-card"><p>Carregando...</p></div></div>;

    const set = (campo, v) => setCfg(c => ({ ...c, [campo]: v }));
    const setEv = (campo, v) => setCfg(c => ({ ...c, eventos: { ...c.eventos, [campo]: v } }));
    const setFila = (campo, v) => setCfg(c => ({ ...c, fila: { ...c.fila, [campo]: v } }));
    const ro = !podeEditar;

    const salvar = async () => {
        setSalvando(true);
        try {
            await api.post('/integracoes/whatsapp', {
                ativo: cfg.ativo, url_api: cfg.url_api, instancia: cfg.instancia, token_acesso: token || undefined,
                eventos: cfg.eventos, fila: cfg.fila, textos
            });
            setToken('');
            Swal.fire({ icon: 'success', title: 'Salvo!', timer: 1500, showConfirmButton: false });
            carregar(); carregarSituacao();
        } catch (e) { erro(e, 'Não foi possível salvar.'); } finally { setSalvando(false); }
    };

    const lerQr = async () => {
        try {
            const r = await api.get('/integracoes/whatsapp/qrcode');
            if (!r.data.base64 && !r.data.pairingCode) { carregarSituacao(); return Swal.fire('Atenção', 'A Evolution não devolveu QR Code (o número pode já estar conectado).', 'info'); }
            setQr(r.data);
        } catch (e) { erro(e, 'Não foi possível obter o QR Code. Salve a configuração antes.'); }
    };

    const desconectar = async () => {
        const c = await Swal.fire({ title: 'Desconectar o número?', text: 'As mensagens ficam na fila até um novo QR Code ser lido.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#c62828', confirmButtonText: 'Desconectar' });
        if (!c.isConfirmed) return;
        try { await api.post('/integracoes/whatsapp/desconectar'); carregarSituacao(); } catch (e) { erro(e, 'Falha ao desconectar.'); }
    };

    const testar = async () => {
        try { const r = await api.post('/integracoes/whatsapp/teste'); Swal.fire('Teste enviado para a fila', r.data.mensagem, 'success'); setTimeout(() => { carregarEnvios(); carregarSituacao(); }, 3000); }
        catch (e) { erro(e, 'Falha no teste.'); }
    };

    const enviarEscala = async () => {
        const c = await Swal.fire({
            title: 'Enviar a escala agora?', icon: 'question', showCancelButton: true, confirmButtonColor: '#2e7d32', confirmButtonText: 'Enviar',
            text: `Cada colaborador com escala na semana de ${semanaEnvio.split('-').reverse().join('/')} recebe a sua escala. Quem já recebeu essa semana não recebe de novo.`
        });
        if (!c.isConfirmed) return;
        try { const r = await api.post('/integracoes/whatsapp/escala-semanal/enviar', { semana: semanaEnvio }); Swal.fire('Pronto', r.data.mensagem, 'success'); carregarEnvios(); carregarSituacao(); }
        catch (e) { erro(e, 'Falha ao enviar a escala.'); }
    };

    const reenviar = async (id) => {
        try { await api.post(`/integracoes/whatsapp/envios/${id}/reenviar`); carregarEnvios(); carregarSituacao(); }
        catch (e) { erro(e, 'Não foi possível reenviar.'); }
    };

    const verMensagem = (e) => Swal.fire({ title: NOME_EVENTO[e.tipo_evento] || e.tipo_evento, html: `<pre style="text-align:left;white-space:pre-wrap;font-family:inherit;font-size:.9rem">${String(e.mensagem || '(ainda não montada)').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`, width: 560 });

    const [rotuloEstado, corEstado] = ESTADOS[estado] || [estado || '-', '#757575'];
    const textoInfo = cfg.textos[eventoTexto] || { variaveis: [], padrao: '' };
    const ev = cfg.eventos;
    const f = cfg.fila;

    return (
        <div className="wpp-tela">
            {/* ---------------- CONEXÃO ---------------- */}
            <div className="form-card">
                <h3>WhatsApp - Conexão</h3>
                <div className={`par-item ${cfg.ativo ? 'on' : ''}`}>
                    <div className="par-texto">
                        <strong>Integração ativa</strong>
                        {cfg.data_atualizacao && <small>Última alteração: {new Date(cfg.data_atualizacao).toLocaleString('pt-BR')}{cfg.usuario_alteracao ? ` · ${cfg.usuario_alteracao}` : ''}</small>}
                    </div>
                    <Switch ligado={cfg.ativo} onChange={v => set('ativo', v)} desabilitado={ro} rotulos={['Ativa', 'Inativa']} />
                </div>
                <div className="form-row">
                    <div className="form-group flex-2"><label>URL da Evolution API</label>
                        <input className="form-control" value={cfg.url_api} disabled={ro} onChange={e => set('url_api', e.target.value)} placeholder="https://evolution.seudominio.com" /></div>
                    <div className="form-group flex-1"><label>Instância</label>
                        <input className="form-control" value={cfg.instancia} disabled={ro} onChange={e => set('instancia', e.target.value)} placeholder="operaecho" /></div>
                    <div className="form-group flex-1"><label>API Key {cfg.tem_token && <small style={{ color: '#2e7d32' }}>(já salva)</small>}</label>
                        <input className="form-control" type="password" autoComplete="new-password" value={token} disabled={ro} onChange={e => setToken(e.target.value)} placeholder={cfg.tem_token ? '•••••••• (deixe vazio para manter)' : 'apikey da instância'} /></div>
                </div>
                <div className="wpp-conexao">
                    <span className="wpp-badge" style={{ background: corEstado }}>{rotuloEstado}</span>
                    <button type="button" className="btn-tab" onClick={carregarSituacao}><Icon n="refresh" /> Verificar</button>
                    {podeEditar && <button type="button" className="btn-tab" onClick={lerQr}><Icon n="camera" /> Conectar (QR Code)</button>}
                    {podeEditar && estado === 'open' && <button type="button" className="btn-tab" onClick={desconectar}><Icon n="logout" /> Desconectar</button>}
                    {podeEditar && <button type="button" className="btn-tab" onClick={testar}><Icon n="check" /> Enviar teste para mim</button>}
                </div>
                {qr && (
                    <div className="wpp-qr">
                        {qr.base64 && <img src={qr.base64.startsWith('data:') ? qr.base64 : `data:image/png;base64,${qr.base64}`} alt="QR Code do WhatsApp" />}
                        <div>
                            <strong>Leia com o WhatsApp do número da empresa</strong>
                            <p>No celular: WhatsApp › Aparelhos conectados › Conectar um aparelho.</p>
                            {qr.pairingCode && <p>Ou use o código de pareamento: <b>{qr.pairingCode}</b></p>}
                            <button type="button" className="btn-tab" onClick={lerQr}><Icon n="refresh" /> Gerar outro</button>
                            <button type="button" className="btn-tab" onClick={() => setQr(null)}>Fechar</button>
                        </div>
                    </div>
                )}
            </div>

            {/* ---------------- SITUAÇÃO DA FILA ---------------- */}
            {situacao && (
                <div className="form-card">
                    <h3>Fila de envio <small className="par-sub">{situacao.proximaAcao}</small></h3>
                    <div className="wpp-cards">
                        <div><b>{situacao.enviadosHoje}/{situacao.limiteHoje}</b><span>enviadas hoje / limite</span></div>
                        <div><b>{situacao.pendentes}</b><span>na fila</span></div>
                        <div><b>{situacao.aguardandoAgrupamento}</b><span>alterações agrupando</span></div>
                        <div><b>{situacao.ultimoMinuto}/{f.maxPorMinuto}</b><span>no último minuto</span></div>
                        <div><b>{situacao.semana}ª</b><span>semana de aquecimento</span></div>
                        <div><b>{situacao.dentroDoHorario ? 'Sim' : 'Não'}</b><span>dentro da janela ({f.horaInicio}-{f.horaFim})</span></div>
                    </div>
                </div>
            )}

            {/* ---------------- EVENTOS ---------------- */}
            <div className="form-card">
                <h3>Mensagens automáticas</h3>

                <div className={`par-item ${ev.escala_semanal_ativa ? 'on' : ''}`}>
                    <div className="par-texto">
                        <strong>Escala da semana</strong>
                        <div className="wpp-inline">
                            <select className="form-control" value={ev.escala_semanal_dia} disabled={ro} onChange={e => setEv('escala_semanal_dia', Number(e.target.value))}>
                                {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                            </select>
                            <span>às</span>
                            <input type="time" className="form-control" value={ev.escala_semanal_hora} disabled={ro} onChange={e => setEv('escala_semanal_hora', e.target.value)} />
                            <select className="form-control" value={ev.escala_semanal_referencia} disabled={ro} onChange={e => setEv('escala_semanal_referencia', e.target.value)}>
                                <option value="PROXIMA">enviar a semana seguinte</option>
                                <option value="ATUAL">enviar a semana atual</option>
                            </select>
                        </div>
                        {ev.escala_semanal_ultima && <small>Última semana disparada: {ev.escala_semanal_ultima.split('-').reverse().join('/')}</small>}
                        {podeEditar && (
                            <div className="wpp-inline" style={{ marginTop: 8 }}>
                                <span>Envio manual - semana de</span>
                                <input type="date" className="form-control" value={semanaEnvio} onChange={e => setSemanaEnvio(e.target.value)} />
                                <button type="button" className="btn-tab" onClick={enviarEscala}><Icon n="calendar" /> Enviar agora</button>
                            </div>
                        )}
                    </div>
                    <Switch ligado={ev.escala_semanal_ativa} onChange={v => setEv('escala_semanal_ativa', v)} desabilitado={ro} />
                </div>

                <div className={`par-item ${ev.escala_alteracao_ativa ? 'on' : ''}`}>
                    <div className="par-texto">
                        <strong>Alteração de escala</strong>
                        <div className="wpp-inline">
                            <span>Aguardar</span>
                            <input type="number" min={1} max={240} className="form-control" style={{ width: 90 }} value={ev.escala_alteracao_espera} disabled={ro} onChange={e => setEv('escala_alteracao_espera', e.target.value)} />
                            <span>minutos sem novas mudanças</span>
                        </div>
                    </div>
                    <Switch ligado={ev.escala_alteracao_ativa} onChange={v => setEv('escala_alteracao_ativa', v)} desabilitado={ro} />
                </div>

                <div className={`par-item ${ev.ferias_ativa ? 'on' : ''}`}>
                    <div className="par-texto">
                        <strong>Aprovação de férias</strong>
                    </div>
                    <Switch ligado={ev.ferias_ativa} onChange={v => setEv('ferias_ativa', v)} desabilitado={ro} />
                </div>

                <div className={`par-item ${ev.codigo_senha_ativa ? 'on' : ''}`}>
                    <div className="par-texto">
                        <strong>Código de redefinição de senha</strong>
                    </div>
                    <Switch ligado={ev.codigo_senha_ativa} onChange={v => setEv('codigo_senha_ativa', v)} desabilitado={ro} />
                </div>
            </div>

            {/* ---------------- PROTEÇÃO DO NÚMERO ---------------- */}
            <div className="form-card">
                <h3>Proteção do número</h3>
                <div className="form-row">
                    <div className="form-group flex-1"><label>Início do aquecimento</label><input type="date" className="form-control" value={f.inicioAquecimento || ''} disabled={ro} onChange={e => setFila('inicioAquecimento', e.target.value)} /></div>
                    <div className="form-group flex-1"><label>Limite inicial (msgs/dia)</label><input type="number" className="form-control" value={f.limiteInicial} disabled={ro} onChange={e => setFila('limiteInicial', e.target.value)} /></div>
                    <div className="form-group flex-1"><label>Crescimento por semana (%)</label><input type="number" className="form-control" value={f.crescimentoSemanal} disabled={ro} onChange={e => setFila('crescimentoSemanal', e.target.value)} /></div>
                    <div className="form-group flex-1"><label>Teto diário</label><input type="number" className="form-control" value={f.limiteMaximo} disabled={ro} onChange={e => setFila('limiteMaximo', e.target.value)} /></div>
                </div>
                <div className="form-row">
                    <div className="form-group flex-1"><label>Máximo por minuto</label><input type="number" className="form-control" value={f.maxPorMinuto} disabled={ro} onChange={e => setFila('maxPorMinuto', e.target.value)} /></div>
                    <div className="form-group flex-1"><label>Pausa mínima (s)</label><input type="number" className="form-control" value={f.pausaMinima} disabled={ro} onChange={e => setFila('pausaMinima', e.target.value)} /></div>
                    <div className="form-group flex-1"><label>Pausa máxima (s)</label><input type="number" className="form-control" value={f.pausaMaxima} disabled={ro} onChange={e => setFila('pausaMaxima', e.target.value)} /></div>
                    <div className="form-group flex-1"><label>Janela de envio</label>
                        <div className="wpp-inline"><input type="time" className="form-control" value={f.horaInicio} disabled={ro} onChange={e => setFila('horaInicio', e.target.value)} /><span>às</span><input type="time" className="form-control" value={f.horaFim} disabled={ro} onChange={e => setFila('horaFim', e.target.value)} /></div></div>
                </div>
            </div>

            {/* ---------------- TEXTOS ---------------- */}
            <div className="form-card">
                <h3>Textos das mensagens</h3>
                <div className="wpp-inline" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                    {EVENTOS_TEXTO.map(e => <button key={e.id} type="button" className={`btn-tab ${eventoTexto === e.id ? 'ativo' : ''}`} onClick={() => setEventoTexto(e.id)}>{e.nome}</button>)}
                </div>
                <div className="wpp-textos">
                    <div>
                        <textarea className="form-control" rows={16} value={textos[eventoTexto] || ''} disabled={ro} onChange={e => setTextos(t => ({ ...t, [eventoTexto]: e.target.value }))} />
                        <div className="wpp-vars">
                            {textoInfo.variaveis.map(v => <code key={v} onClick={() => !ro && setTextos(t => ({ ...t, [eventoTexto]: `${t[eventoTexto] || ''}{${v}}` }))}>{`{${v}}`}</code>)}
                            {podeEditar && <button type="button" className="btn-tab" onClick={() => setTextos(t => ({ ...t, [eventoTexto]: textoInfo.padrao }))}><Icon n="undo" /> Restaurar padrão</button>}
                        </div>
                    </div>
                    <div className="wpp-previa"><small>Prévia (dados de exemplo)</small><pre>{previa}</pre></div>
                </div>
            </div>

            <div className="form-actions" style={{ marginBottom: 20 }}>
                {podeEditar
                    ? <button className="btn-salvar" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar configuração do WhatsApp'}</button>
                    : <span style={{ color: '#999', fontStyle: 'italic' }}>Somente leitura.</span>}
            </div>

            {/* ---------------- TRILHA ---------------- */}
            <div className="form-card">
                <h3>Envios recentes</h3>
                <div className="wpp-inline" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
                    <input className="form-control" placeholder="Colaborador..." value={filtro.termo} onChange={e => setFiltro(x => ({ ...x, termo: e.target.value }))} style={{ maxWidth: 220 }} />
                    <select className="form-control" value={filtro.tipo} onChange={e => setFiltro(x => ({ ...x, tipo: e.target.value }))} style={{ maxWidth: 200 }}>
                        <option value="">Todos os eventos</option>
                        {Object.entries(NOME_EVENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select className="form-control" value={filtro.status} onChange={e => setFiltro(x => ({ ...x, status: e.target.value }))} style={{ maxWidth: 180 }}>
                        <option value="">Todas as situações</option>
                        {Object.keys(COR_STATUS).map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                    <button type="button" className="btn-tab" onClick={() => { carregarEnvios(); carregarSituacao(); }}><Icon n="refresh" /> Atualizar</button>
                </div>
                <div className="rg-tabela-wrap">
                    <table className="tabela-unidades">
                        <thead><tr><th>Criada</th><th>Colaborador</th><th>Evento</th><th>Número</th><th>Situação</th><th>Enviada</th><th></th></tr></thead>
                        <tbody>
                            {envios.length === 0 && <tr><td colSpan={7} className="rg-vazio">Nenhum envio.</td></tr>}
                            {envios.map(e => (
                                <tr key={e.id_envio}>
                                    <td>{e.data_criacao}</td>
                                    <td>{e.nome_completo || '-'}</td>
                                    <td>{NOME_EVENTO[e.tipo_evento] || e.tipo_evento}{e.modulo ? <small> · {e.modulo === 'PROJETOS' ? 'Projetos' : 'Implantação'}</small> : null}</td>
                                    <td>{e.numero || '-'}</td>
                                    <td>
                                        <span className="wpp-badge" style={{ background: COR_STATUS[e.status] || '#757575' }}>{e.status.replace('_', ' ')}</span>
                                        {(e.motivo || e.erro) && <div><small title={e.erro || ''}>{MOTIVOS[e.motivo] || e.motivo || String(e.erro).slice(0, 60)}</small></div>}
                                        {e.status === 'AGUARDANDO' && e.liberar_em && <div><small>sai após {e.liberar_em}</small></div>}
                                    </td>
                                    <td>{e.data_envio || '-'}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                        <button type="button" className="btn-tab" title="Ver mensagem" onClick={() => verMensagem(e)}><Icon n="search" /></button>
                                        {podeEditar && ['FALHA', 'CANCELADO'].includes(e.status) && e.tipo_evento !== 'CODIGO_SENHA' && e.numero &&
                                            <button type="button" className="btn-tab" title="Reenviar" onClick={() => reenviar(e.id_envio)}><Icon n="redo" /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
