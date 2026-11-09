/* Cabeçalho do sistema: marca, menu horizontal com submenus, notificações e usuário. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LINK_PARAMETROS, MENU, secaoDoCaminho, type GrupoMenu, type ItemMenu } from '@/app/navegacao';
import Icon from '@/shared/ui/Icon';
import { useNotificacoes } from '@/features/acessos/contexto';
import type { Notificacao } from '@/features/acessos/api';
import { useAuth } from '@/shared/auth/AuthContext';
import { podeAprovarAcesso } from '@/shared/auth/session';
import { useClickFora } from '@/shared/hooks';
import { cn } from '@/shared/lib';

const ATRASO_FECHAR_MS = 250;
const MAXIMO_NOTIFICACOES = 5;

const CLASSE_ITEM_TOPO = 'flex cursor-pointer items-center gap-1.5 rounded-md border-0 bg-transparent px-2.5 py-[7px] font-sans text-[13px] font-medium text-white/85 no-underline transition-colors hover:bg-white/15 hover:text-white';
const CLASSE_PAINEL = 'absolute z-[9999] rounded-[10px] border border-line bg-white p-[5px] shadow-pop';
const CLASSE_ITEM_PAINEL = 'flex cursor-pointer items-center gap-2.5 rounded-[7px] px-3 py-[9px] text-[13.5px] text-text no-underline hover:bg-surface-2 hover:text-pine';
const CLASSE_BOTAO_ICONE = 'flex cursor-pointer items-center gap-2 rounded-[7px] border-0 bg-transparent p-2 font-sans text-white transition-colors hover:bg-white/15';

function Caret() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" className="opacity-80">
            <path d="M6 9l6 6 6-6" />
        </svg>
    );
}

function LinkPainel({ item }: { item: ItemMenu }) {
    return (
        <NavLink to={item.para} end className={({ isActive }) => cn(CLASSE_ITEM_PAINEL, isActive && 'bg-tint text-pine-800')}>
            {item.rotulo}
        </NavLink>
    );
}

function GruposDoMenu({ grupos }: { grupos: GrupoMenu[] }) {
    return grupos.map((grupo) => (
        <div key={grupo.titulo ?? 'itens'}>
            {grupo.titulo && <p className="m-0 px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{grupo.titulo}</p>}
            {grupo.itens.map((item) => <LinkPainel key={item.para} item={item} />)}
        </div>
    ));
}

function useMenuPermitido() {
    const { podeAcessar } = useAuth();
    return MENU
        .map((secao) => ({
            ...secao,
            grupos: secao.grupos
                .map((grupo) => ({ ...grupo, itens: grupo.itens.filter((item) => podeAcessar(item.modulo)) }))
                .filter((grupo) => grupo.itens.length > 0)
        }))
        .filter((secao) => secao.grupos.length > 0);
}

/** Abre ao passar o mouse ou clicar; fecha com atraso, para dar tempo de chegar ao submenu. */
function MenuPrincipal() {
    const { pathname } = useLocation();
    const { podeAcessar } = useAuth();
    const secoes = useMenuPermitido();
    const secaoAtual = secaoDoCaminho(pathname);
    const [aberto, setAberto] = useState<string | null>(null);
    const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
    const area = useRef<HTMLElement>(null);

    const fechar = useCallback(() => {
        clearTimeout(temporizador.current);
        setAberto(null);
    }, []);
    const abrir = (rotulo: string) => {
        clearTimeout(temporizador.current);
        setAberto(rotulo);
    };
    const agendarFechar = () => {
        clearTimeout(temporizador.current);
        temporizador.current = setTimeout(() => setAberto(null), ATRASO_FECHAR_MS);
    };
    useClickFora(area, fechar);

    useEffect(() => {
        const aoTeclar = (evento: KeyboardEvent) => { if (evento.key === 'Escape') fechar(); };
        document.addEventListener('keydown', aoTeclar);
        return () => {
            document.removeEventListener('keydown', aoTeclar);
            clearTimeout(temporizador.current);
        };
    }, [fechar]);

    return (
        <nav ref={area} aria-label="Menu principal" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) fechar(); }}>
            <ul className="m-0 flex list-none items-center gap-0.5 p-0">
                {secoes.map((secao) => (
                    <li key={secao.rotulo} className="relative" onMouseEnter={() => abrir(secao.rotulo)} onMouseLeave={agendarFechar}>
                        <button
                            type="button"
                            aria-haspopup="true"
                            aria-expanded={aberto === secao.rotulo}
                            onClick={() => abrir(secao.rotulo)}
                            className={cn(CLASSE_ITEM_TOPO, (secaoAtual === secao.rotulo || aberto === secao.rotulo) && 'bg-white/15 text-white')}
                        >
                            {secao.rotulo} <Caret />
                        </button>
                        {aberto === secao.rotulo && (
                            <div className={cn(CLASSE_PAINEL, 'top-[calc(100%+8px)] left-0 min-w-[236px] whitespace-nowrap')}>
                                <GruposDoMenu grupos={secao.grupos} />
                            </div>
                        )}
                    </li>
                ))}
                {podeAcessar(LINK_PARAMETROS.modulo) && (
                    <li>
                        <NavLink to={LINK_PARAMETROS.para} className={({ isActive }) => cn(CLASSE_ITEM_TOPO, isActive && 'bg-white/15 text-white')}>
                            {LINK_PARAMETROS.rotulo}
                        </NavLink>
                    </li>
                )}
            </ul>
        </nav>
    );
}

