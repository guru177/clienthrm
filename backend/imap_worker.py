import imaplib
import email
from email.header import decode_header
import sqlite3
import os
import uuid
import datetime
import random
import time
import re
import json
import google.generativeai as genai
from PyPDF2 import PdfReader
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

IMAP_SERVER = os.getenv("SMTP_HOST", "mail.crafteluxe.in")
EMAIL_ACCOUNT = os.getenv("SMTP_USER", "test@crafteluxe.in")
PASSWORD = os.getenv("SMTP_PASS", "Guru@1234")

# Storage path for resumes
STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "public", "storage", "resumes")
os.makedirs(STORAGE_DIR, exist_ok=True)

# Database path
DB_PATH = os.path.join(os.path.dirname(__file__), "..", "database", "database.sqlite")

def get_career_id(conn):
    cur = conn.cursor()
    cur.execute("SELECT id FROM careers LIMIT 1")
    row = cur.fetchone()
    return row[0] if row else 1

def parse_resume_with_llm(text):
    if not GEMINI_API_KEY:
        return None
    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        prompt = f"""
You are an expert ATS parser. Extract the following information from the resume text provided below. 
Format your response EXACTLY as a raw JSON object with no markdown formatting and no backticks.

{{
  "name": "",
  "email": "",
  "phone": "",
  "skills": [],
  "education": [],
  "experience": [],
  "total_experience_years": 0,
  "summary_feedback": "Provide a one-sentence summary of the candidate's profile, followed by bullet points of their key strengths and qualifications."
}}

Resume Text:
{text}
"""
        response = model.generate_content(prompt)
        clean_json = response.text.replace('```json', '').replace('```', '').strip()
        return json.loads(clean_json)
    except Exception as e:
        print(f"LLM Parsing failed: {e}")
        return None

def process_email(msg, conn):
    subject, encoding = decode_header(msg.get("Subject", ""))[0]
    if isinstance(subject, bytes):
        subject = subject.decode(encoding if encoding else "utf-8", errors="ignore")
    
    from_header = msg.get("From", "")
    name, email_addr = email.utils.parseaddr(from_header)
    
    if not email_addr:
        return
        
    print(f"Processing application from {name} <{email_addr}> - {subject}")
    
    resume_path = None
    resume_url = None
    
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        if part.get("Content-Disposition") is None:
            continue
            
        filename = part.get_filename()
        if filename:
            # We found an attachment
            ext = os.path.splitext(filename)[1].lower()
            if ext in [".pdf", ".doc", ".docx"]:
                safe_filename = f"{uuid.uuid4().hex}{ext}"
                resume_path = os.path.join(STORAGE_DIR, safe_filename)
                
                with open(resume_path, "wb") as f:
                    f.write(part.get_payload(decode=True))
                
                resume_url = f"resumes/{safe_filename}"
                break # Only take the first document
                
    if not resume_url:
        resume_url = "" # No resume attached
        
    phone_number = ""
    experience_years = 0 # default if parsing fails
    extracted_name = name or "Applicant"
    extracted_email = email_addr
    applied_position = subject if subject else "General Application"
    ats_feedback_text = f"Parsed from email attachment. Strong match for {applied_position}."
    
    if resume_path and resume_path.endswith(".pdf"):
        try:
            reader = PdfReader(resume_path)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + " "
                
            # Attempt LLM Parsing First (High Accuracy)
            llm_data = parse_resume_with_llm(text)
            
            if llm_data:
                print("Successfully parsed resume with LLM!")
                if llm_data.get("phone"): phone_number = llm_data["phone"]
                if llm_data.get("total_experience_years") is not None: experience_years = llm_data["total_experience_years"]
                if llm_data.get("name"): extracted_name = llm_data["name"]
                if llm_data.get("email"): extracted_email = llm_data["email"]
                
                # Create a smart ATS feedback from the summary
                if llm_data.get("summary_feedback"):
                    ats_feedback_text = llm_data["summary_feedback"]
                elif llm_data.get("skills"):
                    ats_feedback_text = "Key Skills: " + ", ".join(llm_data["skills"][:5])
            else:
                print("Falling back to Regex Parser (No API Key or LLM failed)")
                # Better regex for phone numbers (matches +91 9876543210 etc)
                phone_match = re.search(r'(\+?\d[\d\s\-()]{8,}\d)', text)
                if phone_match:
                    # Remove extra spaces from phone number
                    phone_number = re.sub(r'\s+', ' ', phone_match.group(0).strip())
                    
                # Isolate the Experience section to avoid counting Graduation dates
                section_match = re.search(r'\b(?:EXPERIENCE|EMPLOYMENT(?: HISTORY)?|WORK HISTORY)\b(.*?)\b(?:EDUCATION|SKILLS|PROJECTS|CERTIFICATIONS|ACHIEVEMENTS)\b', text, re.IGNORECASE | re.DOTALL)
                scan_text = section_match.group(1) if section_match else text
                
                # Look for date ranges in the isolated section
                years = re.findall(r'(19\d{2}|20\d{2})', scan_text)
                if len(years) >= 2:
                    years = [int(y) for y in years]
                    diff = max(years) - min(years)
                    if 1 <= diff <= 40:
                        experience_years = diff
        except Exception as e:
            print(f"Failed to parse PDF: {e}")
            
    # AI Simulation for ATS score and parsing
    now = datetime.datetime.now()
    ats_score = random.randint(65, 95)
    tracking_number = f"APP-{now.year}-{random.randint(1000, 9999)}"
    
    # Database Insertion
    career_id = get_career_id(conn)
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO job_applications (
            career_id, tracking_number, name, email, phone, resume, status, 
            applied_position, experience_years, ats_score, ats_feedback, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)
    """, (
        career_id, tracking_number, extracted_name, extracted_email, phone_number, resume_url,
        applied_position, experience_years, ats_score,
        ats_feedback_text,
        now_str, now_str
    ))
    conn.commit()
    print(f"Successfully saved application: {tracking_number}")

def fetch_emails():
    try:
        # Connect to the server
        mail = imaplib.IMAP4_SSL(IMAP_SERVER)
        mail.login(EMAIL_ACCOUNT, PASSWORD)
        mail.select("inbox")
        
        # Search for unread emails
        status, messages = mail.search(None, "UNSEEN")
        
        if status == "OK":
            email_ids = messages[0].split()
            if not email_ids:
                print("No new emails.")
                
            for e_id in email_ids:
                res, msg_data = mail.fetch(e_id, "(RFC822)")
                for response_part in msg_data:
                    if isinstance(response_part, tuple):
                        msg = email.message_from_bytes(response_part[1])
                        
                        conn = sqlite3.connect(DB_PATH)
                        try:
                            process_email(msg, conn)
                        except Exception as e:
                            print(f"Error processing email: {e}")
                        finally:
                            conn.close()
                            
        mail.logout()
    except Exception as e:
        print(f"IMAP Error: {e}")

if __name__ == "__main__":
    print("Starting IMAP Resume Fetcher Background Worker...")
    while True:
        fetch_emails()
        time.sleep(60) # Poll every 60 seconds
