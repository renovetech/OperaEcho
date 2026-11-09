import type { ReactNode } from 'react';
import Icon from '@/shared/ui/Icon';
import type { ConfigWhatsapp, EnvioWhatsapp, FilaWhatsapp, SituacaoFila } from '@/features/parametros/api';
import { NOME_EVENTO, type ControleWhatsapp } from '@/features/parametros/hooks';
import { cn } from '@/shared/lib';
import { BalaoAjuda } from '@/shared/ui/BalaoAjuda';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Interruptor, Select, Textarea } from '@/shared/ui/Campos';
import { Card, FormSecao } from '@/shared/ui/Pagina';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const EVENTOS_TEXTO = [
    { id: 'ESCALA_SEMANAL', nome: 'Escala da semana' },
    { id: 'ESCALA_ALTERACAO', nome: 'Alteração de escala' },
    { id: 'FERIAS_APROVADA', nome: 'Férias aprovadas' },
    { id: 'FERIAS_RECUSADA', nome: 'Férias recusadas' },
    { id: 'CODIGO_SENHA', nome: 'Código de senha' }
];
const TOM_STATUS: Record<string, string> = {
    ENVIADO: 'bg-tint text-pine-800', PENDENTE: 'bg-brass-tint text-brass', AGUARDANDO: 'bg-brass-tint text-brass', ENVIANDO: 'bg-line-2 text-text',
    FALHA: 'bg-danger-tint text-danger', NAO_ENVIADO: 'bg-line-2 text-text-2', CANCELADO: 'bg-line-2 text-text-2'
};
const MOTIVOS: Record<string, string> = {
    SEM_WHATSAPP_CONFIRMADO: 'Sem WhatsApp confirmado no cadastro', CELULAR_INVALIDO: 'Celular inválido', USUARIO_INATIVO: 'Usuário inativo',
    EXPIRADO: 'Venceu antes de sair', DATAS_PASSADAS: 'Datas já passaram', EVENTO_DESLIGADO: 'Evento desligado', NOVO_CODIGO: 'Substituído por novo código'
};
const ESTADOS: Record<string, [string, string]> = {
    open: ['Conectado', 'bg-tint text-pine-800'], connecting: ['Conectando...', 'bg-brass-tint text-brass'], close: ['Desconectado', 'bg-danger-tint text-danger'],
    NAO_CONFIGURADO: ['Não configurado', 'bg-line-2 text-text-2'], ERRO: ['Evolution não respondeu', 'bg-danger-tint text-danger'], INATIVO: ['Integração inativa', 'bg-line-2 text-text-2']
};

interface LinhaOpcaoProps {
    titulo: string;
    ajuda?: string;
    detalhe?: ReactNode;
    ligado: boolean;
    rotuloLigado?: string;
    rotuloDesligado?: string;
    desabilitado?: boolean;
    aoAlternar: () => void;
    children?: ReactNode;
}

/** Opção com interruptor à direita, usada nos parâmetros e nos eventos do WhatsApp. */
export function LinhaOpcao({ titulo, ajuda, detalhe, ligado, rotuloLigado = 'Ligado', rotuloDesligado = 'Desligado', desabilitado, aoAlternar, children }: LinhaOpcaoProps) {
    return (
        <div className="flex items-start justify-between gap-6 border-b border-line-2 py-3.5 first:pt-0 last:border-b-0 last:pb-0">
            <div className="min-w-0 flex-1">
                {ajuda
                    ? <BalaoAjuda texto={ajuda} className="flex w-fit items-center gap-1.5"><p className="m-0 text-sm font-medium text-ink">{titulo}</p></BalaoAjuda>
                    : <p className="m-0 text-sm font-medium text-ink">{titulo}</p>}
                {children}
                {detalhe && <small className="mt-1 block text-xs text-muted">{detalhe}</small>}
            </div>
            <div className="flex w-32 shrink-0 items-center justify-end gap-2.5">
                <span className={cn('text-xs font-medium', ligado ? 'text-pine-800' : 'text-text-2')}>{ligado ? rotuloLigado : rotuloDesligado}</span>
                <Interruptor rotulo={titulo} checked={ligado} disabled={desabilitado} onChange={aoAlternar} />
            </div>
        </div>
    );
}

const Linha = ({ children }: { children: ReactNode }) => <div className="mt-2.5 flex items-center gap-2.5 text-[13px] text-text">{children}</div>;
const Selo = ({ tom, children }: { tom: string; children: ReactNode }) => <span className={cn('inline-block rounded-full px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap', tom)}>{children}</span>;

