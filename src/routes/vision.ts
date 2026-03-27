import { Router } from 'express';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();
// Guarda a imagem na memória RAM temporariamente para envio rápido
const upload = multer({ storage: multer.memoryStorage() });

router.post('/analyze-table', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Comandante, nenhuma imagem foi detectada no envio." });
        }

        // Inicializa a IA (Certifique-se de ter a GEMINI_API_KEY no seu arquivo .env)
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const imageParts = [
            {
                inlineData: {
                    data: req.file.buffer.toString("base64"),
                    mimeType: req.file.mimetype
                }
            }
        ];

        // Ordem estrita para a IA não conversar, apenas extrair os dados.
        const prompt = "Você é um extrator de dados de cassino. Analise esta imagem de um histórico de roleta. Extraia apenas os números sorteados que aparecem na imagem. Leia os números na ordem em que aparecem na interface (geralmente do mais recente para o mais antigo, ou seguindo a grade da esquerda para a direita, de cima para baixo, dependendo do padrão da imagem). Retorne EXATAMENTE E APENAS um array JSON de números inteiros. Exemplo: [32, 15, 19, 4, 21]. Não escreva nenhum outro texto, saudação ou formatação markdown, apenas o array [].";

        const result = await model.generateContent([prompt, ...imageParts]);
        const responseText = result.response.text();

        // Filtro de limpeza: garante que vamos extrair apenas o array, mesmo se a IA falar algo.
        const jsonMatch = responseText.match(/\[(.*?)\]/s);
        
        if (jsonMatch) {
            const numbers = JSON.parse(`[${jsonMatch[1]}]`);
            return res.json({ numbers });
        } else {
            console.error("[Hawk-Eye] IA não retornou um array válido:", responseText);
            return res.status(500).json({ error: "Falha na decodificação tática da imagem." });
        }

    } catch (error) {
        console.error("[Hawk-Eye Error]:", error);
        res.status(500).json({ error: "Falha na Visão Computacional. Verifique logs do servidor." });
    }
});

export default router;
