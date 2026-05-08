const apiKey = "AIzaSyA7hxO4N9puHhFcmQSEjmZ40xT6dbE3JSI";

async function check() {
  console.log("[SYS] Consultando Google API...");
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    
    if (data.models) {
      console.log("\n=== MODELOS DISPONÍVEIS PARA SUA CHAVE ===");
      data.models
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
        .forEach(m => console.log(`✓ ${m.name}`));
      console.log("==========================================\n");
    } else {
      console.log("[ERRO] Resposta inesperada:", data);
    }
  } catch (err) {
    console.log("[ERRO FATAL]", err.message);
  }
}
check();
