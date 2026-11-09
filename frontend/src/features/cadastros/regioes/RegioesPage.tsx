import { useSearchParams } from 'react-router-dom';
import { AbaRegioes, AbaVinculos } from '@/features/cadastros/regioes/components';
import { useDadosDoProjeto, usePermissoesRegioes, useProjetosAtivos } from '@/features/cadastros/regioes/hooks';
import { useVoltar } from '@/shared/hooks';
import { Abas } from '@/shared/ui/Abas';
import { Button } from '@/shared/ui/Button';
import { Field, Select } from '@/shared/ui/Campos';
import { Aviso } from '@/shared/ui/Estados';
import { Badge, Card, PageHeader } from '@/shared/ui/Pagina';

export function RegioesPage() {
    const voltar = useVoltar();
    const permissoes = usePermissoesRegioes();
    const projetos = useProjetosAtivos();
    const [parametros, setParametros] = useSearchParams();
    const idProjeto = parametros.get('projeto') ?? '';
    const aba = parametros.get('aba') === 'unidades' ? 'unidades' : 'regioes';
    const { macros, unidades, recarregar } = useDadosDoProjeto(idProjeto);

    const alterar = (chave: string, valor: string) => {
        const proximos = new URLSearchParams(parametros);
        if (valor) proximos.set(chave, valor);
        else proximos.delete(chave);
        setParametros(proximos, { replace: true });
    };

    const qtdMicros = macros.reduce((soma, macro) => soma + macro.micros.length, 0);
    const semRegiao = unidades.filter((unidade) => !unidade.id_macro).length;

    return (
        <>
            <PageHeader
                titulo="Macro e Micro Regiões"
                ajuda="Cada projeto tem a sua nomenclatura de regiões. Escolha uma macro região para ver e editar as micros dela."
                acoes={(
                    <>
                        <Abas itens={[{ id: 'regioes', rotulo: 'Regiões' }, { id: 'unidades', rotulo: 'Vincular unidades' }]} ativa={aba} aoMudar={(id) => alterar('aba', id === 'unidades' ? id : '')} />
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                    </>
                )}
            />
            <Card className="mb-3.5 flex items-end gap-5 px-4 py-3.5">
                <Field rotulo="Projeto" htmlFor="projeto-regioes" obrigatorio className="w-96">
                    <Select id="projeto-regioes" value={idProjeto} onChange={(e) => alterar('projeto', e.target.value)}>
                        <option value="">Selecione o projeto</option>
                        {projetos.map((projeto) => <option key={projeto.id_projeto} value={projeto.id_projeto}>{projeto.nome_projeto}</option>)}
                    </Select>
                </Field>
                {idProjeto && (
                    <div className="flex gap-2 pb-2.5">
                        <Badge>{macros.length} macro(s)</Badge>
                        <Badge>{qtdMicros} micro(s)</Badge>
                        <Badge>{unidades.length} unidade(s)</Badge>
                        <Badge tom={semRegiao ? 'ouro' : 'marca'}>{semRegiao} sem região</Badge>
                    </div>
                )}
            </Card>
            {!idProjeto && <Aviso titulo="Selecione o projeto">As regiões e os vínculos aparecem aqui.</Aviso>}
            {idProjeto && aba === 'regioes' && <AbaRegioes key={idProjeto} idProjeto={idProjeto} macros={macros} recarregar={recarregar} permissoes={permissoes} />}
            {idProjeto && aba === 'unidades' && <AbaVinculos key={idProjeto} idProjeto={idProjeto} macros={macros} unidades={unidades} recarregar={recarregar} podeEditar={permissoes.podeEditar} />}
        </>
    );
}
