import { useParams } from 'react-router-dom';
import { useAprovacaoAcesso } from '@/features/acessos/hooks';
import { useAuth } from '@/shared/auth/AuthContext';
import { podeAprovarAcesso } from '@/shared/auth/session';
import { useVoltar } from '@/shared/hooks';
import { formatarDiaMes } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { Card, PageHeader } from '@/shared/ui/Pagina';

function FormularioAprovacao({ idSolicitante }: { idSolicitante: number }) {
    const voltar = useVoltar();
    const { solicitante, perfis, perfil, setPerfil, carregando, ativar, recusar } = useAprovacaoAcesso(idSolicitante);

    if (carregando) return <Carregando />;
    if (!solicitante) return <Aviso titulo="Solicitação não encontrada">Ela pode já ter sido analisada.</Aviso>;

    const setorFuncao = `${solicitante.nome_setor || solicitante.setor || ''} - ${solicitante.nome_funcao || solicitante.funcao || ''}`;

    return (
        <>
            <PageHeader titulo="Aprovação de Acesso" />
            <Card className="max-w-[760px]">
                <div className="grid grid-cols-6 gap-x-[18px] gap-y-4 px-[22px] py-5">
                    <Field rotulo="Solicitante" className="col-span-4"><Input value={solicitante.nome_completo} disabled /></Field>
                    <Field rotulo="Data Solicitação" className="col-span-2"><Input value={formatarDiaMes(solicitante.data_criacao)} disabled /></Field>
                    <Field rotulo="CPF" className="col-span-3"><Input value={solicitante.cpf || ''} disabled /></Field>
                    <Field rotulo="Matrícula" className="col-span-3"><Input value={solicitante.matricula || ''} disabled /></Field>
                    <Field rotulo="Setor / Função" className="col-span-6"><Input value={setorFuncao} disabled /></Field>
                    <Field rotulo="Perfil de Acesso" htmlFor="perfil-acesso" obrigatorio className="col-span-6">
                        <Select id="perfil-acesso" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
                            <option value="">Selecione...</option>
                            {perfis.map((item) => {
                                const nome = item.nome_perfil || item.nome;
                                return <option key={item.id_perfil || item.id} value={nome}>{nome}</option>;
                            })}
                        </Select>
                    </Field>
                </div>
                <div className="flex justify-between gap-2.5 rounded-b-[10px] border-t border-line bg-surface-2 px-[22px] py-3.5">
                    <Button variant="secondary" onClick={voltar}>Cancelar</Button>
                    <div className="flex gap-2.5">
                        <Button variant="danger" onClick={recusar}>Recusar</Button>
                        <Button onClick={ativar}>Ativar Acesso</Button>
                    </div>
                </div>
            </Card>
        </>
    );
}

export default function AprovacaoAcessoPage() {
    const { usuario } = useAuth();
    const idSolicitante = Number(useParams().id);

    if (!podeAprovarAcesso(usuario)) return <Aviso titulo="Sem acesso a esta tela" />;
    if (!Number.isInteger(idSolicitante)) return <Aviso titulo="Solicitação não encontrada" />;
    return <FormularioAprovacao idSolicitante={idSolicitante} />;
}