export interface SecaoWhatsappProps {
    w: ControleWhatsapp;
    config: ConfigWhatsapp;
    podeEditar: boolean;
}

export function SecaoConexao({ w, config, podeEditar }: SecaoWhatsappProps) {
    const [rotulo, tom] = ESTADOS[w.estado ?? ''] ?? [w.estado || '-', 'bg-line-2 text-text-2'];
    const srcQr = w.qr?.base64 && (w.qr.base64.startsWith('data:') ? w.qr.base64 : `data:image/png;base64,${w.qr.base64}`);
    const alteracao = config.data_atualizacao
        ? `Última alteração: ${new Date(config.data_atualizacao).toLocaleString('pt-BR')}${config.usuario_alteracao ? ` · ${config.usuario_alteracao}` : ''}`
        : undefined;

    return (
        <FormSecao titulo="Conexão" ajuda="Liga o sistema à Evolution API, que envia as mensagens pelo WhatsApp da empresa. Com a integração inativa, nenhuma mensagem é enviada. A API Key só é trocada se um novo valor for informado.">
            <LinhaOpcao titulo="Integração ativa" detalhe={alteracao} ligado={config.ativo} rotuloLigado="Ativa" rotuloDesligado="Inativa" desabilitado={!podeEditar} aoAlternar={() => w.alterarConfig('ativo', !config.ativo)} />
            <div className="mt-4 grid grid-cols-4 gap-[18px]">
                <Field rotulo="URL da Evolution API" htmlFor="wpp-url" className="col-span-2">
                    <Input id="wpp-url" value={config.url_api} disabled={!podeEditar} placeholder="https://evolution.seudominio.com" onChange={(e) => w.alterarConfig('url_api', e.target.value)} />
                </Field>
                <Field rotulo="Instância" htmlFor="wpp-instancia">
                    <Input id="wpp-instancia" value={config.instancia} disabled={!podeEditar} placeholder="operaecho" onChange={(e) => w.alterarConfig('instancia', e.target.value)} />
                </Field>
                <Field rotulo={config.tem_token ? 'API Key (já salva)' : 'API Key'} htmlFor="wpp-token">
                    <Input id="wpp-token" type="password" autoComplete="new-password" value={w.token} disabled={!podeEditar} placeholder={config.tem_token ? 'Deixe vazio para manter' : 'apikey da instância'} onChange={(e) => w.setToken(e.target.value)} />
                </Field>
            </div>
            <div className="mt-4 flex items-center gap-2.5">
                <Selo tom={tom}>{rotulo}</Selo>
                <Button variant="secondary" size="sm" onClick={w.atualizarSituacao}><Icon n="refresh" /> Verificar</Button>
                {podeEditar && <Button variant="secondary" size="sm" onClick={w.lerQr}><Icon n="camera" /> Conectar (QR Code)</Button>}
                {podeEditar && w.estado === 'open' && <Button variant="secondary" size="sm" onClick={w.desconectar}><Icon n="logout" /> Desconectar</Button>}
                {podeEditar && <Button variant="secondary" size="sm" onClick={w.testar}><Icon n="check" /> Enviar teste para mim</Button>}
            </div>
            {w.qr && (
                <div className="mt-4 flex items-center gap-6 rounded-[10px] border border-line bg-surface-2 p-4">
                    {srcQr && <img src={srcQr} alt="QR Code do WhatsApp" className="size-52 rounded-lg bg-white" />}
                    <div>
                        <BalaoAjuda texto="No celular: WhatsApp › Aparelhos conectados › Conectar um aparelho." className="flex w-fit items-center gap-1.5">
                            <p className="m-0 text-sm font-semibold text-ink">Leia com o WhatsApp do número da empresa</p>
                        </BalaoAjuda>
                        {w.qr.pairingCode && <p className="m-0 mt-1 text-[13px] text-text">Ou use o código de pareamento: <b className="font-mono">{w.qr.pairingCode}</b></p>}
                        <div className="mt-3 flex gap-2">
                            <Button variant="secondary" size="sm" onClick={w.lerQr}><Icon n="refresh" /> Gerar outro</Button>
                            <Button variant="ghost" size="sm" onClick={() => w.setQr(null)}>Fechar</Button>
                        </div>
                    </div>
                </div>
            )}
        </FormSecao>
    );
}

function Indicador({ valor, rotulo }: { valor: ReactNode; rotulo: string }) {
    return (
        <div className="rounded-lg border border-line-2 bg-surface-2 px-3.5 py-3">
            <p className="m-0 text-lg font-bold text-ink tabular-nums">{valor}</p>
            <p className="m-0 mt-0.5 text-xs text-text-2">{rotulo}</p>
        </div>
    );
}

