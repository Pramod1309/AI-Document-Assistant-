import google.generativeai as genai
from django.conf import settings
import json
import logging
import re

logger = logging.getLogger(__name__)

def parse_intent(user_message, file_metadata, conversation_history):
    """
    Use Gemini AI to parse the user's intent and map it to a document operation or conversation.
    If Gemini fails to classify as document_operation, use a regex fallback to detect operation patterns.
    Returns a dict with intent, operation, params, and description.
    """
    try:
        model = genai.GenerativeModel('gemini-2.0-flash-lite')
        
        # Prepare context
        file_context = "\n".join([f"File: {meta['name']} (Type: {meta['type']}, Size: {meta['size']} bytes)" for meta in file_metadata])
        history_context = "\n".join([f"{msg['role']}: {msg['parts'][0]['text']}" for msg in conversation_history[-5:]])
        
        prompt = f"""
You are an AI assistant that interprets user commands for document operations or general conversation.
The user provided the following message: "{user_message}"
Uploaded files:
{file_context}
Recent conversation history:
{history_context}

Determine the user's intent. If a file is uploaded and the message contains terms like 'convert', 'compress', 'resize', 'to', or similar (e.g., 'compress this PDF', 'convert to PDF and compress to 1MB'), classify it as a document operation. Otherwise, treat it as a general conversation.

Supported operations:
- convert_and_compress_images_to_pdf: Convert images to PDF and compress to a size (e.g., "1MB").
- convert_parallel_operations: Perform two operations on two files (e.g., convert one to PDF, resize another).
- images_to_pdf: Convert images to PDF.
- compress_pdf: Compress a PDF to a size (e.g., "500kb"). Can use last compressed PDF if mentioned (e.g., "re-compress the last PDF").
- word_to_pdf: Convert Word (DOCX) to PDF.
- pdf_to_word: Convert PDF to Word (DOCX).
- ppt_to_pdf: Convert PowerPoint (PPT/PPTX) to PDF.
- excel_to_pdf: Convert Excel (XLS/XLSX) to PDF.
- pdf_to_excel: Convert PDF to Excel (XLSX).
- pdf_to_ppt: Convert PDF to PowerPoint (PPTX).
- convert_image_format: Convert image to another format (e.g., JPG to PNG).
- resize_image: Resize image to a size (e.g., "1MB"), resolution (e.g., "800x600"), or aspect ratio (e.g., "4:3").

Instructions:
- Match the user's message and file types to the appropriate operation.
- Extract parameters like size, format, or resolution from the message.
- If the message references a previous operation (e.g., "re-compress the last PDF"), set "use_last_compressed": true.
- Return a JSON string with no extra text or markdown (e.g., avoid ```json).
- If no files are uploaded or the intent is unclear, default to "conversation".

Output format (return as a JSON string):
{{
    "intent": "document_operation" or "conversation",
    "operation": str (if document_operation, e.g., "compress_pdf"),
    "params": dict (e.g., {{"size": "1MB", "format": "JPEG"}}),
    "description": str (natural language description of the operation)
}}

Examples:
User: "Turn these images into a PDF and make it smaller than 2MB"
Files: image/jpeg
Output: {{
    "intent": "document_operation",
    "operation": "convert_and_compress_images_to_pdf",
    "params": {{"size": "2MB"}},
    "description": "convert images to a PDF and compress it to less than 2MB"
}}

User: "Compress this PDF to 500kb"
Files: application/pdf
Output: {{
    "intent": "document_operation",
    "operation": "compress_pdf",
    "params": {{"size": "500kb"}},
    "description": "compress the PDF to 500kb"
}}

User: "Convert my Word doc to PDF"
Files: application/vnd.openxmlformats-officedocument.wordprocessingml.document
Output: {{
    "intent": "document_operation",
    "operation": "word_to_pdf",
    "params": {{}},
    "description": "convert a Word document to PDF"
}}

User: "Re-compress the last PDF to 300kb"
Files: none
Output: {{
    "intent": "document_operation",
    "operation": "compress_pdf",
    "params": {{"size": "300kb", "use_last_compressed": true}},
    "description": "re-compress the last compressed PDF to 300kb"
}}

User: "Convert this image to PNG"
Files: image/jpeg
Output: {{
    "intent": "document_operation",
    "operation": "convert_image_format",
    "params": {{"format": "PNG"}},
    "description": "convert an image to PNG format"
}}

User: "Convert in one PDF and compress in 1MB"
Files: image/png
Output: {{
    "intent": "document_operation",
    "operation": "convert_and_compress_images_to_pdf",
    "params": {{"size": "1MB"}},
    "description": "convert images to PDF and compress to 1MB"
}}

User: "Can you tell me about document conversion?"
Files: none
Output: {{
    "intent": "conversation",
    "operation": null,
    "params": {{}},
    "description": "general conversation about document conversion"
}}

User: "What is a PDF?"
Files: none
Output: {{
    "intent": "conversation",
    "operation": null,
    "params": {{}},
    "description": "general conversation about PDFs"
}}
"""
        
        response = model.generate_content(prompt)
        logger.debug(f"Gemini raw response: {response.text}")
        
        # Strip markdown and parse as JSON
        cleaned_response = re.sub(r'```json\s*|\s*```', '', response.text.strip())
        try:
            result = json.loads(cleaned_response)
            logger.debug(f"Parsed intent result: {result}")
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini response as JSON: {cleaned_response}, Error: {str(e)}")
            result = {
                "intent": "conversation",
                "operation": None,
                "params": {},
                "description": "Unable to parse the command. Please try rephrasing."
            }

        # Fallback: If Gemini classifies as conversation but files are present, check for operation patterns
        if result["intent"] == "conversation" and file_metadata:
            logger.debug("Entering regex fallback for intent classification")
            message_lower = user_message.lower()
            
            # Check file types
            file_types = [meta["type"].lower() for meta in file_metadata]
            has_pdf = any("application/pdf" in ft for ft in file_types)
            has_docx = any("application/vnd.openxmlformats-officedocument.wordprocessingml.document" in ft for ft in file_types)
            has_ppt = any("application/vnd.openxmlformats-officedocument.presentationml.presentation" in ft or ft.endswith(".ppt") for ft in file_types)
            has_excel = any("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in ft or ft.endswith(".xls") for ft in file_types)
            has_image = any(ft.startswith("image/") for ft in file_types)

            # Regex patterns for operations
            compress_pattern = re.compile(r"(compress|make smaller|reduce)\b.*\b(pdf)?\b.*\b(\d+\s?(kb|mb))", re.IGNORECASE)
            convert_to_pdf_pattern = re.compile(r"(convert|turn|make)\b.*\b(pdf|one pdf)", re.IGNORECASE)
            convert_and_compress_pattern = re.compile(r"(convert|turn|make)\b.*\b(pdf|one pdf).*(compress|make smaller|reduce)\b.*\b(\d+\s?(kb|mb))", re.IGNORECASE)
            convert_from_pdf_pattern = re.compile(r"(convert|turn|make)\b.*\bpdf\b.*\b(to|into)\b.*\b(word|docx|excel|ppt)", re.IGNORECASE)
            convert_image_format_pattern = re.compile(r"(convert|turn|make)\b.*\b(image|photo|picture)?\b.*\b(to|into)\b.*\b(png|jpg|jpeg|gif|bmp)", re.IGNORECASE)
            resize_image_pattern = re.compile(r"(resize|scale)\b.*\b(image|photo|picture)?\b.*\b(\d+\s?(kb|mb)|(\d+x\d+))", re.IGNORECASE)

            # Check for convert_and_compress_images_to_pdf
            if has_image and convert_and_compress_pattern.search(message_lower):
                size_match = re.search(r"(\d+\s?(kb|mb))", message_lower)
                size = size_match.group(0) if size_match else "1MB"
                logger.debug(f"Fallback detected convert_and_compress_images_to_pdf: size={size}")
                return {
                    "intent": "document_operation",
                    "operation": "convert_and_compress_images_to_pdf",
                    "params": {"size": size},
                    "description": f"convert images to PDF and compress to {size}"
                }

            # Check for compress_pdf
            elif has_pdf and compress_pattern.search(message_lower):
                size_match = re.search(r"(\d+\s?(kb|mb))", message_lower)
                size = size_match.group(0) if size_match else "1MB"
                logger.debug(f"Fallback detected compress_pdf: size={size}")
                return {
                    "intent": "document_operation",
                    "operation": "compress_pdf",
                    "params": {"size": size},
                    "description": f"compress the PDF to {size}"
                }

            # Check for images_to_pdf
            elif has_image and convert_to_pdf_pattern.search(message_lower) and not convert_and_compress_pattern.search(message_lower):
                logger.debug("Fallback detected images_to_pdf")
                return {
                    "intent": "document_operation",
                    "operation": "images_to_pdf",
                    "params": {},
                    "description": "convert images to PDF"
                }

            # Check for word_to_pdf, ppt_to_pdf, excel_to_pdf
            elif (has_docx or has_ppt or has_excel) and convert_to_pdf_pattern.search(message_lower):
                if has_docx:
                    logger.debug("Fallback detected word_to_pdf")
                    return {
                        "intent": "document_operation",
                        "operation": "word_to_pdf",
                        "params": {},
                        "description": "convert a Word document to PDF"
                    }
                elif has_ppt:
                    logger.debug("Fallback detected ppt_to_pdf")
                    return {
                        "intent": "document_operation",
                        "operation": "ppt_to_pdf",
                        "params": {},
                        "description": "convert a PowerPoint presentation to PDF"
                    }
                elif has_excel:
                    logger.debug("Fallback detected excel_to_pdf")
                    return {
                        "intent": "document_operation",
                        "operation": "excel_to_pdf",
                        "params": {},
                        "description": "convert an Excel spreadsheet to PDF"
                    }

            # Check for pdf_to_word, pdf_to_excel, pdf_to_ppt
            elif has_pdf and convert_from_pdf_pattern.search(message_lower):
                if "word" in message_lower or "docx" in message_lower:
                    logger.debug("Fallback detected pdf_to_word")
                    return {
                        "intent": "document_operation",
                        "operation": "pdf_to_word",
                        "params": {},
                        "description": "convert a PDF to Word document"
                    }
                elif "excel" in message_lower:
                    logger.debug("Fallback detected pdf_to_excel")
                    return {
                        "intent": "document_operation",
                        "operation": "pdf_to_excel",
                        "params": {},
                        "description": "convert a PDF to Excel spreadsheet"
                    }
                elif "ppt" in message_lower:
                    logger.debug("Fallback detected pdf_to_ppt")
                    return {
                        "intent": "document_operation",
                        "operation": "pdf_to_ppt",
                        "params": {},
                        "description": "convert a PDF to PowerPoint presentation"
                    }

            # Check for convert_image_format
            elif has_image and convert_image_format_pattern.search(message_lower):
                format_match = re.search(r"\b(png|jpg|jpeg|gif|bmp)\b", message_lower)
                format = format_match.group(0).upper() if format_match else "PNG"
                logger.debug(f"Fallback detected convert_image_format: format={format}")
                return {
                    "intent": "document_operation",
                    "operation": "convert_image_format",
                    "params": {"format": format},
                    "description": f"convert an image to {format} format"
                }

            # Check for resize_image
            elif has_image and resize_image_pattern.search(message_lower):
                size_match = re.search(r"(\d+\s?(kb|mb))", message_lower)
                resolution_match = re.search(r"(\d+x\d+)", message_lower)
                params = {}
                if size_match:
                    params["size"] = size_match.group(0)
                if resolution_match:
                    params["resolution"] = resolution_match.group(0)
                logger.debug(f"Fallback detected resize_image: params={params}")
                return {
                    "intent": "document_operation",
                    "operation": "resize_image",
                    "params": params,
                    "description": f"resize an image to {params.get('size', '')} {params.get('resolution', '')}".strip()
                }

        return result

    except Exception as e:
        logger.error(f"Error in parse_intent: {str(e)}")
        return {
            "intent": "conversation",
            "operation": None,
            "params": {},
            "description": f"Error parsing intent: {str(e)}"
        }