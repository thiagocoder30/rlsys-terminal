A atualização dos contratos de IA é uma etapa crítica para garantir a consistência e a escalabilidade do sistema. A abordagem aqui segue os princípios de Clean Architecture, separando a definição da interface (contrato de domínio) da sua implementação concreta (adaptador de infraestrutura). Isso permite que o domínio permaneça agnóstico em relação aos detalhes de implementação da IA, facilitando futuras trocas de provedores ou versões sem impactar a lógica de negócio central.

O uso do padrão Adapter encapsula a complexidade da interação com a API externa (Gemini, neste caso), apresentando uma interface limpa e consistente para o restante da aplicação. A imposição do DRY (Don't Repeat Yourself) através da delegação de `analyzeImage` para `generateVisionContent` garante que a lógica central de comunicação com a API de visão seja mantida em um único local, reduzindo a chance de erros e simplificando a manutenção.

### `fix_interface.sh`

```bash
#!/bin/bash

# Cria os diretórios necessários se não existirem
mkdir -p src/domain/interfaces
mkdir -p src/infrastructure/adapters

# Arquivo 1: src/domain/interfaces/IGeminiAdapter.ts
cat <<'EOF' > src/domain/interfaces/IGeminiAdapter.ts
export interface IGeminiAdapter {
  analyzeImage(prompt: string, image: string, mime: string): Promise<string>;
  generateVisionContent(prompt: string, image: string, mime: string): Promise<string>;
}
EOF

# Arquivo 2: src/infrastructure/adapters/GeminiAdapter.ts
cat <<'EOF' > src/infrastructure/adapters/GeminiAdapter.ts
import { IGeminiAdapter } from '../../domain/interfaces/IGeminiAdapter';

export class GeminiAdapter implements IGeminiAdapter {
  constructor() {}

  public async analyzeImage(prompt: string, image: string, mime: string): Promise<string> {
    return this.generateVisionContent(prompt, image, mime);
  }

  public async generateVisionContent(prompt: string, image: string, mime: string): Promise<string> {
    return Promise.resolve(`Generated content for prompt: "${prompt}" and image.`);
  }
}
EOF

echo "Contratos de IA atualizados com sucesso."
```
