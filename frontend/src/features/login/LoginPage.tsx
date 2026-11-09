/* Tela de entrada: formulário à esquerda e imagem à direita, separados por um fio de latão em diagonal.
 * A diagonal inverte ao abrir a solicitação de acesso; ao entrar no sistema, a imagem ocupa a tela. */
import { useCallback, useMemo, useState } from 'react';
import { FormEntrada, FormNovaSenha, FormRecuperacao, FormSolicitacao } from '@/features/login/formularios';
import { useEntrada, useNovaSenha, useRecuperacao, useSolicitacao, type TelaLogin } from '@/features/login/hooks';
import { cn } from '@/shared/lib';
import { NOME_SISTEMA, VERSAO_SISTEMA } from '@/shared/versao';

/* Mesma inclinação nos dois sentidos: o recorte da imagem e o fio de latão andam juntos. */
const RECORTE_NORMAL = 'polygon(96px 0, 100% 0, 100% 100%, 0 100%)';
const RECORTE_INVERTIDO = 'polygon(0 0, 100% 0, 100% 100%, 96px 100%)';
const RECORTE_TELA_CHEIA = 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
const FIO_NORMAL = 'polygon(96px 0, 100px 0, 4px 100%, 0 100%)';
const FIO_INVERTIDO = 'polygon(0 0, 4px 0, 100px 100%, 96px 100%)';

const TRANSICAO = 'duration-700 ease-[cubic-bezier(.22,1,.36,1)]';

export function LoginPage() {
    const [tela, setTela] = useState<TelaLogin>('LOGIN');
    const [erro, setErroBruto] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [tokenReset, setTokenReset] = useState<string | null>(null);
    const [autorizado, setAutorizado] = useState(false);

    const setErro = useCallback((mensagem: string) => setErroBruto(mensagem), []);
    const form = useMemo(() => ({ erro, setErro, carregando, setCarregando }), [erro, setErro, carregando]);

    const entrada = useEntrada(form, (token) => { setTokenReset(token); setTela('PRIMEIRO_ACESSO'); });
    const recuperacao = useRecuperacao(form, (token) => { setTokenReset(token); setAutorizado(true); });

    const irPara = (destino: TelaLogin) => {
        setErroBruto('');
        setTela(destino);
    };
    const voltarAoLogin = () => {
        recuperacao.reiniciar();
        setAutorizado(false);
        setTokenReset(null);
        irPara('LOGIN');
    };

    const novaSenha = useNovaSenha(form, tokenReset, () => { entrada.limpar(); voltarAoLogin(); });
    const solicitacao = useSolicitacao(form, tela === 'SOLICITAR', () => setTela('LOGIN'));

    const solicitando = tela === 'SOLICITAR';
    const saindo = entrada.saindo;
    const recorte = saindo ? RECORTE_TELA_CHEIA : solicitando ? RECORTE_INVERTIDO : RECORTE_NORMAL;

    return (
        <div className="relative isolate flex h-screen min-h-[720px] min-w-[1340px] overflow-hidden bg-white">
            <section className={cn('relative z-[1] box-border flex h-full shrink-0 flex-col transition-all', TRANSICAO, solicitando ? 'w-[760px] py-3.5 pr-24 pl-14' : 'w-[520px] py-6 pr-[72px] pl-14', saindo && '-translate-x-[60px] opacity-0 blur-[10px]')}>
                <div className={cn('entrada-login shrink-0', solicitando ? 'mb-2' : 'mb-auto flex justify-center pb-3')}>
                    <img src="/logo.png" alt="Opera Echo" className={cn('block w-auto transition-all', TRANSICAO, solicitando ? 'h-11' : 'h-[112px]')} />
                </div>

                <div key={tela} className={cn('w-full', !solicitando && 'my-auto')}>
                    {tela === 'LOGIN' && (
                        <header className="entrada-login mb-6">
                            <p className="m-0 mb-1 text-[10.5px] font-semibold tracking-[0.2em] text-brass uppercase">Área restrita</p>
                            <h1 className="m-0 mb-1 text-[28px] leading-tight font-semibold tracking-tight text-ink">Bem-vindo</h1>
                            <p className="m-0 text-[13.5px] text-text-2">Insira suas credenciais para continuar.</p>
                        </header>
                    )}

                    {erro && <p key={erro} role="alert" className="tremor-login m-0 mb-4 rounded-lg border border-solid border-danger bg-danger-tint px-3 py-2.5 text-[13px] text-danger">{erro}</p>}

                    {tela === 'LOGIN' && <FormEntrada entrada={entrada} carregando={carregando} aoEsquecer={() => { recuperacao.reiniciar(); irPara('RECUPERAR'); }} aoSolicitar={() => irPara('SOLICITAR')} />}
                    {tela === 'RECUPERAR' && !autorizado && <FormRecuperacao rec={recuperacao} carregando={carregando} aoCancelar={voltarAoLogin} />}
                    {tela === 'RECUPERAR' && autorizado && <FormNovaSenha titulo="Criar nova senha" senha={novaSenha} carregando={carregando} aoCancelar={voltarAoLogin} />}
                    {tela === 'PRIMEIRO_ACESSO' && <FormNovaSenha titulo="Atualização obrigatória" senha={novaSenha} carregando={carregando} aoCancelar={voltarAoLogin} />}
                    {solicitando && <FormSolicitacao solicitacao={solicitacao} carregando={carregando} aoCancelar={() => irPara('LOGIN')} />}
                </div>

                {!solicitando && (
                    <footer className="entrada-login mt-auto pt-3 text-[11px] text-muted">
                        <p className="m-0">{NOME_SISTEMA}</p>
                        <p className="m-0 font-mono">Versão {VERSAO_SISTEMA}</p>
                    </footer>
                )}
            </section>

            <aside aria-hidden="true" style={{ clipPath: recorte }} className={cn('relative z-[2] min-w-0 flex-1 overflow-hidden bg-pine-800 transition-all', TRANSICAO, saindo ? '-ml-[520px]' : '-ml-14')}>
                <img src="/imagem_topo.png" alt="" className={cn('absolute inset-0 size-full object-cover transition-transform duration-[900ms]', solicitando && 'translate-x-[2%] scale-[1.06]')} />
                <div className={cn('absolute inset-0 flex flex-col justify-end p-16 text-white transition-opacity duration-300', (solicitando || saindo) && 'opacity-0')}>
                    <span className="mb-4 h-0.5 w-12 bg-brass-soft" />
                    <p className="m-0 max-w-[420px] text-[30px] leading-tight font-semibold tracking-tight">Implantações, projetos e indicadores em um só lugar.</p>
                </div>
            </aside>
            <span aria-hidden="true" style={{ clipPath: solicitando ? FIO_INVERTIDO : FIO_NORMAL, left: solicitando ? '704px' : '464px' }} className={cn('fio-login pointer-events-none absolute inset-y-0 right-0 z-[3] transition-all', TRANSICAO, saindo && 'opacity-0')} />
        </div>
    );
}
