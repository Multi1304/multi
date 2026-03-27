import requests
import json
import os

OLLAMA_API = "http://localhost:11434/api/generate"
MODEL = "qwen2.5-coder:7b"

def evade_predictive(fingerprint_json):
    """
    Analiza esta huella JSON y sugiere parámetros spoof ajustados para evadir detección.
    """
    print(f"[V3 AI] Analyzing Fingerprint with {MODEL}...")
    
    prompt = f"""
    Analiza esta huella JSON {json.dumps(fingerprint_json)} y sugiere parámetros spoof ajustados 
    (ej. nuevo canvas seed, hardwareConcurrency value, WebGL vendor) para evadir detección en 
    Facebook/Google/Amazon. Da JSON output estructurado.
    """

    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json"
    }

    try:
        # Check for GPU support (mental check: torch.cuda.is_available() inside the model execution)
        response = requests.post(OLLAMA_API, json=payload, timeout=90)
        data = response.json()
        return json.loads(data.get("response", "{}"))
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    test_fp = {
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        "canvas": "default_noisy",
        "webgl": "Google Inc. ANGLE"
    }
    result = evade_predictive(test_fp)
    print(json.dumps(result, indent=2))
