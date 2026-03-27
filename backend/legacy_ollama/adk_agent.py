import sys
import os
import asyncio
import json
import logging
import psutil
from typing import Dict, Any, Optional

# LiteLLM allows unified access to local Ollama and Cloud LLMs
try:
    from litellm import completion
except ImportError:
    completion = None

# Mocking Google ADK if not fully available in environment for the script logic
try:
    from google.adk import Agent
except ImportError:
    class Agent:
        def __init__(self, name="DefaultAgent"):
            self.name = name
        def run(self, task):
            return f"Agent {self.name} simulated execution for task."

# Logging setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("ADKAgent")

# Configuration from Environment
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "ollama/qwen2.5:7b") # Disponible en el sistema
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "gemini/gemini-1.5-flash")

class MultiloginADKAgent:
    def __init__(self):
        self.model = OLLAMA_MODEL
        self.base_url = OLLAMA_BASE_URL
        self.adk_agent = Agent(name="MultiloginUltraAgent")
        logger.info(f"Initializing ADK Agent | Model: {self.model} | HW Monitor Active")

    def get_hardware_stats(self) -> Dict[str, Any]:
        """Monitors CPU and RAM usage."""
        return {
            "cpu_percent": psutil.cpu_percent(),
            "ram_percent": psutil.virtual_memory().percent,
            "gpu_found": self._check_gpu()
        }

    def _check_gpu(self) -> bool:
        # Simple check for NVIDIA GPU via psutil or system path
        return os.path.exists("/dev/nvidia0") or "nvidia" in os.popen("where nvidia-smi 2>nul").read().lower()

    async def execute(self, task_type: str, payload: str) -> Dict[str, Any]:
        """Main execution loop with hardware monitoring and fallback logic."""
        stats_start = self.get_hardware_stats()
        
        prompt = self._map_task_to_prompt(task_type, payload)
        
        result = None
        used_model = self.model
        
        try:
            # DIRECT OLLAMA CALL (More robust for local dev)
            import requests
            logger.info(f"Attempting direct Ollama API call to {self.base_url} with model qwen2.5:7b...")
            ollama_url = f"{self.base_url}/api/chat"
            payload_data = {
                "model": "qwen2.5:7b",
                "messages": [{"role": "user", "content": prompt}],
                "stream": False
            }
            res = requests.post(ollama_url, json=payload_data, timeout=120)
            if res.status_code == 200:
                result = res.json().get('message', {}).get('content')
                logger.info("Direct Ollama call successful.")
            else:
                error_msg = res.json().get('error', 'Unknown Error')
                raise Exception(f"Ollama API returned status {res.status_code}: {error_msg}")
                
        except Exception as e:
            logger.warning(f"Direct Ollama call failed: {str(e)}. Attempting LiteLLM/Cloud fallback...")
            try:
                if not completion:
                    raise ImportError("LiteLLM not installed")
                
                logger.info(f"Dispatching task to LiteLLM ({self.model})...")
                response = await completion(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    api_base=self.base_url,
                    timeout=90
                )
                result = response.choices[0].message.content
                logger.info("LiteLLM Ollama call successful.")
            except Exception as le:
                logger.warning(f"Ollama via LiteLLM failed: {str(le)}. Attempting cloud fallback...")
                try:
                    used_model = FALLBACK_MODEL
                    response = await completion(
                        model=FALLBACK_MODEL,
                        messages=[{"role": "user", "content": prompt}]
                    )
                    result = response.choices[0].message.content
                    logger.info("Cloud fallback successful.")
                except Exception as fe:
                    logger.error(f"Critical Failure: Both local and cloud models failed. {str(fe)}")
                    return {"success": False, "error": "AI Engine Unavailable"}

        stats_end = self.get_hardware_stats()
        
        return {
            "success": True,
            "result": result,
            "metadata": {
                "task": task_type,
                "model_used": used_model,
                "hw_stats": {
                    "start": stats_start,
                    "end": stats_end
                }
            }
        }

    def _map_task_to_prompt(self, task_type: str, payload: str) -> str:
        """Centralized prompt engineering for the agent (Optimized heavily)."""
        
        json_rule = "\nCRITICAL: Respond ONLY with valid JSON. No markdown, no explanations, no wrapping text outside the JSON boundaries."
        
        templates = {
            "content_generation": f"Acting as a professional social media manager, generate a high-engagement post for: {payload}. Keep it concise.",
            "evasion_predictive": f"Analyze these browser fingerprint signals and suggest specific canvas/webgl spoofing parameters to evade detection: {payload}. {json_rule}",
            "autopilot": f"Convert this high-level browser automation goal into a strict sequence of human-like interaction JSON steps (action, target, delay). Goal: {payload}. {json_rule}",
            "fingerprint_usa": f"Generate a detailed, realistic browser fingerprint (User-Agent, Screen, Timezone, Canvas, WebGL) for a USA-based Windows 11 user. {json_rule}",
            "semantic_profile": f"Based on the following semantic user request for a browser profile, suggest the most appropriate base template (e.g., Marketer, E-commerce, Mobile) and any specific fingerprint overrides needed.\nRequest: {payload}\n\nReturn EXACTLY a JSON structure with 'templateName' (string) and 'overrides' (dict). {json_rule}",
            "flow_recommendation": f"Given the following user goal, recommend a sequential automation flow sequence (steps like goto, click, type, wait_random) to achieve it securely without getting banned. Goal: {payload}. {json_rule}"
        }
        return templates.get(task_type, payload)

async def run_cli():
    if len(sys.argv) < 3:
        # Default test mode
        agent = MultiloginADKAgent()
        res = await agent.execute("fingerprint_usa", "Dynamic USA Fingerprint Request")
        print(json.dumps(res, indent=2))
        return

    task = sys.argv[1]
    query = " ".join(sys.argv[2:])
    
    agent = MultiloginADKAgent()
    res = await agent.execute(task, query)
    print(json.dumps(res))

if __name__ == "__main__":
    asyncio.run(run_cli())
