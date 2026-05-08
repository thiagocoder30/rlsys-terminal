# RL.SYS CORE - Documentação de Contexto (Sprint 5)

## 🎯 Objetivo do Projeto
Sistema de alta performance para processamento de sinais e análise de visão computacional, otimizado para hardware Helio P22 (2GB RAM).

## 🏗️ Arquitetura e Mapa de Arquivos (ESTRITO)
Qualquer novo código deve respeitar os caminhos abaixo. **NÃO mude arquivos de diretório.**

- **Configurações:** `src/config.ts` (Gerencia API Keys e constantes).
- **Domínio (Cálculos/Matemática):** `src/domain/math/HistoryBuffer.ts` 
  - *Nota:* Classe genérica `HistoryBuffer<T>`, exige `capacity` no constructor.
- **Infraestrutura (IA):** `src/infrastructure/ai/GeminiAdapter.ts`
  - *Método:* `generateVisionContent(prompt, base64, mimeType)`.
- **Infraestrutura (HTTP):** `src/infrastructure/http/Server.ts`
  - *Porta:* 3000 | *Host:* 0.0.0.0.
  - *Upload:* Multer com `memoryStorage`.
- **Ponto de Entrada:** `src/main.ts` (Composition Root).

## 🛠️ Stack Tecnológica
- TypeScript / Node.js
- Express (Servidor)
- Multer (Upload de arquivos)
- @google/generative-ai (Modelo: gemini-1.5-flash)

## ⚠️ Regras de Ouro para o AI (Copiloto)
1. **DIP (Inversão de Dependência):** Sempre que possível, dependa de interfaces.
2. **Sem Placeholders:** Não gere códigos vazios ou "para implementar depois".
3. **Hardware Limidado:** Priorize eficiência de memória. Evite recursão pesada.
4. **Verificação de Caminho:** Antes de sugerir um `import`, verifique este mapa.
5. **Estilo de Código:** Purista, Clean Architecture, tipagem estrita (no-any quando possível).

---
*Documento atualizado em: Maio de 2026*
