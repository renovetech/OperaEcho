/* ARQUIVO: src/SigtapImportacao.js
 * Parâmetros > SIGTAP - importação do pacote .zip da Tabela Unificada (DATASUS).
 * Mesmas regras do RenoveReg / RenoveSaúde: só o .zip original, uma importação
 * por vez, processamento em segundo plano com acompanhamento, registro de
 * competência, usuário e data/hora, e histórico completo.
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Swal from 'sweetalert2';
import Icon from './components/Icon';
import api from './api';
import { fmtComp, fmtNum, fmtDuracao } from './sigtapUtils';
import './SigtapConsulta.css';

const SITUACAO = {
    CONCLUIDA: { rotulo: 'Concluída', cls: 'ok' },
    PROCESSANDO: { rotulo: 'Processando', cls: 'warn' },
    ERRO: { rotulo: 'Erro', cls: 'danger' }
};

export default function SigtapImportacao({ podeEditar }) {
    const [resumo, setResumo] = useState(null);
    const [arquivo, setArquivo] = useState(null);
    const [enviando, setEnviando] = useState(0); // % do upload; 0 = parado
    const [andamento, setAndamento] = useState(null);
    const [arrastando, setArrastando] = useState(false);
    const [filtro, setFiltro] = useState({ competencia: '', situacao: '' });
    const [hist, setHist] = useState({ itens: [], total: 0, pagina: 1, tamanho: 10 });
    const [carregandoHist, setCarregandoHist] = useState(true);
    const entrada = useRef(null);
    const timer = useRef(null);

    const carregarHistorico = useCallback(async (pagina = 1, f = filtro) => {
        setCarregandoHist(true);
        try {
            const r = await api.get('/sigtap/importacoes', { params: { ...f, pagina, tamanho: 10 } });
            setHist(r.data);
        } catch (e) {
            setHist({ itens: [], total: 0, pagina: 1, tamanho: 10 });
        } finally { setCarregandoHist(false); }
    }, [filtro]);

    const acompanhar = useCallback((imp) => {
        setAndamento(imp);
        clearInterval(timer.current);
        timer.current = setInterval(async () => {
            try {
                const { data } = await api.get(`/sigtap/importacoes/${imp.id_importacao}`);
                if (data.situacao === 'PROCESSANDO') { setAndamento(data); return; }
                clearInterval(timer.current);
                setAndamento(null);
                if (data.situacao === 'CONCLUIDA') {
                    Swal.fire({
                        icon: 'success', title: 'SIGTAP atualizado!',
                        html: `Competência <b>${fmtComp(data.competencia)}</b> importada:<br>${fmtNum(data.qt_procedimentos)} procedimentos · ${fmtNum(data.qt_compatibilidades)} compatibilidades`,
                        confirmButtonColor: '#2e7d32'
                    });
                } else {
                    Swal.fire('A importação falhou', data.mensagem || 'Veja o histórico.', 'error');
                }
                carregarResumo(); // eslint-disable-line no-use-before-define
                carregarHistorico(1);
            } catch (e) {
                clearInterval(timer.current);
                setAndamento(null);
            }
        }, 2000);
    }, [carregarHistorico]); // eslint-disable-line react-hooks/exhaustive-deps

    const carregarResumo = useCallback(async () => {
        try {
            const r = await api.get('/sigtap/resumo');
            setResumo(r.data);
            if (r.data.emAndamento) acompanhar(r.data.emAndamento);
        } catch (e) {
            setResumo(null);
            Swal.fire('Erro', e.response?.data?.erro || 'Não foi possível carregar o SIGTAP.', 'error');
        }
    }, [acompanhar]);

    useEffect(() => {
        carregarResumo();
        carregarHistorico(1);
        return () => clearInterval(timer.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const escolher = (f) => {
        if (!f) return;
        if (!/\.zip$/i.test(f.name)) {
            Swal.fire('Arquivo inválido', 'Envie o arquivo .zip original baixado do SIGTAP, sem descompactar.', 'warning');
            return;
        }
        setArquivo(f);
    };

    const enviar = async () => {
        if (!arquivo) return;
        const existente = resumo?.competencias?.length;
        const confirma = await Swal.fire({
            title: 'Importar pacote SIGTAP?',
            html: `<b>${arquivo.name}</b><br><small>${(arquivo.size / 1048576).toFixed(1)} MB</small><br><br>` +
                (existente ? 'Se a competência do arquivo já existir na base, os dados dela serão substituídos.' : 'Esta será a primeira competência da base.'),
            icon: 'question', showCancelButton: true, confirmButtonText: 'Importar', cancelButtonText: 'Cancelar', confirmButtonColor: '#2e7d32'
        });
        if (!confirma.isConfirmed) return;

        setEnviando(1);
        try {
            const fd = new FormData();
            fd.append('arquivo', arquivo);
            const { data } = await api.post('/sigtap/importacoes', fd, {
                onUploadProgress: (e) => e.total && setEnviando(Math.max(1, Math.round((e.loaded / e.total) * 100)))
            });
            setArquivo(null);
            if (entrada.current) entrada.current.value = '';
            acompanhar(data);
            carregarHistorico(1);
        } catch (e) {
            Swal.fire('Não foi possível importar', e.response?.data?.erro || 'Falha ao enviar o arquivo.', 'error');
        } finally { setEnviando(0); }
    };

    const remover = async (c) => {
        const ok = await Swal.fire({
            title: `Remover a competência ${fmtComp(c.competencia)}?`,
            text: 'Os dados desta competência deixam de aparecer na Consulta SIGTAP. O histórico de importações é mantido e a competência pode ser importada novamente.',
            icon: 'warning', showCancelButton: true, confirmButtonText: 'Sim, remover', cancelButtonText: 'Cancelar', confirmButtonColor: '#A23B36'
        });
        if (!ok.isConfirmed) return;
        try {
            Swal.fire({ title: 'Removendo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            await api.delete(`/sigtap/competencias/${c.competencia}`);
            Swal.fire({ icon: 'success', title: 'Competência removida', timer: 1400, showConfirmButton: false });
            carregarResumo();
            carregarHistorico(1);
        } catch (e) {
            Swal.fire('Erro', e.response?.data?.erro || 'Não foi possível remover.', 'error');
        }
    };

    const ult = resumo?.ultimaConcluida;
    const vigente = resumo?.competencias?.[0];
    const paginas = Math.max(1, Math.ceil((hist.total || 0) / (hist.tamanho || 10)));

    return (
        <div className="sg sg-imp">
            <div className="sg-stats">
                <div className="sg-stat"><span>Competência vigente</span><strong>{fmtComp(resumo?.competenciaVigente) === '-' ? 'Sem dados' : fmtComp(resumo?.competenciaVigente)}</strong></div>
                <div className="sg-stat"><span>Procedimentos vigentes</span><strong className="mono">{fmtNum(vigente?.qt_procedimentos || 0)}</strong></div>
                <div className="sg-stat"><span>Última importação</span><strong className="sg-stat-sm">{ult ? ult.fim : 'Nenhuma'}</strong>{ult && <small>Competência {fmtComp(ult.competencia)}</small>}</div>
                <div className="sg-stat"><span>Responsável</span><strong className="sg-stat-sm">{ult?.usuario || '-'}</strong></div>
            </div>

            <div className="sg-card">
                <div className="sg-card-tit">
                    <h4><Icon n="upload" /> Enviar pacote</h4>
                    <a className="sg-link-ext" href="http://sigtap.datasus.gov.br/tabela-unificada/app/download.jsp" target="_blank" rel="noopener noreferrer">
                        <Icon n="download" /> Baixar pacote no DATASUS
                    </a>
                </div>

                {andamento ? (
                    <div className="sg-upload pronto">
                        <b>Importando {andamento.arquivo}</b>
                        <span>Competência {fmtComp(andamento.competencia)} · {andamento.etapa || 'Processando'}</span>
                        <div className="sg-barra"><i style={{ width: `${andamento.percentual || 3}%` }} /></div>
                        <small>{andamento.percentual || 0}% · A importação continua mesmo se você sair desta tela.</small>
                    </div>
                ) : (
                    <div className={`sg-upload ${arquivo ? 'pronto' : ''} ${arrastando ? 'arrastando' : ''}`}
                        onDragOver={e => { e.preventDefault(); if (podeEditar) setArrastando(true); }}
                        onDragLeave={() => setArrastando(false)}
                        onDrop={e => { e.preventDefault(); setArrastando(false); if (podeEditar) escolher(e.dataTransfer.files?.[0]); }}>
                        <span className="sg-upload-ic"><Icon n={arquivo ? 'check' : 'box'} /></span>
                        <b>{arquivo ? 'Arquivo selecionado' : 'Arraste o .zip aqui ou escolha o arquivo'}</b>
                        {arquivo
                            ? <div className="sg-arquivo mono">{arquivo.name} <small>({(arquivo.size / 1048576).toFixed(1)} MB)</small></div>
                            : <span>Procedimentos, descrições, CID, CBO, habilitações, serviços, instrumentos, atributos e compatibilidades são lidos do pacote.</span>}
                        {enviando > 0 && <div className="sg-barra"><i style={{ width: `${enviando}%` }} /></div>}
                        {podeEditar ? (
                            <div className="sg-upload-acoes">
                                <label className="sg-btn sg-btn-out">
                                    <Icon n="file" /> {arquivo ? 'Trocar arquivo' : 'Escolher arquivo'}
                                    <input ref={entrada} type="file" accept=".zip" hidden onChange={e => escolher(e.target.files?.[0])} />
                                </label>
                                <button className="sg-btn" disabled={!arquivo || enviando > 0} onClick={enviar}>
                                    <Icon n="refresh" /> {enviando > 0 ? `Enviando ${enviando}%...` : 'Importar'}
                                </button>
                            </div>
                        ) : <small className="sg-muted">Somente leitura - sem permissão para importar.</small>}
                    </div>
                )}
                <div className="sg-aviso">
                    <Icon n="alert" />
                    <p>Cada competência importada fica disponível na <b>Consulta SIGTAP</b> (Operações). Reimportar uma competência existente substitui os dados dela; se qualquer etapa falhar, nada é alterado.</p>
                </div>
            </div>

            {resumo?.competencias?.length > 0 && (
                <div className="sg-card">
                    <div className="sg-card-tit"><h4><Icon n="calendar" /> Competências na base</h4><small className="sg-muted">{resumo.competencias.length} disponível(is)</small></div>
                    <div className="sg-comps">
                        {resumo.competencias.map((c, i) => (
                            <div key={c.competencia} className={`sg-comp ${i === 0 ? 'vigente' : ''}`}>
                                <div>
                                    <strong>{fmtComp(c.competencia)}</strong>{i === 0 && <em>vigente</em>}
                                    <small>{fmtNum(c.qt_procedimentos)} procedimentos · {c.usuario}</small>
                                </div>
                                {podeEditar && !andamento && (
                                    <button title="Remover competência" className="sg-ic-btn del" onClick={() => remover(c)}><Icon n="trash" /></button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="sg-card">
                <div className="sg-card-tit"><h4><Icon n="clock" /> Histórico de importações</h4></div>
                <form className="sg-filtros" onSubmit={e => { e.preventDefault(); carregarHistorico(1); }}>
                    <label>Competência (AAAAMM)
                        <input className="form-control mono" inputMode="numeric" maxLength={6} placeholder="202609" value={filtro.competencia}
                            onChange={e => setFiltro({ ...filtro, competencia: e.target.value.replace(/\D/g, '') })} />
                    </label>
                    <label>Situação
                        <select className="form-control" value={filtro.situacao} onChange={e => setFiltro({ ...filtro, situacao: e.target.value })}>
                            <option value="">Todas</option>
                            <option value="CONCLUIDA">Concluída</option>
                            <option value="PROCESSANDO">Processando</option>
                            <option value="ERRO">Erro</option>
                        </select>
                    </label>
                    <div className="sg-filtros-acoes">
                        <button type="button" className="sg-btn sg-btn-out" onClick={() => { const f = { competencia: '', situacao: '' }; setFiltro(f); carregarHistorico(1, f); }}>Limpar</button>
                        <button type="submit" className="sg-btn"><Icon n="search" /> Buscar</button>
                    </div>
                </form>

                <div className="sg-tabela-wrap">
                    <table className="sg-tabela sg-resp">
                        <thead>
                            <tr><th>Arquivo / Usuário</th><th>Competência</th><th>Início</th><th>Duração</th><th className="r">Procedimentos</th><th className="r">Novos</th><th className="r">Compatib.</th><th>Situação</th></tr>
                        </thead>
                        <tbody>
                            {carregandoHist ? (
                                <tr><td colSpan={8} className="sg-vazio">Carregando...</td></tr>
                            ) : hist.itens.length === 0 ? (
                                <tr><td colSpan={8} className="sg-vazio"><b>Nenhuma importação registrada</b><br />Envie o pacote da Tabela Unificada para montar a base de consulta.</td></tr>
                            ) : hist.itens.map(i => (
                                <tr key={i.id_importacao}>
                                    <td data-l="Arquivo"><div className="sg-cel-main">{i.arquivo}</div><div className="sg-cel-sub"><Icon n="user" /> {i.usuario}</div></td>
                                    <td data-l="Competência" className="mono">{fmtComp(i.competencia)}{i.removida && <div className="sg-cel-sub">removida</div>}</td>
                                    <td data-l="Início" className="mono">{i.inicio}</td>
                                    <td data-l="Duração" className="mono">{fmtDuracao(i.duracao_seg)}</td>
                                    <td data-l="Procedimentos" className="r mono">{fmtNum(i.qt_procedimentos)}</td>
                                    <td data-l="Novos" className="r mono">{fmtNum(i.qt_novos)}</td>
                                    <td data-l="Compatib." className="r mono">{fmtNum(i.qt_compatibilidades)}</td>
                                    <td data-l="Situação">
                                        <span className={`sg-badge ${SITUACAO[i.situacao]?.cls || ''}`}>{SITUACAO[i.situacao]?.rotulo || i.situacao}</span>
                                        {i.situacao === 'PROCESSANDO' && i.percentual !== undefined && <div className="sg-cel-sub">{i.etapa} · {i.percentual}%</div>}
                                        {i.mensagem && <div className="sg-cel-sub sg-erro-msg">{i.mensagem}</div>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {paginas > 1 && (
                    <div className="sg-pager">
                        <span>{fmtNum(hist.total)} importações</span>
                        <button className="sg-ic-btn" disabled={hist.pagina <= 1} onClick={() => carregarHistorico(hist.pagina - 1)}><Icon n="arrow-left" /></button>
                        <b>{hist.pagina} / {paginas}</b>
                        <button className="sg-ic-btn" disabled={hist.pagina >= paginas} onClick={() => carregarHistorico(hist.pagina + 1)}><Icon n="arrow-right" /></button>
                    </div>
                )}
            </div>
        </div>
    );
}
