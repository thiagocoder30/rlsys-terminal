// src/services/TriplicationMatrix.ts

export class TriplicationMatrix {
    private static REDS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    private static BLACKS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
    private static EVENS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36];
    private static ODDS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35];

    public static getTargets(history: number[], strategyName: string): number[] | null {
        // Regra de Ouro: Pega os últimos giros, mas se o ZERO aparecer, o ciclo é abortado.
        const validSpins = [];
        for (const num of history) {
            if (num === 0) break; // O Zero quebra a formação do Trio
            validSpins.push(num);
            if (validSpins.length === 2) break;
        }

        // Precisamos de exatamente 2 giros limpos para ter Início e Confirmação
        if (validSpins.length < 2) return null;

        const spin1 = validSpins[1]; // O Início (Mais antigo do par)
        const spin2 = validSpins[0]; // A Confirmação (Mais recente)

        // Matematicamente:
        // SURF: Aposta no mesmo atributo do Início (Continua a Cadeia de Markov)
        // BREAK: Aposta no atributo OPOSTO ao Início (Quebra a Cadeia de Markov)

        if (strategyName === "Triplications: Color Surf") {
            const isSpin1Red = this.REDS.includes(spin1);
            return isSpin1Red ? this.REDS : this.BLACKS;
        }
        
        if (strategyName === "Triplications: Color Break") {
            const isSpin1Red = this.REDS.includes(spin1);
            return isSpin1Red ? this.BLACKS : this.REDS;
        }
        
        if (strategyName === "Triplications: Parity Surf") {
            const isSpin1Even = spin1 % 2 === 0;
            return isSpin1Even ? this.EVENS : this.ODDS;
        }
        
        if (strategyName === "Triplications: Parity Break") {
            const isSpin1Even = spin1 % 2 === 0;
            return isSpin1Even ? this.ODDS : this.EVENS;
        }

        return null;
    }
}