export function SecaoFila({ situacao, fila }: { situacao: SituacaoFila; fila: FilaWhatsapp }) {
    return (
        <FormSecao titulo="Fila de envio" ajuda="As mensagens entram em fila e saem aos poucos, respeitando os limites de Proteção do número. O que passa do limite do dia ou fica fora da janela de envio espera a próxima oportunidade.">
            {situacao.proximaAcao && <p className="m-0 mb-3 text-[13px] text-text">{situacao.proximaAcao}</p>}
            <div className="grid grid-cols-6 gap-3">
                <Indicador valor={`${situacao.enviadosHoje}/${situacao.limiteHoje}`} rotulo="enviadas hoje / limite" />
                <Indicador valor={situacao.pendentes} rotulo="na fila" />
                <Indicador valor={situacao.aguardandoAgrupamento} rotulo="alterações agrupando" />
                <Indicador valor={`${situacao.ultimoMinuto}/${fila.maxPorMinuto}`} rotulo="no último minuto" />
                <Indicador valor={`${situacao.semana}ª`} rotulo="semana de aquecimento" />
                <Indicador valor={situacao.dentroDoHorario ? 'Sim' : 'Não'} rotulo={`dentro da janela (${fila.horaInicio}-${fila.horaFim})`} />
            </div>
        </FormSecao>
    );
}

export function SecaoEventos({ w, config, podeEditar }: SecaoWhatsappProps) {
    const { eventos } = config;
    const bloqueado = !podeEditar;
    return (
        <FormSecao titulo="Mensagens automáticas" ajuda={"Escala da semana: enviada no dia e hora escolhidos, com a semana atual ou a seguinte.\nAlteração de escala: as mudanças são agrupadas e a mensagem só sai depois do tempo de espera sem novas mudanças.\nEvento desligado não gera mensagem."}>
            <LinhaOpcao
                titulo="Escala da semana"
                ligado={eventos.escala_semanal_ativa}
                desabilitado={bloqueado}
                aoAlternar={() => w.alterarEvento('escala_semanal_ativa', !eventos.escala_semanal_ativa)}
                detalhe={eventos.escala_semanal_ultima ? `Última semana disparada: ${eventos.escala_semanal_ultima.split('-').reverse().join('/')}` : undefined}
            >
                <Linha>
                    <Select className="w-36" aria-label="Dia do envio" value={eventos.escala_semanal_dia} disabled={bloqueado} onChange={(e) => w.alterarEvento('escala_semanal_dia', Number(e.target.value))}>
                        {DIAS.map((dia, indice) => <option key={dia} value={indice}>{dia}</option>)}
                    </Select>
                    <span>às</span>
                    <Input type="time" className="w-28" aria-label="Hora do envio" value={eventos.escala_semanal_hora} disabled={bloqueado} onChange={(e) => w.alterarEvento('escala_semanal_hora', e.target.value)} />
                    <Select className="w-60" aria-label="Semana enviada" value={eventos.escala_semanal_referencia} disabled={bloqueado} onChange={(e) => w.alterarEvento('escala_semanal_referencia', e.target.value)}>
                        <option value="PROXIMA">enviar a semana seguinte</option>
                        <option value="ATUAL">enviar a semana atual</option>
                    </Select>
                </Linha>
                {podeEditar && (
                    <Linha>
                        <span>Envio manual - semana de</span>
                        <Input type="date" className="w-40" aria-label="Semana do envio manual" value={w.semanaEnvio} onChange={(e) => w.setSemanaEnvio(e.target.value)} />
                        <Button variant="secondary" size="sm" onClick={w.enviarEscala}><Icon n="calendar" /> Enviar agora</Button>
                    </Linha>
                )}
            </LinhaOpcao>
            <LinhaOpcao titulo="Alteração de escala" ligado={eventos.escala_alteracao_ativa} desabilitado={bloqueado} aoAlternar={() => w.alterarEvento('escala_alteracao_ativa', !eventos.escala_alteracao_ativa)}>
                <Linha>
                    <span>Aguardar</span>
                    <Input type="number" min={1} max={240} className="w-24" aria-label="Minutos de espera" value={eventos.escala_alteracao_espera} disabled={bloqueado} onChange={(e) => w.alterarEvento('escala_alteracao_espera', e.target.value)} />
                    <span>minutos sem novas mudanças</span>
                </Linha>
            </LinhaOpcao>
            <LinhaOpcao titulo="Aprovação de férias" ligado={eventos.ferias_ativa} desabilitado={bloqueado} aoAlternar={() => w.alterarEvento('ferias_ativa', !eventos.ferias_ativa)} />
            <LinhaOpcao titulo="Código de redefinição de senha" ligado={eventos.codigo_senha_ativa} desabilitado={bloqueado} aoAlternar={() => w.alterarEvento('codigo_senha_ativa', !eventos.codigo_senha_ativa)} />
        </FormSecao>
    );
}

