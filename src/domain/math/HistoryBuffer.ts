/**
 * @file src/domain/math/HistoryBuffer.ts
 * @description Implementação de um buffer circular (circular queue) de tamanho fixo.
 *              Ideal para manter um histórico limitado de itens de forma eficiente em memória.
 */

/**
 * @class HistoryBuffer
 * @template T O tipo dos itens armazenados no buffer.
 * @description Um buffer circular de tamanho fixo para armazenar um histórico de itens.
 *              Quando o buffer está cheio e um novo item é adicionado, o item mais antigo é sobrescrito.
 *              Operações de adição e acesso são O(1).
 */
export class HistoryBuffer<T> {
  private readonly capacity: number;
  private buffer: T[];
  private head: number; // Índice do próximo slot a ser escrito
  private tail: number; // Índice do item mais antigo (se o buffer estiver cheio)
  private currentSize: number; // Número atual de elementos no buffer

  /**
   * Cria uma nova instância de HistoryBuffer.
   * @param {number} capacity - A capacidade máxima do buffer. Deve ser um número positivo.
   * @throws {Error} Se a capacidade for menor ou igual a zero.
   */
  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error("A capacidade do HistoryBuffer deve ser um número positivo.");
    }
    this.capacity = capacity;
    this.buffer = new Array<T>(capacity);
    this.head = 0;
    this.tail = 0;
    this.currentSize = 0;
  }

  /**
   * Adiciona um item ao buffer. Se o buffer estiver cheio, o item mais antigo é sobrescrito.
   * @param {T} item - O item a ser adicionado.
   * @returns {void}
   * @complexity O(1)
   */
  public add(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;

    if (this.currentSize < this.capacity) {
      this.currentSize++;
    } else {
      // Se o buffer estava cheio, o head sobrescreveu o tail, então o tail avança
      this.tail = this.head;
    }
  }

  /**
   * Retorna o item no índice especificado, relativo ao início lógico do buffer.
   * O índice 0 corresponde ao item mais antigo atualmente no buffer.
   * @param {number} index - O índice do item a ser recuperado (0 a size-1).
   * @returns {T | undefined} O item no índice especificado, ou undefined se o índice for inválido.
   * @complexity O(1)
   */
  public get(index: number): T | undefined {
    if (index < 0 || index >= this.currentSize) {
      return undefined; // Índice fora dos limites
    }
    const actualIndex = (this.tail + index) % this.capacity;
    return this.buffer[actualIndex];
  }

  /**
   * Retorna todos os itens atualmente no buffer, na ordem do mais antigo para o mais recente.
   * @returns {T[]} Um array contendo todos os itens do buffer.
   * @complexity O(N) onde N é o número de elementos no buffer.
   */
  public getAll(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.currentSize; i++) {
      result.push(this.get(i)!); // '!' porque get(i) é garantido não ser undefined aqui
    }
    return result;
  }

  /**
   * Retorna o número atual de itens no buffer.
   * @returns {number} O número de itens.
   * @complexity O(1)
   */
  public size(): number {
    return this.currentSize;
  }

  /**
   * Retorna a capacidade máxima do buffer.
   * @returns {number} A capacidade.
   * @complexity O(1)
   */
  public getCapacity(): number {
    return this.capacity;
  }

  /**
   * Verifica se o buffer está cheio.
   * @returns {boolean} True se o buffer estiver cheio, false caso contrário.
   * @complexity O(1)
   */
  public isFull(): boolean {
    return this.currentSize === this.capacity;
  }

  /**
   * Verifica se o buffer está vazio.
   * @returns {boolean} True se o buffer estiver vazio, false caso contrário.
   * @complexity O(1)
   */
  public isEmpty(): boolean {
    return this.currentSize === 0;
  }

  /**
   * Limpa o buffer, removendo todos os itens.
   * @returns {void}
   * @complexity O(1)
   */
  public clear(): void {
    this.buffer = new Array<T>(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.currentSize = 0;
  }
}
