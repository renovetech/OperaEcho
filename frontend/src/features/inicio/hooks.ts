import { useEffect, useState } from 'react';
import {
    buscarAtividadesDoDia, buscarFerias, buscarPlanos, buscarTotais, SEM_ATIVIDADES,
    type FeriasAgendada, type ProgressoPlano, type Totais
} from '@/features/inicio/api';
import { useAuth } from '@/shared/auth/AuthContext';
import { logErro } from '@/shared/lib';

const INTERVALO_ATUALIZACAO_MS = 30000;
const TOTAIS_VAZIOS: Totais = { implantadores: 0, operadores: 0, projetos: 0, unidades: 0, produtos: 0 };

export function useResumoInicio() {
    const { id_usuario: idUsuario } = useAuth().usuario;
    const [totais, setTotais] = useState<Totais>(TOTAIS_VAZIOS);
    const [ferias, setFerias] = useState<FeriasAgendada[]>([]);
    const [planos, setPlanos] = useState<ProgressoPlano[]>([]);
    const [atividadesImplantacao, setAtividadesImplantacao] = useState(SEM_ATIVIDADES);
    const [atividadesProjetos, setAtividadesProjetos] = useState(SEM_ATIVIDADES);
    const [ultimaAtualizacao, setUltimaAtualizacao] = useState(() => Date.now());

    useEffect(() => {
        let ativo = true;
        // Cada bloco carrega por conta própria: uma consulta lenta não segura as demais.
        function carregar<T>(busca: Promise<T>, aplicar: (valor: T) => void, contexto: string) {
            return busca
                .then((valor) => { if (ativo) aplicar(valor); })
                .catch((erro: unknown) => logErro(contexto, erro));
        }
        const atualizar = () => {
            carregar(buscarTotais(idUsuario), (valor) => {
                setTotais(valor);
                setUltimaAtualizacao(Date.now());
            }, 'Erro ao buscar totais');
            carregar(buscarFerias(idUsuario), setFerias, 'Erro ao buscar próximas férias');
            carregar(buscarPlanos(idUsuario), setPlanos, 'Erro ao buscar planos');
            carregar(buscarAtividadesDoDia('atividades-hoje', idUsuario), setAtividadesImplantacao, 'Erro ao buscar atividades do dia');
            carregar(buscarAtividadesDoDia('atividades-hoje-projetos', idUsuario), setAtividadesProjetos, 'Erro ao buscar atividades de projetos do dia');
        };
        atualizar();
        const intervalo = setInterval(atualizar, INTERVALO_ATUALIZACAO_MS);
        return () => {
            ativo = false;
            clearInterval(intervalo);
        };
    }, [idUsuario]);

    return { totais, ferias, planos, atividadesImplantacao, atividadesProjetos, ultimaAtualizacao };
}
