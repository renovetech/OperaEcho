/* Formulários da tela de entrada. A lógica fica em hooks.ts. */
import { useState, type ReactNode } from 'react';
import Icon from '@/shared/ui/Icon';
import type { useEntrada, useNovaSenha, useRecuperacao, useSolicitacao } from '@/features/login/hooks';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';

const NOME_DO_CANAL: Record<string, string> = { WHATSAPP: 'WhatsApp', EMAIL: 'E-mail' };

const TituloEtapa = ({ children }: { children: ReactNode }) => <h3 className="m-0 mb-3 text-lg font-semibold tracking-tight text-ink">{children}</h3>;
const TextoEtapa = ({ children }: { children: ReactNode }) => <p className="m-0 mb-4 text-[13px] leading-relaxed text-text-2">{children}</p>;
const LinhaBotoes = ({ children }: { children: ReactNode }) => <div className="mt-2 grid grid-cols-2 gap-3 [&>button]:justify-center">{children}</div>;
const LinkAcao = ({ aoClicar, children }: { aoClicar: () => void; children: ReactNode }) => (
    <button type="button" onClick={aoClicar} className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-pine hover:text-pine-800 hover:underline">{children}</button>
);

function CampoSenha({ id, rotulo, valor, aoMudar, ...resto }: { id: string; rotulo: string; valor: string; aoMudar: (valor: string) => void; placeholder?: string; disabled?: boolean; required?: boolean; autoComplete?: string }) {
    const [visivel, setVisivel] = useState(false);
    return (
        <Field rotulo={rotulo} htmlFor={id}>
            <div className="relative">
                <Input id={id} type={visivel ? 'text' : 'password'} className="pr-10" value={valor} onChange={(evento) => aoMudar(evento.target.value)} {...resto} />
                <button
                    type="button"
                    aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
                    title={visivel ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setVisivel(!visivel)}
                    className="absolute top-1/2 right-2 flex -translate-y-1/2 cursor-pointer rounded-md border-0 bg-transparent p-1 text-base text-muted hover:text-ink"
                >
                    <Icon n={visivel ? 'eye-off' : 'eye'} />
                </button>
            </div>
        </Field>
    );
}

export function FormEntrada({ entrada, carregando, aoEsquecer, aoSolicitar }: { entrada: ReturnType<typeof useEntrada>; carregando: boolean; aoEsquecer: () => void; aoSolicitar: () => void }) {
    return (
        <form onSubmit={(evento) => void entrada.enviar(evento)} className="cascata-login flex flex-col gap-4">
            <Field rotulo="Usuário" htmlFor="login-usuario">
                <Input id="login-usuario" placeholder="Digite seu usuário" autoComplete="username" value={entrada.usuario} disabled={carregando} onChange={(evento) => entrada.setUsuario(evento.target.value)} />
            </Field>
            <CampoSenha id="login-senha" rotulo="Senha" placeholder="••••••••" autoComplete="current-password" valor={entrada.senha} disabled={carregando} aoMudar={entrada.setSenha} />
            <div className="-mt-1 text-right"><LinkAcao aoClicar={aoEsquecer}>Esqueci minha senha</LinkAcao></div>
            <Button type="submit" isLoading={carregando} className="brilho-login h-11 justify-center text-sm tracking-wide">{carregando ? 'Autenticando...' : 'Acessar sistema'}</Button>
            <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />ou<span className="h-px flex-1 bg-line" /></div>
            <Button type="button" variant="secondary" className="h-11 justify-center" onClick={aoSolicitar}>Solicitar acesso (primeiro acesso)</Button>
        </form>
    );
}

