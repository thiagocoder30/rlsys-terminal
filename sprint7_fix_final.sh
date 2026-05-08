```bash
#!/bin/bash

# sprint7_fix_final.sh
#
# Este script Bash sobrescreve arquivos TypeScript para aplicar correções finais
# da Sprint 7, garantindo conformidade com os requisitos de arquitetura,
# tipagem e tratamento de erros.
#
# PRINCÍPIOS DE CODIFICAÇÃO APLICADOS:
# - SOLID & Clean Architecture: Separação de interfaces (IGeminiAdapter) e implementação (GeminiAdapter).
# - Tipagem Estrita: Uso rigoroso de tipos TypeScript (Request, Response, Buffer, Promise).
# - Tratamento de Erros Profissional: Uso de AppError e tratamento de exceções.
# - Gestão de Recursos: Multer configurado para memória, evitando arquivos temporários em disco.
#
# REGRAS DE OURO:
# - As chaves de fechamento de classes e métodos estão presentes.
# - O uso de 'cat <<'EOF'' garante que o conteúdo seja interpretado literalmente,
#   evitando expansão de variáveis de ambiente pelo Bash.

echo "Iniciando a aplicação das correções finais da Sprint 7..."

# 1. src/domain/interfaces/IGeminiAdapter.ts
# Define a interface para o adaptador Gemini, garantindo a separação de preocupações
# e a conformidade com o princípio de inversão de dependência.
echo "Sobrescrevendo src/domain/interfaces/IGeminiAdapter.ts..."
mkdir -p src/domain/interfaces
cat <<'EOF' > src/domain/interfaces/IGeminiAdapter.ts
/**
 * @file src/domain/interfaces/IGeminiAdapter.ts
 * @description Define a interface para o adaptador Gemini, garantindo a separação de preocupações
 *              e a conformidade com o princípio de inversão de dependência.
 */

import { Buffer } from 'buffer';

/**
 * @interface IGeminiAdapter
 * @description Interface que define os métodos para interação com a API Gemini,
 *              especificamente para análise de imagens e geração de conteúdo visual.
 */
export interface IGeminiAdapter {
  /**
   * Analisa uma imagem fornecida, retornando uma descrição ou insights.
   * @param imageBuffer O buffer da imagem a ser analisada.
   * @param mimeType O tipo MIME da imagem (ex: 'image/jpeg', 'image/png').
   * @returns Uma Promise que resolve para uma string contendo o resultado da análise.
   */
  analyzeImage(imageBuffer: Buffer, mimeType: string): Promise<string>;

  /**
   * Gera conteúdo visual ou descrições baseadas em um prompt e uma imagem.
   * Este método é mais genérico e pode ser usado para diversas tarefas de visão.
   * @param prompt O prompt de texto para guiar a geração de conteúdo.
   * @param imageBuffer O buffer da imagem a ser processada.
   * @param mimeType O tipo MIME da imagem.
   * @returns Uma Promise que resolve para uma string contendo o conteúdo gerado.
   */
  generateVisionContent(prompt: string, imageBuffer: Buffer, mimeType: string): Promise<string>;
}
EOF
echo "src/domain/interfaces/IGeminiAdapter.ts atualizado."

# 2. src/infrastructure/adapters/GeminiAdapter.ts
# Implementa os dois métodos da interface IGeminiAdapter, garantindo que 'analyzeImage'
# chame 'generateVisionContent' para consistência e reuso de lógica.
echo "Sobrescrevendo src/infrastructure/adapters/GeminiAdapter.ts..."
mkdir -p src/infrastructure/adapters
cat <<'EOF' > src/infrastructure/adapters/GeminiAdapter.ts
/**
 * @file src/infrastructure/adapters/GeminiAdapter.ts
 * @description Implementação concreta do adaptador Gemini, utilizando a SDK oficial
 *              para interagir com a API Gemini.
 */

import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';
import { Buffer } from 'buffer';
import { IGeminiAdapter } from '../../domain/interfaces/IGeminiAdapter';
import { AppError } from '../../shared/errors/AppError'; // Assumindo que AppError existe em shared/errors

/**
 * @class GeminiAdapter
 * @implements {IGeminiAdapter}
 * @description Adaptador para a API Gemini, responsável por encapsular a lógica
 *              de comunicação e tratamento de respostas.
 */
export class GeminiAdapter implements IGeminiAdapter {
  private genAI: GoogleGenerativeAI;
  private readonly MODEL_NAME = 'gemini-pro-vision'; // Ou 'gemini-1.5-pro-latest' para mais avançado

  /**
   * Construtor do GeminiAdapter.
   * @param apiKey A chave da API do Google Gemini.
   */
  constructor(apiKey: string) {
    if (!apiKey) {
      throw new AppError('GEMINI_API_KEY is not provided.', 500);
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Converte um buffer de imagem e tipo MIME em um formato compatível com a API Gemini.
   * @param imageBuffer O buffer da imagem.
   * @param mimeType O tipo MIME da imagem.
   * @returns Um objeto FileData para a API Gemini.
   */
  private fileToGenerativePart(imageBuffer: Buffer, mimeType: string) {
    return {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType
      },
    };
  }

  /**
   * Analisa uma imagem fornecida, retornando uma descrição ou insights.
   * Este método delega a chamada principal para `generateVisionContent` com um prompt específico.
   * @param imageBuffer O buffer da imagem a ser analisada.
   * @param mimeType O tipo MIME da imagem (ex: 'image/jpeg', 'image/png').
   * @returns Uma Promise que resolve para uma string contendo o resultado da análise.
   * @throws {AppError} Se a análise falhar.
   */
  public async analyzeImage(imageBuffer: Buffer, mimeType: string): Promise<string> {
    const prompt = 'Descreva detalhadamente o que você vê nesta imagem, focando em objetos, cores, contexto e possíveis ações. Seja conciso e objetivo.';
    return this.generateVisionContent(prompt, imageBuffer, mimeType);
  }

  /**
   * Gera conteúdo visual ou descrições baseadas em um prompt e uma imagem.
   * @param prompt O prompt de texto para guiar a geração de conteúdo.
   * @param imageBuffer O buffer da imagem a ser processada.
   * @param mimeType O tipo MIME da imagem.
   * @returns Uma Promise que resolve para uma string contendo o conteúdo gerado.
   * @throws {AppError} Se a geração de conteúdo falhar.
   */
  public async generateVisionContent(prompt: string, imageBuffer: Buffer, mimeType: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.MODEL_NAME });

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              this.fileToGenerativePart(imageBuffer, mimeType),
            ],
          },
        ],
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      });

      const response = await result.response;
      const text = response.text();

      if (!text) {
        throw new AppError('Gemini API returned an empty response.', 500);
      }

      return text;
    } catch (error: any) {
      console.error('Error calling Gemini API:', error);
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(`Failed to generate vision content: ${error.message || 'Unknown error'}`, 500);
    }
  }
}
EOF
echo "src/infrastructure/adapters/GeminiAdapter.ts atualizado."

# 3. src/application/controllers/SignalController.ts
# Remove 'return' das chamadas de resposta (usa apenas 'res.status().json()')
# e adiciona 'return;' explícito para garantir que a execução da função pare.
echo "Sobrescrevendo src/application/controllers/SignalController.ts..."
mkdir -p src/application/controllers
cat <<'EOF' > src/application/controllers/SignalController.ts
/**
 * @file src/application/controllers/SignalController.ts
 * @description Controlador para gerenciar sinais e eventos do sistema.
 */

import { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError'; // Assumindo que AppError existe em shared/errors

/**
 * @class SignalController
 * @description Gerencia as requisições relacionadas a sinais e eventos.
 */
export class SignalController {
  /**
   * @method handleSignal
   * @description Lida com um sinal recebido, processando-o e retornando uma resposta.
   * @param req Objeto de requisição do Express.
   * @param res Objeto de resposta do Express.
   */
  public async handleSignal(req: Request, res: Response): Promise<void> {
    try {
      const { signalType, payload } = req.body;

      if (!signalType) {
        res.status(400).json({ message: 'Signal type is required.' });
        return; // Retorno explícito para parar a execução
      }

      // Lógica de processamento do sinal (ex: enfileirar, persistir, etc.)
      console.log(`Received signal: ${signalType} with payload:`, payload);

      // Exemplo de resposta de sucesso
      res.status(200).json({ message: `Signal '${signalType}' processed successfully.`, receivedPayload: payload });
      return; // Retorno explícito para parar a execução
    } catch (error: any) {
      console.error('Error handling signal:', error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ message: error.message });
      } else {
        res.status(500).json({ message: 'Internal server error processing signal.' });
      }
      return; // Retorno explícito para parar a execução após a resposta de erro
    }
  }

  /**
   * @method getSignalStatus
   * @description Retorna o status de um sinal específico ou do sistema de sinais.
   * @param req Objeto de requisição do Express.
   * @param res Objeto de resposta do Express.
   */
  public async getSignalStatus(req: Request, res: Response): Promise<void> {
    try {
      const { signalId } = req.params;

      // Lógica para buscar o status do sinal
      if (signalId === '123') {
        res.status(200).json({ signalId, status: 'processed', timestamp: new Date().toISOString() });
      } else if (signalId) {
        res.status(404).json({ message: `Signal with ID '${signalId}' not found.` });
      } else {
        res.status(200).json({ message: 'Signal system is operational.', activeSignals: 5 });
      }
      return; // Retorno explícito para parar a execução após qualquer resposta de sucesso
    } catch (error: any) {
      console.error('Error getting signal status:', error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ message: error.message });
      } else {
        res.status(500).json({ message: 'Internal server error getting signal status.' });
      }
      return; // Retorno explícito para parar a execução após a resposta de erro
    }
  }
}
EOF
echo "src/application/controllers/SignalController.ts atualizado."

# 4. src/application/controllers/VisionController.ts
# Remove 'return' das chamadas de resposta e ajusta o Multer para 'cb(null, false)'
# em caso de erro, evitando conflito de tipos com o objeto Error.
echo "Sobrescrevendo src/application/controllers/VisionController.ts..."
mkdir -p src/application/controllers
cat <<'EOF' > src/application/controllers/VisionController.ts
/**
 * @file src/application/controllers/VisionController.ts
 * @description Controlador para gerenciar operações de visão computacional,
 *              como upload e análise de imagens.
 */

import { Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../../shared/errors/AppError'; // Assumindo que AppError existe em shared/errors
import { ImageAnalysisService } from '../../domain/services/ImageAnalysisService'; // Dependência

// Define um tipo customizado para a Request do Express que inclui o arquivo do Multer
interface CustomRequest extends Request {
  file?: Express.Multer.File;
}

/**
 * @class VisionController
 * @description Gerencia as requisições relacionadas à visão computacional.
 */
export class VisionController {
  private upload: multer.Multer;

  /**
   * Construtor do VisionController.
   * @param imageAnalysisService Serviço de análise de imagem para processar as requisições.
   */
  constructor(private imageAnalysisService: ImageAnalysisService) {
    // Configuração do Multer para upload de imagens
    this.upload = multer({
      storage: multer.memoryStorage(), // Armazena o arquivo em memória como um Buffer
      limits: {
        fileSize: 5 * 1024 * 1024, // Limite de 5MB por arquivo
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true); // Aceita o arquivo
        } else {
          // Ajuste aqui: cb(null, false) para evitar conflito de tipos com Error
          // Multer irá tratar isso como uma rejeição de arquivo, e o erro será capturado
          // pelo middleware de tratamento de erros do Multer ou pelo nosso catch.
          console.warn(`File rejected: Invalid MIME type ${file.mimetype}`);
          cb(null, false); // Rejeita o arquivo
        }
      },
    });
  }

  /**
   * Middleware para lidar com o upload de uma única imagem.
   * @returns Um middleware do Multer configurado para um único arquivo.
   */
  public uploadImageMiddleware() {
    return this.upload.single('image');
  }

  /**
   * @method analyzeImage
   * @description Lida com a requisição de análise de imagem.
   * @param req Objeto de requisição do Express (com arquivo anexado).
   * @param res Objeto de resposta do Express.
   */
  public async analyzeImage(req: CustomRequest, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'No image file provided.' });
        return;
      }

      const imageBuffer = req.file.buffer;
      const mimeType = req.file.mimetype;

      if (!imageBuffer || !mimeType) {
        res.status(400).json({ message: 'Invalid image file data.' });
        return;
      }

      const analysisResult = await this.imageAnalysisService.analyzeImage(imageBuffer, mimeType);

      res.status(200).json({ message: 'Image analyzed successfully.', analysis: analysisResult });
      return;
    } catch (error: any) {
      console.error('Error analyzing image:', error);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ message: error.message });
      } else if (error instanceof multer.MulterError) {
        // Multer errors (e.g., file size limit)
        res.status(400).json({ message: `Upload error: ${error.message}` });
      } else {
        res.status(500).json({ message: 'Internal server error during image analysis.' });
      }
      return;
    }
  }
}
EOF
echo "src/application/controllers/VisionController.ts atualizado."

# 5. src/domain/services/ImageAnalysisService.ts
# Garante que o serviço de análise de imagem chame o método 'analyzeImage' do adaptador Gemini.
echo "Sobrescrevendo src/domain/services/ImageAnalysisService.ts..."
mkdir -p src/domain/services
cat <<'EOF' > src/domain/services/ImageAnalysisService.ts
/**
 * @file src/domain/services/ImageAnalysisService.ts
 * @description Serviço de domínio responsável pela lógica de negócio
 *              para análise de imagens.
 */

import { Buffer } from 'buffer';
import { IGeminiAdapter } from '../interfaces/IGeminiAdapter';
import { AppError } from '../../shared/errors/AppError'; // Assumindo que AppError existe em shared/errors

/**
 * @class ImageAnalysisService
 * @description Serviço que orquestra a análise de imagens, utilizando um adaptador
 *              para interagir com a API de visão (ex: Gemini).
 */
export class ImageAnalysisService {
  /**
   * Construtor do ImageAnalysisService.
   * @param geminiAdapter O adaptador para a API Gemini, injetado via inversão de controle.
   */
  constructor(private geminiAdapter: IGeminiAdapter) {}

  /**
   * @method analyzeImage
   * @description Realiza a análise de uma imagem.
   * @param imageBuffer O buffer da imagem a ser analisada.
   * @param mimeType O tipo MIME da imagem.
   * @returns Uma Promise que resolve para uma string contendo o resultado da análise.
   * @throws {AppError} Se a imagem for inválida ou a análise falhar.
   */
  public async analyzeImage(imageBuffer: Buffer, mimeType: string): Promise<string> {
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new AppError('Image buffer is empty or invalid.', 400);
    }
    if (!mimeType || !mimeType.startsWith('image/')) {
      throw new AppError('Invalid MIME type. Expected an image MIME type.', 400);
    }

    try {
      // Delega a análise real ao adaptador Gemini
      const analysisResult = await this.geminiAdapter.analyzeImage(imageBuffer, mimeType);
      return analysisResult;
    } catch (error: any) {
      console.error('Error in ImageAnalysisService during image analysis:', error);
      if (error instanceof AppError) {
        throw error; // Re-throw custom application errors
      }
      throw new AppError(`Failed to analyze image: ${error.message || 'Unknown error'}`, 500);
    }
  }
}
EOF
echo "src/domain/services/ImageAnalysisService.ts atualizado."

echo "Todas as correções da Sprint 7 foram aplicadas com sucesso."
echo "Por favor, verifique os arquivos e execute os testes para confirmar a funcionalidade."
```
