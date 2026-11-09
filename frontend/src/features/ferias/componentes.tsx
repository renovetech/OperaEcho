import Icon from '@/shared/ui/Icon';
import { formatarData, rotuloStatus, type AlertaClt } from '@/features/ferias/regras';
import { cn } from '@/shared/lib';

const TOM_STATUS: Record<string, { selo: string; linha: string }> = {
    APROVADO: { selo: 'border-pine text-pine', linha: 'bg-tint' },
    RECUSADO: { selo: 'border-danger text-danger', linha: 'bg-danger-tint' }
};
const TOM_ANALISE = { selo: 'border-brass text-brass', linha: 'bg-brass-tint' };

export const fundoDoStatus = (status: string) => (TOM_STATUS[status] ?? TOM_ANALISE).linha;

export function SeloStatus({ status }: { status: string }) {
    return <span className={cn('inline-block rounded-full border border-solid bg-white px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', (TOM_STATUS[status] ?? TOM_ANALISE).selo)}>{rotuloStatus(status)}</span>;
}

export function AlertaAtencao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <div role="alert" className="mb-3.5 rounded-lg border border-solid border-brass-soft bg-brass-tint px-4 py-3 text-[13.5px] text-ink">
            <b className="flex items-center gap-1.5 font-semibold text-brass"><Icon n="alert" /> {titulo}</b>
            <div className="mt-1.5">{children}</div>
        </div>
    );
}

export function AlertaPrazoClt({ alerta }: { alerta: AlertaClt }) {
    return (
        <AlertaAtencao titulo="Prazo legal (CLT Art. 134) excedido">
            O período aquisitivo de <b>{alerta.periodo}</b> (iniciado em {formatarData(alerta.inicio)}) deve ser concluído em até <b>1 ano e 11 meses</b>. Data limite para o fim do gozo: <b>{formatarData(alerta.limite)}</b>.
        </AlertaAtencao>
    );
}
