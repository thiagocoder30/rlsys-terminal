# 🎯 RL.sys (Roulette Logic System)

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Status](https://img.shields.io/badge/status-Production-success.svg)
![Stack](https://img.shields.io/badge/stack-React%20%7C%20Node.js%20%7C%20TypeScript-informational.svg)
![Database](https://img.shields.io/badge/database-Prisma%20%7C%20Supabase-orange.svg)

O **RL.sys** é um terminal de operação quantitativa desenhado sob uma arquitetura mobile-first. Ele atua como um "motor invisível" que ingere dados cronológicos de roletas europeias em tempo real (via input manual ou Visão Computacional multimodal), processa anomalias matemáticas e emite sinais táticos de entrada utilizando inteligência bayesiana.

O sistema elimina o viés emocional da operação, delegando a tomada de decisão a um Orquestrador de Estratégias que avalia a regressão à média e o desvio padrão (Z-Score) de setores físicos da mesa.

---

## 🚀 Arquitetura e Tech Stack

O projeto adota uma separação estrita de responsabilidades (SoC) com tipagem estática ponta a ponta:

* **Frontend (O "Córtex Visual"):** React, Vite, TypeScript, Tailwind CSS. 
  * UI de alta densidade (Dark Mode).
  * Haptic Feedback nativo para inputs mobile.
  * Ingestão Óptica (OCR) via Google Gemini Flash API com compressão nativa HTML5 Canvas.
* **Backend (O "Motor Lógico"):** Node.js, Express, TypeScript.
  * Orquestração centralizada de estratégias matemáticas.
  * *Auto-Bootstrapper* de estratégias no ciclo de vida do servidor.
* **Banco de Dados:** Prisma ORM acoplado ao Supabase (PostgreSQL).
  * Persistência de sessões, histórico contínuo de giros e tracking de pesos de machine learning.

---

## 🧠 Core Modules (Módulos do Sistema)

### 1. Ingestão Óptica de Alta Frequência (OCR)
Lógica de interseção (Sniper Intersection) para *Bulk Insert*. O sistema captura a tela do cassino, comprime em milissegundos via Canvas, extrai a matriz numérica usando IA multimodal (Gemini Flash) e deduplica o histórico, injetando apenas giros novos na linha do tempo.

### 2. Motor Bayesiano e de Risco
As estratégias no sistema não são estáticas. Elas nascem com um peso base (`0.5`). O sistema resolve sinais em *background* (modo Shadow): acertos (WIN) aumentam o peso probabilístico da estratégia, enquanto erros (LOSS) o diminuem, forçando o robô a se adaptar ao viés vivo da mesa.

### 3. Orquestrador Quantitativo (Strategy Orchestrator)
O motor avalia múltiplas abordagens topológicas da roleta simultaneamente. Se um setor cai em uma "Zona de Loss" repetidas vezes, o algoritmo identifica o ponto de ruptura e dispara gatilhos de correção de variância.
* **Estratégias Embarcadas (Auto-Bootstrapped):**
  * *Race: Vizinhos de 1 e 21* (Coverage: 26 números)
  * *Race: Fusion* (Coverage: 24 números)
  * *James Bond Clássica* (Coverage: 25 números)

---

## ⚙️ Instalação e Uso (Local / Termux)

O RL.sys foi projetado para rodar nativamente em ambientes Unix (como o Arch Linux via Termux no Android) para garantir latência zero na operação tática.

```bash
# 1. Clone o repositório
git clone [https://github.com/SEU_USUARIO/rlsys-terminal.git](https://github.com/SEU_USUARIO/rlsys-terminal.git)
cd rlsys-terminal

# 2. Instale as dependências
npm install

# 3. Configure as Variáveis de Ambiente (.env)
DATABASE_URL="sua_string_do_supabase"
GEMINI_API_KEY="sua_chave_do_google_ai_studio"

# 4. Sincronize o Prisma com o Banco de Dados
npx prisma db push

# 5. Inicie o Servidor e o Frontend
npm run dev
