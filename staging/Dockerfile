# ─── YELAVE ERP - Production Dockerfile ───────────────────────────────
# Multi-stage build: Python + ODBC Driver 18 for SQL Server on Debian
# ──────────────────────────────────────────────────────────────────────

FROM python:3.12-slim AS base

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# ─── Install Microsoft ODBC Driver 18 for SQL Server ──────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        gnupg2 \
        apt-transport-https \
        unixodbc-dev \
        gcc \
        g++ \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 libgssapi-krb5-2 \
    && apt-get purge -y --auto-remove curl gnupg2 apt-transport-https gcc g++ \
    && rm -rf /var/lib/apt/lists/*

# ─── Python dependencies ─────────────────────────────────────────────
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Fix for SQL Server 2008 R2 (TLS 1.0/1.1) ───────────────────────
RUN sed -i 's/\[openssl_init\]/\[openssl_init\]\nssl_conf = ssl_sect/' /etc/ssl/openssl.cnf \
    && printf "\n[ssl_sect]\nsystem_default = system_default_sect\n\n[system_default_sect]\nCipherString = DEFAULT@SECLEVEL=0\nMinProtocol = TLSv1\n" >> /etc/ssl/openssl.cnf

# ─── Copy application code ───────────────────────────────────────────
COPY backend/ ./backend/
COPY dashboard-prototype/ ./dashboard-prototype/

# ─── Remove dev/temp files ───────────────────────────────────────────
RUN find /app -name "*.pyc" -delete \
    && find /app -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true \
    && rm -rf /app/backend/venv \
    && rm -f /app/backend/*.tmp \
    && rm -f /app/dashboard-prototype/*.py \
    && rm -f /app/dashboard-prototype/*.tmp

# ─── Environment defaults ───────────────────────────────────────────
ENV ODBC_DRIVER="{ODBC Driver 18 for SQL Server}"
ENV PYTHONUNBUFFERED=1

# ─── Expose port ─────────────────────────────────────────────────────
EXPOSE 8000

# ─── Health check ────────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/db')" || exit 1

# ─── Start the application ──────────────────────────────────────────
WORKDIR /app/backend
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--access-log"]
