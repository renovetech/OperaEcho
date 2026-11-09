import { useAlterarSenha } from '@/features/conta/hooks';
import { useVoltar } from '@/shared/hooks';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Campos';
import { Card, PageHeader } from '@/shared/ui/Pagina';

export default function AlterarSenhaPage() {
    const voltar = useVoltar();
    const { novaSenha, setNovaSenha, confirmaSenha, setConfirmaSenha, percentualForca, senhaForte, salvar } = useAlterarSenha();

    return (
        <>
            <PageHeader titulo="Alterar Senha" />
            <Card className="max-w-[520px]">
                <form onSubmit={salvar}>
                    <div className="flex flex-col gap-4 px-[22px] py-5">
                        <Field rotulo="Nova Senha" htmlFor="nova-senha" obrigatorio ajuda="Mínimo 7 caracteres, com maiúscula, minúscula, número e caractere especial.">
                            <Input id="nova-senha" type="password" autoComplete="new-password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required />
                            <div className="h-1 overflow-hidden rounded-full bg-line-2">
                                <div className={cn('h-full transition-all', senhaForte ? 'bg-pine' : 'bg-danger')} style={{ width: `${percentualForca}%` }} />
                            </div>
                        </Field>
                        <Field rotulo="Confirmar Senha" htmlFor="confirma-senha" obrigatorio>
                            <Input id="confirma-senha" type="password" autoComplete="new-password" value={confirmaSenha} onChange={(e) => setConfirmaSenha(e.target.value)} required />
                        </Field>
                    </div>
                    <div className="flex justify-end gap-2.5 rounded-b-[10px] border-t border-line bg-surface-2 px-[22px] py-3.5">
                        <Button variant="secondary" onClick={voltar}>Cancelar</Button>
                        <Button type="submit" disabled={!senhaForte}>Salvar</Button>
                    </div>
                </form>
            </Card>
        </>
    );
}
