import sys
import os
import json
import requests
import logging
import asyncio

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("CamelFarm-ADK")

XAI_API_KEY = os.getenv("XAI_API_KEY")
XAI_URL = "https://api.x.ai/v1/chat/completions"

class AdkAgent:
    def __init__(self, model="grok-2-latest"):
        self.model = model
        self.api_key = XAI_API_KEY

    async def execute(self, task_type: str, payload: str):
        """Executes a task using Grok API."""
        logger.info(f"Executing {task_type} with Grok...")
        
        system_prompt = self._get_system_prompt(task_type)
        user_prompt = f"Payload: {payload}"
        
        try:
            response = requests.post(
                XAI_URL,
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "response_format": {"type": "json_object"},
                    "stream": False
                },
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()['choices'][0]['message']['content']
                return {"success": True, "result": json.loads(result)}
            else:
                return {"success": False, "error": f"API Error {response.status_code}: {response.text}"}
                
        except Exception as e:
            logger.error(f"Execution failure: {str(e)}")
            return {"success": False, "error": str(e)}

    def _get_system_prompt(self, task_type):
        prompts = {
            "autopilot": "You are a master RPA pilot. Convert goals into valid JSON steps: navigate, click, type, wait.",
            "rpa_flow": "Generate a complex RPA flow in JSON with error handling and branching. If target is blocked by captcha, add a 2Captcha step.",
            "telemetry": "Analyze session logs and provide anti-ban insights. Suggest fingerprint adjustments.",
            "evasion": "Suggest precision anti-detect counter-measures for the given fingerprint."
        }
        return prompts.get(task_type, "You are a helpful AI assistant.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Usage: python adk_agent.py <task_type> <payload>"}))
        sys.exit(1)
        
    task = sys.argv[1]
    payload = sys.argv[2]
    
    agent = AdkAgent()
    result = asyncio.run(agent.execute(task, payload))
    print(json.dumps(result))
    sys.exit(0)
