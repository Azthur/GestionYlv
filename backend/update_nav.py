import os
import re

html_dir = r"c:\SistemaGestionyelave\staging\dashboard-prototype"

standard_nav = """<nav class="nav-menu">
                <a href="/index.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
                    </svg>Dashboard
                </a>
                <a href="/logistics.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                    </svg>Centro Logístico
                </a>
                <a href="/orders.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>Compras (Legacy)
                </a>
                <a href="/production.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                    </svg>Producción y Costos
                </a>
                <a href="/reparto.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
                        <circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>
                    </svg>Reparto y Rutas
                </a>
                <a href="/conciliacion.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>Finanzas (Conciliación)
                </a>
                <a href="/db-config.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                    </svg>Mantenimiento BD
                </a>
            </nav>"""

pattern = re.compile(r'<nav class="nav-menu">.*?</nav>', re.DOTALL)

for file in os.listdir(html_dir):
    if file.endswith('.html') and '_backup' not in file:
        filepath = os.path.join(html_dir, file)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Count occurrences to be safe
            if '<nav class="nav-menu">' in content:
                new_content = pattern.sub(standard_nav, content)
                
                # Let's adjust the "active" class dynamically based on the current file
                base_name = file
                new_content = new_content.replace(f'href="/{base_name}" class="nav-item"', f'href="/{base_name}" class="nav-item active"')
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated {file}")
        except Exception as e:
            print(f"Error on {file}: {e}")
