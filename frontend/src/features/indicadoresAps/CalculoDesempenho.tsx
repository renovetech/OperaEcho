/* Resumo do cálculo quadrimestral: Notas Técnicas nº 8/2026 (eSF, eAP, eSB, eMulti) e nº 12/2026 (eSFR, eCR, eAPP) da DEAPS/SAPS/MS. */
import { Card, CardTitulo } from '@/shared/ui/Pagina';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

const CONCEITOS = [
    { nome: 'Regular', pontos: '0,25', cor: '#d13b3b', fundo: '#fdecec' },
    { nome: 'Suficiente', pontos: '0,50', cor: '#e07c00', fundo: '#fff6ea' },
    { nome: 'Bom', pontos: '0,75', cor: '#2e7d32', fundo: '#e8f5e9' },
    { nome: 'Ótimo', pontos: '1,00', cor: '#1565c0', fundo: '#e3f2fd' }
];

const FAIXAS = [
    { conceito: 'Ótimo', componente2: '> 8,5', componente3: '> 7,5' },
    { conceito: 'Bom', componente2: '≥ 7 e ≤ 8,5', componente3: '≥ 5 e ≤ 7,5' },
    { conceito: 'Suficiente', componente2: '≥ 5 e < 7', componente3: '> 2,5 e < 5' },
    { conceito: 'Regular', componente2: '< 5', componente3: '≤ 2,5' }
];

const PESOS: { equipe: string; nota: string; itens: [string, string, number][] }[] = [
    { equipe: 'eSF / eAP', nota: 'NT 8/2026', itens: [['C1', 'Mais Acesso à APS', 1], ['C2', 'Cuidado no desenvolvimento infantil', 2], ['C3', 'Cuidado na gestação e puerpério', 2], ['C4', 'Cuidado da pessoa com diabetes', 1], ['C5', 'Cuidado da pessoa com hipertensão', 1], ['C6', 'Cuidado da pessoa idosa', 1], ['C7', 'Cuidado da mulher na prevenção do câncer', 2]] },
    { equipe: 'eSB', nota: 'NT 8/2026', itens: [['B1', 'Primeira consulta odontológica programada', 2], ['B2', 'Tratamento concluído', 2], ['B3', 'Taxa de exodontias', 2], ['B4', 'Escovação supervisionada', 1], ['B5', 'Procedimentos odontológicos individuais preventivos', 2], ['B6', 'Tratamento restaurador atraumático', 1]] },
    { equipe: 'eMulti', nota: 'NT 8/2026', itens: [['M1', 'Média de atendimentos da eMulti por pessoa', 6], ['M2', 'Ações interprofissionais da eMulti', 4]] },
    { equipe: 'eSFR', nota: 'NT 12/2026', itens: [['R1', 'Mais Acesso à APS', 1], ['R2', 'Desenvolvimento infantil', 2], ['R3', 'Cuidado na gestação e puerpério', 2], ['R4', 'Cuidado da pessoa com diabetes', 1.5], ['R5', 'Cuidado da pessoa com hipertensão', 1.5], ['R6', 'Cuidado da mulher na prevenção do câncer', 2]] },
    { equipe: 'eCR', nota: 'NT 12/2026', itens: [['CR1', 'Mais Acesso à APS', 2], ['CR2', 'Cuidado na gestação e puerpério', 2], ['CR3', 'Rastreamento de IST', 3], ['CR4', 'Cuidado da pessoa com tuberculose', 3]] },
    { equipe: 'eAPP', nota: 'NT 12/2026', itens: [['P1', 'Mais acesso à Atenção Primária Prisional', 1], ['P2', 'Cuidado na gestação *', 1], ['P3', 'Cuidado da pessoa com diabetes e/ou hipertensão', 1], ['P4', 'Rastreio de infecções sexualmente transmissíveis', 3], ['P5', 'Cuidado da pessoa com tuberculose', 3], ['P6', 'Cuidado da mulher na prevenção do câncer *', 1]] }
];

const REGRA_PESOS = 'Nota de cada indicador = pontos do conceito × peso. A Nota Final é a soma das notas e vai até 10.\n* eAPP em unidade prisional sem população feminina ou sem gestantes elegíveis recebe a pontuação integral de P2 e P6, sem prejuízo à nota final.';
const REGRA_RESUMO = 'Resumo das Notas Técnicas nº 8/2026 e nº 12/2026 (DEAPS/SAPS/MS), que tratam do cofinanciamento federal da APS (Portarias GM/MS nº 3.493/2024 e nº 7.799/2025). A Nota nº 8/2026 revogou a nº 6/2025.\nOs valores oficiais de cada equipe são os publicados no Siaps.';

const fmtPeso = (peso: number) => peso.toLocaleString('pt-BR');

const Etapa = ({ numero, titulo, children }: { numero: number; titulo: string; children: string }) => (
    <li className="flex gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-tint text-[13px] font-bold text-pine-800">{numero}</span>
        <div><b className="block text-sm font-semibold text-ink">{titulo}</b><span className="text-[13.5px] leading-snug text-text">{children}</span></div>
    </li>
);

