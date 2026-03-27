import json
import logging
import requests
import sys

# Suppress debug logs from script to keep stdout clean for Node.js
logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger(__name__)

OLLAMA_API_URL = "http://127.0.0.1:11434/api/chat"
MODEL = "llama3.2:3b" # Optimizado para consumo de RAM ultrabajo (3B parameters)

def evadePredictive(fingerprintJSON: dict) -> dict:
    """
    Sends the fingerprint data to local Ollama qwen2.5-coder to predict and generate 
    necessary JSON override values.
    """
    prompt = f"""
Eres un experto en ciberseguridad y evasión de anti-bots (Facebook, Google, Amazon).
Analiza detalladamente esta huella JSON: {json.dumps(fingerprintJSON)}

INSTRUCCIONES ESTRICTAS:
1. Aplica un "ruido matemático" sutil pero realista a canvasSeed y audioPerturbation.
2. Ajusta hardwareConcurrency inteligentemente según la plataforma detectada.
3. Responde ÚNICA Y EXCLUSIVAMENTE con un objeto JSON válido.
4. Prohibido añadir texto adicional, saludos o explicaciones fuera del JSON.

FORMATO DE SALIDA EXACTO REQUERIDO:
{{
  "suggestions": {{
    "canvasSeed": <numero_entero_aleatorio>,
    "hardwareConcurrency": <numero_par_realista>,
    "webglVendor": "<vendor_realista_segun_os>",
    "webglRenderer": "<renderer_realista_segun_os>",
    "audioPerturbation": <numero_flotante_pequeno>
  }}
}}
"""

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ],
        "format": "json",
        "stream": False
    }

    try:
        response = requests.post(OLLAMA_API_URL, json=payload, timeout=30)
        response.raise_for_status()
        
        result_content = response.json().get('message', {}).get('content', '')
        suggestions_data = json.loads(result_content)
        
        if "suggestions" in suggestions_data:
            return {
                "success": True,
                "fixes": suggestions_data["suggestions"]
            }
        else:
            return {"success": False, "error": "Invalid format returned from AI"}
            
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            # Parse the incoming JSON string from Node.js
            fingerprint_arg = json.loads(sys.argv[1])
            result = evadePredictive(fingerprint_arg)
            # Print EXACTLY the JSON result and nothing else to stdout
            print(json.dumps(result))
        except json.JSONDecodeError:
            print(json.dumps({"success": False, "error": "Invalid input JSON"}))
    else:
        # Fallback for manual testing
        test_fp = {"id": "test", "platform": "desktop", "ua": "test_ua"}
        print(json.dumps(evadePredictive(test_fp)))