type CampoFila = Exclude<keyof FilaWhatsapp, 'horaInicio' | 'horaFim'>;

const CAMPOS_PROTECAO: { campo: CampoFila; rotulo: string; tipo: 'date' | 'number' }[] = [
    { campo: 'inicioAquecimento', rotulo: 'Início do aquecimento', tipo: 'date' },
    { campo: 'limiteInicial', rotulo: 'Limite inicial (msgs/dia)', tipo: 'number' },
    { campo: 'crescimentoSemanal', rotulo: 'Crescimento por semana (%)', tipo: 'number' },
    { campo: 'limiteMaximo', rotulo: 'Teto diário', tipo: 'number' },
    { campo: 'maxPorMinuto', rotulo: 'Máximo por minuto', tipo: 'number' },
    { campo: 'pausaMinima', rotulo: 'Pausa mínima (s)', tipo: 'number' },
    { campo: 'pausaMaxima', rotulo: 'Pausa máxima (s)', tipo: 'number' }
];

export function SecaoProtecao({ w, config, podeEditar }: SecaoWhatsappProps) {
    const { fila } = config;
    return (
        <FormSecao titulo="Proteção do número" ajuda={"Evita bloqueio do número por excesso de envios.\nLimite do dia: limite inicial × (1 + crescimento %) elevado ao número de semanas desde o início do aquecimento, sem passar do teto diário.\nEntre uma mensagem e outra há uma pausa aleatória entre a mínima e a máxima, respeitando o máximo por minuto.\nFora da janela de envio, as mensagens esperam."}>
            <div className="grid grid-cols-4 gap-x-[18px] gap-y-4">
                {CAMPOS_PROTECAO.map(({ campo, rotulo, tipo }) => (
                    <Field key={campo} rotulo={rotulo} htmlFor={`fila-${campo}`}>
                        <Input id={`fila-${campo}`} type={tipo} value={fila[campo] ?? ''} disabled={!podeEditar} onChange={(e) => w.alterarFila(campo, e.target.value)} />
                    </Field>
                ))}
                <Field rotulo="Janela de envio">
                    <div className="flex items-center gap-2 text-[13px] text-text">
                        <Input type="time" aria-label="Início da janela" value={fila.horaInicio} disabled={!podeEditar} onChange={(e) => w.alterarFila('horaInicio', e.target.value)} />
                        <span>às</span>
                        <Input type="time" aria-label="Fim da janela" value={fila.horaFim} disabled={!podeEditar} onChange={(e) => w.alterarFila('horaFim', e.target.value)} />
                    </div>
                </Field>
            </div>
        </FormSecao>
    );
}

