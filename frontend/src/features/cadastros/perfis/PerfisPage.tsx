import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    buscarRegras, listarNomesDePerfis, MODULOS_DO_SISTEMA, salvarRegras, type ModuloSistema, type Regra, type RegrasPorModulo
} from '@/features/cadastros/perfis/api';
import { erro, sucesso } from '@/shared/feedback';
import { useVoltar } from '@/shared/hooks';
import { cn, logErro } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Interruptor, Select } from '@/shared/ui/Campos';
import { Card, PageHeader } from '@/shared/ui/Pagina';
import { Tabela, Td, Th } from '@/shared/ui/Tabela';

const PERFIL_PADRAO = 'Administrador';
const CATEGORIAS = [...new Set(MODULOS_DO_SISTEMA.map((modulo) => modulo.categoria))];
const REGRA_VAZIA: Regra = { pode_acessar: false, pode_novo: false, pode_editar: false };

/** Marcar Novo/Editar libera o acesso; retirar o acesso retira Novo e Editar. */
function alternar(regra: Regra, campo: keyof Regra): Regra {
    const valor = !regra[campo];
    if (campo === 'pode_acessar') return valor ? { ...regra, pode_acessar: true } : REGRA_VAZIA;
    return { ...regra, [campo]: valor, pode_acessar: valor || regra.pode_acessar };
}

function usePerfis() {
    const [parametros, setParametros] = useSearchParams();
    const perfil = parametros.get('perfil') ?? PERFIL_PADRAO;
    const [perfis, setPerfis] = useState<string[]>([]);
    const [regras, setRegras] = useState<RegrasPorModulo>({});
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        listarNomesDePerfis().then(setPerfis).catch((falha: unknown) => {
            logErro('Erro ao carregar perfis', falha);
            erro('Não foi possível carregar os perfis.');
        });
    }, []);

    useEffect(() => {
        let ativo = true;
        buscarRegras(perfil)
            .then((dados) => { if (ativo) setRegras(dados); })
            .catch((falha: unknown) => {
                logErro('Erro ao carregar regras', falha);
                erro('Não foi possível carregar as permissões.');
            })
            .finally(() => { if (ativo) setCarregando(false); });
        return () => { ativo = false; };
    }, [perfil]);

    const selecionarPerfil = (novo: string) => {
        setCarregando(true);
        setParametros({ perfil: novo }, { replace: true });
    };

    const alterar = (chave: string, campo: keyof Regra) => {
        setRegras((atuais) => ({ ...atuais, [chave]: alternar(atuais[chave] ?? REGRA_VAZIA, campo) }));
    };

    const salvar = async () => {
        setSalvando(true);
        try {
            await salvarRegras(perfil, regras);
            sucesso('Permissões salvas!', `Permissões de ${perfil} atualizadas.`);
        } catch (falha) {
            logErro('Erro ao salvar regras', falha);
            erro('Falha ao salvar as permissões.');
        } finally {
            setSalvando(false);
        }
    };

    return { perfil, perfis, regras, carregando, salvando, selecionarPerfil, alterar, salvar };
}

interface LinhaModuloProps {
    modulo: ModuloSistema;
    regra: Regra;
    aoAlterar: (campo: keyof Regra) => void;
}

function MarcaAcao({ disponivel, marcado, habilitado, rotulo, aoAlterar }: { disponivel: boolean; marcado: boolean; habilitado: boolean; rotulo: string; aoAlterar: () => void }) {
    if (!disponivel) return <span className="text-line">•</span>;
    return <input type="checkbox" aria-label={rotulo} className="size-[17px] cursor-pointer accent-pine disabled:cursor-not-allowed" checked={marcado} disabled={!habilitado} onChange={aoAlterar} />;
}

function LinhaModulo({ modulo, regra, aoAlterar }: LinhaModuloProps) {
    return (
        <tr className={cn(regra.pode_acessar && 'bg-tint/40')}>
            <Td>{modulo.rotulo}</Td>
            <Td centro><span className="inline-flex align-middle"><Interruptor rotulo={`Acesso a ${modulo.rotulo}`} checked={regra.pode_acessar} onChange={() => aoAlterar('pode_acessar')} /></span></Td>
            <Td centro><MarcaAcao disponivel={modulo.temNovo} marcado={regra.pode_novo} habilitado={regra.pode_acessar} rotulo={`Novo em ${modulo.rotulo}`} aoAlterar={() => aoAlterar('pode_novo')} /></Td>
            <Td centro><MarcaAcao disponivel={modulo.temEditar} marcado={regra.pode_editar} habilitado={regra.pode_acessar} rotulo={`Editar em ${modulo.rotulo}`} aoAlterar={() => aoAlterar('pode_editar')} /></Td>
        </tr>
    );
}

export function PerfisPage() {
    const voltar = useVoltar();
    const { perfil, perfis, regras, carregando, salvando, selecionarPerfil, alterar, salvar } = usePerfis();

    return (
        <>
            <PageHeader
                titulo="Perfis de Acesso"
                ajuda={"Acesso libera a tela para o perfil. Novo e Editar só valem com o Acesso ligado: marcar um deles liga o Acesso, e desligar o Acesso desliga os dois.\nAs mudanças só valem depois de Salvar alterações."}
                acoes={(
                    <>
                        <Button variant="secondary" onClick={voltar}>Voltar</Button>
                        <Button onClick={salvar} isLoading={salvando}>Salvar alterações</Button>
                    </>
                )}
            />
            <Card className="mb-3.5 px-4 py-3.5">
                <Field rotulo="Perfil selecionado" htmlFor="perfil-selecionado" className="w-80">
                    <Select id="perfil-selecionado" value={perfil} disabled={carregando} onChange={(e) => selecionarPerfil(e.target.value)}>
                        {perfis.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
                    </Select>
                </Field>
            </Card>
            <div className={cn('transition-opacity', carregando && 'opacity-50')}>
                <Tabela cabecalho={<><Th>Módulo / Funcionalidade</Th><Th centro className="w-32">Acesso</Th><Th centro className="w-32">Novo</Th><Th centro className="w-32">Editar / Excluir</Th></>}>
                    {CATEGORIAS.flatMap((categoria) => [
                        <tr key={categoria}><td colSpan={4} className="bg-surface-2 px-[18px] py-2 text-xs font-semibold tracking-wide text-pine-800 uppercase">{categoria}</td></tr>,
                        ...MODULOS_DO_SISTEMA.filter((modulo) => modulo.categoria === categoria).map((modulo) => (
                            <LinhaModulo key={modulo.chave} modulo={modulo} regra={regras[modulo.chave] ?? REGRA_VAZIA} aoAlterar={(campo) => alterar(modulo.chave, campo)} />
                        ))
                    ])}
                </Tabela>
            </div>
        </>
    );
}
