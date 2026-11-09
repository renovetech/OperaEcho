/* Janelas de apoio do lançamento: jornada padrão e calculadora CLT. */
import { useState, type ChangeEvent } from 'react';
import Icon from '@/shared/ui/Icon';
import { calcularCalculadora, mascararHora, mascararMoeda, minutosParaHora, type EntradaCalculadora, type Jornada, type TotaisHoras } from '@/features/horaExtra/calculos';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Campos';
import { FaixaIndicadores } from '@/shared/ui/DocumentoFormal';
import { Janela } from '@/shared/ui/Janela';

const COR_DESCONTO = '#8f332f';
const COR_TOTAL = '#1b5e20';
const AJUDA_CALCULADORA = 'Estimativa pelas normas gerais da CLT: INSS pela tabela progressiva de 2026 (Portaria MPS/MF nº 13/2026, teto de R$ 8.475,55), IRRF pela Lei 15.270/2025 (isenção até R$ 5.000 e redução até R$ 7.350) e VT de 6%. Não substitui o contracheque: pode variar com convenções coletivas, benefícios e a base real de cada tributo.';

const moeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

export type ParametrosCalculadora = Pick<EntradaCalculadora, 'salario' | 'cargaHoraria' | 'diasUteis' | 'diasDsr' | 'dependentes'>;

export const PARAMETROS_INICIAIS: ParametrosCalculadora = { salario: '', cargaHoraria: '200', diasUteis: '25', diasDsr: '5', dependentes: '0' };

interface JanelaJornadaProps {
    jornada: Jornada;
    aoMudar: (jornada: Jornada) => void;
    aoAplicar: () => void;
    aoFechar: () => void;
}

export function JanelaJornada({ jornada, aoMudar, aoAplicar, aoFechar }: JanelaJornadaProps) {
    const campo = (chave: keyof Jornada) => (evento: ChangeEvent<HTMLInputElement>) => aoMudar({ ...jornada, [chave]: evento.target.value });
    return (
        <Janela
            titulo="Jornada padrão"
            larguraClasse="w-[520px]"
            aoFechar={aoFechar}
            rodape={(
                <>
                    <Button variant="secondary" onClick={aoFechar}>Fechar</Button>
                    <Button onClick={() => { aoAplicar(); aoFechar(); }}><Icon n="refresh" /> Aplicar na tabela</Button>
                </>
            )}
        >
            <div className="grid grid-cols-3 gap-3">
                <Field rotulo="Entrada" htmlFor="jornada-entrada"><Input id="jornada-entrada" type="time" value={jornada.entrada} onChange={campo('entrada')} /></Field>
                <Field rotulo="Saída" htmlFor="jornada-saida"><Input id="jornada-saida" type="time" value={jornada.saida} onChange={campo('saida')} /></Field>
                <Field rotulo="Intervalo" htmlFor="jornada-intervalo"><Input id="jornada-intervalo" type="time" value={jornada.intervalo} onChange={campo('intervalo')} /></Field>
            </div>
        </Janela>
    );
}

interface JanelaCalculadoraProps {
    totais: TotaisHoras;
    parametros: ParametrosCalculadora;
    aoMudar: (parametros: ParametrosCalculadora) => void;
    aoFechar: () => void;
}

/** As horas abrem com os totais da folha e podem ser ajustadas para simular. */
export function JanelaCalculadora({ totais, parametros, aoMudar, aoFechar }: JanelaCalculadoraProps) {
    const [horas, setHoras] = useState(() => ({
        horas50: minutosParaHora(totais.he50),
        horas100: minutosParaHora(totais.he100),
        horasNoturnas: minutosParaHora(totais.adNoturno)
    }));
    const resultado = calcularCalculadora({ ...parametros, ...horas });
    const parametro = (chave: keyof ParametrosCalculadora) => (evento: ChangeEvent<HTMLInputElement>) => aoMudar({ ...parametros, [chave]: evento.target.value });
    const hora = (chave: keyof typeof horas) => (evento: ChangeEvent<HTMLInputElement>) => setHoras({ ...horas, [chave]: mascararHora(evento.target.value) });

    return (
        <Janela titulo="Calculadora de horas extras e DSR" larguraClasse="w-[980px]" aoFechar={aoFechar} rodape={<Button variant="secondary" onClick={aoFechar}>Fechar</Button>}>
            <div className="mb-5 grid grid-cols-4 gap-3">
                <Field rotulo="Salário base (R$)" htmlFor="calc-salario" ajuda={AJUDA_CALCULADORA}><Input id="calc-salario" placeholder="0,00" value={parametros.salario} onChange={(evento) => aoMudar({ ...parametros, salario: mascararMoeda(evento.target.value) })} /></Field>
                <Field rotulo="Carga mensal" htmlFor="calc-carga"><Input id="calc-carga" type="number" value={parametros.cargaHoraria} onChange={parametro('cargaHoraria')} /></Field>
                <Field rotulo="Dias úteis no mês" htmlFor="calc-uteis"><Input id="calc-uteis" type="number" value={parametros.diasUteis} onChange={parametro('diasUteis')} /></Field>
                <Field rotulo="Dias DSR (dom./fer.)" htmlFor="calc-dsr"><Input id="calc-dsr" type="number" value={parametros.diasDsr} onChange={parametro('diasDsr')} /></Field>
                <Field rotulo="Horas 50%" htmlFor="calc-50"><Input id="calc-50" placeholder="00:00" value={horas.horas50} onChange={hora('horas50')} /></Field>
                <Field rotulo="Horas 100%" htmlFor="calc-100"><Input id="calc-100" placeholder="00:00" value={horas.horas100} onChange={hora('horas100')} /></Field>
                <Field rotulo="Horas noturnas" htmlFor="calc-noturnas"><Input id="calc-noturnas" placeholder="00:00" value={horas.horasNoturnas} onChange={hora('horasNoturnas')} /></Field>
                <Field rotulo="Dependentes (IR)" htmlFor="calc-dependentes"><Input id="calc-dependentes" type="number" min="0" value={parametros.dependentes} onChange={parametro('dependentes')} /></Field>
            </div>
            <FaixaIndicadores itens={[
                { rotulo: 'Valor hora base', valor: moeda(resultado.horaBase) },
                { rotulo: 'Total HE 50%', valor: moeda(resultado.valorHE50) },
                { rotulo: 'Total HE 100%', valor: moeda(resultado.valorHE100) },
                { rotulo: 'HE noturna', valor: moeda(resultado.valorNoturno) },
                { rotulo: 'Valor DSR', valor: moeda(resultado.valorDSR) },
                { rotulo: 'Total bruto', valor: moeda(resultado.totalBruto), cor: COR_TOTAL }
            ]} />
            <FaixaIndicadores itens={[
                { rotulo: 'INSS', valor: `- ${moeda(resultado.inss)}`, cor: COR_DESCONTO },
                { rotulo: 'Vale-transporte (6%)', valor: `- ${moeda(resultado.vt)}`, cor: COR_DESCONTO },
                { rotulo: 'IRRF', valor: `- ${moeda(resultado.irrf)}`, cor: COR_DESCONTO },
                { rotulo: 'Total de descontos', valor: `- ${moeda(resultado.totalDescontos)}`, cor: COR_DESCONTO },
                { rotulo: 'Líquido estimado', valor: moeda(resultado.liquido), cor: COR_TOTAL }
            ]} />
        </Janela>
    );
}
