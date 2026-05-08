/**
 * @file src/domain/math/ISignalRepository.ts
 * @description Define a interface para o repositório de sinais, desacoplando o domínio da infraestrutura de persistência.
 */

/**
 * @interface SignalData
 * @description Estrutura de dados para representar um sinal ou resultado de análise a ser persistido.
 */
export interface SignalData {
    /**
     * O tipo do sinal (ex: 'vision_input', 'vision_analysis_result', 'sensor_reading').
     */
    type: string;
    /**
     * O valor do sinal, serializado como string (ex: JSON de um objeto, base64 de uma imagem).
     */
    value: string;
    /**
     * Timestamp da ocorrência do sinal, em milissegundos desde a Época.
     */
    timestamp: number;
    /**
     * Opcional: Resultado da análise associada ao sinal (ex: resposta do Gemini).
     * Serializado como string.
     */
    analysis?: string;
}

/**
 * @interface ISignalRepository
 * @description Contrato para operações de persistência de sinais.
 * Garante que o domínio não dependa de detalhes de implementação do banco de dados.
 */
export interface ISignalRepository {
    /**
     * Salva um sinal no repositório.
     * @param signal Os dados do sinal a serem salvos.
     * @returns Uma Promise que resolve quando o sinal é salvo.
     * @throws Erro se a operação de salvamento falhar.
     */
    saveSignal(signal: SignalData): Promise<void>;
}
