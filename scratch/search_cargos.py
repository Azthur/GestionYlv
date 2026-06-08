import sys
import os

filepath = 'backend/cargos_documentales.py'

encodings = ['utf-8', 'utf-16', 'latin-1', 'cp1252']
for enc in encodings:
    try:
        with open(filepath, 'r', encoding=enc) as f:
            content = f.read()
            if 'update' in content.lower() or 'execute' in content.lower():
                print(f"Success with encoding: {enc}")
                # Print some matching lines
                lines = content.splitlines()
                count = 0
                for i, line in enumerate(lines):
                    if 'update' in line.lower() or 'execute' in line.lower():
                        print(f"{i+1}: {line[:100]}")
                        count += 1
                        if count > 10:
                            break
                break
    except Exception as e:
        print(f"Failed with {enc}: {e}")
