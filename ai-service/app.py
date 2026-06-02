from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks # type: ignore
from pydantic import BaseModel # type: ignore
import os
import shutil
from typing import List, Dict, Any

from scripts.speech2text import transcribe_audio
from scripts.extract_data import ask_llm
from scripts.send_email import send_email_notification
from scripts.meeting_analysis import (
    generate_summary, 
    extract_tasks_and_suggestions, 
    chunk_transcript, 
    build_and_save_index, 
    query_rag_index
)

# Initialize FastAPI app
app = FastAPI()

# Temporary folder for storing uploaded files
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# 🔹 API: Send Email Notification (Background Task)
@app.post("/notify/")
async def send_email(data: Dict[str, Any], background_tasks: BackgroundTasks):
    try:
        # Send email in the background (non-blocking)
        background_tasks.add_task(send_email_notification, data)
        return {"message": "Email notification sent!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending email: {str(e)}")


# 🔹 EXTENDED SAAS PIPELINE APIs

@app.post("/process/")
async def process_audio_for_saas(file: UploadFile = File(...)):
    """Full transcription and feature extraction API for Spring Boot SaaS."""
    try:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if os.path.getsize(file_path) == 0:
            os.remove(file_path)
            raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

        # 1. Transcribe audio using Whisper
        transcript = transcribe_audio(file_path)
        os.remove(file_path)

        if not transcript or not transcript.strip():
            return {
                "transcript": "",
                "extracted_data": {"name": "", "start_time": "", "end_time": "", "total_hours": "0", "meeting_date": "", "note": ""},
                "summary": "No transcript available.",
                "tasks": [],
                "chunks": []
            }

        # 2. Extract metadata using existing LangChain/Ollama pipeline
        extracted_data = ask_llm(transcript)

        # 3. Generate summary
        summary = generate_summary(transcript)

        # 4. Extract Jira-style tasks and updates
        tasks = extract_tasks_and_suggestions(transcript)

        # 5. Chunk transcript for FAISS indexing
        chunks = chunk_transcript(transcript)

        return {
            "transcript": transcript,
            "extracted_data": extracted_data,
            "summary": summary,
            "tasks": tasks,
            "chunks": chunks
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to process meeting: {str(e)}")


class IndexRequest(BaseModel):
    meeting_id: int
    chunks: List[Dict[str, Any]]

@app.post("/index/")
async def create_vector_index(data: IndexRequest):
    """Index chunks in FAISS for the given meeting ID."""
    try:
        build_and_save_index(data.meeting_id, data.chunks)
        return {"message": f"FAISS index created for meeting {data.meeting_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector indexing failed: {str(e)}")


class RagRequest(BaseModel):
    meeting_id: int
    question: str

@app.post("/rag/")
async def query_rag(data: RagRequest):
    """Query the meeting RAG chatbot."""
    try:
        result = query_rag_index(data.meeting_id, data.question)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG search failed: {str(e)}")


# Run the API
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
