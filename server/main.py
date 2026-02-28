from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
import json
import os
from dotenv import load_dotenv

load_dotenv()

# Gemini API 설정
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = None
if GEMINI_API_KEY:
    # google-genai SDK 클라이언트 생성
    client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/chat")
async def chat(request: Request):
    data = await request.json()
    message = data.get("message", "")

    async def generate_stream():
        if not GEMINI_API_KEY or client is None:
            yield f"data: {json.dumps({'content': 'GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        try:
            # 2026년 기준 Stable 모델인 2.5-flash를 먼저 시도
            # 만약 2.5가 안된다면 최신 별칭인 gemini-flash-latest 시도
            selected_model = "gemini-2.5-flash"
            
            try:
                response = await client.aio.models.generate_content_stream(
                    model=selected_model,
                    contents=message
                )
            except Exception:
                selected_model = "gemini-flash-latest"
                response = await client.aio.models.generate_content_stream(
                    model=selected_model,
                    contents=message
                )

            async for chunk in response:
                # 클라이언트가 연결을 끊었는지 매 청크마다 확인
                if await request.is_disconnected():
                    print("Client disconnected. Stopping stream...")
                    break

                if chunk.text:
                    data_str = json.dumps({"content": chunk.text})
                    yield f"data: {data_str}\n\n"
            
            yield "data: [DONE]\n\n"
        except Exception as e:
            error_msg = str(e)
            if "429" in error_msg:
                friendly_msg = "현재 사용 중인 API 키의 무료 할당량이 소진되었거나, 해당 모델에 대한 접근이 제한되었습니다. (Google AI Studio에서 Quota 상태를 확인해 주세요.)"
            else:
                friendly_msg = f"에러 발생: {error_msg}"
            
            yield f"data: {json.dumps({'content': friendly_msg})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate_stream(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4000)
