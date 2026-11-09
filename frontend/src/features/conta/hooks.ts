import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { aviso, erro as mostrarErro, sucesso } from '@/shared/feedback';
import api from '@/shared/api';
import { celularValido, emailValido, mascaraCelular, soDigitos } from '@/shared/celular';
import { useAuth } from '@/shared/auth/AuthContext';
import { salvarUsuario } from '@/shared/auth/session';
import { logErro } from '@/shared/lib';
import { calcularForca, FORCA_MAXIMA } from '@/shared/senha';

export function useAlterarSenha() {
    const { usuario } = useAuth();
    const navigate = useNavigate();
    const [novaSenha, setNovaSenha] = useState('');
    const [confirmaSenha, setConfirmaSenha] = useState('');
    const forca = calcularForca(novaSenha);
    const senhaForte = forca === FORCA_MAXIMA;

    const salvar = async (evento: FormEvent) => {
        evento.preventDefault();
        if (!senhaForte) return aviso('Senha fraca.');
        if (novaSenha !== confirmaSenha) return aviso('Senhas não conferem.');
        try {
            await api.post('/recuperar-senha/confirmar', { id_usuario: usuario.id_usuario, nova_senha: novaSenha });
            void sucesso('Senha alterada!');
            navigate('/system');
        } catch {
            void mostrarErro('Erro ao alterar a senha.');
        }
        return undefined;
    };

    return { novaSenha, setNovaSenha, confirmaSenha, setConfirmaSenha, percentualForca: forca * 20, senhaForte, salvar };
}

interface Contato {
    completo: boolean;
    celular?: string;
    email?: string;
}

const HTML_CONTATO = `<p style="margin:0 0 12px;font-size:.95rem">Agora a escala da semana, as alterações de escala, a aprovação de férias e o código para redefinir a senha chegam pelo <b>WhatsApp</b>. Informe o seu celular para continuar.</p>
    <input id="ctt-cel" class="swal2-input" type="tel" placeholder="Celular com WhatsApp *" style="display:block;width:85%;margin:8px auto">
    <input id="ctt-email" class="swal2-input" type="email" placeholder="E-mail (opcional)" style="display:block;width:85%;margin:8px auto">`;

const campoSwal = (id: string) => document.getElementById(id) as HTMLInputElement;

function pedirContato(contato: Contato) {
    return Swal.fire<Contato>({
        title: 'Atualize seu contato',
        icon: 'info',
        html: HTML_CONTATO,
        confirmButtonText: 'Salvar',
        confirmButtonColor: '#2e7d32',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showLoaderOnConfirm: true,
        didOpen: () => {
            const celular = campoSwal('ctt-cel');
            celular.value = mascaraCelular(contato.celular);
            celular.addEventListener('input', () => { celular.value = mascaraCelular(celular.value); });
            campoSwal('ctt-email').value = contato.email || '';
        },
        preConfirm: async () => {
            const celular = campoSwal('ctt-cel').value;
            const email = campoSwal('ctt-email').value.trim();
            if (!celularValido(celular)) return Swal.showValidationMessage('Celular inválido: DDD + 9 dígitos, ex.: (21) 98765-4321.');
            if (!emailValido(email)) return Swal.showValidationMessage('E-mail inválido.');
            try {
                const { data } = await api.put<Contato>('/meu-cadastro/contato', { celular: soDigitos(celular), celular_whatsapp: true, email });
                return data;
            } catch {
                return Swal.showValidationMessage('Não foi possível salvar.');
            }
        }
    });
}

/** Celular com WhatsApp é obrigatório: quem não confirmou completa o cadastro logo após o login. */
export function useContatoObrigatorio(): void {
    const { usuario } = useAuth();

    useEffect(() => {
        let ativo = true;
        const verificar = async () => {
            const { data } = await api.get<Contato>('/meu-cadastro/contato');
            if (!ativo || data.completo) return;
            const { value } = await pedirContato(data);
            if (!value) return;
            salvarUsuario({ ...usuario, celular: value.celular, celular_whatsapp: true, email: value.email });
            void sucesso('Contato atualizado!');
        };
        verificar().catch((erro: unknown) => logErro('Erro ao verificar contato', erro));
        return () => { ativo = false; };
    }, [usuario]);
}
