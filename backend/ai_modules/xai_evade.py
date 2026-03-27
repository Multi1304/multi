import sys
import os
import json
import requests
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("xaiEvade")

XAI_API_KEY = os.getenv("XAI_API_KEY")
OLLAMA_URL = "http://localhost:11434/api/chat"

def check_gpu_status():
    """Checks if CUDA/GPU is available for ML optimization."""
    try:
        import torch
        return {
            "cuda_available": torch.cuda.is_available(),
            "device_count": torch.cuda.device_count() if torch.cuda.is_available() else 0,
            "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "None"
        }
    except ImportError:
        return {"cuda_available": False, "error": "torch not installed"}

def get_grok_evasion(fingerprint):
    """Calls Grok API for evasion suggestions."""
    logger.info("Attempting Grok (xAI) API call...")
    url = "https://api.x.ai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {XAI_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "grok-2-latest",
        "messages": [
            {"role": "system", "content": "You are a stealth browser evasion specialist. Return ONLY a valid JSON object."},
            {"role": "user", "content": f"Analyze this fingerprint and suggest counter-measures: {json.dumps(fingerprint)}"}
        ],
        "response_format": {"type": "json_object"},
        "stream": False
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=10)
        if response.status_code == 200:
            logger.info("Grok API call successful.")
            return response.json()['choices'][0]['message']['content']
        else:
            logger.warning(f"Grok API returned status {response.status_code}: {response.text}")
            return None
    except Exception as e:
        logger.error(f"Grok API error: {str(e)}")
        return None

def get_ollama_fallback(fingerprint):
    """Fallback to local Ollama if Grok is offline."""
    logger.info("Attempting local Ollama fallback...")
    payload = {
        "model": "qwen2.5:7b",
        "messages": [
            {"role": "user", "content": f"Analyze this fingerprint for evasion: {json.dumps(fingerprint)}"}
        ],
        "stream": False
    }
    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=30)
        if response.status_code == 200:
            logger.info("Ollama fallback successful.")
            return response.json()['message']['content']
        return None
    except Exception as e:
        logger.error(f"Ollama fallback error: {str(e)}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No fingerprint provided"}))
        sys.exit(1)
        
    try:
        fingerprint_input = json.loads(sys.argv[1])
        
        # 1. Try Grok
        result_text = get_grok_evasion(fingerprint_input)
        
        # 2. Try Fallback if Grok failed
        if not result_text:
            result_text = get_ollama_fallback(fingerprint_input)
            
        if result_text:
            try:
                # Clean up response if it has markdown-like code blocks
                if "```json" in result_text:
                    result_text = result_text.split("```json")[1].split("```")[0].strip()
                elif "```" in result_text:
                    result_text = result_text.split("```")[1].split("```")[0].strip()
                
                final_json = json.loads(result_text)
                final_json["gpu_status"] = check_gpu_status()
                print(json.dumps({"success": True, "result": final_json}))
            except Exception as pe:
                print(json.dumps({"success": False, "error": f"Parsing error: {str(pe)}", "raw": result_text}))
        else:
            print(json.dumps({"success": False, "error": "All AI models failed"}))
            
    except Exception as ge:
        print(json.dumps({"success": False, "error": f"General error: {str(ge)}"}))
