import { useState } from 'react';
import { Contador } from '@/shared/ui/Contador';
import type { AtividadesDoDia, EquipeDoDia, FeriasAgendada, ProgressoPlano, Totais } from '@/features/inicio/api';
import { useAuth } from '@/shared/auth/AuthContext';
import { cn, formatarDiaMes } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Badge, Card, CardTitulo, Stat } from '@/shared/ui/Pagina';

const QTD_PROXIMOS = 3;

function Numero({ valor, className }: { valor: number; className?: string }) {
    return <p className={cn('m-0 text-[26px] leading-none font-bold text-ink tabular-nums', className)}><Contador valor={valor} /></p>;
}

function StatEquipe({ totais }: { totais: Totais }) {
    const { usuario } = useAuth();
    const funcao = (usuario.nome_funcao || usuario.funcao || usuario.perfil_acesso || '').toUpperCase();
    const isGestor = ['GERENTE', 'ASSISTENTE', 'ADMINISTRADOR'].some((cargo) => funcao.includes(cargo));
    const isOperador = ['OPERADOR', 'ANALISTA', 'LÍDER'].some((cargo) => funcao.includes(cargo));

    if (isGestor) {
        return (
            <Stat rotulo="Implantadores / Operadores">
                <div className="flex items-baseline gap-2.5">
                    <Numero valor={totais.implantadores} className="text-pine" />
                    <span className="text-lg font-light text-line">/</span>
                    <Numero valor={totais.operadores} />
                </div>
            </Stat>
        );
    }
    if (isOperador) return <Stat rotulo="Operadores"><Numero valor={totais.operadores} /></Stat>;
    return <Stat rotulo="Implantadores"><Numero valor={totais.implantadores} /></Stat>;
}

export function GradeTotais({ totais }: { totais: Totais }) {
    return (
        <div className="mb-[18px] grid grid-cols-4 gap-4">
            <StatEquipe totais={totais} />
            <Stat rotulo="Projetos Ativos"><Numero valor={totais.projetos} /></Stat>
            <Stat rotulo="Unidades Ativas"><Numero valor={totais.unidades} /></Stat>
            <Stat rotulo="Produtos Vinculados"><Numero valor={totais.produtos} /></Stat>
        </div>
    );
}

const detalheEquipe = ({ implantador, unidade, motivo }: EquipeDoDia): string =>
    `Implantador: ${implantador || 'Não informado'}\nUnidade: ${unidade || 'Não informada'}\nMotivo: ${motivo || 'Não informado'}`;

export function ResumoDia({ titulo, atividades }: { titulo: string; atividades: AtividadesDoDia }) {
    return (
        <Card>
            <CardTitulo titulo={titulo} extra={<Badge tom="marca">{atividades.total} hoje</Badge>} />
            <div className="flex min-h-[62px] flex-wrap items-center gap-2 px-[18px] py-3.5">
                {atividades.por_equipe.length === 0 && <p className="m-0 text-[13.5px] text-text-2">Nenhuma atividade registrada hoje.</p>}
                {atividades.por_equipe.map((equipe) => (
                    <span
                        key={equipe.nome}
                        title={detalheEquipe(equipe)}
                        className="inline-flex cursor-help items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-1 pl-3 text-[12.5px] text-text"
                    >
                        {equipe.nome}
                        <b className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-tint px-1.5 text-xs font-semibold text-pine-800">{equipe.total}</b>
                    </span>
                ))}
            </div>
        </Card>
    );
}

function nomeCurto(nome = ''): string {
    const partes = nome.split(' ');
    return partes.length === 1 ? nome : `${partes[0]} ${partes[partes.length - 1]}`;
}