export function FormRecuperacao({ rec, carregando, aoCancelar }: { rec: ReturnType<typeof useRecuperacao>; carregando: boolean; aoCancelar: () => void }) {
    if (rec.etapa === 'IDENTIFICAR') {
        return (
            <form onSubmit={rec.identificar} className="cascata-login flex flex-col gap-4">
                <div>
                    <TituloEtapa>Redefinir senha</TituloEtapa>
                    <TextoEtapa>Vamos enviar um código de confirmação para o seu WhatsApp ou e-mail cadastrado.</TextoEtapa>
                </div>
                <Field rotulo="Usuário (login)" htmlFor="rec-usuario"><Input id="rec-usuario" required autoComplete="username" value={rec.usuario} onChange={(evento) => rec.setUsuario(evento.target.value)} /></Field>
                <Field rotulo="Matrícula" htmlFor="rec-matricula"><Input id="rec-matricula" required value={rec.matricula} onChange={(evento) => rec.setMatricula(evento.target.value)} /></Field>
                <LinhaBotoes>
                    <Button type="button" variant="secondary" onClick={aoCancelar}>Voltar</Button>
                    <Button type="submit" isLoading={carregando}>{carregando ? 'Verificando...' : 'Continuar'}</Button>
                </LinhaBotoes>
            </form>
        );
    }
    if (rec.etapa === 'CANAL') {
        return (
            <form onSubmit={rec.enviarCodigo} className="cascata-login flex flex-col gap-3">
                <TituloEtapa>Onde quer receber o código?</TituloEtapa>
                {rec.canais.map((item) => (
                    <label key={item.canal} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border border-solid px-3 py-2.5', rec.canal === item.canal ? 'border-pine bg-tint' : 'border-line bg-white')}>
                        <input type="radio" name="canal" className="accent-pine" value={item.canal} checked={rec.canal === item.canal} onChange={() => rec.setCanal(item.canal)} />
                        <span className="text-[13px]"><b className="font-semibold text-ink">{NOME_DO_CANAL[item.canal] ?? item.canal}</b><small className="block text-xs text-text-2">{item.destino}</small></span>
                    </label>
                ))}
                <LinhaBotoes>
                    <Button type="button" variant="secondary" onClick={() => rec.voltarPara('IDENTIFICAR')}>Voltar</Button>
                    <Button type="submit" isLoading={carregando} disabled={!rec.canal}>{carregando ? 'Enviando...' : 'Enviar código'}</Button>
                </LinhaBotoes>
            </form>
        );
    }
    return (
        <form onSubmit={rec.confirmarCodigo} className="cascata-login flex flex-col gap-4">
            <div>
                <TituloEtapa>Digite o código</TituloEtapa>
                <TextoEtapa>Enviamos um código de 6 dígitos por {NOME_DO_CANAL[rec.canal] ?? rec.canal} para <b className="font-semibold">{rec.destino}</b>. Ele vale por 10 minutos.</TextoEtapa>
            </div>
            <Field rotulo="Código" htmlFor="rec-codigo">
                <Input id="rec-codigo" required inputMode="numeric" autoComplete="one-time-code" className="text-center text-[22px] tracking-[0.5em]" value={rec.codigo} onChange={(evento) => rec.setCodigo(evento.target.value)} />
            </Field>
            <div className="-mt-1 text-right"><LinkAcao aoClicar={() => { if (!carregando) void rec.reenviar(); }}>Não recebi: reenviar código</LinkAcao></div>
            <LinhaBotoes>
                <Button type="button" variant="secondary" onClick={() => rec.voltarPara('CANAL')}>Voltar</Button>
                <Button type="submit" isLoading={carregando} disabled={!rec.codigoCompleto}>{carregando ? 'Conferindo...' : 'Confirmar'}</Button>
            </LinhaBotoes>
        </form>
    );
}

export function FormNovaSenha({ titulo, senha, carregando, aoCancelar }: { titulo: string; senha: ReturnType<typeof useNovaSenha>; carregando: boolean; aoCancelar: () => void }) {
    return (
        <form onSubmit={(evento) => void senha.enviar(evento)} className="cascata-login flex flex-col gap-4">
            <div>
                <TituloEtapa>{titulo}</TituloEtapa>
                <small className="block text-xs text-text-2">Mínimo de 7 caracteres, com maiúscula, minúscula, número e caractere especial.</small>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-2">
                    <div className={cn('h-full transition-[width] duration-300', senha.senhaForte ? 'bg-pine' : 'bg-danger')} style={{ width: `${senha.percentualForca}%` }} />
                </div>
            </div>
            <CampoSenha id="nova-senha" rotulo="Nova senha" required autoComplete="new-password" valor={senha.novaSenha} aoMudar={senha.setNovaSenha} />
            <CampoSenha id="confirma-senha" rotulo="Confirmar senha" required autoComplete="new-password" valor={senha.confirmacao} aoMudar={senha.setConfirmacao} />
            <LinhaBotoes>
                <Button type="button" variant="secondary" onClick={aoCancelar}>Cancelar</Button>
                <Button type="submit" isLoading={carregando} disabled={!senha.senhaForte}>Alterar senha</Button>
            </LinhaBotoes>
        </form>
    );
}

const CAMPO_COMPACTO = 'py-[7px]';

