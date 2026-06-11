import subprocess
logs = subprocess.check_output('docker logs yelave-erp', shell=True).decode('utf-8', 'ignore')
lines = logs.splitlines()
tracebacks = []
in_traceback = False
tb_lines = []
for line in lines:
    if line.startswith("Traceback"):
        in_traceback = True
        tb_lines = [line]
    elif in_traceback:
        tb_lines.append(line)
        if not line.startswith(" ") and not line.startswith("Traceback") and ":" in line:
            in_traceback = False
            tracebacks.append("\n".join(tb_lines))

if tracebacks:
    print(tracebacks[-1])
else:
    print("No traceback found")