export function ProximasFerias({ ferias }: { ferias: FeriasAgendada[] }) {
    const [indice, setIndice] = useState(0);
    const atual = ferias[indice];
    const anterior = () => setIndice((i) => (i > 0 ? i - 1 : ferias.length - 1));
    const proximo = () => setIndice((i) => (i < ferias.length - 1 ? i + 1 : 0));

    return (
        <Card>
            <CardTitulo titulo="Próximas Férias" extra={<Badge tom="ouro">{ferias.length} agendadas</Badge>} />
            {!atual && <p className="m-0 px-[18px] py-11 text-center text-sm text-text-2">Nenhuma férias programada.</p>}
            {atual && (
                <div className="px-[18px] py-4">
                    <div className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-full bg-tint font-semibold text-pine-800">{nomeCurto(atual.nome_completo || 'U').charAt(0)}</span>
                        <div>
                            <p className="m-0 text-sm font-semibold text-ink">{nomeCurto(atual.nome_completo)}</p>
                            <p className="m-0 mt-0.5 text-[12.5px] text-text-2">{formatarDiaMes(atual.data_inicio)} até {formatarDiaMes(atual.data_fim)}</p>
                        </div>
                    </div>
                    <div className="my-3.5 flex items-center justify-between">
                        <Button variant="secondary" size="sm" onClick={anterior} aria-label="Colaborador anterior">◀</Button>
                        <span className="text-[12.5px] text-text-2">Colaborador {indice + 1} de {ferias.length}</span>
                        <Button variant="secondary" size="sm" onClick={proximo} aria-label="Próximo colaborador">▶</Button>
                    </div>
                    {ferias.slice(indice + 1, indice + 1 + QTD_PROXIMOS).map((item) => (
                        <div key={`${item.nome_completo}-${item.data_inicio}`} className="flex justify-between border-t border-line-2 py-2 text-[13px]">
                            <span className="text-text">{nomeCurto(item.nome_completo)}</span>
                            <span className="text-text-2 tabular-nums">{formatarDiaMes(item.data_inicio)}</span>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
}

function Legenda({ cor, quantidade, rotulo, percentual }: { cor: string; quantidade: number; rotulo: string; percentual: number }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-text-2">
            <span className={cn('size-2 rounded-full', cor)} />
            <b className="font-semibold text-ink">{quantidade}</b> {rotulo} ({percentual}%)
        </span>
    );
}

function CartaoPlano({ plano }: { plano: ProgressoPlano }) {
    return (
        <article className="border-b border-line-2 px-[18px] py-3.5 last:border-b-0">
            <div className="mb-1 flex justify-between gap-3 text-xs text-text-2">
                <span className="font-medium text-pine-800">{plano.nome_projeto}</span>
                <span className="whitespace-nowrap">Total: {plano.total_unidades} ações</span>
            </div>
            <h3 className="m-0 mb-2.5 text-sm font-semibold text-ink">{plano.titulo}</h3>
            <div className="mb-2.5 flex h-2 overflow-hidden rounded-full bg-line-2">
                <div className="bg-pine" style={{ width: `${plano.perc_concluido}%` }} title={`${plano.perc_concluido}% Fechado`} />
                <div className="bg-brass-soft" style={{ width: `${plano.perc_andamento}%` }} title={`${plano.perc_andamento}% Em Andamento`} />
                <div className="bg-danger" style={{ width: `${plano.perc_atrasado}%` }} title={`${plano.perc_atrasado}% Em Atraso`} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Legenda cor="bg-pine" quantidade={plano.unidades_concluidas} rotulo="Fechados" percentual={plano.perc_concluido} />
                <Legenda cor="bg-brass-soft" quantidade={plano.unidades_andamento} rotulo="Em Andamento" percentual={plano.perc_andamento} />
                <Legenda cor="bg-danger" quantidade={plano.unidades_atrasadas} rotulo="Em Atraso" percentual={plano.perc_atrasado} />
            </div>
        </article>
    );
}

export function StatusPlanos({ planos }: { planos: ProgressoPlano[] }) {
    return (
        <Card>
            <CardTitulo titulo="Status dos Planos de Ação" extra={<Badge tom="ouro">{planos.length} em andamento</Badge>} />
            {planos.length === 0 && <p className="m-0 px-[18px] py-11 text-center text-sm text-text-2">Nenhum plano ativo.</p>}
            {planos.map((plano) => <CartaoPlano key={plano.id_plano} plano={plano} />)}
        </Card>
    );
}
