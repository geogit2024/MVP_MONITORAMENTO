import requests
import json

# Pegar um token se necessário? O backend está rodando localmente.
# Assumindo que a rota está aberta ou que podemos testar via endpoint
URL = "http://127.0.0.1:8000/api/analyze-ndvi"
DATA = {"area_id": 6}

try:
    print("Enviando requisição de análise GEE para area_id 6...")
    # Como não tenho o JWT do usuário agora, vou tentar uma chamada direta
    # Se falhar por 401, vou olhar os LOGS do servidor que ja foram disparados.
    response = requests.post(URL, json=DATA, timeout=60)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        res_json = response.json()
        print(f"NDVI[0]: {res_json.get('ndvi_data', [{}])[0].get('ndvi')}")
        print(f"Report: {res_json.get('report')[:100]}...")
    else:
        print(f"Erro: {response.text}")
except Exception as e:
    print(f"Falha na requisição: {e}")