function TabelaPesos({ equipe, nota, itens }: (typeof PESOS)[number]) {
    return (
        <Card>
            <CardTitulo titulo={equipe} extra={<span className="text-xs text-text-2">{nota}</span>} />
            <div className="p-3.5">
                <Tabela cabecalho={<><Th>Indicador</Th><Th centro>Peso</Th></>}>
                    {!itens.length && <LinhaVazia colunas={2}>Sem indicadores.</LinhaVazia>}
                    {itens.map(([codigo, nome, peso]) => (
                        <tr key={codigo}>
                            <Td className="py-2"><b className="font-semibold">{codigo}</b> {nome}</Td>
                            <Td centro className="py-2 font-semibold tabular-nums">{fmtPeso(peso)}</Td>
                        </tr>
                    ))}
                    <tr className="bg-surface-2"><Td className="py-2 font-semibold">Total</Td><Td centro className="py-2 font-bold tabular-nums">{fmtPeso(itens.reduce((soma, item) => soma + item[2], 0))}</Td></tr>
                </Tabela>
            </div>
        </Card>
    );
}

export function CalculoDesempenho() {
    return (
        <>
            <div className="mb-3.5 grid grid-cols-2 gap-3.5">
                <Card>
                    <CardTitulo titulo="Como o desempenho é apurado" ajuda={REGRA_RESUMO} />
                    <ol className="m-0 flex list-none flex-col gap-3.5 p-[18px]">
                        <Etapa numero={1} titulo="Envio dos dados">As informações precisam chegar ao Siaps até o 10º dia do mês subsequente para contar nos indicadores.</Etapa>
                        <Etapa numero={2} titulo="Resultado mensal">Serve para monitoramento e planejamento das boas práticas. É preliminar: não define o repasse sozinho.</Etapa>
                        <Etapa numero={3} titulo="Resultado do quadrimestre">Média dos meses, usada na avaliação e no cofinanciamento. Havendo suspensão de pagamento, a média considera só os meses válidos.</Etapa>
                        <Etapa numero={4} titulo="Incentivo financeiro">Repassado nos quatro meses seguintes. Em novas homologações, é transferido mensalmente até o segundo recálculo, pelos valores da classificação Bom.</Etapa>
                    </ol>
                </Card>
                <Card>
                    <CardTitulo titulo="Componente II: Vínculo e Acompanhamento Territorial" />
                    <ul className="list-disc m-0 flex flex-col gap-2.5 py-[18px] pr-[18px] pl-9 text-[13.5px] leading-snug text-text">
                        <li>O resultado do quadrimestre é a média dos valores mensais das dimensões de Cadastro e Acompanhamento.</li>
                        <li>A Satisfação do Usuário entra como bônus: vale a maior nota obtida entre os meses do quadrimestre.</li>
                        <li>A Nota Final define a classificação do incentivo, conforme a tabela abaixo.</li>
                    </ul>
                    <CardTitulo titulo="Componente III: Qualidade do Cuidado" />
                    <ul className="list-disc m-0 flex flex-col gap-2.5 py-[18px] pr-[18px] pl-9 text-[13.5px] leading-snug text-text">
                        <li>O resultado de cada indicador é a média dos meses monitorados e vira um conceito.</li>
                        <li>Desenvolvimento Infantil e Gestação e Puerpério contam só os meses com crianças que completaram 2 anos e gestações que atingiram o 42º dia de puerpério.</li>
                        <li>Pontos do conceito × peso do indicador = nota do indicador. A soma das notas é a Nota Final.</li>
                    </ul>
                </Card>
            </div>
            <div className="mb-3.5 grid grid-cols-[2fr_3fr] gap-3.5">
                <Card>
                    <CardTitulo titulo="Pontos por conceito do indicador" />
                    <div className="grid grid-cols-4 gap-2 p-[18px]">
                        {CONCEITOS.map((conceito) => (
                            <div key={conceito.nome} className="rounded-lg px-1.5 py-3 text-center" style={{ background: conceito.fundo, color: conceito.cor }}>
                                <span className="mb-0.5 block text-[11px] font-bold tracking-wide uppercase">{conceito.nome}</span>
                                <b className="text-lg font-bold tabular-nums">{conceito.pontos}</b>
                            </div>
                        ))}
                    </div>
                </Card>
                <Card>
                    <CardTitulo titulo="Classificação para o incentivo financeiro" ajuda="A faixa é aplicada à Nota Final de cada componente." />
                    <div className="p-3.5">
                        <Tabela cabecalho={<><Th>Classificação</Th><Th centro>Nota Final do Componente II</Th><Th centro>Nota Final do Componente III</Th></>}>
                            {FAIXAS.map((faixa) => (
                                <tr key={faixa.conceito}>
                                    <Td className="py-2 font-semibold">{faixa.conceito}</Td>
                                    <Td centro className="py-2 tabular-nums">{faixa.componente2}</Td>
                                    <Td centro className="py-2 tabular-nums">{faixa.componente3}</Td>
                                </tr>
                            ))}
                        </Tabela>
                    </div>
                </Card>
            </div>
            <Card className="mb-3.5">
                <CardTitulo titulo="Pesos do Componente III por equipe" ajuda={REGRA_PESOS} />
                <p className="m-0 px-[18px] pt-3.5 text-[13.5px] leading-snug text-text"><b className="font-semibold">Exemplo (eSF):</b> C1 Bom (0,75 × 1), C2 Ótimo (1 × 2), C3 Ótimo (1 × 2), C4 Suficiente (0,5 × 1), C5 Regular (0,25 × 1), C6 Ótimo (1 × 1) e C7 Ótimo (1 × 2) somam 8,5, classificação Ótimo.</p>
                <div className="grid grid-cols-3 items-start gap-3.5 p-3.5">
                    {PESOS.map((grupo) => <TabelaPesos key={grupo.equipe} {...grupo} />)}
                </div>
            </Card>
        </>
    );
}
