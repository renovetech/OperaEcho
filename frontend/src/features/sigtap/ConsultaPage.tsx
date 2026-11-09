import { Link, useNavigate } from 'react-router-dom';
import Icon from '@/shared/ui/Icon';
import { BuscaProcedimentos } from '@/features/sigtap/BuscaProcedimentos';
import { BotaoAba } from '@/features/sigtap/componentes';
import { Compatibilidades, TabelasAuxiliares } from '@/features/sigtap/ConsultasAuxiliares';
import { FichaProcedimento } from '@/features/sigtap/FichaProcedimento';
import { fmtComp, fmtNum } from '@/features/sigtap/formatos';
import { useConsultaSigtap } from '@/features/sigtap/hooks';
import { useAuth } from '@/shared/auth/AuthContext';
import { useVoltar } from '@/shared/hooks';
import { Button } from '@/shared/ui/Button';
import { Select } from '@/shared/ui/Campos';
import { Aviso, Carregando } from '@/shared/ui/Estados';
import { Badge, Card, PageHeader } from '@/shared/ui/Pagina';

const ABAS = [
    { id: 'proc', rotulo: 'Procedimentos', icone: 'clipboard' },
    { id: 'compat', rotulo: 'Compatibilidades', icone: 'puzzle' },
    { id: 'tabelas', rotulo: 'Tabelas', icone: 'grid' }
];

function ConsultaSigtap({ aoVoltar, aoAbrirImportacao }: { aoVoltar?: () => void; aoAbrirImportacao?: () => void }) {
    const c = useConsultaSigtap();

    if (c.competencias === null) return <Carregando />;

    const seletor = c.competencias.length > 0 && (
        <Select className="w-44" aria-label="Competência consultada" value={c.competencia} onChange={(e) => c.trocarCompetencia(e.target.value)}>
            {c.competencias.map((item, indice) => <option key={item.competencia} value={item.competencia}>{fmtComp(item.competencia)}{indice === 0 ? ' (vigente)' : ''}</option>)}
        </Select>
    );

    return (
        <>
            <PageHeader
                titulo="Consulta SIGTAP"
                acoes={(
                    <>
                        {seletor}
                        {aoVoltar && <Button variant="secondary" onClick={aoVoltar}>Voltar</Button>}
                    </>
                )}
            />
            {c.competencias.length === 0 && (
                <Aviso titulo="Nenhuma competência importada" acao={aoAbrirImportacao && <Button onClick={aoAbrirImportacao}><Icon n="settings" /> Ir para Parâmetros</Button>}>
                    A Consulta SIGTAP usa uma base própria, alimentada pelo pacote .zip da Tabela Unificada do DATASUS. Importe o pacote em Parâmetros &gt; SIGTAP para começar.
                </Aviso>
            )}
            {c.competencias.length > 0 && (
                <>
                    <Card className="mb-3.5 flex items-center justify-between pr-4 pl-2">
                        <div role="tablist" className="flex">
                            {ABAS.map((aba) => (
                                <BotaoAba key={aba.id} ativo={c.aba === aba.id} onClick={() => c.irParaAba(aba.id)}><Icon n={aba.icone} /> {aba.rotulo}</BotaoAba>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <Badge tom="marca">Competência {fmtComp(c.competencia)}</Badge>
                            {c.info && <Badge>{fmtNum(c.info.qt_procedimentos)} procedimentos</Badge>}
                            {c.info?.data_importacao && <Badge>Atualizada em {c.info.data_importacao}</Badge>}
                        </div>
                    </Card>
                    {c.proc && <FichaProcedimento key={`${c.proc}-${c.competencia}`} codigo={c.proc} competencia={c.competencia} aoVoltar={c.voltarDaFicha} aoAbrir={c.abrirFicha} aoFiltrar={c.filtrarPor} />}
                    {!c.proc && c.aba === 'proc' && <BuscaProcedimentos competencia={c.competencia} aoAbrir={c.abrirFicha} />}
                    {!c.proc && c.aba === 'compat' && <Compatibilidades competencia={c.competencia} aoAbrir={c.abrirFicha} />}
                    {!c.proc && c.aba === 'tabelas' && <TabelasAuxiliares competencia={c.competencia} aoFiltrar={c.filtrarPor} />}
                </>
            )}
        </>
    );
}

/** Dentro do sistema, com o Voltar e o atalho para a importação. */
export function SigtapPage() {
    const voltar = useVoltar();
    const navigate = useNavigate();
    const { podeAcessar } = useAuth();
    return <ConsultaSigtap aoVoltar={voltar} aoAbrirImportacao={podeAcessar('parametros') ? () => navigate('/system/parametros/sigtap') : undefined} />;
}

/** /sigtap sem login: somente leitura, com cabeçalho próprio. */
export function SigtapPublicoPage() {

    return (
        <div className="flex min-h-screen min-w-[1340px] flex-col bg-paper">
            <header className="flex h-[60px] shrink-0 items-center justify-between bg-pine-800 px-6">
                <Link to="/" title="Opera Echo" className="flex items-center rounded-lg bg-white px-2.5 py-1">
                    <img src="/logo.png" alt="Opera Echo" className="block h-[30px] w-auto" />
                </Link>
                <Link to="/" className="flex items-center gap-2 rounded-[7px] px-3 py-2 text-[13px] font-medium text-white no-underline hover:bg-white/15"><Icon n="user" /> Entrar no sistema</Link>
            </header>
            <main className="app-content mx-auto box-border w-full max-w-[1440px] flex-1 px-7 pt-[22px] pb-7">
                <ConsultaSigtap />
            </main>
            <footer className="border-t border-line bg-white px-7 py-3 text-center text-xs text-text-2">
                Base local da Tabela Unificada do SUS (SIGTAP/DATASUS), atualizada pela equipe Opera Echo. Em caso de divergência, prevalece a publicação oficial do Ministério da Saúde.
            </footer>
        </div>
    );
}
