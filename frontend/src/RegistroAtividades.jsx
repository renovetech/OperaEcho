/* ARQUIVO: src/RegistroAtividades.js */
import React, { useState, useEffect } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';

/* Data de HOJE no fuso LOCAL (YYYY-MM-DD). Evita o bug do toISOString(),
 * que converte para UTC e, à noite (BRT = UTC-3), "pula" para o dia seguinte. */
const hojeLocal = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function RegistroAtividades({ aoVoltar, lotacaoFixa, apiBase = '', moduloAcesso, permissaoNovo, permissaoEditar }) {
    // --- ESTADOS DE LISTAS ---
    const [implantadores, setImplantadores] = useState([]);
    const [motivosOpcoes, setMotivosOpcoes] = useState([]);
    const [projetos, setProjetos] = useState([]);
    const [unidadesForm, setUnidadesForm] = useState([]); 
    const [produtosDisponiveis, setProdutosDisponiveis] = useState([]);

    // --- ESTADOS DE FILTRO E PAGINAÇÃO ---
    const [filtros, setFiltros] = useState({
        dataInicio: '', dataFim: '', id_implantador: '', 
        id_projeto: '', id_unidade: '', motivo: '', termo: ''
    });
    const [unidadesFiltro, setUnidadesFiltro] = useState([]);
    
    // Paginação
    const [pagina, setPagina] = useState(1);
    const [totalPaginas, setTotalPaginas] = useState(1);
    const [totalRegistros, setTotalRegistros] = useState(0);
    const [carregando, setCarregando] = useState(false);

    // --- ESTADO DO FORMULÁRIO ---
    const formInicial = {
        id_atividade: '', 
        data_inicio: hojeLocal(), 
        data_fim: '', 
        redmine: '', profissionais_env: '', tempo_gasto: '', implantadores_ids: [], equipe_projeto_ids: [], motivos_selecionados: [],
        id_projeto: '', id_unidade: '', produtos_selecionados: [], 
        arquivos: [], 
        arquivosAntigos: []
    };

    const [form, setForm] = useState(formInicial);
    const [modoPesquisa, setModoPesquisa] = useState(true);
    const [listaAtividades, setListaAtividades] = useState([]);
    const [implantadorTemp, setImplantadorTemp] = useState('');
    // Equipe do Projeto (motivo "Apoio ao Projeto"): todos os profissionais da lotação do projeto.
    const [profissionaisProjeto, setProfissionaisProjeto] = useState([]);
    const [equipeProjetoTemp, setEquipeProjetoTemp] = useState('');

    // --- PERMISSÕES (Default: bloqueado) ---
    const [permissoes, setPermissoes] = useState({ pode_acessar: false, pode_novo: false, pode_editar: false });

    // --- REGRAS DINÂMICAS DE OBRIGATORIEDADE ---
    const isMotivoApoio = form.motivos_selecionados.includes('Apoio ao Projeto');
    // Retirado 'Apoio ao Projeto' da lista de motivos sem profissionais
    const isMotivoSemProfissionais = form.motivos_selecionados.some(m => ['Visita Técnica'].includes(m));
    
    // REGRA 1: no "Apoio ao Projeto" a Qtd de Profissionais NÃO é obrigatória.
    const isObrigatorioProfissionais = form.motivos_selecionados.some(m => ['Implantação', 'Treinamento'].includes(m)) && !isMotivoSemProfissionais;
    // PARÂMETRO (menu Parâmetros): anexo obrigatório por módulo. Desligado => opcional em qualquer motivo.
    // Regras independentes por módulo (sufixo _implantacao / _projetos): anexo, horas e equipe do Apoio.
    const [regras, setRegras] = useState({ anexo: true, horas: true, equipeApoio: true });
    const anexoExigido = regras.anexo;
    const isAnexoObrigatorio = anexoExigido && !isMotivoApoio; // Se for Apoio, o anexo NÃO é obrigatório
    const isHorasObrigatorias = regras.horas;
    const isEquipeApoioObrigatoria = regras.equipeApoio && isMotivoApoio;

    useEffect(() => {
        const sufixo = apiBase === '/projetos' ? 'projetos' : 'implantacao';
        api.get('/parametros')
            .then(r => {
                const ligado = (k) => { const v = r.data?.[`${k}_${sufixo}`]; return v === undefined ? true : (v === '1' || v === 'true'); };
                setRegras({ anexo: ligado('anexo_obrigatorio'), horas: ligado('horas_obrigatorias'), equipeApoio: ligado('equipe_apoio_obrigatoria') });
            })
            .catch(() => {}); // sem resposta: mantém a regra padrão (obrigatório)
    }, [apiBase]);

    // --- EFEITOS ---
    useEffect(() => { 
        carregarListas(); 
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    // Permissões: em modo Projetos vêm do componente pai (isolado por lotação);
    // em modo Implantação são carregadas do próprio módulo.
    useEffect(() => { 
        carregarPermissoes(); 
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permissaoNovo, permissaoEditar]);
    
    useEffect(() => { 
        if (modoPesquisa) buscarAtividades(); 
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, modoPesquisa]); 

    // --- CARREGAR PERMISSÕES ---
    const carregarPermissoes = async () => {
        // Modo Projetos: o pai já resolveu as permissões do módulo isolado (proj_*).
        if (typeof permissaoNovo === 'boolean' || typeof permissaoEditar === 'boolean') {
            setPermissoes({ pode_acessar: true, pode_novo: !!permissaoNovo, pode_editar: !!permissaoEditar });
            return;
        }
        try {
            const session = sessionStorage.getItem('usuario_opera'); 
            const usuarioLogado = session ? JSON.parse(session) : null;

            if (usuarioLogado && usuarioLogado.perfil_acesso) {
                if (usuarioLogado.perfil_acesso === 'Administrador') {
                    setPermissoes({ pode_acessar: true, pode_novo: true, pode_editar: true });
                } else {
                    const resRegras = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                    const regra = resRegras.data.find(r => r.nome_modulo === (moduloAcesso || 'registro_atividades'));
                    
                    if (regra) {
                        setPermissoes({ 
                            pode_acessar: regra.pode_acessar, 
                            pode_novo: regra.pode_novo, 
                            pode_editar: regra.pode_editar 
                        });
                    }
                }
            }
        } catch (error) { console.error("Erro ao carregar permissões", error); }
    };

    const iniciarNovoRegistro = () => {
        setModoPesquisa(false); 
        setForm({...formInicial, implantadores_ids: []}); 
        setImplantadorTemp('');
    };

    // --- Carregamento de Unidades do Filtro ---
    useEffect(() => {
        if (filtros.id_projeto) {
            api.get(`/unidades/buscar?projeto=${filtros.id_projeto}&status=true&limite=1000`)
               .then(res => {
                   if (res.data && Array.isArray(res.data.dados)) {
                       setUnidadesFiltro(res.data.dados);
                   } else if (Array.isArray(res.data)) {
                       setUnidadesFiltro(res.data);
                   } else {
                       setUnidadesFiltro([]);
                   }
               })
               .catch(() => setUnidadesFiltro([]));
        } else {
            setUnidadesFiltro([]);
        }
    }, [filtros.id_projeto]);

    const carregarListas = async () => {
        try {
            const [resProjetos, resImp] = await Promise.all([
                api.get('/projetos'),
                api.get(lotacaoFixa ? `/implantadores?id_projeto=${lotacaoFixa}` : '/implantadores')
            ]);
            const _lp = resProjetos.data.filter(p => p.ativo);
            setProjetos(lotacaoFixa ? _lp.filter(p => String(p.id_projeto) === String(lotacaoFixa)) : _lp);
            setImplantadores(resImp.data.filter(u => u.ativo));
            try {
                const resMotivos = await api.get('/motivos');
                setMotivosOpcoes(resMotivos.data);
            } catch (e) {
                setMotivosOpcoes([{descricao:'Implantação'},{descricao:'Treinamento'},{descricao:'Visita Técnica'}, {descricao:'Apoio ao Projeto'}]);
            }
        } catch (error) { console.error(error); }
    };

    useEffect(() => {
        if (lotacaoFixa) {
            setFiltros(f => ({ ...f, id_projeto: String(lotacaoFixa) }));
            setForm(f => ({ ...f, id_projeto: String(lotacaoFixa) }));
        }
    }, [lotacaoFixa]);

    const buscarAtividades = async () => {
        setCarregando(true);
        // Trava a busca na lotação selecionada no topo (submenu Projetos),
        // evitando que registros de outras lotações do escopo apareçam.
        const filtrosEfetivos = { ...filtros };
        if (lotacaoFixa) filtrosEfetivos.id_projeto = String(lotacaoFixa);
        const params = new URLSearchParams({...filtrosEfetivos, pagina: pagina, limite: 50}).toString();
        try {
            const res = await api.get(`${apiBase}/atividades/buscar?${params}`);
            setListaAtividades(res.data.dados || []);
            setTotalPaginas(res.data.totalPaginas || 1);
            setTotalRegistros(res.data.total || 0);
        } catch (e) { console.error(e); }
        finally { setCarregando(false); }
    };

    const handlePesquisarClick = () => {
        setPagina(1);
        buscarAtividades();
    };

    const limparFiltros = () => {
        setFiltros({ dataInicio: '', dataFim: '', id_implantador: '', id_projeto: '', id_unidade: '', motivo: '', termo: '' });
        setPagina(1);
        setTimeout(() => handlePesquisarClick(), 100);
    };

    const mudarPagina = (novaPagina) => {
        if (novaPagina >= 1 && novaPagina <= totalPaginas) setPagina(novaPagina);
    };

    // --- Carregamento de Unidades do Formulário ---
    // Carrega TODOS os profissionais vinculados à lotação (projeto) - reusa a
    // rota /implantadores?id_projeto, que já devolve a equipe do projeto.
    const carregarProfissionaisProjeto = async (idProj) => {
        if (!idProj) { setProfissionaisProjeto([]); return; }
        try {
            const res = await api.get(`/implantadores?id_projeto=${idProj}`);
            setProfissionaisProjeto(Array.isArray(res.data) ? res.data.filter(u => u.ativo) : []);
        } catch (e) { console.error(e); setProfissionaisProjeto([]); }
    };

    const handleProjetoChangeForm = async (e) => {
        const idProj = e.target.value;
        setForm(prev => ({ ...prev, id_projeto: idProj, id_unidade: '', produtos_selecionados: [], equipe_projeto_ids: [] }));
        setProdutosDisponiveis([]);
        setUnidadesForm([]);
        setEquipeProjetoTemp('');
        if (idProj) {
            try {
                const res = await api.get(`/unidades/buscar?projeto=${idProj}&status=true&limite=1000`);
                if (res.data && Array.isArray(res.data.dados)) {
                    setUnidadesForm(res.data.dados);
                } else if (Array.isArray(res.data)) {
                    setUnidadesForm(res.data);
                } else {
                    setUnidadesForm([]);
                }
            } catch (e) { console.error(e); }
            // REGRA 2: ao escolher o projeto com Apoio marcado, carrega a equipe do projeto.
            if (isMotivoApoio) carregarProfissionaisProjeto(idProj);
        } else {
            setProfissionaisProjeto([]);
        }
    };

    const handleUnidadeChangeForm = async (e) => {
        const idUni = e.target.value;
        
        setForm(prev => ({ ...prev, id_unidade: idUni, produtos_selecionados: [] }));
        
        if (idUni) {
            try {
                const res = await api.get(`/unidades/${idUni}/produtos`);
                if (Array.isArray(res.data)) setProdutosDisponiveis(res.data.filter(p => p.ativo));
            } catch (e) { setProdutosDisponiveis([]); }
        } else { setProdutosDisponiveis([]); }
    };

    const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

    // Máscara h:mm (até 4 dígitos de hora -> 9999:59). Os 2 últimos dígitos são os minutos.
    const handleTempoGastoChange = (e) => {
        let v = e.target.value.replace(/\D/g, '').slice(0, 6);
        if (v.length >= 3) v = v.slice(0, -2) + ':' + v.slice(-2);
        setForm(prev => ({ ...prev, tempo_gasto: v }));
    };
    // Ao sair do campo completa a hora com zero à esquerda ("8:30" -> "08:30").
    const handleTempoGastoBlur = () => {
        setForm(prev => {
            const t = (prev.tempo_gasto || '').trim();
            return /^\d:\d{2}$/.test(t) ? { ...prev, tempo_gasto: '0' + t } : prev;
        });
    };
    
    const adicionarImplantador = () => {
        if (!implantadorTemp) return;
        const id = parseInt(implantadorTemp);
        if (!form.implantadores_ids.includes(id)) setForm(prev => ({ ...prev, implantadores_ids: [...prev.implantadores_ids, id] }));
        setImplantadorTemp(''); 
    };

    const removerImplantador = (id) => setForm(prev => ({ ...prev, implantadores_ids: prev.implantadores_ids.filter(itemId => itemId !== id) }));

    const adicionarEquipeProjeto = () => {
        if (!equipeProjetoTemp) return;
        const id = parseInt(equipeProjetoTemp);
        if (!form.equipe_projeto_ids.includes(id)) setForm(prev => ({ ...prev, equipe_projeto_ids: [...prev.equipe_projeto_ids, id] }));
        setEquipeProjetoTemp('');
    };
    const removerEquipeProjeto = (id) => setForm(prev => ({ ...prev, equipe_projeto_ids: prev.equipe_projeto_ids.filter(itemId => itemId !== id) }));

    const handleMotivoCheck = (desc) => {
        setForm(prev => {
            const novosMotivos = [desc];
            let profissionaisValue = prev.profissionais_env;
            // Limpa o campo de profissionais APENAS se for Visita Técnica
            if (['Visita Técnica'].includes(desc)) profissionaisValue = ''; 
            // Sai do Apoio -> limpa a equipe do projeto selecionada.
            const equipeProj = desc === 'Apoio ao Projeto' ? prev.equipe_projeto_ids : [];
            return { ...prev, motivos_selecionados: novosMotivos, profissionais_env: profissionaisValue, equipe_projeto_ids: equipeProj };
        });
        // REGRA 2: ao marcar Apoio com projeto já selecionado, carrega a equipe do projeto.
        if (desc === 'Apoio ao Projeto') {
            if (form.id_projeto) carregarProfissionaisProjeto(form.id_projeto);
        } else {
            setProfissionaisProjeto([]);
            setEquipeProjetoTemp('');
        }
    };

    const handleProdutoCheck = (nome) => {
        setForm(prev => {
            const sels = [...prev.produtos_selecionados];
            return { ...prev, produtos_selecionados: sels.includes(nome) ? sels.filter(p => p !== nome) : [...sels, nome] };
        });
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        setForm(prev => ({ ...prev, arquivos: [...prev.arquivos, ...files] }));
    };

    const removerArquivoNovo = (index) => {
        setForm(prev => {
            const novosArquivos = [...prev.arquivos];
            novosArquivos.splice(index, 1);
            return { ...prev, arquivos: novosArquivos };
        });
    };

    const removerArquivoAntigo = (caminhoParaRemover) => {
        setForm(prev => ({
            ...prev,
            arquivosAntigos: prev.arquivosAntigos.filter(caminho => caminho !== caminhoParaRemover)
        }));
    };
    
    const handleEditar = async (atividade) => {
        if (atividade.id_projeto) {
            const resUni = await api.get(`/unidades/buscar?projeto=${atividade.id_projeto}&status=true&limite=1000`);
            if (resUni.data && Array.isArray(resUni.data.dados)) {
                setUnidadesForm(resUni.data.dados);
            } else if (Array.isArray(resUni.data)) {
                setUnidadesForm(resUni.data);
            }
        }
        if (atividade.id_unidade) {
            const resProd = await api.get(`/unidades/${atividade.id_unidade}/produtos`);
            if(Array.isArray(resProd.data)) setProdutosDisponiveis(resProd.data.filter(p => p.ativo));
        }
        let idsRecuperados = [];
        if (atividade.lista_implantadores?.length > 0) idsRecuperados = atividade.lista_implantadores.map(u => u.id_usuario);
        else if (atividade.id_implantador) idsRecuperados = [atividade.id_implantador];

        const idsEquipeProj = atividade.lista_equipe_projeto?.length > 0
            ? atividade.lista_equipe_projeto.map(u => u.id_usuario) : [];
        const motivosRecuperados = atividade.motivos ? atividade.motivos.split(', ') : [];
        if (motivosRecuperados.includes('Apoio ao Projeto') && atividade.id_projeto) {
            carregarProfissionaisProjeto(atividade.id_projeto);
        } else {
            setProfissionaisProjeto([]);
        }

        let arquivosSalvos = [];
        if (atividade.caminho_arquivo) {
            if (typeof atividade.caminho_arquivo === 'string') {
                arquivosSalvos = atividade.caminho_arquivo.split(',').map(c => c.trim()).filter(c => c);
            } else if (Array.isArray(atividade.caminho_arquivo)) {
                arquivosSalvos = atividade.caminho_arquivo;
            }
        }

        setForm({
            id_atividade: atividade.id_atividade, 
            data_inicio: atividade.data_inicio ? atividade.data_inicio.split('T')[0] : '', 
            data_fim: atividade.data_fim ? atividade.data_fim.split('T')[0] : '', 
            redmine: atividade.redmine || '',
            profissionais_env: atividade.profissionais_env || '',
            tempo_gasto: atividade.tempo_gasto || '',
            implantadores_ids: idsRecuperados,
            equipe_projeto_ids: idsEquipeProj,
            motivos_selecionados: motivosRecuperados,
            id_projeto: atividade.id_projeto,
            id_unidade: atividade.id_unidade,
            produtos_selecionados: atividade.produtos_trabalhados ? atividade.produtos_trabalhados.split(', ') : [],
            arquivos: [], 
            arquivosAntigos: arquivosSalvos 
        });
        setImplantadorTemp(''); 
        setModoPesquisa(false);
    };

    const handleExcluir = async (id) => {
        if (!permissoes.pode_editar) return;

        const result = await Swal.fire({
            title: 'Tem certeza?',
            text: "Você não poderá reverter esta exclusão!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d32f2f',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sim, excluir!',
            cancelButtonText: 'Cancelar'
        });

        if (result.isConfirmed) {
            try {
                const atividadeExcluida = listaAtividades.find(a => a.id_atividade === id);
                if (atividadeExcluida) {
                    const session = sessionStorage.getItem('usuario_opera'); const usuarioLogado = session ? JSON.parse(session) : { nome_completo: 'Usuario' };

                    const dataFormatada = formatarDataTabela(atividadeExcluida.data_inicio, atividadeExcluida.data_fim);
                    const textoDetalhes = `[EXCLUÍDO] Data: ${dataFormatada} | Proj: ${atividadeExcluida.nome_projeto} | Uni: ${atividadeExcluida.nome_unidade} | Motivo: ${atividadeExcluida.motivos}`;

                    try {
                        await api.post('/rastreio-background', {
                            usuario: usuarioLogado.nome_completo || usuarioLogado.nome,
                            latitude: null, 
                            longitude: null,
                            tipo_registro: 'EXCLUSAO_ATIVIDADE',
                            detalhes_registro: textoDetalhes
                        });
                    } catch (rastreioErr) {
                        console.warn('Rastreio falhou, continuando exclusão:', rastreioErr);
                    }
                }

                await api.delete(`${apiBase}/atividades/${id}`);
                Swal.fire('Excluído!', 'O registro foi excluído.', 'success');
                buscarAtividades(); 
            } catch (error) {
                console.error("Erro ao excluir:", error);
                Swal.fire('Erro', 'Não foi possível excluir o registro.', 'error');
            }
        }
    };

    const handleSalvar = async (e) => {
        e.preventDefault();
        
        if (form.id_atividade && !permissoes.pode_editar) {
            return Swal.fire('Sem Permissão', 'Você não tem permissão para editar atividades.', 'error');
        }
        if (!form.id_atividade && !permissoes.pode_novo) {
            return Swal.fire('Sem Permissão', 'Você não tem permissão para criar atividades.', 'error');
        }

        if (!form.data_inicio || !form.id_unidade) return Swal.fire('Atenção', 'Preencha Data Início e Unidade.', 'warning');
        if (form.implantadores_ids.length === 0) return Swal.fire('Atenção', 'Adicione pelo menos um da equipe.', 'warning');
        if (form.motivos_selecionados.length === 0) return Swal.fire('Atenção', 'Selecione um Motivo.', 'warning');
        let tempo = (form.tempo_gasto || '').trim();
        if (/^\d:\d{2}$/.test(tempo)) tempo = '0' + tempo;
        if (!tempo && isHorasObrigatorias) return Swal.fire('Atenção', 'Informe o Tempo Gasto (hh:mm).', 'warning');
        if (tempo && !/^\d{2,4}:[0-5]\d$/.test(tempo)) return Swal.fire('Atenção', 'Tempo Gasto inválido. Use o formato hh:mm (minutos de 00 a 59).', 'warning');
        if (form.data_fim && new Date(form.data_fim) < new Date(form.data_inicio)) return Swal.fire('Erro', 'Data Fim menor que Data Início.', 'error');
        if (isObrigatorioProfissionais && !form.profissionais_env) return Swal.fire('Atenção', 'Informe a qtd de Profissionais.', 'warning');
        // REGRA 3: no "Apoio ao Projeto" a Equipe do Projeto é obrigatória.
        if (isEquipeApoioObrigatoria && form.equipe_projeto_ids.length === 0) return Swal.fire('Atenção', 'Selecione pelo menos um profissional na Equipe do Projeto.', 'warning');

        if (produtosDisponiveis.length > 0 && form.produtos_selecionados.length === 0) {
            return Swal.fire('Atenção', 'Selecione pelo menos um Produto Trabalhado.', 'warning');
        }

        // [MODIFICADO] Aplicação da regra do anexo flexível
        if (isAnexoObrigatorio && form.arquivos.length === 0 && form.arquivosAntigos.length === 0) {
            return Swal.fire('Atenção', 'É obrigatório manter ou anexar pelo menos um arquivo para este motivo.', 'warning');
        }

        const formData = new FormData();
        if(form.id_atividade) formData.append('id_atividade', form.id_atividade);
        
        formData.append('data_inicio', form.data_inicio);
        formData.append('data_fim', form.data_fim || form.data_inicio);
        formData.append('implantadores_ids', JSON.stringify(form.implantadores_ids));
        // Só envia equipe do projeto quando for Apoio ao Projeto (senão vai vazio e limpa).
        formData.append('equipe_projeto_ids', JSON.stringify(isMotivoApoio ? form.equipe_projeto_ids : []));

        Object.keys(form).forEach(key => {
            if (['id_atividade', 'data_inicio', 'data_fim', 'implantadores_ids', 'equipe_projeto_ids', 'arquivos', 'arquivosAntigos'].includes(key)) return; 
            if (key === 'motivos_selecionados') formData.append('motivos', form.motivos_selecionados.join(', '));
            else if (key === 'produtos_selecionados') formData.append('produtos_trabalhados', form.produtos_selecionados.join(', '));
            else if (key === 'tempo_gasto') formData.append('tempo_gasto', tempo);
            else formData.append(key, form[key]);
        });

        formData.append('arquivos_antigos_mantidos', form.arquivosAntigos.join(','));

        const session = sessionStorage.getItem('usuario_opera'); 
        const usuarioLogado = session ? JSON.parse(session) : {};
        formData.append('nome_usuario_upload', usuarioLogado.nome_completo || 'Usuario');

        form.arquivos.forEach((arquivo) => {
            formData.append(`anexos`, arquivo); 
        });

        Swal.fire({ title: 'Salvando...', didOpen: () => Swal.showLoading() });

        try {
            await api.post(`${apiBase}/atividades/salvar`, formData);
            Swal.fire({ icon: 'success', title: 'Salvo com sucesso!', timer: 1500, showConfirmButton: false });
            setForm(formInicial);
            setProdutosDisponiveis([]);
            setImplantadorTemp('');
            setEquipeProjetoTemp(''); setProfissionaisProjeto([]);
            setModoPesquisa(true);
            buscarAtividades();
        } catch (e) { 
            console.error(e);
            Swal.fire('Erro', 'Falha ao salvar registro.', 'error');
        }
    };

    const formatarDataTabela = (inicio, fim) => {
        if (!inicio) return '-';
        const d1 = inicio.split('T')[0].split('-').reverse().join('/');
        if (!fim || fim.split('T')[0] === inicio.split('T')[0]) return d1;
        const d2 = fim.split('T')[0].split('-').reverse().join('/');
        return `${d1} até ${d2}`;
    };
    
    const renderNomesImplantadores = (atividade) => {
        if (atividade.lista_implantadores?.length > 0) return atividade.lista_implantadores.map(u => u.nome_completo.split(' ')[0]).join(', ');
        if (atividade.nome_implantador) return atividade.nome_implantador.split(' ')[0];
        return '-';
    };

    const renderDownloadAnexos = (caminhoArquivoStr) => {
        if (!caminhoArquivoStr) return '-';

        let caminhos = [];
        if (typeof caminhoArquivoStr === 'string') {
            caminhos = caminhoArquivoStr.split(',').map(c => c.trim()).filter(c => c);
        } else if (Array.isArray(caminhoArquivoStr)) {
            caminhos = caminhoArquivoStr;
        } else {
            caminhos = [caminhoArquivoStr];
        }

        if (caminhos.length === 0) return '-';

        const baseUrl = api.defaults.baseURL || window.location.origin;

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center' }}>
                {caminhos.map((caminho, index) => {
                    const nomeArquivo = caminho.split('?')[0].split('/').pop() || `Anexo_${index+1}`;
                    const linkDownload = caminho.startsWith('http') ? caminho : `${baseUrl}/${caminho}`;
                    
                    return (
                        <a 
                            key={index} 
                            href={linkDownload} 
                            download 
                            target="_blank" 
                            rel="noreferrer" 
                            style={{
                                display: 'inline-block',
                                backgroundColor: 'var(--pine-700)',
                                color: '#fff',
                                textDecoration: 'none',
                                cursor: 'pointer',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '1rem',
                                lineHeight: '1',
                                textAlign: 'center'
                            }} 
                            title={`Baixar: ${nomeArquivo}`}
                        >
                            <Icon n="arrow-down"/>
                        </a>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="cadastro-container"> 
            <div className="page-header">
                <div className="header-title">
                    <span className="icon"><Icon n="check"/></span><h2>Registro de Atividades</h2>
                </div>
                <div>
                    {permissoes.pode_novo && (
                        <button className={`btn-tab ${!modoPesquisa ? 'ativo' : ''}`} onClick={iniciarNovoRegistro}>Novo Registro</button>
                    )}
                    <button className={`btn-tab ${modoPesquisa ? 'ativo' : ''}`} onClick={() => setModoPesquisa(true)}>Pesquisar</button>
                    <button 
                        className="btn-voltar" 
                        onClick={() => {
                            if (!modoPesquisa) {
                                setModoPesquisa(true);
                                setForm(formInicial);
                                setProdutosDisponiveis([]);
                                setImplantadorTemp('');
                                setEquipeProjetoTemp(''); setProfissionaisProjeto([]);
                            } else {
                                aoVoltar();
                            }
                        }}
                    >Voltar</button>
                </div>
            </div>

            {!modoPesquisa ? (
                <form className="form-card" onSubmit={handleSalvar}>
                    <h3>{form.id_atividade ? 'Editar Atividade' : 'Nova Atividade'}</h3>

                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>Data Início *</label>
                            <input type="date" min="1900-01-01" max="2100-12-31" className="form-control" name="data_inicio" value={form.data_inicio} onChange={handleChange} required />
                        </div>
                        <div className="form-group flex-1">
                            <label>Data Fim</label>
                            <input type="date" min="1900-01-01" max="2100-12-31" className="form-control" name="data_fim" value={form.data_fim} onChange={handleChange} />
                        </div>
                        <div className="form-group flex-1">
                            <label>Redmine</label>
                            <input type="number" className="form-control" name="redmine" value={form.redmine} onChange={handleChange} placeholder="140794" />
                        </div>
                        <div className="form-group flex-1">
                            <label>Profissionais {isObrigatorioProfissionais ? '*' : ''}</label>
                            <input 
                                type="number" className="form-control" name="profissionais_env" 
                                value={form.profissionais_env} onChange={handleChange} 
                                placeholder={isMotivoSemProfissionais ? "N/A" : "Qtd"} disabled={isMotivoSemProfissionais} 
                            />
                        </div>
                        <div className="form-group flex-1">
                            <label>Tempo Gasto {isHorasObrigatorias ? '*' : '(opcional)'}</label>
                            <input 
                                type="text" className="form-control" name="tempo_gasto" 
                                value={form.tempo_gasto} onChange={handleTempoGastoChange} onBlur={handleTempoGastoBlur}
                                placeholder="hh:mm" maxLength={7} inputMode="numeric"
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>Equipe da ação *</label>
                            <div style={{display: 'flex', gap: '10px'}}>
                                <select className="form-control" value={implantadorTemp} onChange={(e) => setImplantadorTemp(e.target.value)} style={{flex: 1}}>
                                    <option value="">Selecione para adicionar...</option>
                                    {implantadores.map(i => <option key={i.id_usuario} value={i.id_usuario}>{i.nome_completo}</option>)}
                                </select>
                                <button type="button" onClick={adicionarImplantador} className="btn-salvar" style={{padding: '0 20px', margin: 0}}>+</button>
                            </div>
                        </div>
                    </div>

                    <div style={{marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px'}}>
                        {form.implantadores_ids.map(id => {
                            const user = implantadores.find(u => u.id_usuario === id);
                            if (!user) return null;
                            return (
                                <div key={id} style={{
                                    background: '#e0e0e0', padding: '6px 12px', borderRadius: '20px', 
                                    display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#333'
                                }}>
                                    <span><Icon n="user"/> {user.nome_completo}</span>
                                    <button type="button" onClick={() => removerImplantador(id)} style={{background: 'transparent', border: 'none', color: '#d32f2f', fontWeight: 'bold', cursor: 'pointer', fontSize:'1.1rem'}}>×</button>
                                </div>
                            )
                        })}
                    </div>

                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label style={{color: 'var(--pine)', fontSize:'1rem'}}>Motivo da Visita (Selecione um) *</label>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop:'5px' }}>
                                {motivosOpcoes.map(m => {
                                    const isSelected = form.motivos_selecionados.includes(m.descricao);
                                    return (
                                        <div key={m.id || m.descricao} onClick={() => handleMotivoCheck(m.descricao)}
                                            style={{
                                                cursor: 'pointer', padding: '10px 20px', borderRadius: '6px',
                                                border: isSelected ? '2px solid #2e7d32' : '1px solid #ccc',
                                                backgroundColor: isSelected ? '#e8f5e9' : '#fff',
                                                color: isSelected ? '#1b5e20' : '#555', fontWeight: isSelected ? 'bold' : 'normal',
                                                transition: 'all 0.2s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                            }}
                                        >
                                            {m.descricao}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>Projeto *</label>
                            <select className="form-control" name="id_projeto" value={form.id_projeto} onChange={handleProjetoChangeForm} required>
                                <option value="">Selecione...</option>
                                {projetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                            </select>
                        </div>
                        <div className="form-group flex-1">
                            <label>Unidade *</label>
                            <select className="form-control" name="id_unidade" value={form.id_unidade} onChange={handleUnidadeChangeForm} disabled={!form.id_projeto} required>
                                <option value="">Selecione...</option>
                                {unidadesForm.map(u => <option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* EQUIPE DO PROJETO - somente para o motivo "Apoio ao Projeto" */}
                    {isMotivoApoio && (
                        <>
                            <div className="form-row">
                                <div className="form-group flex-1">
                                    <label>Equipe do Projeto {isEquipeApoioObrigatoria ? '*' : '(opcional)'}</label>
                                    <div style={{display: 'flex', gap: '10px'}}>
                                        <select className="form-control" value={equipeProjetoTemp} onChange={(e) => setEquipeProjetoTemp(e.target.value)} style={{flex: 1}} disabled={!form.id_projeto}>
                                            <option value="">{form.id_projeto ? 'Selecione para adicionar...' : 'Selecione o projeto primeiro...'}</option>
                                            {profissionaisProjeto.map(i => <option key={i.id_usuario} value={i.id_usuario}>{i.nome_completo}</option>)}
                                        </select>
                                        <button type="button" onClick={adicionarEquipeProjeto} className="btn-salvar" style={{padding: '0 20px', margin: 0}}>+</button>
                                    </div>
                                </div>
                            </div>

                            <div style={{marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '10px'}}>
                                {form.equipe_projeto_ids.map(id => {
                                    const user = profissionaisProjeto.find(u => u.id_usuario === id);
                                    return (
                                        <div key={id} style={{
                                            background: '#e0e0e0', padding: '6px 12px', borderRadius: '20px',
                                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#333'
                                        }}>
                                            <span><Icon n="user"/> {user ? user.nome_completo : `ID ${id}`}</span>
                                            <button type="button" onClick={() => removerEquipeProjeto(id)} style={{background: 'transparent', border: 'none', color: '#d32f2f', fontWeight: 'bold', cursor: 'pointer', fontSize:'1.1rem'}}>×</button>
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}

                    {produtosDisponiveis.length > 0 && (
                        <div style={{marginTop: '10px', padding:'15px', border:'1px solid #ffcc80', background:'#fff3e0', borderRadius:'6px'}}>
                            <label style={{color: '#ef6c00', fontWeight: 'bold', marginBottom:'10px', display:'block'}}>Produtos Trabalhados: *</label>
                            <div style={{display:'flex', gap:'15px', flexWrap:'wrap'}}>
                                {produtosDisponiveis.map(p => (
                                    <label key={p.id_produto} className="checkbox-label" style={{background:'#fff', padding:'5px 10px', borderRadius:'4px', border:'1px solid #eee'}}>
                                        <input type="checkbox" checked={form.produtos_selecionados.includes(p.nome_produto)} onChange={() => handleProdutoCheck(p.nome_produto)} />
                                        {p.nome_produto}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="form-row" style={{marginTop: '20px'}}>
                        <div className="form-group flex-1">
                            {/* [MODIFICADO] Label dinâmica para avisar quando é opcional */}
                            <label>Anexos {isAnexoObrigatorio ? '(Obrigatório manter ou enviar ao menos um) *' : anexoExigido ? '(Opcional para Apoio ao Projeto)' : '(Opcional)'}</label>
                            
                            {form.arquivosAntigos.length > 0 && (
                                <div style={{marginBottom: '15px', padding: '10px', border: '1px solid var(--sage-100)', background: 'var(--tint)', borderRadius: '4px'}}>
                                    <strong style={{fontSize: '0.9rem', color: 'var(--pine)', display: 'block', marginBottom: '5px'}}>Anexos Salvos (Clique no X para remover):</strong>
                                    {form.arquivosAntigos.map((caminho, idx) => {
                                        const nomeExibicao = caminho.split('?')[0].split('/').pop();
                                        return (
                                            <div key={`old-${idx}`} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #ddd', marginBottom: '5px'}}>
                                                <span style={{fontSize: '0.85rem', color: '#333'}}><Icon n="file"/> {nomeExibicao}</span>
                                                <button 
                                                    type="button" 
                                                    onClick={() => removerArquivoAntigo(caminho)} 
                                                    style={{background: 'transparent', border: 'none', color: '#d32f2f', cursor: 'pointer', fontWeight: 'bold'}}
                                                    title="Excluir este anexo do registro"
                                                >
                                                    <Icon n="x"/> Remover
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <input 
                                type="file" 
                                className="form-control" 
                                onChange={handleFileChange} 
                                multiple 
                                style={{padding: '10px', border: '1px dashed #ccc'}}
                            />
                            
                            {form.arquivos.length > 0 && (
                                <div style={{marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '5px'}}>
                                    <strong style={{fontSize: '0.9rem', color: '#555'}}>Novos arquivos prontos para envio:</strong>
                                    {form.arquivos.map((arq, idx) => (
                                        <div key={`new-${idx}`} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f5f5f5', padding: '8px 12px', borderRadius: '4px', border: '1px dashed #999'}}>
                                            <span style={{fontSize: '0.85rem', color: '#333'}}><Icon n="plus"/> {arq.name}</span>
                                            <button 
                                                type="button" 
                                                onClick={() => removerArquivoNovo(idx)} 
                                                style={{background: 'transparent', border: 'none', color: '#d32f2f', cursor: 'pointer', fontWeight: 'bold'}}
                                            >
                                                <Icon n="x"/> Cancelar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="form-actions">
                        <button 
                            type="button" 
                            className="btn-voltar" 
                            style={{background: '#757575'}} 
                            onClick={() => {
                                setModoPesquisa(true);
                                setForm(formInicial);
                                setProdutosDisponiveis([]);
                                setImplantadorTemp('');
                                setEquipeProjetoTemp(''); setProfissionaisProjeto([]);
                            }}
                        >Cancelar</button>
                        
                        {(!form.id_atividade && permissoes.pode_novo) || (form.id_atividade && permissoes.pode_editar) ? (
                            <button type="submit" className="btn-salvar">{form.id_atividade ? 'Salvar Alterações' : 'Salvar Registro'}</button>
                        ) : (
                            <span style={{color: '#999', fontStyle:'italic', marginLeft: '10px'}}>Sem permissão para salvar.</span>
                        )}
                    </div>
                </form>
            ) : (
                <div className="listagem-section">
                    <div className="search-bar" style={{flexDirection:'column', alignItems:'stretch'}}>
                        <div className="form-row" style={{marginBottom:'10px'}}>
                            <div className="form-group flex-1"><label>Data Início</label><input type="date" min="1900-01-01" max="2100-12-31" className="form-control" value={filtros.dataInicio} onChange={e => setFiltros({...filtros, dataInicio: e.target.value})} /></div>
                            <div className="form-group flex-1"><label>Data Fim</label><input type="date" min="1900-01-01" max="2100-12-31" className="form-control" value={filtros.dataFim} onChange={e => setFiltros({...filtros, dataFim: e.target.value})} /></div>
                            <div className="form-group flex-1"><label>Implantador</label><select className="form-control" value={filtros.id_implantador} onChange={e => setFiltros({...filtros, id_implantador: e.target.value})}><option value="">Todos</option>{implantadores.map(i => <option key={i.id_usuario} value={i.id_usuario}>{i.nome_completo}</option>)}</select></div>
                            <div className="form-group flex-1"><label>Projeto</label><select className="form-control" value={filtros.id_projeto} onChange={e => setFiltros({...filtros, id_projeto: e.target.value})}><option value="">Todos</option>{projetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}</select></div>
                            
                            <div className="form-group flex-1"><label>Unidade</label><select className="form-control" value={filtros.id_unidade} onChange={e => setFiltros({...filtros, id_unidade: e.target.value})} disabled={!filtros.id_projeto}><option value="">Todas</option>{unidadesFiltro.map(u => <option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}</option>)}</select></div>
                            <div className="form-group flex-1"><label>Motivo</label><select className="form-control" value={filtros.motivo} onChange={e => setFiltros({...filtros, motivo: e.target.value})}><option value="">Todos</option>{motivosOpcoes.map(m => <option key={m.descricao} value={m.descricao}>{m.descricao}</option>)}</select></div>
                        </div>
                        <div style={{display:'flex', gap:'10px'}}>
                            <input className="form-control" style={{flex:1}} placeholder="Busca geral..." value={filtros.termo} onChange={e => setFiltros({...filtros, termo: e.target.value})} />
                            <button className="btn-voltar" style={{margin:0}} onClick={limparFiltros}>Limpar</button>
                            <button className="btn-tab ativo" style={{margin:0}} data-busca="1" onClick={handlePesquisarClick}><Icon n="search"/> Pesquisar</button>
                        </div>
                    </div>

                    <div className="table-responsive">
                        <table className="tabela-unidades">
                            <thead>
                                <tr>
                                    <th>Período</th>
                                    <th>Equipe</th>
                                    <th>Projeto / Unidade</th>
                                    <th>Motivo</th>
                                    <th className="center">Anexo</th>
                                    <th className="center">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {carregando ? (
                                    <tr><td colSpan="6" className="center" style={{padding:'20px'}}>Carregando...</td></tr>
                                ) : listaAtividades.map(a => (
                                    <tr key={a.id_atividade}>
                                        <td>{formatarDataTabela(a.data_inicio, a.data_fim)}</td>
                                        <td>{renderNomesImplantadores(a)}</td>
                                        <td><small style={{color:'#666', display:'block', fontSize:'0.8rem'}}>{a.nome_projeto}</small>{a.nome_unidade}</td>
                                        <td>{a.motivos}</td>
                                        <td className="center">{renderDownloadAnexos(a.caminho_arquivo)}</td>
                                        <td className="center">
                                            {permissoes.pode_editar ? (
                                                <div style={{display:'flex', justifyContent:'center', gap:'5px'}}>
                                                    <button className="btn-editar" onClick={() => handleEditar(a)} title="Editar"><Icon n="edit"/></button>
                                                    <button className="btn-excluir" onClick={() => handleExcluir(a.id_atividade)} title="Excluir" style={{background:'#d32f2f', color:'white', border:'none', borderRadius:'4px', padding:'5px 10px', cursor:'pointer'}}><Icon n="trash"/></button>
                                                </div>
                                            ) : <span><Icon n="lock"/></span>}
                                        </td>
                                    </tr>
                                ))}
                                {!carregando && listaAtividades.length === 0 && <tr><td colSpan="6" className="center" style={{padding: '20px', color: '#999'}}>Nenhum registro encontrado.</td></tr>}
                            </tbody>
                        </table>
                    </div>

                    {totalPaginas > 1 && (
                        <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '20px'}}>
                            <button className="btn-tab" onClick={() => mudarPagina(pagina - 1)} disabled={pagina === 1}>◀ Anterior</button>
                            <span style={{fontWeight: 'bold', color: '#555'}}>Página {pagina} de {totalPaginas} <small>({totalRegistros} registros)</small></span>
                            <button className="btn-tab" onClick={() => mudarPagina(pagina + 1)} disabled={pagina === totalPaginas}>Próxima ▶</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default RegistroAtividades;