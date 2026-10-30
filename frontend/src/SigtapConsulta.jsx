/* ARQUIVO: src/SigtapConsulta.js
 * Operações > Consulta SIGTAP (operaecho.com/sigtap).
 * Consulta à base local da Tabela Unificada, importada em Parâmetros > SIGTAP:
 * procedimentos (com todas as abas do DATASUS), compatibilidades e tabelas
 * auxiliares - funciona mesmo quando o site do governo está fora do ar.
 * Tela responsiva. Permissão: módulo 'sigtap'.
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Swal from 'sweetalert2';
import Icon from './components/Icon';
import api from './api';
import {
    fmtProc, fmtCid, fmtComp, fmtMoeda, fmtNum, fmtPerc, fmtIdade, fmtQtd,
    COMPLEXIDADE, SEXO, REGISTRO_SIGLA, COMPATIBILIDADE, rotuloCompat, SIA_SIH_TIPO
} from './sigtapUtils';
import './SigtapConsulta.css';

const BUSCA_VAZIA = {
    q: '', grupo: '', subgrupo: '', forma: '', financiamento: '', complexidade: '', registro: '',
    modalidade: '', sexo: '', ordem: 'codigo', vinculo: '', codigo: '', vinculoRotulo: ''
};
const erroMsg = (e, padrao) => e?.response?.data?.erro || padrao;

// ============================================================================ PÁGINA
export default function SigtapConsulta({ aoVoltar, aoAbrirImportacao }) {
    const [comps, setComps] = useState(null); // null = carregando
    const [competencia, setCompetencia] = useState('');
    const [aba, setAba] = useState('proc');
    const [pilha, setPilha] = useState([]); // procedimentos abertos (navegação entre fichas)
    const [origem, setOrigem] = useState('proc');
    const [busca, setBusca] = useState(BUSCA_VAZIA);
    const [buscou, setBuscou] = useState(false);

    useEffect(() => {
        api.get('/sigtap/competencias')
            .then(r => { setComps(r.data || []); if (r.data?.length) setCompetencia(r.data[0].competencia); })
            .catch(e => { setComps([]); Swal.fire('Erro', erroMsg(e, 'Não foi possível carregar o SIGTAP.'), 'error'); });
    }, []);

    const info = comps?.find(c => c.competencia === competencia);

    const abrir = useCallback((codigo) => {
        setPilha(p => (p[p.length - 1] === codigo ? p : [...p, codigo]));
        setAba(a => { if (a !== 'detalhe') setOrigem(a); return 'detalhe'; });
        // O conteúdo rola dentro de .app-content (Dashboard), não na janela.
        (document.querySelector('.app-content') || window).scrollTo?.({ top: 0, behavior: 'smooth' });
    }, []);
    const voltarFicha = () => {
        setPilha(p => {
            const n = p.slice(0, -1);
            if (!n.length) setAba(origem);
            return n;
        });
    };
    const filtrarPor = (vinculo, codigo, rotulo) => {
        // Hierarquia vai para os seletores (grupo/subgrupo/forma); demais vínculos viram o chip de filtro.
        if (vinculo === 'grupo') setBusca({ ...BUSCA_VAZIA, grupo: codigo });
        else if (vinculo === 'subgrupo') setBusca({ ...BUSCA_VAZIA, grupo: codigo.slice(0, 2), subgrupo: codigo });
        else if (vinculo === 'forma') setBusca({ ...BUSCA_VAZIA, grupo: codigo.slice(0, 2), subgrupo: codigo.slice(0, 4), forma: codigo });
        else setBusca({ ...BUSCA_VAZIA, vinculo, codigo, vinculoRotulo: rotulo });
        setBuscou(true);
        setPilha([]);
        setAba('proc');
    };

    if (comps === null) return <div className="cadastro-container sg"><div className="sg-carregando"><span className="sg-spin" /> Carregando a base SIGTAP...</div></div>;

    return (
        <div className="cadastro-container sg">
            <div className="sg-topo">
                <div className="sg-topo-tit">
                    <span className="sg-topo-ic"><Icon n="stethoscope" /></span>
                    <div>
                        <h2>Consulta SIGTAP</h2>
                    </div>
                </div>
                <div className="sg-topo-acoes">
                    {comps.length > 0 && (
                        <label className="sg-comp-sel" title="Competência consultada">
                            <Icon n="calendar" />
                            <select value={competencia} onChange={e => { setCompetencia(e.target.value); setPilha(p => p.slice(-1)); }}>
                                {comps.map((c, i) => <option key={c.competencia} value={c.competencia}>{fmtComp(c.competencia)}{i === 0 ? ' (vigente)' : ''}</option>)}
                            </select>
                        </label>
                    )}
                    {aoVoltar && <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>}
                </div>
            </div>

            {comps.length === 0 ? (
                <div className="sg-card sg-sem-base">
                    <span className="sg-sem-base-ic"><Icon n="inbox" /></span>
                    <h3>Nenhuma competência importada</h3>
                    <p>A Consulta SIGTAP usa uma base própria, alimentada pelo pacote .zip da Tabela Unificada do DATASUS. Importe o pacote em <b>Parâmetros &gt; SIGTAP</b> para começar.</p>
                    {aoAbrirImportacao && <button className="sg-btn" onClick={aoAbrirImportacao}><Icon n="settings" /> Ir para Parâmetros</button>}
                </div>
            ) : (
                <>
                    <div className="sg-faixa">
                        <span><Icon n="check" /> Competência <b>{fmtComp(competencia)}</b></span>
                        {info && <span><Icon n="box" /> {fmtNum(info.qt_procedimentos)} procedimentos</span>}
                        {info?.data_importacao && <span className="sg-faixa-sub"><Icon n="clock" /> Atualizada em {info.data_importacao}</span>}
                    </div>

                    <div className="sg-abas" role="tablist">
                        <button className={aba === 'proc' || (aba === 'detalhe' && origem === 'proc') ? 'ativo' : ''} onClick={() => { setPilha([]); setAba('proc'); }}><Icon n="clipboard" /> Procedimentos</button>
                        <button className={aba === 'compat' || (aba === 'detalhe' && origem === 'compat') ? 'ativo' : ''} onClick={() => { setPilha([]); setAba('compat'); }}><Icon n="puzzle" /> Compatibilidades</button>
                        <button className={aba === 'tabelas' || (aba === 'detalhe' && origem === 'tabelas') ? 'ativo' : ''} onClick={() => { setPilha([]); setAba('tabelas'); }}><Icon n="grid" /> Tabelas</button>
                    </div>

                    {aba === 'detalhe' && pilha.length > 0 && (
                        <FichaProcedimento key={`${pilha[pilha.length - 1]}-${competencia}`} codigo={pilha[pilha.length - 1]} competencia={competencia}
                            anterior={pilha.length > 1 ? pilha[pilha.length - 2] : null}
                            onVoltar={voltarFicha} onAbrir={abrir} onFiltrar={filtrarPor} />
                    )}
                    <div style={{ display: aba === 'proc' ? 'block' : 'none' }}>
                        <BuscaProcedimentos competencia={competencia} busca={busca} setBusca={setBusca} buscou={buscou} setBuscou={setBuscou} onAbrir={abrir} />
                    </div>
                    {aba === 'compat' && <Compatibilidades competencia={competencia} onAbrir={abrir} />}
                    {aba === 'tabelas' && <TabelasAuxiliares competencia={competencia} onFiltrar={filtrarPor} />}
                </>
            )}
        </div>
    );
}

// ============================================================================ BUSCA DE PROCEDIMENTOS
function BuscaProcedimentos({ competencia, busca, setBusca, buscou, setBuscou, onAbrir }) {
    const [meta, setMeta] = useState(null);
    const [avancado, setAvancado] = useState(false);
    const [pagina, setPagina] = useState(1);
    const [res, setRes] = useState({ itens: [], total: 0, tamanho: 20 });
    const [carregando, setCarregando] = useState(false);
    const [texto, setTexto] = useState(busca.q);
    const seq = useRef(0);

    useEffect(() => {
        if (!competencia) return;
        api.get('/sigtap/filtros', { params: { competencia } }).then(r => setMeta(r.data)).catch(() => setMeta(null));
    }, [competencia]);

    useEffect(() => { setTexto(busca.q); }, [busca.q]);

    // Digitação: aplica a busca após uma pausa.
    useEffect(() => {
        if (texto === busca.q) return undefined;
        const t = setTimeout(() => {
            if (texto.trim().length === 0 || texto.trim().length >= 3) { setBusca(b => ({ ...b, q: texto })); setBuscou(true); setPagina(1); }
        }, 450);
        return () => clearTimeout(t);
    }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps

    const temFiltro = useMemo(() => Object.entries(busca).some(([k, v]) => !['ordem', 'vinculoRotulo'].includes(k) && v), [busca]);

    useEffect(() => {
        if (!buscou || !competencia) return;
        const id = ++seq.current;
        setCarregando(true);
        const { vinculoRotulo, ...params } = busca;
        api.get('/sigtap/procedimentos', { params: { ...params, competencia, pagina, tamanho: 20 } })
            .then(r => { if (id === seq.current) setRes(r.data); })
            .catch(e => { if (id === seq.current) { setRes({ itens: [], total: 0, tamanho: 20 }); Swal.fire('Erro', erroMsg(e, 'Falha na busca.'), 'error'); } })
            .finally(() => { if (id === seq.current) setCarregando(false); });
    }, [busca, pagina, competencia, buscou]);

    const alterar = (campo, valor) => {
        setBusca(b => {
            const n = { ...b, [campo]: valor };
            if (campo === 'grupo') { n.subgrupo = ''; n.forma = ''; }
            if (campo === 'subgrupo') n.forma = '';
            return n;
        });
        setBuscou(true);
        setPagina(1);
    };
    const limpar = () => { setBusca(BUSCA_VAZIA); setTexto(''); setBuscou(false); setPagina(1); setRes({ itens: [], total: 0, tamanho: 20 }); };
    const enviar = (e) => { e.preventDefault(); setBusca(b => ({ ...b, q: texto })); setBuscou(true); setPagina(1); };

    const subgrupos = (meta?.subgrupos || []).filter(s => busca.grupo && s.codigo.startsWith(busca.grupo));
    const formas = (meta?.formas || []).filter(f => busca.subgrupo && f.codigo.startsWith(busca.subgrupo));
    const paginas = Math.max(1, Math.ceil((res.total || 0) / (res.tamanho || 20)));
    const nomeDe = (lista, cod) => (lista || []).find(x => x.codigo === cod)?.nome;
    const nAvancados = ['financiamento', 'complexidade', 'registro', 'modalidade', 'sexo'].filter(k => busca[k]).length;

    return (
        <div className="sg-bloco">
            <form className="sg-card sg-busca" onSubmit={enviar}>
                <div className="sg-busca-linha">
                    <div className="sg-busca-campo">
                        <Icon n="search" />
                        <input autoFocus value={texto} onChange={e => setTexto(e.target.value)}
                            placeholder="Código (03.01.10.027-6) ou nome do procedimento" aria-label="Buscar procedimento" />
                        {texto && <button type="button" className="sg-x" onClick={() => setTexto('')} aria-label="Limpar texto">×</button>}
                    </div>
                    <button type="submit" className="sg-btn">Buscar</button>
                </div>

                <div className="sg-hier">
                    <label>Grupo
                        <select className="form-control" value={busca.grupo} onChange={e => alterar('grupo', e.target.value)}>
                            <option value="">Todos os grupos</option>
                            {(meta?.grupos || []).map(g => <option key={g.codigo} value={g.codigo}>{g.codigo} - {g.nome}</option>)}
                        </select>
                    </label>
                    <label>Subgrupo
                        <select className="form-control" value={busca.subgrupo} disabled={!busca.grupo} onChange={e => alterar('subgrupo', e.target.value)}>
                            <option value="">{busca.grupo ? 'Todos os subgrupos' : 'Selecione o grupo'}</option>
                            {subgrupos.map(s => <option key={s.codigo} value={s.codigo}>{s.codigo.slice(2)} - {s.nome}</option>)}
                        </select>
                    </label>
                    <label>Forma de organização
                        <select className="form-control" value={busca.forma} disabled={!busca.subgrupo} onChange={e => alterar('forma', e.target.value)}>
                            <option value="">{busca.subgrupo ? 'Todas as formas' : 'Selecione o subgrupo'}</option>
                            {formas.map(f => <option key={f.codigo} value={f.codigo}>{f.codigo.slice(4)} - {f.nome}</option>)}
                        </select>
                    </label>
                </div>

                <button type="button" className="sg-mais" onClick={() => setAvancado(a => !a)} aria-expanded={avancado}>
                    <Icon n="settings" /> Filtros avançados{nAvancados ? ` (${nAvancados})` : ''} <span className={`sg-seta ${avancado ? 'aberta' : ''}`}>▾</span>
                </button>
                {avancado && (
                    <div className="sg-hier sg-avancado">
                        <label>Financiamento
                            <select className="form-control" value={busca.financiamento} onChange={e => alterar('financiamento', e.target.value)}>
                                <option value="">Todos</option>
                                {(meta?.financiamentos || []).map(f => <option key={f.codigo} value={f.codigo}>{f.nome}</option>)}
                            </select>
                        </label>
                        <label>Complexidade
                            <select className="form-control" value={busca.complexidade} onChange={e => alterar('complexidade', e.target.value)}>
                                <option value="">Todas</option>
                                {Object.entries(COMPLEXIDADE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </label>
                        <label>Instrumento de registro
                            <select className="form-control" value={busca.registro} onChange={e => alterar('registro', e.target.value)}>
                                <option value="">Todos</option>
                                {(meta?.registros || []).map(r => <option key={r.codigo} value={r.codigo}>{r.nome}</option>)}
                            </select>
                        </label>
                        <label>Modalidade
                            <select className="form-control" value={busca.modalidade} onChange={e => alterar('modalidade', e.target.value)}>
                                <option value="">Todas</option>
                                {(meta?.modalidades || []).map(m => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}
                            </select>
                        </label>
                        <label>Sexo
                            <select className="form-control" value={busca.sexo} onChange={e => alterar('sexo', e.target.value)}>
                                <option value="">Todos</option>
                                {Object.entries(SEXO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </label>
                        <label>Ordenar por
                            <select className="form-control" value={busca.ordem} onChange={e => alterar('ordem', e.target.value)}>
                                <option value="codigo">Código</option>
                                <option value="nome">Nome</option>
                                <option value="valor_amb">Maior valor ambulatorial</option>
                                <option value="valor_hosp">Maior valor hospitalar</option>
                            </select>
                        </label>
                    </div>
                )}

                {(temFiltro || buscou) && (
                    <div className="sg-chips">
                        {busca.vinculo && <span className="sg-chip forte">{busca.vinculoRotulo || `${busca.vinculo}: ${busca.codigo}`}<button type="button" onClick={() => { alterar('vinculo', ''); setBusca(b => ({ ...b, codigo: '', vinculoRotulo: '' })); }}>×</button></span>}
                        {busca.grupo && <span className="sg-chip">Grupo: {nomeDe(meta?.grupos, busca.grupo)}<button type="button" onClick={() => alterar('grupo', '')}>×</button></span>}
                        {busca.subgrupo && <span className="sg-chip">Subgrupo: {nomeDe(meta?.subgrupos, busca.subgrupo)}<button type="button" onClick={() => alterar('subgrupo', '')}>×</button></span>}
                        {busca.forma && <span className="sg-chip">Forma: {nomeDe(meta?.formas, busca.forma)}<button type="button" onClick={() => alterar('forma', '')}>×</button></span>}
                        {busca.financiamento && <span className="sg-chip">{nomeDe(meta?.financiamentos, busca.financiamento)}<button type="button" onClick={() => alterar('financiamento', '')}>×</button></span>}
                        {busca.complexidade && <span className="sg-chip">{COMPLEXIDADE[busca.complexidade]}<button type="button" onClick={() => alterar('complexidade', '')}>×</button></span>}
                        {busca.registro && <span className="sg-chip">{nomeDe(meta?.registros, busca.registro)}<button type="button" onClick={() => alterar('registro', '')}>×</button></span>}
                        {busca.modalidade && <span className="sg-chip">{nomeDe(meta?.modalidades, busca.modalidade)}<button type="button" onClick={() => alterar('modalidade', '')}>×</button></span>}
                        {busca.sexo && <span className="sg-chip">Sexo: {SEXO[busca.sexo]}<button type="button" onClick={() => alterar('sexo', '')}>×</button></span>}
                        <button type="button" className="sg-limpar" onClick={limpar}>Limpar tudo</button>
                    </div>
                )}
            </form>

            {!buscou ? (
                <div className="sg-card">
                    <div className="sg-card-tit"><h4><Icon n="folder" /> Navegue pelos grupos</h4><button className="sg-btn sg-btn-out sg-btn-sm" onClick={() => { setBuscou(true); setPagina(1); }}>Ver todos os procedimentos</button></div>
                    <div className="sg-grupos">
                        {(meta?.grupos || []).map(g => (
                            <button key={g.codigo} className="sg-grupo" onClick={() => alterar('grupo', g.codigo)}>
                                <span className="mono">{g.codigo}</span>
                                <b>{g.nome}</b>
                                <small>{(meta?.subgrupos || []).filter(s => s.codigo.startsWith(g.codigo)).length} subgrupos</small>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="sg-card">
                    <div className="sg-card-tit">
                        <h4><Icon n="clipboard" /> {carregando ? 'Buscando...' : `${fmtNum(res.total)} procedimento${res.total === 1 ? '' : 's'}`}</h4>
                        {res.total > 0 && <small className="sg-muted">Toque em um procedimento para ver a ficha completa</small>}
                    </div>
                    <div className={`sg-tabela-wrap ${carregando ? 'carregando' : ''}`}>
                        <table className="sg-tabela sg-resp sg-lista">
                            <thead>
                                <tr><th>Código</th><th>Procedimento</th><th>Complexidade</th><th>Instrumentos</th><th className="r">Ambulatorial</th><th className="r">Hospitalar</th></tr>
                            </thead>
                            <tbody>
                                {!carregando && res.itens.length === 0 && (
                                    <tr><td colSpan={6} className="sg-vazio"><b>Nenhum procedimento encontrado</b><br />Revise o texto ou remova algum filtro.</td></tr>
                                )}
                                {res.itens.map(p => (
                                    <tr key={p.co_procedimento} className="sg-clicavel" tabIndex={0}
                                        onClick={() => onAbrir(p.co_procedimento)} onKeyDown={e => e.key === 'Enter' && onAbrir(p.co_procedimento)}>
                                        <td data-l="Código" className="mono sg-cod">{fmtProc(p.co_procedimento)}</td>
                                        <td data-l="Procedimento" className="sg-nome-proc"><b>{p.no_procedimento}</b><small>{p.no_financiamento}</small></td>
                                        <td data-l="Complexidade"><span className={`sg-cx cx${p.tp_complexidade}`}>{COMPLEXIDADE[p.tp_complexidade] || '-'}</span></td>
                                        <td data-l="Instrumentos"><div className="sg-regs">{(p.registros || '').split(',').filter(Boolean).map(r => <span key={r} className="sg-reg" title={nomeDe(meta?.registros, r)}>{REGISTRO_SIGLA[r] || r}</span>)}</div></td>
                                        <td data-l="Ambulatorial" className="r mono">{fmtMoeda(p.vl_sa)}</td>
                                        <td data-l="Hospitalar" className="r mono">{fmtMoeda((p.vl_sh || 0) + (p.vl_sp || 0))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Paginacao pagina={pagina} paginas={paginas} total={res.total} rotulo="procedimentos" onIr={setPagina} />
                </div>
            )}
        </div>
    );
}

// ============================================================================ FICHA DO PROCEDIMENTO
function FichaProcedimento({ codigo, competencia, anterior, onVoltar, onAbrir, onFiltrar }) {
    const [d, setD] = useState(null);
    const [erro, setErro] = useState('');
    const [aba, setAba] = useState('descricao');

    useEffect(() => {
        setD(null); setErro('');
        api.get(`/sigtap/procedimentos/${codigo}`, { params: { competencia } })
            .then(r => setD(r.data))
            .catch(e => setErro(erroMsg(e, 'Não foi possível carregar o procedimento.')));
    }, [codigo, competencia]);

    const copiar = () => {
        navigator.clipboard?.writeText(codigo).then(() =>
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Código copiado', timer: 1300, showConfirmButton: false })
        ).catch(() => {});
    };

    const voltar = <button className="sg-voltar-ficha" onClick={onVoltar}><Icon n="arrow-left" /> {anterior ? `Voltar para ${fmtProc(anterior)}` : 'Voltar à lista'}</button>;
    if (erro) return <div className="sg-bloco">{voltar}<div className="sg-card sg-vazio">{erro}</div></div>;
    if (!d) return <div className="sg-bloco">{voltar}<div className="sg-card sg-carregando"><span className="sg-spin" /> Carregando procedimento...</div></div>;

    const p = d.procedimento;
    const totalHosp = (p.vl_sh || 0) + (p.vl_sp || 0);
    const comp = d.compatibilidades;
    const nReg = (c) => d.nomesRegistro?.[c] || c;

    const ABAS = [
        { k: 'descricao', t: 'Descrição', n: p.ds_procedimento ? 1 : 0, sem: true },
        { k: 'cid', t: 'CID', n: d.cids.length },
        { k: 'cbo', t: 'CBO', n: d.cbos.length },
        { k: 'compat', t: 'Compatibilidades', n: comp.comoPrincipal.length + comp.comoSecundario.length + comp.excecoes.length },
        { k: 'servico', t: 'Serviço/Classificação', n: d.servicos.length },
        { k: 'habilitacao', t: 'Habilitação', n: d.habilitacoes.length + d.incrementos.length },
        { k: 'leito', t: 'Leito', n: d.leitos.length },
        { k: 'redes', t: 'Redes', n: d.redes.length },
        { k: 'origem', t: 'Origem', n: d.origens.length + d.siaSih.length },
        { k: 'regra', t: 'Regra Condicionada', n: d.regras.length },
        { k: 'renases', t: 'RENASES', n: d.renases.length },
        { k: 'tuss', t: 'TUSS', n: d.tuss.length },
        { k: 'historico', t: 'Histórico', n: d.historico.length }
    ];

    return (
        <div className="sg-bloco sg-ficha">
            {voltar}
            <div className="sg-card sg-ficha-cab">
                <div className="sg-trilha">
                    <button onClick={() => onFiltrar('grupo', codigo.slice(0, 2), `Grupo ${codigo.slice(0, 2)} - ${p.no_grupo}`)}>{codigo.slice(0, 2)} · {p.no_grupo}</button>
                    <span>›</span>
                    <button onClick={() => onFiltrar('subgrupo', codigo.slice(0, 4), `Subgrupo ${codigo.slice(2, 4)} - ${p.no_sub_grupo}`)}>{codigo.slice(2, 4)} · {p.no_sub_grupo}</button>
                    <span>›</span>
                    <button onClick={() => onFiltrar('forma', codigo.slice(0, 6), `Forma ${codigo.slice(4, 6)} - ${p.no_forma_organizacao}`)}>{codigo.slice(4, 6)} · {p.no_forma_organizacao}</button>
                </div>
                <div className="sg-ficha-titulo">
                    <button className="sg-codigo mono" onClick={copiar} title="Copiar código (sem pontuação)">{fmtProc(codigo)} <Icon n="clipboard" /></button>
                    <h3>{p.no_procedimento}</h3>
                </div>
                <div className="sg-selos">
                    <span className={`sg-cx cx${p.tp_complexidade}`}>{COMPLEXIDADE[p.tp_complexidade] || 'Complexidade -'}</span>
                    {p.no_financiamento && <span className="sg-selo">{p.no_financiamento}</span>}
                    {p.no_rubrica && <span className="sg-selo">Rubrica: {p.no_rubrica}</span>}
                    <span className="sg-selo sg-selo-comp">Competência {fmtComp(competencia)}</span>
                </div>
            </div>

            <div className="sg-ficha-grade">
                <div className="sg-card">
                    <div className="sg-card-tit"><h4><Icon n="clipboard" /> Atributos</h4></div>
                    <dl className="sg-atrib">
                        <div className="larga"><dt>Modalidade de atendimento</dt><dd>{d.modalidades.length ? d.modalidades.map(m => <span key={m.codigo} className="sg-tag">{m.nome}</span>) : '-'}</dd></div>
                        <div className="larga"><dt>Instrumento de registro</dt><dd>{d.registros.length ? d.registros.map(r => <span key={r.codigo} className="sg-tag forte" title={REGISTRO_SIGLA[r.codigo]}>{r.nome}</span>) : '-'}</dd></div>
                        <div><dt>Sexo</dt><dd>{SEXO[p.tp_sexo] || '-'}</dd></div>
                        <div><dt>Quantidade máxima</dt><dd className="mono">{fmtQtd(p.qt_maxima_execucao)}</dd></div>
                        <div><dt>Idade mínima</dt><dd title={`${p.vl_idade_minima} meses`}>{fmtIdade(p.vl_idade_minima)}</dd></div>
                        <div><dt>Idade máxima</dt><dd title={`${p.vl_idade_maxima} meses`}>{fmtIdade(p.vl_idade_maxima)}</dd></div>
                        <div><dt>Média de permanência</dt><dd className="mono">{fmtQtd(p.qt_dias_permanencia, ' dias')}</dd></div>
                        <div><dt>Tempo de permanência</dt><dd className="mono">{fmtQtd(p.qt_tempo_permanencia, ' dias')}</dd></div>
                        <div><dt>Pontos</dt><dd className="mono">{p.qt_pontos ? fmtNum(p.qt_pontos) : '-'}</dd></div>
                    </dl>
                    {d.detalhes.length > 0 && (
                        <div className="sg-detalhes">
                            <dt>Atributos complementares</dt>
                            {d.detalhes.map(x => (
                                <details key={x.codigo}>
                                    <summary><span className="mono">{x.codigo}</span> {x.nome}</summary>
                                    {x.descricao ? <p>{x.descricao}</p> : <p className="sg-muted">Sem descrição no pacote.</p>}
                                    <button className="sg-link" onClick={() => onFiltrar('detalhe', x.codigo, `Atributo ${x.codigo} - ${x.nome}`)}>Ver procedimentos com este atributo</button>
                                </details>
                            ))}
                        </div>
                    )}
                </div>

                <div className="sg-card sg-valores">
                    <div className="sg-card-tit"><h4><Icon n="trend" /> Valores</h4></div>
                    <div className="sg-val-bloco">
                        <span className="sg-val-tit">Ambulatorial</span>
                        <div className="sg-val-linha"><span>Serviço ambulatorial (SA)</span><b className="mono">{fmtMoeda(p.vl_sa)}</b></div>
                        <div className="sg-val-total"><span>Total ambulatorial</span><b className="mono">{fmtMoeda(p.vl_sa)}</b></div>
                    </div>
                    <div className="sg-val-bloco">
                        <span className="sg-val-tit">Hospitalar</span>
                        <div className="sg-val-linha"><span>Serviço hospitalar (SH)</span><b className="mono">{fmtMoeda(p.vl_sh)}</b></div>
                        <div className="sg-val-linha"><span>Serviço profissional (SP)</span><b className="mono">{fmtMoeda(p.vl_sp)}</b></div>
                        <div className="sg-val-total"><span>Total hospitalar</span><b className="mono">{fmtMoeda(totalHosp)}</b></div>
                    </div>
                    {d.incrementos.length > 0 && <p className="sg-hint">Possui {d.incrementos.length} incremento(s) por habilitação - veja a aba Habilitação.</p>}
                </div>
            </div>

            <div className="sg-card sg-ficha-abas">
                <div className="sg-subabas" role="tablist">
                    {ABAS.map(a => (
                        <button key={a.k} disabled={!a.n} className={aba === a.k ? 'ativo' : ''} onClick={() => setAba(a.k)}>
                            {a.t}{!a.sem && a.n > 0 && <em>{a.n}</em>}
                        </button>
                    ))}
                </div>
                <div className="sg-subaba-corpo">
                    {aba === 'descricao' && (p.ds_procedimento ? <p className="sg-descricao">{p.ds_procedimento}</p> : <p className="sg-vazio">Sem descrição.</p>)}
                    {aba === 'cid' && (
                        <ListaFiltravel itens={d.cids} chave={x => x.codigo} placeholder="Filtrar CID..." busca={x => `${x.codigo} ${fmtCid(x.codigo)} ${x.nome}`}
                            cab={['CID', 'Descrição', 'Principal', '']} linha={x => [
                                <span className="mono">{fmtCid(x.codigo)}</span>, x.nome,
                                x.principal === 'S' ? <span className="sg-badge ok">Sim</span> : <span className="sg-muted">Não</span>,
                                <button className="sg-link" onClick={() => onFiltrar('cid', x.codigo, `CID ${fmtCid(x.codigo)} - ${x.nome}`)}>procedimentos</button>
                            ]} />
                    )}
                    {aba === 'cbo' && (
                        <ListaFiltravel itens={d.cbos} chave={x => x.codigo} placeholder="Filtrar CBO..." busca={x => `${x.codigo} ${x.nome}`}
                            cab={['Código', 'Ocupação', '']} linha={x => [
                                <span className="mono">{x.codigo}</span>, x.nome,
                                <button className="sg-link" onClick={() => onFiltrar('ocupacao', x.codigo, `CBO ${x.codigo} - ${x.nome}`)}>procedimentos</button>
                            ]} />
                    )}
                    {aba === 'compat' && <AbaCompat comp={comp} nReg={nReg} onAbrir={onAbrir} />}
                    {aba === 'servico' && (
                        <ListaFiltravel itens={d.servicos} chave={x => x.servico + x.classificacao} busca={x => `${x.servico} ${x.nome_servico} ${x.classificacao} ${x.nome_classificacao}`}
                            cab={['Serviço', 'Classificação', '']} linha={x => [
                                <><span className="mono">{x.servico}</span> {x.nome_servico}</>,
                                <><span className="mono">{x.classificacao}</span> {x.nome_classificacao}</>,
                                <button className="sg-link" onClick={() => onFiltrar('servico', `${x.servico}.${x.classificacao}`, `Serviço ${x.servico}/${x.classificacao} - ${x.nome_classificacao}`)}>procedimentos</button>
                            ]} />
                    )}
                    {aba === 'habilitacao' && (
                        <>
                            {d.habilitacoes.length > 0 && (
                                <ListaFiltravel itens={d.habilitacoes} chave={x => x.codigo + (x.grupo || '')} busca={x => `${x.codigo} ${x.nome} ${x.nome_grupo || ''}`}
                                    cab={['Código', 'Habilitação', 'Grupo', '']} linha={x => [
                                        <span className="mono">{x.codigo}</span>, x.nome,
                                        x.grupo ? <span title={x.descricao_grupo || ''}><span className="mono">{x.grupo}</span> {x.nome_grupo}</span> : <span className="sg-muted">-</span>,
                                        <button className="sg-link" onClick={() => onFiltrar('habilitacao', x.codigo, `Habilitação ${x.codigo} - ${x.nome}`)}>procedimentos</button>
                                    ]} />
                            )}
                            {d.incrementos.length > 0 && (
                                <>
                                    <h5 className="sg-sub-tit">Incrementos por habilitação</h5>
                                    <ListaFiltravel itens={d.incrementos} chave={x => x.codigo} busca={x => `${x.codigo} ${x.nome}`}
                                        cab={['Habilitação', '% SH', '% SA', '% SP']} linha={x => [
                                            <><span className="mono">{x.codigo}</span> {x.nome}</>,
                                            <span className="mono">{fmtPerc(x.sh)}</span>, <span className="mono">{fmtPerc(x.sa)}</span>, <span className="mono">{fmtPerc(x.sp)}</span>
                                        ]} />
                                </>
                            )}
                        </>
                    )}
                    {aba === 'leito' && <ListaFiltravel itens={d.leitos} chave={x => x.codigo} busca={x => x.nome} cab={['Código', 'Tipo de leito']} linha={x => [<span className="mono">{x.codigo}</span>, x.nome]} />}
                    {aba === 'redes' && <ListaFiltravel itens={d.redes} chave={x => x.codigo} busca={x => `${x.nome} ${x.rede}`} cab={['Componente', 'Nome', 'Rede de atenção']} linha={x => [<span className="mono">{x.codigo}</span>, x.nome, x.rede]} />}
                    {aba === 'origem' && (
                        <>
                            {d.origens.length > 0 && <ListaFiltravel itens={d.origens} chave={x => x.codigo} busca={x => `${x.codigo} ${x.nome}`} cab={['Procedimento de origem', 'Nome']}
                                linha={x => [<button className="sg-link mono" onClick={() => onAbrir(x.codigo)}>{fmtProc(x.codigo)}</button>, x.nome]} />}
                            {d.siaSih.length > 0 && (
                                <>
                                    <h5 className="sg-sub-tit">Correspondência com a tabela antiga (SIA/SIH)</h5>
                                    <ListaFiltravel itens={d.siaSih} chave={x => x.codigo + x.tipo} busca={x => `${x.codigo} ${x.nome}`} cab={['Código', 'Nome', 'Tipo']}
                                        linha={x => [<span className="mono">{x.codigo}</span>, x.nome, SIA_SIH_TIPO[x.tipo] || x.tipo]} />
                                </>
                            )}
                        </>
                    )}
                    {aba === 'regra' && d.regras.map(x => (
                        <div key={x.codigo} className="sg-regra"><b><span className="mono">{x.codigo}</span> {x.nome}</b>{x.descricao && <p>{x.descricao}</p>}</div>
                    ))}
                    {aba === 'renases' && <ListaFiltravel itens={d.renases} chave={x => x.codigo} busca={x => `${x.codigo} ${x.nome}`} cab={['Código', 'RENASES']} linha={x => [<span className="mono">{x.codigo}</span>, x.nome]} />}
                    {aba === 'tuss' && <ListaFiltravel itens={d.tuss} chave={x => x.codigo} busca={x => `${x.codigo} ${x.nome}`} cab={['Código', 'TUSS']} linha={x => [<span className="mono">{x.codigo}</span>, x.nome]} />}
                    {aba === 'historico' && <AbaHistorico historico={d.historico} />}
                </div>
            </div>
        </div>
    );
}

function AbaCompat({ comp, nReg, onAbrir }) {
    const [lado, setLado] = useState(comp.comoPrincipal.length ? 'principal' : comp.comoSecundario.length ? 'secundario' : 'excecoes');
    const lista = lado === 'principal' ? comp.comoPrincipal : comp.comoSecundario;
    const grupos = useMemo(() => {
        const m = {};
        lista.forEach(x => {
            const k = `${x.reg_principal}-${x.reg_compativel}-${x.tipo}`;
            (m[k] = m[k] || { k, ...x, itens: [] }).itens.push(x);
        });
        return Object.values(m);
    }, [lista]);

    return (
        <div>
            <div className="sg-seg">
                <button className={lado === 'principal' ? 'ativo' : ''} disabled={!comp.comoPrincipal.length} onClick={() => setLado('principal')}>Como principal <em>{comp.comoPrincipal.length}</em></button>
                <button className={lado === 'secundario' ? 'ativo' : ''} disabled={!comp.comoSecundario.length} onClick={() => setLado('secundario')}>Como secundário <em>{comp.comoSecundario.length}</em></button>
                <button className={lado === 'excecoes' ? 'ativo' : ''} disabled={!comp.excecoes.length} onClick={() => setLado('excecoes')}>Exceções <em>{comp.excecoes.length}</em></button>
            </div>
            {lado !== 'excecoes' ? grupos.map(g => (
                <div key={g.k} className="sg-compat-grupo">
                    <div className="sg-compat-cab">
                        <span className={`sg-badge ${COMPATIBILIDADE[g.tipo]?.cor || ''}`}>{rotuloCompat(g.tipo)}</span>
                        <span>{nReg(g.reg_principal)} <b>×</b> {nReg(g.reg_compativel)}</span>
                        <small>{g.itens.length}</small>
                    </div>
                    <small className="sg-muted sg-compat-ajuda">{COMPATIBILIDADE[g.tipo]?.ajuda}</small>
                    <ListaFiltravel itens={g.itens} chave={x => x.codigo} limite={8} busca={x => `${x.codigo} ${fmtProc(x.codigo)} ${x.nome}`}
                        cab={['Procedimento', 'Nome', 'Qtd.']} linha={x => [
                            <button className="sg-link mono" onClick={() => onAbrir(x.codigo)}>{fmtProc(x.codigo)}</button>, x.nome,
                            <span className="mono">{x.quantidade ?? '-'}</span>
                        ]} />
                </div>
            )) : (
                <ListaFiltravel itens={comp.excecoes} chave={x => x.restricao + x.principal + x.compativel} busca={x => `${x.restricao} ${x.principal} ${x.compativel} ${x.nome_restricao} ${x.nome_principal} ${x.nome_compativel}`}
                    cab={['Restrição', 'Principal', 'Compatível', 'Tipo']} linha={x => [
                        <><button className="sg-link mono" onClick={() => onAbrir(x.restricao)}>{fmtProc(x.restricao)}</button> <small className="sg-cel-nome">{x.nome_restricao}</small></>,
                        <><button className="sg-link mono" onClick={() => onAbrir(x.principal)}>{fmtProc(x.principal)}</button> <small className="sg-cel-nome">{x.nome_principal} · {nReg(x.reg_principal)}</small></>,
                        <><button className="sg-link mono" onClick={() => onAbrir(x.compativel)}>{fmtProc(x.compativel)}</button> <small className="sg-cel-nome">{x.nome_compativel} · {nReg(x.reg_compativel)}</small></>,
                        rotuloCompat(x.tipo)
                    ]} />
            )}
        </div>
    );
}

function AbaHistorico({ historico }) {
    const campos = [
        ['vl_sa', 'SA', fmtMoeda], ['vl_sh', 'SH', fmtMoeda], ['vl_sp', 'SP', fmtMoeda],
        ['tp_complexidade', 'Complexidade', v => COMPLEXIDADE[v] || v], ['qt_maxima_execucao', 'Qtd. máx.', v => fmtQtd(v)],
        ['vl_idade_minima', 'Idade mín.', fmtIdade], ['vl_idade_maxima', 'Idade máx.', fmtIdade]
    ];
    return (
        <div>
            <div className="sg-tabela-wrap">
                <table className="sg-tabela sg-resp">
                    <thead><tr><th>Competência</th>{campos.map(c => <th key={c[0]}>{c[1]}</th>)}</tr></thead>
                    <tbody>
                        {historico.map((h, i) => {
                            const ant = historico[i + 1];
                            return (
                                <tr key={h.competencia}>
                                    <td data-l="Competência" className="mono"><b>{fmtComp(h.competencia)}</b>{ant && ant.no_procedimento !== h.no_procedimento && <div className="sg-cel-sub sg-mudou">nome alterado</div>}</td>
                                    {campos.map(([k, rot, f]) => (
                                        <td key={k} data-l={rot} className={`mono ${ant && ant[k] !== h[k] ? 'sg-mudou' : ''}`}>{f(h[k])}</td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/** Tabela com filtro local (aparece quando há muitos itens) e "mostrar mais". */
