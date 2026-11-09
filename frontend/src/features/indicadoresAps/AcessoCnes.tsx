/* Portão do guia: libera por CNES de unidade com Prime Saúde ou e-SUS. */
import { useState, type FormEvent } from 'react';
import api from '@/shared/api';
import { avisoRapido, erro, mensagemDeErro, resultadoComDetalhes } from '@/shared/feedback';
import { escaparHtml } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Campos';

const TAMANHO_CNES = 7;

export interface UnidadeAcesso {
    nome: string;
    cnes: string;
}

interface RespostaCnes {
    cadastrado: boolean;
    produtoValido: boolean;
    nomeUnidade?: string;
}

export function AcessoCnes({ aoEntrar }: { aoEntrar: (unidade: UnidadeAcesso) => void }) {
    const [cnes, setCnes] = useState('');
    const [validando, setValidando] = useState(false);

    const validar = async (evento: FormEvent) => {
        evento.preventDefault();
        if (cnes.length < TAMANHO_CNES) {
            erro('Insira um CNES válido (7 dígitos).', 'Atenção');
            return;
        }
        setValidando(true);
        try {
            const { data } = await api.get<RespostaCnes>(`/indicadores/validar-cnes/${cnes}`);
            const nome = data.nomeUnidade ?? '';
            if (!data.cadastrado) {
                erro(`O número ${cnes} não existe em nossa base. Este recurso é exclusivo para clientes Opera Echo / Eco Sistemas.`, 'CNES não encontrado');
            } else if (data.produtoValido) {
                avisoRapido(`Acesso liberado: ${escaparHtml(nome)}`);
                aoEntrar({ nome, cnes });
            } else {
                resultadoComDetalhes('warning', 'Acesso restrito', `A unidade <b>${escaparHtml(nome)}</b> não possui o produto <b>Prime Saúde ou ESUS</b> ativo.<br/><br/>Fale com o suporte Opera Echo.`);
            }
        } catch (falha) {
            erro(mensagemDeErro(falha, 'Falha ao validar o CNES. Tente novamente.'));
        } finally {
            setValidando(false);
        }
    };

    return (
        <div className="relative flex min-h-screen min-w-[1340px] items-center justify-center overflow-hidden bg-[url(/imagem_topo.png)] bg-cover bg-center p-5">
            <div className="absolute inset-0 bg-[linear-gradient(150deg,rgba(20,70,35,.92),rgba(30,110,55,.82)_45%,rgba(46,125,50,.72))]" />
            <form onSubmit={validar} className="relative w-[440px] overflow-hidden rounded-[18px] bg-white shadow-[0_30px_80px_rgba(10,30,18,.55)]">
                <div className="flex justify-center px-8 pt-9 pb-5"><img src="/logo.png" alt="Opera Echo" className="block w-[210px]" /></div>
                <div className="px-[34px] pb-8">
                    <h1 className="m-0 mb-6 text-center text-[21px] font-bold text-ink">Guia de Indicadores APS 2026</h1>
                    <Field rotulo="Número do CNES" htmlFor="aps-cnes" obrigatorio className="mb-5">
                        <Input
                            id="aps-cnes"
                            autoFocus
                            inputMode="numeric"
                            maxLength={TAMANHO_CNES}
                            placeholder="0000000"
                            disabled={validando}
                            className="py-3.5 text-center text-xl font-bold tracking-[4px] tabular-nums"
                            value={cnes}
                            onChange={(e) => setCnes(e.target.value.replace(/\D/g, ''))}
                        />
                    </Field>
                    <Button type="submit" isLoading={validando} className="w-full justify-center py-3.5">Entrar no guia</Button>
                </div>
                <div className="border-0 border-t border-solid border-line bg-surface-2 p-3.5 text-center text-xs text-text-2">Opera Echo Management © 2026 | Eco Sistemas</div>
            </form>
        </div>
    );
}
