import json
import ee
from google.oauth2 import service_account
from gee_logic import GEELogic

def run_test():
    try:
        print("--- TESTE DE IDENTIDADE GEE ---")
        GEELogic.initialize()
        
        # Teste 1: Acesso a metadados públicos
        try:
            name = ee.Image("COPERNICUS/S2_SR_HARMONIZED/20240101T140709_20240101T140707_T19MFT").get('system:id').getInfo()
            print(f"Teste 1 (Metadados Públicos): SUCESSO. ID: {name}")
        except Exception as e1:
            print(f"Teste 1 (Metadados Públicos): FALHA. {e1}")
            
        # Teste 2: Cálculo simples de redução
        try:
            print("Tentando cálculo simples (reduceRegion) em um ponto fixo...")
            point = ee.Geometry.Point([-38.5, -5.5])
            img = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(point).first()
            if img:
                stats = img.reduceRegion(ee.Reducer.mean(), point, 10).getInfo()
                print(f"Teste 2 (Cálculo): SUCESSO. Stats: {stats}")
            else:
                print("Teste 2: Nenhuma imagem encontrada no ponto.")
        except Exception as e2:
            print(f"Teste 2 (Cálculo): FALHA. {e2}")

    except Exception as e:
        print(f"Erro Geral: {e}")

if __name__ == "__main__":
    run_test()
