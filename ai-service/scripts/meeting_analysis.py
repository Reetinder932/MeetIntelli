import os
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.prompts import PromptTemplate
from langchain_ollama import ChatOllama
from langchain_text_splitters import RecursiveCharacterTextSplitter
import json

# Setup Ollama model
base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
model = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")
llm = ChatOllama(base_url=base_url, model=model)

# Embedding model for FAISS
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

VECTOR_STORE_DIR = "vector_stores"
os.makedirs(VECTOR_STORE_DIR, exist_ok=True)

def generate_summary(transcript: str) -> str:
    """Generate a structured summary of the meeting transcript."""
    prompt = PromptTemplate.from_template(
        "You are an expert meeting assistant. Summarize the following meeting transcript. "
        "Provide a high-level summary, key decisions made, and highlight any blockers discussed.\n\n"
        "Transcript:\n{transcript}\n\nSummary:"
    )
    chain = prompt | llm
    response = chain.invoke({"transcript": transcript})
    return response.content

def extract_tasks_and_suggestions(transcript: str) -> list:
    """Extract tasks and suggest status updates from the transcript."""
    prompt = PromptTemplate.from_template(
        "Analyze the following meeting transcript and extract concrete tasks that were assigned, "
        "completed, or are in progress. For each task, extract: \n"
        "1. Title (short, active voice, e.g., 'Develop user authentication API')\n"
        "2. Description (details of what needs to be done)\n"
        "3. Assigned to (name of the person, or empty if unknown)\n"
        "4. Suggested update (e.g., if John says 'I have completed the backend API', output: 'Backend API -> Completed')\n\n"
        "Return the output ONLY as a JSON list of objects, with no markdown formatting and no extra commentary. Format:\n"
        "[\n"
        "  {{\n"
        "    \"title\": \"...\",\n"
        "    \"description\": \"...\",\n"
        "    \"assigned_to\": \"...\",\n"
        "    \"suggested_update\": \"...\"\n"
        "  }}\n"
        "]\n\n"
        "Transcript:\n{transcript}"
    )
    chain = prompt | llm
    response = chain.invoke({"transcript": transcript})
    content = response.content.strip()
    print(f"[DEBUG Tasks LLM Response]: {content}")
    
    # Try parsing json
    try:
        content = content.strip()
        # Strip codeblock wrappers if LLM returned them
        if content.startswith("```json"):
            content = content[7:]
        elif content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        # Remove single line comments like // ...
        import re
        content_no_comments = re.sub(r'(?<!:)\/\/.*$', '', content, flags=re.MULTILINE)
        content_no_comments = content_no_comments.strip()

        parsed = json.loads(content_no_comments)
        print(f"[DEBUG Tasks Parsed]: {parsed}")
        return parsed
    except Exception as e:
        print(f"Standard tasks JSON parsing failed: {e}. Attempting regex list extraction.")
        try:
            import re
            match = re.search(r'\[.*\]', content_no_comments, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                print(f"[DEBUG Tasks Parsed via Regex]: {parsed}")
                return parsed
        except Exception as e2:
            print(f"Regex task list extraction failed: {e2}")
        
        print(f"Error parsing tasks JSON. Raw content: {content}")
        return []

def chunk_transcript(transcript: str) -> list:
    """Chunk the transcript text into manageable overlapping segments."""
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=600,
        chunk_overlap=120
    )
    chunks = text_splitter.split_text(transcript)
    result = []
    for idx, text in enumerate(chunks):
        result.append({
            "text": text,
            "chunk_index": idx,
            "start_time": f"00:{idx*2:02d}", # Mocked timestamps for chunks if unavailable
            "end_time": f"00:{(idx+1)*2:02d}"
        })
    return result

def build_and_save_index(meeting_id: int, chunks: list):
    """Generate embeddings and build a FAISS index for a specific meeting."""
    texts = [c["text"] for c in chunks]
    metadatas = [{"chunk_index": c["chunk_index"], "meeting_id": meeting_id} for c in chunks]
    
    vector_store = FAISS.from_texts(texts, embeddings, metadatas=metadatas)
    
    save_path = os.path.join(VECTOR_STORE_DIR, f"meeting_{meeting_id}")
    vector_store.save_local(save_path)
    print(f"FAISS index saved successfully for meeting {meeting_id} at {save_path}")

def query_rag_index(meeting_id: int, question: str) -> dict:
    """Load FAISS index, search context, and generate answer from Ollama."""
    load_path = os.path.join(VECTOR_STORE_DIR, f"meeting_{meeting_id}")
    if not os.path.exists(load_path):
        return {
            "answer": "No vector store index exists for this meeting yet. Please process the meeting first.",
            "referencedChunks": []
        }
    
    vector_store = FAISS.load_local(load_path, embeddings, allow_dangerous_deserialization=True)
    
    # Perform similarity search
    docs = vector_store.similarity_search(question, k=4)
    context = "\n---\n".join([doc.page_content for doc in docs])
    referenced_chunks = [doc.page_content for doc in docs]
    
    prompt = PromptTemplate.from_template(
        "You are an intelligent chatbot assisting a team with their meetings. "
        "Answer the user's question ONLY using the provided meeting transcript context. "
        "If the answer cannot be found in the context, say 'I cannot find that information in the transcript.' "
        "Do not make up facts or extrapolate beyond the transcript. Keep your answer brief and structured.\n\n"
        "Context:\n{context}\n\n"
        "Question: {question}\n\n"
        "Answer:"
    )
    chain = prompt | llm
    response = chain.invoke({"context": context, "question": question})
    
    return {
        "answer": response.content,
        "referencedChunks": referenced_chunks
    }
