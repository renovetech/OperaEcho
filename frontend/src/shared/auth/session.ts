/* Sessão do usuário no navegador. */
const CHAVE_TOKEN = 'token_opera';
const CHAVE_USUARIO = 'usuario_opera';
export const CHAVE_LOTACAO_PROJETO = 'oe_lotacao_projeto';

const CARGOS_APROVADORES = ['LÍDER DE PROJETO', 'COORDENADOR DE IMPLANTAÇÃO', 'GERENTE', 'ADMINISTRADOR'];

export interface Usuario {
    id_usuario: number;
    perfil_acesso: string;
    nome?: string;
    nome_completo?: string;
    usuario?: string;
    funcao?: string;
    nome_funcao?: string;
    celular?: string;
    celular_whatsapp?: boolean;
    email?: string;
}

function valorValido(valor: string | null): valor is string {
    return Boolean(valor) && valor !== 'undefined' && valor !== 'null';
}

export function lerUsuario(): Usuario | null {
    const salvo = sessionStorage.getItem(CHAVE_USUARIO);
    if (!valorValido(salvo)) return null;
    try {
        return JSON.parse(salvo) as Usuario;
    } catch {
        return null;
    }
}

export function lerToken(): string | null {
    const token = sessionStorage.getItem(CHAVE_TOKEN);
    return valorValido(token) ? token : null;
}

export function iniciarSessao(token: string, usuario: Usuario): void {
    sessionStorage.setItem(CHAVE_TOKEN, token);
    salvarUsuario(usuario);
}

export function temSessao(): boolean {
    return valorValido(sessionStorage.getItem(CHAVE_TOKEN)) && lerUsuario() !== null;
}

export function salvarUsuario(usuario: Usuario): void {
    sessionStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
}

export function encerrarSessao(): void {
    [CHAVE_TOKEN, CHAVE_USUARIO, CHAVE_LOTACAO_PROJETO].forEach((chave) => sessionStorage.removeItem(chave));
}

/** O servidor valida de novo; aqui só decide o que aparece na tela. */
export function podeAprovarAcesso(usuario: Usuario): boolean {
    const perfil = usuario.perfil_acesso?.toUpperCase() ?? '';
    const funcao = usuario.funcao?.toUpperCase() ?? '';
    return CARGOS_APROVADORES.some((cargo) => perfil.includes(cargo) || funcao.includes(cargo));
}
