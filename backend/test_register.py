from main import register
from database import SessionLocal
import schemas
import traceback

db = SessionLocal()
try:
    user_data = schemas.UserCreate(email="direct_test@teste.com", password="123")
    res = register(user_data, db=db)
    print("SUCCESS", res.email)
except Exception as e:
    print("FATAL EXCEPTION:")
    traceback.print_exc()
finally:
    db.close()
