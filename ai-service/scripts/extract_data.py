import json
from langchain_ollama import ChatOllama # type: ignore
from langchain_core.prompts import (SystemMessagePromptTemplate,  # type: ignore
                                    HumanMessagePromptTemplate,
                                    ChatPromptTemplate)
from langchain_core.output_parsers import StrOutputParser # type: ignore
import os
import re

#  Define LLM Configuration
base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
model = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")

llm = ChatOllama(base_url=base_url, model=model)

# System Message for Context
system = SystemMessagePromptTemplate.from_template(
    "You are an AI assistant that extracts structured data from meeting transcripts in JSON format."
)

#  Refined Prompt for JSON Extraction
json_prompt = """
**Task:** Extract key information from the following text.

**Transcript Text:**
{context}

**Instructions:**
1. For the customer name, look for an introduction phrase such as "Hi, this is [Name]" or "Hello, this is [Name]". Extract only the name (e.g., "Sarah"). If no name is mentioned, return an empty string.
2. For start and end times, extract them ONLY if explicitly mentioned in the text (e.g., '3:15 PM' or '4:45 PM'). If they are not clearly stated, return empty strings.
3. If total hours is explicitly stated (e.g., "lasting 1.5 hours"), include it. Otherwise, leave it empty.
4. For the meeting date, extract it if present; otherwise, default to today's date.
5. Extract any additional meeting notes provided.

Return ONLY a valid JSON object without any additional text or commentary (do NOT include comments inside the JSON), using the following format:

```json
{{
    "name": "<Extracted Customer Name or empty string>",
    "start_time": "<Extracted Start Time (e.g., '3:15 PM') or empty string>",
    "end_time": "<Extracted End Time (e.g., '4:45 PM') or empty string>",
    "total_hours": "<Total meeting hours. If not provided, calculate from start and end times>",
    "meeting_date": "<Extracted Meeting Date or today's date if missing>",
    "note": "<Extracted Meeting Notes>"
}}
```
"""
prompt = HumanMessagePromptTemplate.from_template(json_prompt)




def fix_time_format(transcript):
    """
    Fixes time formats where Whisper removes colons.
    - Converts '315 PM' -> '3:15 PM'
    - Converts '3 PM' -> '3:00 PM'
    - Handles time intervals like '315 PM to 445 PM' -> '3:15 PM to 4:45 PM'
    """
    # Step 1: Fix missing colons in full times (e.g., "315 PM" -> "3:15 PM")
    pattern_full = r'\b(\d{1,2})(\d{2})\s?(AM|PM|am|pm)\b'
    
    def add_colon(match):
        hours, minutes, period = match.groups()
        return f"{int(hours)}:{minutes} {period.upper()}"

    transcript = re.sub(pattern_full, add_colon, transcript)
    
    # Step 2: Fix single-hour times missing minutes (e.g., "3 PM" -> "3:00 PM")
    # Use a negative lookahead (?!:) to ensure we don't modify times that already have a colon.
    pattern_single = r'\b(\d{1,2})(?!:)\s*(AM|PM|am|pm)\b'
    transcript = re.sub(pattern_single, r'\1:00 \2', transcript)
    
    return transcript


def clean_and_parse_json(text):
    text = text.strip()
    # Strip markdown wrappers
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    
    # Remove single line comments like // ... (but keep http:// or https://)
    text_no_comments = re.sub(r'(?<!:)\/\/.*$', '', text, flags=re.MULTILINE)
    text_no_comments = text_no_comments.strip()
    
    try:
        return json.loads(text_no_comments)
    except Exception as e:
        print(f"Standard JSON parsing failed: {e}. Attempting regex extraction.")
        try:
            match = re.search(r'\{.*\}', text_no_comments, re.DOTALL)
            if match:
                return json.loads(match.group(0))
        except Exception as e2:
            print(f"Regex JSON extraction failed: {e2}")
        return {}


#  Function to Call LLM
def ask_llm(context):
    fixed_context = fix_time_format(context)
    messages = [system, prompt]
    template = ChatPromptTemplate(messages)

    qna_chain = template | llm | StrOutputParser()
    try:
        raw_output = qna_chain.invoke({'context': fixed_context})
        parsed_data = clean_and_parse_json(raw_output)
    except Exception as e:
        print(f"LLM extraction chain error: {e}")
        parsed_data = {}

    default_res = {
        "name": "",
        "start_time": "",
        "end_time": "",
        "total_hours": "",
        "meeting_date": "",
        "note": ""
    }

    # Format the note value appropriately
    note_val = parsed_data.get("note", "")
    if isinstance(note_val, list):
        note_val = "\n".join(str(x) for x in note_val)
    elif not isinstance(note_val, str):
        note_val = str(note_val) if note_val is not None else ""

    for k, v in default_res.items():
        if k not in parsed_data or parsed_data[k] is None:
            parsed_data[k] = v

    parsed_data["note"] = note_val
    return parsed_data


