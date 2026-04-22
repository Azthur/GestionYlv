import socket, time, json

# Raw TCP socket test to eliminate any client library overhead
def raw_http_get(path):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect(('127.0.0.1', 8000))
    request = f"GET {path} HTTP/1.1\r\nHost: localhost:8000\r\nConnection: close\r\n\r\n"
    sock.sendall(request.encode())
    
    response = b""
    while True:
        data = sock.recv(4096)
        if not data:
            break
        response += data
    sock.close()
    
    # Parse body
    parts = response.split(b"\r\n\r\n", 1)
    return parts[1] if len(parts) > 1 else b""

print("=== Raw socket test ===")
for i in range(3):
    t = time.time()
    body = raw_http_get('/health/db')
    print(f"  /health/db #{i+1}: {(time.time()-t)*1000:.0f}ms")

print()
for i in range(3):
    t = time.time()
    body = raw_http_get('/api/cargos/ocs-disponibles?codcia=003&ano=2026&mes=4&tipo_cargo=LOG_A_CONT&login=71941916JL&tipo_oc=ALL&only_my_records=false')
    print(f"  /api/cargos #{i+1}: {(time.time()-t)*1000:.0f}ms")
