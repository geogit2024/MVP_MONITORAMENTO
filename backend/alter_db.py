import sqlite3

def alter_db():
    try:
        conn = sqlite3.connect("saas_v2.db")
        cursor = conn.cursor()
        
        # Check se a coluna existe para evitar erro
        cursor.execute("PRAGMA table_info(users)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if "radar_frequency" not in columns:
            print("Adicionando radar_frequency...")
            cursor.execute("ALTER TABLE users ADD COLUMN radar_frequency VARCHAR DEFAULT 'weekly'")
            
        if "radar_time" not in columns:
            print("Adicionando radar_time...")
            cursor.execute("ALTER TABLE users ADD COLUMN radar_time VARCHAR DEFAULT '03:00'")
            
        if "radar_email_alerts" not in columns:
            print("Adicionando radar_email_alerts...")
            cursor.execute("ALTER TABLE users ADD COLUMN radar_email_alerts BOOLEAN DEFAULT 1")
            
        # Migração da tabela monitoring_history
        cursor.execute("PRAGMA table_info(monitoring_history)")
        history_columns = [info[1] for info in cursor.fetchall()]
        if "embedding" not in history_columns:
            print("Adicionando embedding em monitoring_history...")
            cursor.execute("ALTER TABLE monitoring_history ADD COLUMN embedding TEXT")
            
        conn.commit()
        print("Migração concluída com sucesso!")
    except Exception as e:
        print(f"Erro: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    alter_db()