export function SecaoTextos({ w, config, podeEditar }: SecaoWhatsappProps) {
    const info = config.textos[w.eventoTexto] ?? { variaveis: [], padrao: '' };
    const texto = w.textos[w.eventoTexto] ?? '';
    return (
        <FormSecao titulo="Textos das mensagens" ajuda="Clique em uma variável para inseri-la no texto: ela é trocada pelo dado real no envio. A prévia usa dados de exemplo. Restaurar padrão volta ao texto original do sistema.">
            <div className="mb-3 flex gap-2">
                {EVENTOS_TEXTO.map((evento) => (
                    <Button key={evento.id} size="sm" variant={w.eventoTexto === evento.id ? 'primary' : 'secondary'} onClick={() => w.setEventoTexto(evento.id)}>{evento.nome}</Button>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Textarea rows={14} aria-label="Texto da mensagem" value={texto} disabled={!podeEditar} onChange={(e) => w.alterarTexto(e.target.value)} />
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {info.variaveis.map((variavel) => (
                            <button key={variavel} type="button" disabled={!podeEditar} className="cursor-pointer rounded-md border border-solid border-line bg-surface-2 px-2 py-1 font-mono text-xs text-text hover:border-pine hover:text-pine" onClick={() => w.alterarTexto(`${texto}{${variavel}}`)}>{`{${variavel}}`}</button>
                        ))}
                        {podeEditar && <Button variant="ghost" size="sm" onClick={() => w.alterarTexto(info.padrao)}><Icon n="undo" /> Restaurar padrão</Button>}
                    </div>
                </div>
                <div className="rounded-lg border border-line-2 bg-surface-2 p-3.5">
                    <small className="text-xs text-text-2">Prévia (dados de exemplo)</small>
                    <pre className="m-0 mt-2 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{w.previa}</pre>
                </div>
            </div>
        </FormSecao>
    );
}

function LinhaEnvio({ envio, podeEditar, w }: { envio: EnvioWhatsapp; podeEditar: boolean; w: ControleWhatsapp }) {
    const podeReenviar = podeEditar && ['FALHA', 'CANCELADO'].includes(envio.status) && envio.tipo_evento !== 'CODIGO_SENHA' && Boolean(envio.numero);
    const moduloEnvio = envio.modulo ? ` · ${envio.modulo === 'PROJETOS' ? 'Projetos' : 'Implantação'}` : '';
    return (
        <tr>
            <Td className="tabular-nums">{envio.data_criacao}</Td>
            <Td>{envio.nome_completo || '-'}</Td>
            <Td>{NOME_EVENTO[envio.tipo_evento] ?? envio.tipo_evento}<small className="text-text-2">{moduloEnvio}</small></Td>
            <Td className="tabular-nums">{envio.numero || '-'}</Td>
            <Td>
                <Selo tom={TOM_STATUS[envio.status] ?? 'bg-line-2 text-text-2'}>{envio.status.replace('_', ' ')}</Selo>
                {(envio.motivo || envio.erro) && <small className="mt-1 block text-xs text-text-2" title={envio.erro ?? ''}>{(envio.motivo && MOTIVOS[envio.motivo]) || envio.motivo || String(envio.erro).slice(0, 60)}</small>}
                {envio.status === 'AGUARDANDO' && envio.liberar_em && <small className="mt-1 block text-xs text-text-2">sai após {envio.liberar_em}</small>}
            </Td>
            <Td className="tabular-nums">{envio.data_envio || '-'}</Td>
            <Td>
                <span className="flex gap-1">
                    <Button variant="ghost" size="sm" title="Ver mensagem" aria-label="Ver mensagem" onClick={() => w.verMensagem(envio)}><Icon n="search" /></Button>
                    {podeReenviar && <Button variant="ghost" size="sm" title="Reenviar" aria-label="Reenviar" onClick={() => w.reenviar(envio.id_envio)}><Icon n="redo" /></Button>}
                </span>
            </Td>
        </tr>
    );
}

export function EnviosRecentes({ w, podeEditar }: { w: ControleWhatsapp; podeEditar: boolean }) {
    return (
        <>
            <h2 className="m-0 mt-[18px] mb-3 text-[14.5px] font-semibold text-ink">Envios recentes</h2>
            <Card className="mb-3.5 flex items-end gap-3.5 px-4 py-3.5">
                <Field rotulo="Colaborador" htmlFor="envio-termo" className="w-64"><Input id="envio-termo" placeholder="Nome..." value={w.filtro.termo} onChange={(e) => w.setFiltro({ ...w.filtro, termo: e.target.value })} /></Field>
                <Field rotulo="Evento" htmlFor="envio-tipo" className="w-56">
                    <Select id="envio-tipo" value={w.filtro.tipo} onChange={(e) => w.setFiltro({ ...w.filtro, tipo: e.target.value })}>
                        <option value="">Todos os eventos</option>
                        {Object.entries(NOME_EVENTO).map(([chave, nome]) => <option key={chave} value={chave}>{nome}</option>)}
                    </Select>
                </Field>
                <Field rotulo="Situação" htmlFor="envio-status" className="w-52">
                    <Select id="envio-status" value={w.filtro.status} onChange={(e) => w.setFiltro({ ...w.filtro, status: e.target.value })}>
                        <option value="">Todas as situações</option>
                        {Object.keys(TOM_STATUS).map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                    </Select>
                </Field>
                <Button variant="secondary" onClick={w.atualizarTudo}><Icon n="refresh" /> Atualizar</Button>
            </Card>
            <Tabela cabecalho={<><Th>Criada</Th><Th>Colaborador</Th><Th>Evento</Th><Th>Número</Th><Th>Situação</Th><Th>Enviada</Th><Th className="w-24"> </Th></>}>
                {w.envios.length === 0 && <LinhaVazia colunas={7}>Nenhum envio.</LinhaVazia>}
                {w.envios.map((envio) => <LinhaEnvio key={envio.id_envio} envio={envio} podeEditar={podeEditar} w={w} />)}
            </Tabela>
        </>
    );
}
