import json

log_path = r"C:\Users\Asistente-Gerencia\.gemini\antigravity-ide\brain\e2b835ed-2ead-4275-886a-27b75ae825eb\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            step = json.loads(line)
            if step.get('step_index') == 1115:
                tool_calls = step.get('tool_calls', [])
                for call in tool_calls:
                    args = call.get('args', {})
                    content = args.get('CodeContent', '')
                    if content:
                        # Since it starts with '"', it is a stringified JSON representation.
                        # Let's decode it to get the actual content.
                        actual_code = json.loads(content)
                        with open("scratch/decoded_auditoria-comprobantes.js", "w", encoding="utf-8") as out:
                            out.write(actual_code)
                        print("Saved decoded JS to scratch/decoded_auditoria-comprobantes.js")
        except Exception as e:
            print("Error parsing/decoding:", e)
