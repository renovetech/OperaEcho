import Icon from '@/shared/ui/Icon';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/lib';

export interface ItemAba<T extends string> {
    id: T;
    rotulo: string;
    icone?: string;
    desativada?: boolean;
}

interface AbasProps<T extends string> {
    itens: readonly ItemAba<T>[];
    ativa: T;
    aoMudar: (id: T) => void;
    rotulo?: string;
    className?: string;
}

/** Abas do sistema: a aba ativa é o botão primário. */
export function Abas<T extends string>({ itens, ativa, aoMudar, rotulo, className }: AbasProps<T>) {
    return (
        <div role="tablist" aria-label={rotulo} className={cn('flex gap-2', className)}>
            {itens.map((item) => (
                <Button key={item.id} role="tab" aria-selected={item.id === ativa} variant={item.id === ativa ? 'primary' : 'secondary'} disabled={item.desativada} onClick={() => aoMudar(item.id)}>
                    {item.icone && <Icon n={item.icone} />} {item.rotulo}
                </Button>
            ))}
        </div>
    );
}
