import { lazy } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    EnviosRecentes, LinhaOpcao, SecaoConexao, SecaoEventos, SecaoFila, SecaoProtecao, SecaoTextos
} from '@/features/parametros/components';
import { useParametrosGerais, useWhatsapp } from '@/features/parametros/hooks';
import { useAuth } from '@/shared/auth/AuthContext';
import { useVoltar } from '@/shared/hooks';
import { Abas } from '@/shared/ui/Abas';
import { Button } from '@/shared/ui/Button';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { Card, FormSecao, PageHeader } from '@/shared/ui/Pagina';

const ImportacaoSigtap = lazy(() => import('@/features/sigtap/ImportacaoSigtap'));

const ABAS = [
    { id: 'implantacao', rotulo: 'Implantação', icone: 'build' },
    { id: 'projetos', rotulo: 'Projetos', icone: 'folder' },
    { id: 'sigtap', rotulo: 'SIGTAP', icone: 'stethoscope' },
    { id: 'whatsapp', rotulo: 'WhatsApp', icone: 'bell' }
];
const ABA_PADRAO = 'implantacao';

const itensDeRegistro = (sufixo: string) => [
    {
        chave: `anexo_obrigatorio_${sufixo}`,
        titulo: 'Anexo obrigatório no Registro de Atividades',
        ajuda: 'Ligado: exige ao menos um anexo (exceto "Apoio ao Projeto"). Desligado: o anexo fica opcional em qualquer motivo da visita.'
    },
    {
        chave: `horas_obrigatorias_${sufixo}`,
        titulo: 'Horas trabalhadas (Tempo Gasto) obrigatórias',
        ajuda: 'Ligado: o Tempo Gasto (hh:mm) deve ser informado em todo lançamento. Desligado: fica opcional; quando informado, continua validado no formato hh:mm.'
    },
    {
        chave: `equipe_apoio_obrigatoria_${sufixo}`,
        titulo: 'Equipe do Projeto obrigatória no "Apoio ao Projeto"',
        ajuda: 'Ligado: ao marcar "Apoio ao Projeto" é preciso incluir ao menos um profissional na Equipe do Projeto. Desligado: a equipe fica opcional.'
    }
];

interface RegrasDoModuloProps {
    modulo: string;
    titulo: string;
    podeEditar: boolean;
    gerais: ReturnType<typeof useParametrosGerais>;
}

function RegrasDoModulo({ modulo, titulo, podeEditar, gerais }: RegrasDoModuloProps) {
    const { valores, auditoria, alterados, salvando, salvar, alternar } = gerais;
    const qtd = alterados.length;

    return (
        <Card>
            <FormSecao titulo={titulo}>
                {itensDeRegistro(modulo).map((item) => {
                    const registro = auditoria[item.chave];
                    const alteracao = registro?.data_alteracao
                        ? `Última alteração: ${registro.data_alteracao}${registro.usuario_alteracao ? ` · ${registro.usuario_alteracao}` : ''}`
                        : undefined;
                    return (
                        <LinhaOpcao
                            key={item.chave}
                            titulo={item.titulo}
                            ajuda={item.ajuda}
                            detalhe={alteracao}
                            ligado={Boolean(valores[item.chave])}
                            rotuloLigado="Obrigatório"
                            rotuloDesligado="Opcional"
                            desabilitado={!podeEditar}
                            aoAlternar={() => alternar(item.chave)}
                        />
                    );
                })}
            </FormSecao>
            <div className="flex justify-end rounded-b-[10px] border-t border-line bg-surface-2 px-[22px] py-3.5">
                {podeEditar
                    ? <Button disabled={!qtd} isLoading={salvando} onClick={salvar}>{qtd ? `Salvar (${qtd})` : 'Salvar'}</Button>
                    : <span className="text-[13px] text-text-2">Somente leitura.</span>}
            </div>
        </Card>
    );
}

function AbaWhatsapp({ podeEditar }: { podeEditar: boolean }) {
    const w = useWhatsapp();
    if (!w.config) return <Carregando />;
    const props = { w, config: w.config, podeEditar };

    return (
        <>
            <Card>
                <SecaoConexao {...props} />
                {w.situacao && <SecaoFila situacao={w.situacao} fila={w.config.fila} />}
                <SecaoEventos {...props} />
                <SecaoProtecao {...props} />
                <SecaoTextos {...props} />
                <div className="flex justify-end rounded-b-[10px] border-t border-line bg-surface-2 px-[22px] py-3.5">
                    {podeEditar
                        ? <Button isLoading={w.salvando} onClick={w.salvar}>Salvar configuração do WhatsApp</Button>
                        : <span className="text-[13px] text-text-2">Somente leitura.</span>}
                </div>
            </Card>
            <EnviosRecentes w={w} podeEditar={podeEditar} />
        </>
    );
}

export function ParametrosPage() {
    const { aba = ABA_PADRAO } = useParams();
    const navigate = useNavigate();
    const voltar = useVoltar();
    const { podeAcao } = useAuth();
    const podeEditar = podeAcao('parametros', 'pode_editar');
    // Fica na página: trocar de aba não perde o que ainda não foi salvo.
    const gerais = useParametrosGerais();
    const abaAtual = ABAS.find((item) => item.id === aba);

    if (!abaAtual) return <Aviso titulo="Página não encontrada" />;

    return (
        <>
            <PageHeader
                titulo="Parâmetros do Sistema"
                acoes={(
                    <>
                        <Abas itens={ABAS} ativa={aba} aoMudar={(id) => { void navigate(`/system/parametros/${id}`, { replace: true }); }} />
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                    </>
                )}
            />
            {aba === 'whatsapp' && <AbaWhatsapp podeEditar={podeEditar} />}
            {aba === 'sigtap' && <ImportacaoSigtap podeEditar={podeEditar} />}
            {(aba === 'implantacao' || aba === 'projetos') && <RegrasDoModulo modulo={aba} titulo={abaAtual.rotulo} podeEditar={podeEditar} gerais={gerais} />}
        </>
    );
}
