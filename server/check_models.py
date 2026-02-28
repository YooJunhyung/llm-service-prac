import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

print("--- Available Models ---")
# google-genai SDK 1.0.0+ 에서는 속성명이 다를 수 있으므로 객체 전체를 출력합니다.
for model in client.models.list():
    print(model)
