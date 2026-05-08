import express from 'express';
import { GeminiAdapter } from '../adapters/GeminiAdapter';
import { StrategyEngine } from '../../domain/services/StrategyEngine';
import { config } from '../../config';

const router = express.Router();
const gemini = new GeminiAdapter(config.geminiApiKey);
const engine = new StrategyEngine();

router.post('/upload-history', async (req, res) => {
  try {
    const { image, bankroll } = req.body;
    
    // 1. OCR de Alta Precisão (Zonas A + B)
    const rawResult = await gemini.analyzeImage(image, "image/jpeg");
    const data = JSON.parse(rawResult);

    // 2. Processamento Quant (Markov, Shannon, Z-Score)
    const analysis = engine.analyze(data.sequencia);

    if (!analysis) {
      return res.status(400).json({ status: "DENIED", reason: "Dados insuficientes para análise quant." });
    }

    // 3. Critério de Aceitação HFT (Thresholds Enterprise)
    // - Entropia < 4.8 (Indica existência de padrão)
    // - Volatilidade controlada
    const isPropitious = analysis.metrics.entropy < 4.8 && analysis.metrics.volatility > 0.5;

    if (!isPropitious) {
      return res.json({
        status: "LOCKED",
        reason: "ALTA ENTROPIA: Mesa com aleatoriedade pura. Risco de ruína elevado.",
        metrics: analysis.metrics
      });
    }

    // 4. Configuração de Sessão (Kelly Criterion aplicado à banca)
    const recommendedStake = bankroll * analysis.bankroll;

    res.json({
      status: "ALLOWED",
      message: "Mesa validada. Padrão detectado.",
      sessionConfig: {
        initialBankroll: bankroll,
        unitStake: recommendedStake.toFixed(2),
        maxDrawdown: (bankroll * 0.15).toFixed(2), // Stop Loss de 15%
        targetProfit: (bankroll * 0.20).toFixed(2), // Stop Gain de 20%
        strategy: analysis.signals[0]?.type || "MEAN_REVERSION"
      },
      analysis
    });

  } catch (error) {
    res.status(500).json({ error: "Falha no processamento do fluxo HFT." });
  }
});

export default router;
