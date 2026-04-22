import sys

with open(r"c:\SistemaGestionyelave\backend\contabilidad.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

global_start = -1
global_end = -1
for i, line in enumerate(lines):
    if '@router.get("/trazabilidad/global")' in line:
        global_start = i
    if global_start != -1 and line.startswith("# ════════════════════════════════════════════════════════════"):
        # The line after the end of the view
        global_end = i
        break

if global_start != -1 and global_end != -1:
    block = lines[global_start:global_end]
    
    del lines[global_start:global_end]
    
    # find where to insert it: before @router.get("/trazabilidad/{nrodoc}")
    target_idx = -1
    for i, line in enumerate(lines):
        if '@router.get("/trazabilidad/{nrodoc}")' in line:
            target_idx = i
            break
            
    if target_idx != -1:
        # insert
        lines = lines[:target_idx] + block + ["\n"] + lines[target_idx:]
        
        with open(r"c:\SistemaGestionyelave\backend\contabilidad.py", "w", encoding="utf-8") as f:
            f.writelines(lines)
        print("Reordered successfully!")
    else:
        print("Could not find target idx.")
else:
    print("Could not find global block.")
