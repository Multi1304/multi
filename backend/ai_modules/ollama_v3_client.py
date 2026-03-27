import requests
import json
import os
import sys

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
MODEL = "llama3.2:3b"

def evade_predictive(fingerprint_json):
    """
    Analiza una huella digital y sugiere parámetros de spoofing para evadir detección.
    """
    prompt = f"""
    Acting as an expert in browser fingerprinting and cybersecurity evasion:
    Analyze this JSON fingerprint and suggest optimized spoofing parameters (canvas seed, hardwareConcurrency, WebGL vendor/renderer, AudioContext perturbation) 
    to evade detection on high-security platforms like Facebook, Google, and Amazon.
    
    Fingerprint:
    {json.dumps(fingerprint_json)}
    
    Return a structured JSON output with the following fields:
    - suggested_canvas_seed (int)
    - suggested_hardware_concurrency (int)
    - suggested_webgl_vendor (string)
    - suggested_webgl_renderer (string)
    - risk_assessment (low/medium/high)
    - explanation (string)
    """

    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "format": "json"
    }

    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()
        return json.loads(result.get("response", "{}"))
    except Exception as e:
        return {"error": str(e), "success": False}

if __name__ == "__main__":
    # Test with dummy fingerprint
    dummy = {
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "canvas": "default",
        "webgl": "default"
    }
    print(json.dumps(evade_predictive(dummy), indent=2))
