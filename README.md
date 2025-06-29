# 🌐 WebGIS MVP com Google Login e Google Maps

Este projeto é um MVP de uma aplicação WebGIS que permite que usuários visualizem suas propriedades em um mapa após fazer login com uma conta Google.

## 🚀 Funcionalidades

- Login com conta Google
- Visualização das propriedades cadastradas via Google Maps
- Popups com nome da propriedade
- Backend em FastAPI autenticado via ID Token Google
- Deploy local com Docker

## 📦 Requisitos

- Node.js (para frontend)
- Docker e Docker Compose (para backend)
- Chaves de API:
  - Google Maps JavaScript API Key
  - Google OAuth 2.0 Client ID

## 🧭 Instruções de Uso

### 1. Clone o projeto
```bash
git clone https://github.com/seuusuario/webgis-mvp.git
cd webgis-mvp
```

### 2. Configurar variáveis

Substitua em:
- `Login.js` → `YOUR_GOOGLE_CLIENT_ID`
- `MapView.js` → `YOUR_GOOGLE_MAPS_API_KEY`
- `docker-compose.yml` → variável `GOOGLE_CLIENT_ID`

### 3. Rodar o backend com Docker
```bash
docker-compose up --build
```
O backend estará disponível em: [http://localhost:8000](http://localhost:8000)

### 4. Rodar o frontend (React)
```bash
cd frontend
npm install
npm run dev
```
Acesse em: [http://localhost:3000](http://localhost:3000)

### 5. Estrutura Esperada
```
webgis-mvp/
├── backend/
│   ├── main.py
│   ├── propriedades.geojson
│   ├── Dockerfile
│   ├── docker-compose.yml
├── frontend/
│   ├── Login.js
│   ├── MapView.js
├── README.md
```

## 🗺️ Exemplo de Usuários
- usuario1@gmail.com
- usuario2@gmail.com

## 📄 Licença
Este projeto é livre para uso educacional e testes de MVP.