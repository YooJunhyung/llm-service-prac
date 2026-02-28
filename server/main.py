from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types
import json
import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)

app = FastAPI()

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
    # 프론트엔드로부터 전체 메시지 리스트를 받습니다.
    # messages: [{role: "user", content: "..."}, {role: "assistant", content: "..."}, ...]
    messages = data.get("messages", [])
    
    # 마지막 메시지가 사용자의 질문입니다.
    user_input = messages[-1]["content"]
    
    # 이전 대화 기록들을 Gemini 형식으로 변환 (system 제외 user/model 만)
    history = []
    for m in messages[:-1]:
        # Gemini SDK는 'assistant' 대신 'model'이라는 role 명칭을 사용합니다.
        role = "model" if m["role"] == "assistant" else "user"
        history.append(types.Content(role=role, parts=[types.Part(text=m["content"])]))

    async def generate_stream():
        if not GEMINI_API_KEY or client is None:
            yield f"data: {json.dumps({'content': 'API 키가 없습니다.'})}\n\n"
            yield "data: [DONE]\n\n"
            return

        try:
            # 채팅 세션 시작 (과거 이력 포함)
            chat_session = client.aio.chats.create(
                model="gemini-2.5-flash",
                history=history,
                config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(include_thoughts=True),
                    system_instruction="너는 유능하고 친절한 AI 어시스턴트야. 한국어로 답변해줘."
                )
            )

            response = await chat_session.send_message_stream(user_input)

            async for chunk in response:
                if await request.is_disconnected():
                    break
                
                payload = {}
                if chunk.candidates:
                    for part in chunk.candidates[0].content.parts:
                        if hasattr(part, "thought") and part.thought:
                            payload["thought"] = part.thought
                            continue
                        if hasattr(part, "text") and part.text:
                            payload["content"] = part.text
                
                if payload:
                    yield f"data: {json.dumps(payload)}\n\n"
            
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'content': f'Error: {str(e)}'})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate_stream(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4000)
