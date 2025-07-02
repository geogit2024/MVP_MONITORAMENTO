import ee
import os

# ✅ Inicialização manual (pode ajustar para sua conta de serviço)
def init_earth_engine():
    try:
        ee.Initialize(project='charged-polymer-442201-t5')
        print("✅ Earth Engine inicializado com credenciais de ambiente.")
    except Exception:
        cred_path = os.getenv("EE_CREDENTIALS_PATH", r"C:\RKSISTEMAS\DEV\MVP\webgis-mvp\backend\credentials\credentials.json")
        service_account = "gee-service@charged-polymer-442201-t5.iam.gserviceaccount.com"
        if not os.path.exists(cred_path):
            raise FileNotFoundError(f"Credencial não encontrada: {cred_path}")
        credentials = ee.ServiceAccountCredentials(service_account, cred_path)
        ee.Initialize(credentials, project='charged-polymer-442201-t5')
        print("✅ Earth Engine inicializado via arquivo de serviço.")

# ✅ Script principal de teste
def test_precipitation_mapid():
    print("🔄 Buscando tiles de precipitação (CHIRPS)...")
    try:
        # Define imagem de precipitação média de junho/2025
        image = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY") \
            .filterDate('2025-06-01', '2025-06-30') \
            .mean()

        # Parâmetros visuais (ajustáveis)
        vis_params = {
            'min': 0,
            'max': 10,
            'palette': ['white', 'lightblue', 'blue', 'darkblue']
        }

        vis_image = image.visualize(**vis_params)
        map_id_dict = vis_image.getMapId()

        # Validação do resultado
        if "mapid" in map_id_dict and "token" in map_id_dict:
            tile_url = f"https://earthengine.googleapis.com/map/{map_id_dict['mapid']}/{{z}}/{{x}}/{{y}}?token={map_id_dict['token']}"
            print("✅ mapid:", map_id_dict['mapid'])
            print("✅ token:", map_id_dict['token'])
            print("✅ Tile URL Leaflet:", tile_url)
        else:
            print("❌ Falha: 'mapid' ou 'token' ausentes no retorno.")
    except Exception as e:
        print("❌ Erro durante teste:", str(e))

# ▶️ Executar
if __name__ == "__main__":
    init_earth_engine()
    test_precipitation_mapid()
