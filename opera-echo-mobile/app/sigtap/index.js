/* ARQUIVO: app/sigtap/index.js
   Consulta SIGTAP no aplicativo: busca de procedimentos na competência vigente
   (mesma API pública do web em operaecho.com/sigtap) e ficha resumida. Só leitura. */

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import api from '../../src/api';
import { cores, espaco, raio, tipo } from '../../src/tema';
import { Cabecalho, Carregando, Cartao, Etiqueta, FolhaInferior, useEspacoInferior, Vazio } from '../../src/ui';

const TAMANHO = 20;
const fmtComp = (c) => (c && c.length === 6 ? `${c.slice(4)}/${c.slice(0, 4)}` : '-');
const fmtCodigo = (c) => {
    const d = String(c || '').replace(/\D/g, '');
    return d.length === 10 ? `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : c;
};
const fmtMoeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const COMPLEXIDADE = { 0: 'Não se aplica', 1: 'Atenção Básica', 2: 'Média complexidade', 3: 'Alta complexidade' };
const SEXO = { I: 'Ambos', M: 'Masculino', F: 'Feminino', N: 'Não se aplica' };

export default function SigtapApp() {
    const router = useRouter();
    const espacoInferior = useEspacoInferior(espaco.xl);
    const [competencia, setCompetencia] = useState(null);
    const [termo, setTermo] = useState('');
    const [itens, setItens] = useState([]);
    const [total, setTotal] = useState(0);
    const [pagina, setPagina] = useState(1);
    const [carregando, setCarregando] = useState(false);
    const [buscou, setBuscou] = useState(false);
    const [ficha, setFicha] = useState(null);
    const [carregandoFicha, setCarregandoFicha] = useState(false);
    const busca = useRef('');

    useEffect(() => {
        api.get('/sigtap/competencias')
            .then(r => setCompetencia(Array.isArray(r.data) && r.data.length ? r.data[0] : null))
            .catch(() => setCompetencia(null));
    }, []);

    const carregar = useCallback(async (q, pag) => {
        setCarregando(true);
        try {
            const r = await api.get('/sigtap/procedimentos', {
                params: { q: q || undefined, competencia: competencia?.competencia, pagina: pag, tamanho: TAMANHO }
            });
            const novos = r.data?.itens || [];
            setItens(prev => (pag === 1 ? novos : [...prev, ...novos]));
            setTotal(r.data?.total || 0);
            setPagina(pag);
        } catch (e) {
            if (pag === 1) { setItens([]); setTotal(0); }
        } finally {
            setCarregando(false);
            setBuscou(true);
        }
    }, [competencia]);

    const pesquisar = () => {
        Keyboard.dismiss();
        busca.current = termo.trim();
        carregar(busca.current, 1);
    };

    const abrirFicha = async (codigo) => {
        setFicha({ procedimento: { co_procedimento: codigo } });
        setCarregandoFicha(true);
        try {
            const r = await api.get(`/sigtap/procedimentos/${codigo}`, { params: { competencia: competencia?.competencia } });
            setFicha(r.data);
        } catch (e) {
            setFicha(null);
        } finally {
            setCarregandoFicha(false);
        }
    };

    const p = ficha?.procedimento || {};

    return (
        <View style={est.raiz}>
            <Cabecalho titulo="Consulta SIGTAP" subtitulo={competencia ? `Competência ${fmtComp(competencia.competencia)}` : 'Tabela SUS'} cor={cores.sigtap} aoVoltar={() => router.back()} />

            <View style={est.busca}>
                <View style={est.buscaCampo}>
                    <MaterialIcons name="search" size={20} color={cores.textoFraco} />
                    <TextInput
                        style={est.buscaInput}
                        value={termo}
                        onChangeText={setTermo}
                        placeholder="Código ou nome do procedimento"
                        placeholderTextColor={cores.textoFraco}
                        returnKeyType="search"
                        onSubmitEditing={pesquisar}
                    />
                </View>
                <TouchableOpacity style={est.buscaBotao} onPress={pesquisar} accessibilityLabel="Buscar">
                    <MaterialIcons name="arrow-forward" size={22} color="#FFF" />
                </TouchableOpacity>
            </View>

            {buscou && <Text style={est.resumo}>{total.toLocaleString('pt-BR')} procedimento(s)</Text>}

            <FlatList
                data={itens}
                keyExtractor={(i) => i.co_procedimento}
                contentContainerStyle={{ paddingHorizontal: espaco.xl, paddingBottom: espacoInferior }}
                keyboardShouldPersistTaps="handled"
                onEndReachedThreshold={0.4}
                onEndReached={() => { if (!carregando && itens.length < total) carregar(busca.current, pagina + 1); }}
                renderItem={({ item }) => (
                    <Cartao aoTocar={() => abrirFicha(item.co_procedimento)} style={est.item}>
                        <Text style={est.codigo}>{fmtCodigo(item.co_procedimento)}</Text>
                        <Text style={est.nome}>{item.no_procedimento}</Text>
                        <View style={est.valores}>
                            <Text style={est.valor}>SA {fmtMoeda(item.vl_sa)}</Text>
                            <Text style={est.valor}>SH {fmtMoeda(item.vl_sh)}</Text>
                            <Text style={est.valor}>SP {fmtMoeda(item.vl_sp)}</Text>
                        </View>
                    </Cartao>
                )}
                ListEmptyComponent={
                    carregando ? <Carregando cor={cores.sigtap} /> :
                    buscou ? <Vazio icone="search-off" texto="Nenhum procedimento encontrado." /> :
                    <Vazio icone="local-hospital" texto="Busque pelo código ou pelo nome do procedimento." />
                }
                ListFooterComponent={carregando && itens.length > 0 ? <ActivityIndicator color={cores.sigtap} style={{ marginVertical: espaco.lg }} /> : null}
            />

            <FolhaInferior visivel={!!ficha} aoFechar={() => setFicha(null)} titulo={fmtCodigo(p.co_procedimento)} altura="85%">
                {carregandoFicha ? <Carregando cor={cores.sigtap} /> : (
                    <ScrollView contentContainerStyle={{ paddingBottom: espaco.xxl }}>
                        <Text style={est.fichaNome}>{p.no_procedimento}</Text>
                        <View style={est.etiquetas}>
                            {COMPLEXIDADE[p.tp_complexidade] && <Etiqueta texto={COMPLEXIDADE[p.tp_complexidade]} cor={cores.sigtap} fundo={cores.sigtapClara} />}
                            {p.no_financiamento && <Etiqueta texto={p.no_financiamento} cor={cores.textoMedio} fundo={cores.superficieAlt} />}
                        </View>

                        <View style={est.blocoValores}>
                            <Linha rotulo="Serviço ambulatorial (SA)" valor={fmtMoeda(p.vl_sa)} />
                            <Linha rotulo="Serviço hospitalar (SH)" valor={fmtMoeda(p.vl_sh)} />
                            <Linha rotulo="Serviço profissional (SP)" valor={fmtMoeda(p.vl_sp)} />
                            <Linha rotulo="Total hospitalar" valor={fmtMoeda((p.vl_sh || 0) + (p.vl_sp || 0))} forte />
                        </View>

                        <Linha rotulo="Grupo" valor={p.no_grupo} />
                        <Linha rotulo="Subgrupo" valor={p.no_sub_grupo} />
                        <Linha rotulo="Forma de organização" valor={p.no_forma_organizacao} />
                        <Linha rotulo="Sexo" valor={SEXO[p.tp_sexo] || p.tp_sexo} />
                        <Linha rotulo="Idade" valor={p.vl_idade_minima != null && p.vl_idade_maxima < 9999 ? `${Math.floor(p.vl_idade_minima / 12)} a ${Math.floor(p.vl_idade_maxima / 12)} anos` : null} />
                        <Linha rotulo="Permanência" valor={p.qt_dias_permanencia ? `${p.qt_dias_permanencia} dia(s)` : null} />
                        <Linha rotulo="Instrumentos de registro" valor={(ficha?.registros || []).map(r => r.nome).join(', ')} />
                        <Linha rotulo="CIDs vinculados" valor={ficha?.cids?.length ? String(ficha.cids.length) : null} />
                        <Linha rotulo="CBOs vinculados" valor={ficha?.cbos?.length ? String(ficha.cbos.length) : null} />

                        {p.ds_procedimento ? <Text style={est.descricao}>{p.ds_procedimento}</Text> : null}
                    </ScrollView>
                )}
            </FolhaInferior>
        </View>
    );
}

function Linha({ rotulo, valor, forte }) {
    if (valor == null || valor === '') return null;
    return (
        <View style={est.linha}>
            <Text style={est.linhaRotulo}>{rotulo}</Text>
            <Text style={[est.linhaValor, forte && { color: cores.sigtap }]}>{valor}</Text>
        </View>
    );
}

const est = StyleSheet.create({
    raiz: { flex: 1, backgroundColor: cores.fundo },
    busca: { flexDirection: 'row', gap: espaco.sm, paddingHorizontal: espaco.xl, paddingTop: espaco.lg },
    buscaCampo: {
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: espaco.sm, height: 50, paddingHorizontal: espaco.md,
        borderWidth: 1, borderColor: cores.bordaForte, borderRadius: raio.md, backgroundColor: cores.superficie
    },
    buscaInput: { flex: 1, ...tipo.corpo, color: cores.texto, paddingVertical: 0 },
    buscaBotao: { width: 50, height: 50, borderRadius: raio.md, backgroundColor: cores.sigtap, alignItems: 'center', justifyContent: 'center' },
    resumo: { ...tipo.legenda, color: cores.textoFraco, paddingHorizontal: espaco.xl, paddingTop: espaco.md },
    item: { paddingVertical: espaco.md },
    codigo: { ...tipo.micro, color: cores.sigtap, letterSpacing: 0.4 },
    nome: { ...tipo.corpoForte, color: cores.texto, marginTop: 4 },
    valores: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.md, marginTop: espaco.sm },
    valor: { ...tipo.legenda, color: cores.textoMedio },
    fichaNome: { ...tipo.subtitulo, color: cores.texto, marginBottom: espaco.md },
    etiquetas: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm, marginBottom: espaco.lg },
    blocoValores: { borderLeftWidth: 3, borderLeftColor: cores.sigtap, paddingLeft: espaco.md, marginBottom: espaco.lg },
    linha: { flexDirection: 'row', justifyContent: 'space-between', gap: espaco.md, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: cores.borda },
    linhaRotulo: { ...tipo.legenda, color: cores.textoMedio, flexShrink: 0, maxWidth: '45%' },
    linhaValor: { ...tipo.corpoForte, fontSize: 14, color: cores.texto, flex: 1, textAlign: 'right' },
    descricao: { ...tipo.legenda, color: cores.textoMedio, lineHeight: 20, marginTop: espaco.lg }
});
