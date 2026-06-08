import json

log_path = r"C:\Users\Asistente-Gerencia\.gemini\antigravity-ide\brain\e2b835ed-2ead-4275-886a-27b75ae825eb\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            step = json.loads(line)
            if step.get('step_index') == 1115:
                tool_calls = step.get('tool_calls', [])
                for call in tool_calls:
                    print(json.dumps(call, indent=2))
        except Exception as e:
            pass