export function FormSolicitacao({ solicitacao, carregando, aoCancelar }: { solicitacao: ReturnType<typeof useSolicitacao>; carregando: boolean; aoCancelar: () => void }) {
    const { cadastro, opcoes, alterar } = solicitacao;
    return (
        <form onSubmit={(evento) => void solicitacao.enviar(evento)} className="cascata-login flex flex-col gap-2.5">
            <h3 className="m-0 text-lg font-semibold tracking-tight text-ink">Solicitar acesso</h3>
            <Field rotulo="Nome completo" obrigatorio htmlFor="sol-nome"><Input id="sol-nome" name="nome_completo" required className={CAMPO_COMPACTO} value={cadastro.nome_completo} onChange={alterar} /></Field>
            <div className="grid grid-cols-2 gap-3">
                <Field rotulo="CPF" obrigatorio htmlFor="sol-cpf"><Input id="sol-cpf" name="cpf" required placeholder="Apenas números" className={CAMPO_COMPACTO} value={cadastro.cpf} onChange={alterar} /></Field>
                <Field rotulo="Matrícula" obrigatorio htmlFor="sol-matricula"><Input id="sol-matricula" name="matricula" required className={CAMPO_COMPACTO} value={cadastro.matricula} onChange={alterar} /></Field>
                <Field rotulo="Celular (WhatsApp)" obrigatorio htmlFor="sol-celular"><Input id="sol-celular" type="tel" name="celular" required placeholder="(21) 98765-4321" className={CAMPO_COMPACTO} value={cadastro.celular} onChange={alterar} /></Field>
                <Field rotulo="Data de nascimento" htmlFor="sol-nascimento"><Input id="sol-nascimento" type="date" min="1900-01-01" max="2100-12-31" name="data_nascimento" className={CAMPO_COMPACTO} value={cadastro.data_nascimento} onChange={alterar} /></Field>
                <Field rotulo="Data de admissão" obrigatorio htmlFor="sol-admissao"><Input id="sol-admissao" type="date" min="1900-01-01" max="2100-12-31" name="data_admissao" required className={CAMPO_COMPACTO} value={cadastro.data_admissao} onChange={alterar} /></Field>
                <Field rotulo="E-mail" htmlFor="sol-email"><Input id="sol-email" type="email" name="email" placeholder="Opcional" className={CAMPO_COMPACTO} value={cadastro.email} onChange={alterar} /></Field>
                <Field rotulo="Setor" obrigatorio htmlFor="sol-setor">
                    <Select id="sol-setor" name="id_setor" required className={CAMPO_COMPACTO} value={cadastro.id_setor} onChange={alterar}>
                        <option value="">Selecione...</option>
                        {opcoes.setores.map((item) => <option key={item.id_setor} value={item.id_setor}>{item.nome_setor}</option>)}
                    </Select>
                </Field>
                <Field rotulo="Função" obrigatorio htmlFor="sol-funcao">
                    <Select id="sol-funcao" name="id_funcao" required className={CAMPO_COMPACTO} value={cadastro.id_funcao} onChange={alterar}>
                        <option value="">Selecione...</option>
                        {opcoes.funcoes.map((item) => <option key={item.id_funcao} value={item.id_funcao}>{item.nome_funcao}</option>)}
                    </Select>
                </Field>
                <Field rotulo="Lotação (acesso a dados)" obrigatorio htmlFor="sol-lotacao">
                    <Select id="sol-lotacao" name="id_lotacao" required className={cn(CAMPO_COMPACTO, solicitacao.sedeEscolhida && 'bg-tint font-semibold text-pine')} value={cadastro.id_lotacao} onChange={alterar}>
                        <option value="">Selecione...</option>
                        <option value={solicitacao.LOTACAO_SEDE}>SEDE - GD (Acesso Total)</option>
                        {opcoes.lotacoes.map((item) => <option key={item.id_projeto} value={item.id_projeto}>{item.nome_projeto}</option>)}
                    </Select>
                </Field>
                <Field rotulo="Usuário (automático)" htmlFor="sol-usuario"><Input id="sol-usuario" disabled className={CAMPO_COMPACTO} value={cadastro.usuario} /></Field>
            </div>
            <LinhaBotoes>
                <Button type="button" variant="secondary" onClick={aoCancelar}>Cancelar</Button>
                <Button type="submit" isLoading={carregando}>Enviar solicitação</Button>
            </LinhaBotoes>
        </form>
    );
}