function MenuNotificacoes() {
    const { notificacoes } = useNotificacoes();
    const navigate = useNavigate();
    const [aberto, setAberto] = useState(false);
    const area = useRef<HTMLDivElement>(null);
    useClickFora(area, useCallback(() => setAberto(false), []));

    const abrir = (notificacao: Notificacao) => {
        setAberto(false);
        navigate(notificacao.tipo === 'ferias' ? '/system/gestao/ferias' : `/system/acessos/aprovacao/${notificacao.id_usuario}`);
    };
    const excedentes = notificacoes.length - MAXIMO_NOTIFICACOES;

    return (
        <div className="relative" ref={area}>
            <button type="button" aria-label="Solicitações" className={cn(CLASSE_BOTAO_ICONE, 'relative')} onClick={() => setAberto(!aberto)}>
                <Icon n="bell" />
                {notificacoes.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-danger px-1 text-[10.5px] font-bold text-white">
                        {notificacoes.length > 99 ? '99+' : notificacoes.length}
                    </span>
                )}
            </button>
            {aberto && (
                <div className={cn(CLASSE_PAINEL, 'top-[calc(100%+8px)] right-0 max-h-[420px] w-[320px] overflow-y-auto')}>
                    <p className="m-0 px-3 pt-2.5 pb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">Solicitações ({notificacoes.length})</p>
                    {notificacoes.length === 0 && <p className="m-0 p-3.5 text-center text-[13px] text-text-2">Nenhuma solicitação.</p>}
                    {notificacoes.slice(0, MAXIMO_NOTIFICACOES).map((item) => (
                        <button
                            key={`${item.tipo}-${item.id_usuario}-${item.data_criacao}`}
                            type="button"
                            className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-[7px] border-0 bg-transparent px-3 py-2.5 text-left font-sans hover:bg-surface-2"
                            onClick={() => abrir(item)}
                        >
                            <b className="text-[13.5px] font-semibold text-ink">{item.nome_completo}</b>
                            <span className="text-[12.5px] text-text-2">{item.titulo}</span>
                        </button>
                    ))}
                    {excedentes > 0 && <p className="m-0 p-2 text-center text-[13px] text-text-2">+ {excedentes}</p>}
                </div>
            )}
        </div>
    );
}

function MenuUsuario() {
    const { usuario, nomeExibicao, sair } = useAuth();
    const [aberto, setAberto] = useState(false);
    const [dataLogin] = useState(() => new Date());
    const area = useRef<HTMLDivElement>(null);
    const fechar = useCallback(() => setAberto(false), []);
    useClickFora(area, fechar);

    return (
        <div className="relative" ref={area}>
            <button type="button" aria-expanded={aberto} className={cn(CLASSE_BOTAO_ICONE, 'px-2.5 py-1.5 text-sm')} onClick={() => setAberto(!aberto)}>
                <span className="grid size-7 place-items-center rounded-full bg-white/20 text-xs font-semibold">{nomeExibicao.charAt(0)}</span>
                <span className="max-w-40 truncate">{nomeExibicao}</span>
                <Caret />
            </button>
            {aberto && (
                <div className={cn(CLASSE_PAINEL, 'top-[calc(100%+8px)] right-0 w-[260px]')}>
                    <div className="border-b border-line-2 px-3 pt-2 pb-2.5">
                        <p className="m-0 truncate text-[13.5px] font-semibold text-ink">{nomeExibicao}</p>
                        <p className="m-0 text-xs text-text-2">{usuario.perfil_acesso}</p>
                        <p className="m-0 mt-1 text-[11.5px] text-muted">Sessão: {dataLogin.toLocaleDateString()} {dataLogin.toLocaleTimeString()}</p>
                    </div>
                    <Link to="/system/conta/senha" className={cn(CLASSE_ITEM_PAINEL, 'mt-1')} onClick={fechar}><Icon n="lock" /> Alterar Senha</Link>
                    <button type="button" className={cn(CLASSE_ITEM_PAINEL, 'w-full border-0 bg-transparent font-sans text-danger hover:text-danger')} onClick={sair}>
                        <Icon n="logout" /> Sair
                    </button>
                </div>
            )}
        </div>
    );
}

export function Cabecalho() {
    const { usuario } = useAuth();

    return (
        <header className="relative z-[1000] flex h-[60px] shrink-0 items-center justify-between gap-4 bg-pine-800 px-6">
            <div className="flex min-w-0 items-center gap-[18px]">
                <Link to="/system" title="Página inicial" className="flex items-center rounded-lg bg-white px-2.5 py-1">
                    <img src="/logo.png" alt="Opera Echo - página inicial" className="block h-[30px] w-auto" />
                </Link>
                <MenuPrincipal />
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {podeAprovarAcesso(usuario) && <MenuNotificacoes />}
                <MenuUsuario />
            </div>
        </header>
    );
}