function ListaFiltravel({ itens, cab, linha, chave, busca, placeholder = 'Filtrar...', limite = 50 }) {
    const [f, setF] = useState('');
    const [todos, setTodos] = useState(false);
    const filtrados = useMemo(() => {
        const t = f.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (!t) return itens;
        return itens.filter(x => busca(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t));
    }, [itens, f, busca]);
    const visiveis = todos ? filtrados : filtrados.slice(0, limite);
    return (
        <div className="sg-lista-filtravel">
            {itens.length > 8 && (
                <div className="sg-filtro-local">
                    <Icon n="search" /><input value={f} onChange={e => setF(e.target.value)} placeholder={placeholder} />
                    <small>{filtrados.length} de {itens.length}</small>
                </div>
            )}
            <div className="sg-tabela-wrap">
                <table className="sg-tabela sg-resp sg-compacta">
                    <thead><tr>{cab.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                    <tbody>
                        {visiveis.map(x => (
                            <tr key={chave(x)}>{linha(x).map((cel, i) => <td key={i} data-l={cab[i]}>{cel}</td>)}</tr>
                        ))}
                        {!visiveis.length && <tr><td colSpan={cab.length} className="sg-vazio">Nada encontrado.</td></tr>}
                    </tbody>
                </table>
            </div>
            {!todos && filtrados.length > limite && (
                <button className="sg-mais-itens" onClick={() => setTodos(true)}>Mostrar todos ({filtrados.length})</button>
            )}
        </div>
    );
}

// ============================================================================ COMPATIBILIDADES
function Compatibilidades({ competencia, onAbrir }) {
    const [tipos, setTipos] = useState([]);
    const [filtro, setFiltro] = useState({ tipo: '', principal: '', secundario: '' });
    const [aplicado, setAplicado] = useState(null);
    const [pagina, setPagina] = useState(1);
    const [res, setRes] = useState({ itens: [], total: 0, tamanho: 25 });
    const [carregando, setCarregando] = useState(false);

    useEffect(() => {
        api.get('/sigtap/compatibilidades/tipos', { params: { competencia } }).then(r => setTipos(r.data.tipos || [])).catch(() => setTipos([]));
    }, [competencia]);

    useEffect(() => {
        if (!aplicado) return;
        setCarregando(true);
        api.get('/sigtap/compatibilidades', { params: { ...aplicado, competencia, pagina, tamanho: 25 } })
            .then(r => setRes(r.data))
            .catch(e => Swal.fire('Erro', erroMsg(e, 'Falha na consulta.'), 'error'))
            .finally(() => setCarregando(false));
    }, [aplicado, pagina, competencia]);

    const rotuloTipo = (t) => `${t.nome_principal} x ${t.nome_compativel} (${rotuloCompat(t.tipo)})`;
    const paginas = Math.max(1, Math.ceil((res.total || 0) / (res.tamanho || 25)));
    const buscar = (e) => { e?.preventDefault(); setPagina(1); setAplicado({ ...filtro }); };
    const totalPares = tipos.reduce((a, t) => a + t.quantidade, 0);

    return (
        <div className="sg-bloco">
            <form className="sg-card sg-busca" onSubmit={buscar}>
                <div className="sg-hier sg-hier-compat">
                    <label className="larga">Compatibilidade
                        <select className="form-control" value={filtro.tipo} onChange={e => { const f = { ...filtro, tipo: e.target.value }; setFiltro(f); setPagina(1); setAplicado(f); }}>
                            <option value="">Todos ({fmtNum(totalPares)})</option>
                            {tipos.map(t => {
                                const v = `${t.reg_principal}-${t.reg_compativel}-${t.tipo}`;
                                return <option key={v} value={v}>{rotuloTipo(t)} - {fmtNum(t.quantidade)}</option>;
                            })}
                        </select>
                    </label>
                    <label>Procedimento principal
                        <input className="form-control" value={filtro.principal} placeholder="Código ou nome" onChange={e => setFiltro({ ...filtro, principal: e.target.value })} />
                    </label>
                    <label>Procedimento secundário / compatível
                        <input className="form-control" value={filtro.secundario} placeholder="Código ou nome" onChange={e => setFiltro({ ...filtro, secundario: e.target.value })} />
                    </label>
                </div>
                <div className="sg-filtros-acoes">
                    <button type="button" className="sg-btn sg-btn-out" onClick={() => { setFiltro({ tipo: '', principal: '', secundario: '' }); setAplicado(null); setRes({ itens: [], total: 0, tamanho: 25 }); }}>Limpar</button>
                    <button type="submit" className="sg-btn"><Icon n="search" /> Consultar</button>
                </div>
            </form>

            {!aplicado ? (
                <div className="sg-card">
                    <div className="sg-card-tit"><h4><Icon n="puzzle" /> Como ler as compatibilidades</h4></div>
                    <div className="sg-legenda">
                        {Object.entries(COMPATIBILIDADE).map(([k, v]) => (
                            <div key={k}><span className={`sg-badge ${v.cor}`}>{v.rotulo}</span><p>{v.ajuda}</p></div>
                        ))}
                    </div>
                    <div className="sg-tipos">
                        {tipos.map(t => {
                            const v = `${t.reg_principal}-${t.reg_compativel}-${t.tipo}`;
                            return (
                                <button key={v} className="sg-tipo" onClick={() => { const f = { ...filtro, tipo: v }; setFiltro(f); setPagina(1); setAplicado(f); }}>
                                    <span className={`sg-badge ${COMPATIBILIDADE[t.tipo]?.cor || ''}`}>{rotuloCompat(t.tipo)}</span>
                                    <b>{t.nome_principal}</b><small>× {t.nome_compativel}</small>
                                    <em className="mono">{fmtNum(t.quantidade)}</em>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="sg-card">
                    <div className="sg-card-tit"><h4><Icon n="puzzle" /> {carregando ? 'Consultando...' : `${fmtNum(res.total)} regra${res.total === 1 ? '' : 's'}`}</h4></div>
                    <div className={`sg-tabela-wrap ${carregando ? 'carregando' : ''}`}>
                        <table className="sg-tabela sg-resp">
                            <thead><tr><th>Procedimento principal</th><th>Procedimento secundário</th><th>Tipo</th><th className="r">Qtd.</th></tr></thead>
                            <tbody>
                                {!carregando && !res.itens.length && <tr><td colSpan={4} className="sg-vazio">Nenhuma compatibilidade encontrada.</td></tr>}
                                {res.itens.map(x => (
                                    <tr key={`${x.principal}${x.reg_principal}${x.secundario}${x.reg_compativel}`}>
                                        <td data-l="Principal"><button className="sg-link mono" onClick={() => onAbrir(x.principal)}>{fmtProc(x.principal)}</button><div className="sg-cel-nome">{x.nome_principal}</div><span className="sg-reg">{REGISTRO_SIGLA[x.reg_principal] || x.reg_principal}</span></td>
                                        <td data-l="Secundário"><button className="sg-link mono" onClick={() => onAbrir(x.secundario)}>{fmtProc(x.secundario)}</button><div className="sg-cel-nome">{x.nome_secundario}</div><span className="sg-reg">{REGISTRO_SIGLA[x.reg_compativel] || x.reg_compativel}</span></td>
                                        <td data-l="Tipo"><span className={`sg-badge ${COMPATIBILIDADE[x.tipo]?.cor || ''}`} title={COMPATIBILIDADE[x.tipo]?.ajuda}>{rotuloCompat(x.tipo)}</span></td>
                                        <td data-l="Qtd." className="r mono">{x.quantidade ?? '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Paginacao pagina={pagina} paginas={paginas} total={res.total} rotulo="regras" onIr={setPagina} />
                </div>
            )}
        </div>
    );
}

// ============================================================================ TABELAS AUXILIARES
const EXTRAS_ROTULO = { grupo: 'Grupo', sub_grupo: 'Subgrupo', servico: 'Serviço', descricao: 'Descrição', rede: 'Rede', sexo: 'Sexo', agravo: 'Agravo', estadio: 'Estádio', campos_irradiados: 'Campos irrad.', tipo: 'Tipo' };

function TabelasAuxiliares({ competencia, onFiltrar }) {
    const [lista, setLista] = useState([]);
    const [tabela, setTabela] = useState('ocupacao');
    const [texto, setTexto] = useState('');
    const [q, setQ] = useState('');
    const [pagina, setPagina] = useState(1);
    const [res, setRes] = useState({ itens: [], total: 0, tamanho: 25 });
    const [carregando, setCarregando] = useState(false);

    useEffect(() => { api.get('/sigtap/tabelas').then(r => setLista(r.data || [])).catch(() => setLista([])); }, []);
    useEffect(() => { const t = setTimeout(() => { setQ(texto); setPagina(1); }, 400); return () => clearTimeout(t); }, [texto]);
    useEffect(() => {
        setCarregando(true);
        api.get(`/sigtap/tabelas/${tabela}`, { params: { competencia, q, pagina, tamanho: 25 } })
            .then(r => setRes(r.data))
            .catch(e => { setRes({ itens: [], total: 0, tamanho: 25 }); Swal.fire('Erro', erroMsg(e, 'Falha na consulta.'), 'error'); })
            .finally(() => setCarregando(false));
    }, [tabela, q, pagina, competencia]);

    const extras = res.itens[0] ? Object.keys(res.itens[0]).filter(k => !['codigo', 'nome', 'qt_procedimentos'].includes(k)) : [];
    const paginas = Math.max(1, Math.ceil((res.total || 0) / (res.tamanho || 25)));
    const fmtCodigo = (c) => (tabela === 'cid' ? fmtCid(c) : c);
    const fmtExtra = (k, v) => (k === 'sexo' ? SEXO[v] || v : k === 'tipo' ? SIA_SIH_TIPO[v] || v : v ?? '-');

    return (
        <div className="sg-bloco">
            <div className="sg-card sg-busca">
                <div className="sg-tabs-ref">
                    {lista.map(t => <button key={t.chave} className={tabela === t.chave ? 'ativo' : ''} onClick={() => { setTabela(t.chave); setPagina(1); }}>{t.titulo}</button>)}
                </div>
                <div className="sg-busca-campo">
                    <Icon n="search" />
                    <input value={texto} onChange={e => setTexto(e.target.value)} placeholder={`Buscar em ${lista.find(t => t.chave === tabela)?.titulo || 'tabela'} por código ou nome`} />
                    {texto && <button type="button" className="sg-x" onClick={() => setTexto('')}>×</button>}
                </div>
            </div>
            <div className="sg-card">
                <div className="sg-card-tit"><h4><Icon n="grid" /> {res.titulo || 'Tabela'}</h4><small className="sg-muted">{carregando ? 'Carregando...' : `${fmtNum(res.total)} registros`}</small></div>
                <div className={`sg-tabela-wrap ${carregando ? 'carregando' : ''}`}>
                    <table className="sg-tabela sg-resp">
                        <thead><tr><th>Código</th><th>Nome</th>{extras.map(k => <th key={k}>{EXTRAS_ROTULO[k] || k}</th>)}<th className="r">Procedimentos</th></tr></thead>
                        <tbody>
                            {!carregando && !res.itens.length && <tr><td colSpan={3 + extras.length} className="sg-vazio">Nenhum registro encontrado.</td></tr>}
                            {res.itens.map(x => (
                                <tr key={x.codigo}>
                                    <td data-l="Código" className="mono">{fmtCodigo(x.codigo)}</td>
                                    <td data-l="Nome">{x.nome}</td>
                                    {extras.map(k => <td key={k} data-l={EXTRAS_ROTULO[k] || k} className={k === 'descricao' ? 'sg-desc-cel' : ''}>{fmtExtra(k, x[k])}</td>)}
                                    <td data-l="Procedimentos" className="r">
                                        {x.qt_procedimentos > 0
                                            ? <button className="sg-btn sg-btn-out sg-btn-sm" onClick={() => onFiltrar(res.vinculo, x.codigo, `${res.titulo}: ${fmtCodigo(x.codigo)} - ${x.nome}`)}>{fmtNum(x.qt_procedimentos)} <Icon n="arrow-right" /></button>
                                            : <span className="sg-muted">0</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <Paginacao pagina={pagina} paginas={paginas} total={res.total} rotulo="registros" onIr={setPagina} />
            </div>
        </div>
    );
}

function Paginacao({ pagina, paginas, total, rotulo, onIr }) {
    if (paginas <= 1) return null;
    return (
        <div className="sg-pager">
            <span>{fmtNum(total)} {rotulo}</span>
            <button className="sg-ic-btn" disabled={pagina <= 1} onClick={() => onIr(1)} title="Primeira">«</button>
            <button className="sg-ic-btn" disabled={pagina <= 1} onClick={() => onIr(pagina - 1)} title="Anterior"><Icon n="arrow-left" /></button>
            <b>{pagina} / {paginas}</b>
            <button className="sg-ic-btn" disabled={pagina >= paginas} onClick={() => onIr(pagina + 1)} title="Próxima"><Icon n="arrow-right" /></button>
            <button className="sg-ic-btn" disabled={pagina >= paginas} onClick={() => onIr(paginas)} title="Última">»</button>
        </div>
    );
}
