FROM python:3.10-slim

# Diretório de trabalho
WORKDIR /app

# Cria pasta para credenciais e copia o JSON do Service Account
RUN mkdir -p /app/credentials
COPY credentials/earthengine-sa.json /app/credentials/earthengine-sa.json

# Copia o restante do código da aplicação
COPY . /app

# Instala dependências Python, incluindo Earth Engine e geoprocessamento
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn[standard] \
    google-auth \
    google-auth-oauthlib \
    google-auth-httplib2 \
    earthengine-api \
    geojson \
    requests

# Define variável de ambiente para o SDK Python usar as credenciais
ENV GOOGLE_APPLICATION_CREDENTIALS=/app/credentials/earthengine-sa.json

# Exponha porta do FastAPI
EXPOSE 8000

# Inicia o servidor Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
