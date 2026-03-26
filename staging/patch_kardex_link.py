import os

kardex_link = """                <a href="/kardex.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                        <line x1="12" y1="22.08" x2="12" y2="12"></line>
                    </svg>Reportes Kardex
                </a>
"""

reparto_link = """                <a href="/reparto.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                        <circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>
                    </svg>Reparto y Rutas
                </a>
"""

files = [
    "conciliacion.html",
    "db-config.html",
    "logistics.html",
    "orders.html",
    "production.html",
    "profile.html",
    "reparto.html",
    "users.html"
]

base_dir = r"c:\SistemaGestionyelave\staging\dashboard-prototype"

for f in files:
    path = os.path.join(base_dir, f)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as file:
            content = file.read()
            
        if 'href="/kardex.html"' not in content:
            if reparto_link in content:
                content = content.replace(reparto_link, reparto_link + kardex_link)
                with open(path, "w", encoding="utf-8") as file:
                    file.write(content)
                print(f"Patched {f}")
            else:
                print(f"Could not find exact reparto link in {f}")
        else:
            print(f"Already patched {f}")
