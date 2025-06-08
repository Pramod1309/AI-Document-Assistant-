import os
import json
import base64
import time
from threading import Thread
import uuid
import mimetypes
from urllib.parse import unquote
import logging
import requests
from io import BytesIO
from celery.result import AsyncResult
from django.http import JsonResponse, FileResponse, StreamingHttpResponse, HttpResponseRedirect
from django.views.decorators.csrf import csrf_exempt
from asgiref.sync import sync_to_async
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.conf import settings
from django.core.cache import cache
from dotenv import load_dotenv
import google.generativeai as genai
from .tasks import (
    convert_and_compress_images_to_pdf,
    convert_parallel_operations,
    images_to_pdf,
    compress_pdf,
    word_to_pdf,
    pdf_to_word,
    ppt_to_pdf,
    excel_to_pdf,
    pdf_to_excel,
    pdf_to_ppt,
    convert_image_format,
    resize_image_task,
)
from .utils import parse_intent
from .models import ChatSession, Message, File
from django.contrib.auth.decorators import login_required
from allauth.socialaccount.models import SocialAccount  # Add this import

# Load environment variables
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash-lite')

# Set up logging
logger = logging.getLogger(__name__)

def api_overview(request):
    return JsonResponse({"message": "Django Backend is Connected!"})

@csrf_exempt
def signup(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            email = data.get("email")
            password = data.get("password")
            confirm_password = data.get("confirm_password")

            if password != confirm_password:
                return JsonResponse({"error": "Passwords do not match"}, status=400)

            if User.objects.filter(email=email).exists():
                return JsonResponse({"error": "User already exists"}, status=400)

            user = User.objects.create_user(username=email, email=email, password=password)
            user.save()
            login(request, user)  # Log in user after signup
            return JsonResponse({"message": "Signup successful!", "email": user.email}, status=201)
        except Exception as e:
            logger.error(f"Error in signup: {str(e)}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Invalid request"}, status=400)

@csrf_exempt
def user_login(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            email = data.get("email")
            password = data.get("password")

            user = authenticate(request, username=email, password=password)
            if user:
                login(request, user)  # Log in user
                # Ensure session is saved
                if not request.session.session_key:
                    request.session.create()
                request.session.modified = True
                logger.info(f"User {email} logged in successfully, session key: {request.session.session_key}")
                return JsonResponse({"message": "Login successful!", "email": user.email}, status=200)
            else:
                return JsonResponse({"error": "Invalid email or password"}, status=400)
        except Exception as e:
            logger.error(f"Error in user_login: {str(e)}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Invalid request"}, status=400)

@csrf_exempt
def check_auth(request):
    if request.method == "GET":
        try:
            if request.user.is_authenticated:
                response_data = {
                    "isAuthenticated": True,
                    "email": request.user.email,
                    "name": request.user.first_name or request.user.email.split('@')[0]
                }
                
                # Add Google profile picture if available
                social_account = SocialAccount.objects.filter(user=request.user).first()
                if social_account:
                    extra_data = social_account.extra_data
                    if 'picture' in extra_data:
                        response_data['picture'] = extra_data['picture']
                
                if not request.session.session_key:
                    request.session.create()
                request.session.modified = True
                
                # Handle frontend redirect if specified
                frontend_redirect = request.GET.get('frontend_redirect')
                if frontend_redirect:
                    return HttpResponseRedirect(frontend_redirect)
                
                return JsonResponse(response_data)
            return JsonResponse({"isAuthenticated": False})
        except Exception as e:
            logger.error(f"Error in check_auth: {str(e)}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Invalid request"}, status=400)

@csrf_exempt
def user_logout(request):
    if request.method == "POST":
        try:
            # Log out the user and clear the session
            logout(request)
            # Clear session data explicitly
            request.session.flush()
            response = JsonResponse({"message": "Logout successful!"}, status=200)
            # Clear authentication cookies
            response.delete_cookie('sessionid')
            response.delete_cookie('csrftoken')
            return response
        except Exception as e:
            logger.error(f"Error in user_logout: {str(e)}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)
    return JsonResponse({"error": "Invalid request"}, status=400)

@csrf_exempt
@login_required
def get_chat_history(request):
    if request.method == "GET":
        try:
            logger.info(f"Fetching chat history for user: {request.user.email}, authenticated: {request.user.is_authenticated}, session key: {request.session.session_key}")
            chats = ChatSession.objects.filter(user=request.user).order_by('-updated_at')
            chat_data = [
                {
                    "id": str(chat.id),
                    "title": chat.title,
                    "timestamp": chat.timestamp.isoformat(),
                    "messages": [
                        {
                            "text": msg.text,
                            "sender": msg.sender,
                            "files": [
                                {
                                    "name": file.name,
                                    "url": file.url,
                                    "type": file.type,
                                    "size": file.size,
                                }
                                for file in msg.files.all()
                            ],
                        }
                        for msg in chat.messages.all()
                    ],
                }
                for chat in chats
            ]
            logger.info(f"Returning {len(chat_data)} chats for user {request.user.email}")
            return JsonResponse({"chats": chat_data}, status=200)
        except Exception as e:
            logger.error(f"Error in get_chat_history: {str(e)}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
@login_required
def get_chat(request, chat_id):
    if request.method == "GET":
        try:
            chat = ChatSession.objects.get(id=chat_id, user=request.user)
            messages = [
                {
                    "text": msg.text,
                    "sender": msg.sender,
                    "files": [
                        {
                            "name": file.name,
                            "url": file.url,
                            "type": file.type,
                            "size": file.size,
                        }
                        for file in msg.files.all()
                    ],
                }
                for msg in chat.messages.all()
            ]
            return JsonResponse({
                "id": str(chat.id),
                "title": chat.title,
                "timestamp": chat.timestamp.isoformat(),
                "messages": messages,
            }, status=200)
        except ChatSession.DoesNotExist:
            return JsonResponse({"error": "Chat not found or not authorized"}, status=404)
        except Exception as e:
            logger.error(f"Error in get_chat: {str(e)}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
@login_required
def save_chat(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            chat_id = data.get("chat_id")
            messages = data.get("messages", [])

            chat_session, created = ChatSession.objects.get_or_create(
                id=chat_id,
                user=request.user,
                defaults={"title": messages[0]["text"][:50] if messages else "Untitled Chat"}
            )

            chat_session.messages.all().delete()

            for msg in messages:
                message = Message.objects.create(
                    chat_session=chat_session,
                    text=msg["text"],
                    sender=msg["sender"],
                )
                for file in msg.get("files", []):
                    File.objects.create(
                        message=message,
                        name=file["name"],
                        url=file.get("url"),
                        type=file["type"],
                        size=file["size"],
                    )

            return JsonResponse({"message": "Chat saved successfully"}, status=200)
        except Exception as e:
            logger.error(f"Error in save_chat: {str(e)}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
@login_required
def rename_chat(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            chat_id = data.get("chat_id")
            title = data.get("title")
            chat = ChatSession.objects.get(id=chat_id, user=request.user)
            chat.title = title
            chat.save()
            return JsonResponse({"message": "Chat renamed successfully"}, status=200)
        except ChatSession.DoesNotExist:
            return JsonResponse({"error": "Chat not found or not authorized"}, status=404)
        except Exception as e:
            logger.error(f"Error in rename_chat: {str(e)}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
@login_required
def delete_chat(request, chat_id):
    if request.method == "DELETE":
        try:
            chat = ChatSession.objects.get(id=chat_id, user=request.user)
            for message in chat.messages.all():
                for file in message.files.all():
                    file_path = os.path.join(settings.PROCESSED_DIR, file.name)
                    if os.path.exists(file_path):
                        os.remove(file_path)
            chat.delete()
            return JsonResponse({"message": "Chat deleted successfully"}, status=200)
        except ChatSession.DoesNotExist:
            return JsonResponse({"error": "Chat not found or not authorized"}, status=404)
        except Exception as e:
            logger.error(f"Error in delete_chat: {str(e)}", exc_info=True)
            return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
def send_message(request):
    if request.method == "POST":
        try:
            # Parse user input
            if request.content_type == 'application/json':
                data = json.loads(request.body)
                user_message = data.get("text", "").strip()
                files = []
            else:
                user_message = request.POST.get("text", "").strip()
                files = request.FILES.getlist("files")

            logger.debug(f"User Message: {user_message}")
            logger.debug(f"Received {len(files)} files")

            print(f"🔹 User Message: {user_message}")
            print(f"🔹 Received {len(files)} files")

            # Initialize conversation history
            conversation_history = request.session.get("conversation_history", [])
            if len(conversation_history) > 10:
                conversation_history = conversation_history[-10:]

            # Save uploaded files
            saved_file_paths = []
            file_metadata = []
            for file in files:
                file_path = os.path.join(settings.TEMP_DIR, file.name)
                logger.debug(f"Saving file to: {file_path}")
                print(f"🔹 Saving file to {file_path}")

                with open(file_path, "wb+") as destination:
                    for chunk in file.chunks():
                        destination.write(chunk)
                saved_file_paths.append(file_path)
                file_metadata.append({
                    "name": file.name,
                    "type": file.content_type,
                    "size": file.size
                })

            # Create or get chat session
            task_id = str(uuid.uuid4())
            if request.user.is_authenticated:
                chat_session, created = ChatSession.objects.get_or_create(
                    id=task_id,
                    user=request.user,
                    defaults={"title": user_message[:50] or "Untitled Chat"}
                )

                # Save user message and files
                user_msg = Message.objects.create(
                    chat_session=chat_session,
                    text=user_message,
                    sender="user",
                )
                for file in file_metadata:
                    File.objects.create(
                        message=user_msg,
                        name=file["name"],
                        type=file["type"],
                        size=file["size"],
                    )

            # Use AI to parse intent
            intent_data = parse_intent(user_message, file_metadata, conversation_history)
            logger.debug(f"Intent data: {intent_data}")

            # Handle document operation if intent is detected
            if intent_data["intent"] == "document_operation":
                logger.info(f"Processing document operation: {intent_data['operation']}")
                processed_dir = settings.PROCESSED_DIR
                os.makedirs(processed_dir, exist_ok=True)

                operation = intent_data["operation"]
                params = intent_data.get("params", {})
                file_paths = saved_file_paths

                if len(file_paths) > settings.DATA_UPLOAD_MAX_NUMBER_FILES:
                    return JsonResponse({"error": f"Too many files uploaded. Maximum allowed is {settings.DATA_UPLOAD_MAX_NUMBER_FILES}."}, status=400)

                task = None
                output_paths = []

                # Validate operation
                supported_operations = [
                    "convert_and_compress_images_to_pdf", "convert_parallel_operations", "images_to_pdf",
                    "compress_pdf", "word_to_pdf", "pdf_to_word", "ppt_to_pdf", "excel_to_pdf",
                    "pdf_to_excel", "pdf_to_ppt", "convert_image_format", "resize_image"
                ]
                if operation not in supported_operations:
                    logger.error(f"Invalid operation requested: {operation}")
                    return JsonResponse({"error": f"Unsupported operation: {operation}"}, status=400)

                if operation == "convert_and_compress_images_to_pdf":
                    desired_size = params.get("size", "1MB")
                    output_pdf_path = os.path.join(processed_dir, f"converted_{task_id}.pdf")
                    compressed_pdf_path = os.path.join(processed_dir, f"compressed_{task_id}.pdf")
                    task = convert_and_compress_images_to_pdf.delay(file_paths, output_pdf_path, compressed_pdf_path, desired_size)
                    request.session['last_compressed_pdf'] = compressed_pdf_path
                    output_paths = [output_pdf_path, compressed_pdf_path]

                elif operation == "convert_parallel_operations":
                    if len(file_paths) != 2:
                        return JsonResponse({"error": "Please upload exactly 2 files for parallel operations."}, status=400)
                    first_op = params.get("first_op", "convert_to_pdf")
                    second_op = params.get("second_op", "resize")
                    first_output = os.path.join(processed_dir, f"{task_id}_first_output.pdf" if first_op == "convert_to_pdf" 
                                          else f"{task_id}_first_output_resized.{os.path.splitext(file_paths[0])[1][1:]}")
                    second_output = os.path.join(processed_dir, f"{task_id}_second_output.pdf" if second_op == "convert_to_pdf" 
                                           else f"{task_id}_second_output_resized.{os.path.splitext(file_paths[1])[1][1:]}")
                    task = convert_parallel_operations.delay(
                        file_paths[0], file_paths[1],
                        first_output, second_output,
                        first_op, second_op, params
                    )
                    output_paths = [first_output, second_output]

                elif operation == "images_to_pdf":
                    if not file_paths:
                        return JsonResponse({"error": "Please upload at least one image file."}, status=400)
                    output_path = os.path.join(processed_dir, f"images_to_pdf_{task_id}.pdf")
                    task = images_to_pdf.delay(file_paths, output_path)
                    output_paths = [output_path]

                elif operation == "compress_pdf":
                    desired_size = params.get("size", "1MB")
                    if params.get("use_last_compressed", False):
                        last_compressed = request.session.get('last_compressed_pdf')
                        if not last_compressed or not os.path.exists(last_compressed):
                            return JsonResponse({"error": "No previous compressed PDF found."}, status=400)
                        input_path = last_compressed
                    else:
                        if len(file_paths) != 1 or not file_paths[0].lower().endswith('.pdf'):
                            return JsonResponse({"error": "Please upload exactly one PDF file."}, status=400)
                        input_path = file_paths[0]
                    output_path = os.path.join(processed_dir, f"compressed_{task_id}.pdf")
                    task = compress_pdf.delay(input_path, output_path, desired_size)
                    request.session['last_compressed_pdf'] = output_path
                    output_paths = [output_path]

                elif operation == "word_to_pdf":
                    if len(file_paths) != 1 or not file_paths[0].lower().endswith('.docx'):
                        return JsonResponse({"error": "Please upload exactly one DOCX file."}, status=400)
                    output_path = os.path.join(processed_dir, f"word_to_pdf_{task_id}.pdf")
                    task = word_to_pdf.delay(file_paths[0], output_path)
                    output_paths = [output_path]

                elif operation == "pdf_to_word":
                    if len(file_paths) != 1 or not file_paths[0].lower().endswith('.pdf'):
                        return JsonResponse({"error": "Please upload exactly one PDF file."}, status=400)
                    output_path = os.path.join(processed_dir, f"pdf_to_word_{task_id}.docx")
                    task = pdf_to_word.delay(file_paths[0], output_path)
                    output_paths = [output_path]

                elif operation == "ppt_to_pdf":
                    if len(file_paths) != 1 or not file_paths[0].lower().endswith(('.ppt', '.pptx')):
                        return JsonResponse({"error": "Please upload exactly one PPT or PPTX file."}, status=400)
                    output_path = os.path.join(processed_dir, f"ppt_to_pdf_{task_id}.pdf")
                    task = ppt_to_pdf.delay(file_paths[0], output_path)
                    output_paths = [output_path]

                elif operation == "excel_to_pdf":
                    if len(file_paths) != 1 or not file_paths[0].lower().endswith(('.xls', '.xlsx')):
                        return JsonResponse({"error": "Please upload exactly one XLS or XLSX file."}, status=400)
                    output_path = os.path.join(processed_dir, f"excel_to_pdf_{task_id}.pdf")
                    task = excel_to_pdf.delay(file_paths[0], output_path)
                    output_paths = [output_path]

                elif operation == "pdf_to_excel":
                    if len(file_paths) != 1 or not file_paths[0].lower().endswith('.pdf'):
                        return JsonResponse({"error": "Please upload exactly one PDF file."}, status=400)
                    output_path = os.path.join(processed_dir, f"pdf_to_excel_{task_id}.xlsx")
                    task = pdf_to_excel.delay(file_paths[0], output_path)
                    output_paths = [output_path]

                elif operation == "pdf_to_ppt":
                    if len(file_paths) != 1 or not file_paths[0].lower().endswith('.pdf'):
                        return JsonResponse({"error": "Please upload exactly one PDF file."}, status=400)
                    output_path = os.path.join(processed_dir, f"pdf_to_ppt_{task_id}.pptx")
                    task = pdf_to_ppt.delay(file_paths[0], output_path)
                    output_paths = [output_path]

                elif operation == "convert_image_format":
                    if len(file_paths) != 1 or not file_paths[0].lower().endswith(('.png', '.jpeg', '.jpg', '.bmp', '.gif')):
                        return JsonResponse({"error": "Please upload exactly one image file (PNG, JPEG, JPG, BMP, or GIF)."}, status=400)
                    format = params.get("format", "JPEG").upper()
                    if format not in ['PNG', 'JPEG', 'JPG', 'BMP', 'GIF']:
                        return JsonResponse({"error": f"Unsupported image format: {format}"}, status=400)
                    output_extension = format.lower()
                    output_path = os.path.join(processed_dir, f"img_to_{output_extension}_{task_id}.{output_extension}")
                    task = convert_image_format.delay(file_paths[0], output_path, format)
                    output_paths = [output_path]

                elif operation == "resize_image":
                    if len(file_paths) != 1 or not file_paths[0].lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.gif')):
                        return JsonResponse({"error": "Please upload exactly one image file (JPG, JPEG, PNG, BMP, or GIF)."}, status=400)
                    output_path = os.path.join(processed_dir, f"resized_image_{task_id}.{os.path.splitext(file_paths[0])[1][1:]}")
                    task = resize_image_task.delay(file_paths[0], output_path, params)
                    output_paths = [output_path]

                # Store operation context for suggestions
                request.session['last_operation'] = {
                    'operation': operation,
                    'params': params,
                    'output_paths': output_paths
                }
                request.session.modified = True

                # Add operation to conversation history
                conversation_history.append({
                    "role": "user",
                    "parts": [{"text": user_message}] + [
                        {"text": f"Uploaded file: {meta['name']}"} for meta in file_metadata
                    ]
                })
                conversation_history.append({
                    "role": "assistant",
                    "parts": [{"text": f"I've understood your request to {intent_data['description']}. Processing your files now..."}]
                })
                request.session["conversation_history"] = conversation_history
                request.session.modified = True

                # Wait for task completion and generate natural response
                task_result = task.get(timeout=300)  # Increased timeout for robustness
                files_info = []

                # Handle task result based on operation
                if operation == "convert_and_compress_images_to_pdf" and "converted" in task_result and "compressed" in task_result:
                    files_info = [
                        {
                            "name": os.path.basename(task_result["converted"]),
                            "url": f"/api/download/{os.path.basename(task_result['converted'])}",
                            "size": os.path.getsize(task_result["converted"]),
                            "type": "application/pdf",
                            "previewable": True
                        },
                        {
                            "name": os.path.basename(task_result["compressed"]),
                            "url": f"/api/download/{os.path.basename(task_result['compressed'])}",
                            "size": os.path.getsize(task_result["compressed"]),
                            "type": "application/pdf",
                            "previewable": True
                        }
                    ]
                elif operation == "convert_parallel_operations" and "first_output" in task_result and "second_output" in task_result:
                    files_info = [
                        {
                            "name": os.path.basename(task_result["first_output"]),
                            "url": f"/api/download/{os.path.basename(task_result['first_output'])}",
                            "size": os.path.getsize(task_result["first_output"]),
                            "type": mimetypes.guess_type(task_result["first_output"])[0] or "application/octet-stream",
                            "previewable": task_result["first_output"].lower().endswith(('.pdf', '.jpg', '.jpeg', '.png'))
                        },
                        {
                            "name": os.path.basename(task_result["second_output"]),
                            "url": f"/api/download/{os.path.basename(task_result['second_output'])}",
                            "size": os.path.getsize(task_result["second_output"]),
                            "type": mimetypes.guess_type(task_result["second_output"])[0] or "application/octet-stream",
                            "previewable": task_result["second_output"].lower().endswith(('.pdf', '.jpg', '.jpeg', '.png'))
                        }
                    ]
                elif "output" in task_result:  # Handles all single-output operations
                    file_ext = os.path.splitext(task_result["output"])[1].lower()
                    previewable = file_ext in ['.pdf', '.jpg', '.jpeg', '.png']
                    files_info = [{
                        "name": os.path.basename(task_result["output"]),
                        "url": f"/api/download/{os.path.basename(task_result['output'])}",
                        "size": os.path.getsize(task_result["output"]),
                        "type": mimetypes.guess_type(task_result["output"])[0] or "application/octet-stream",
                        "previewable": previewable
                    }]

                # Generate natural response
                chat = model.start_chat(history=conversation_history)
                response_prompt = f"""
The user requested to {intent_data['description']}. The task has completed successfully. 
The output files are: {json.dumps(files_info, indent=2)}.
Generate a natural, friendly response that informs the user of the successful operation, mentions the output files with their sizes and download links, and suggests a next step (e.g., compressing further, converting to another format, or editing the file).
Do not include any markdown or code blocks.
"""
                response = chat.send_message(response_prompt)
                natural_response = response.text.strip()
                logger.debug(f"Natural response: {natural_response}")

                # Save assistant response if authenticated
                if request.user.is_authenticated:
                    assistant_msg = Message.objects.create(
                        chat_session=chat_session,
                        text=natural_response,
                        sender="assistant",
                    )
                    for file_info in files_info:
                        File.objects.create(
                            message=assistant_msg,
                            name=file_info["name"],
                            url=file_info["url"],
                            type=file_info["type"],
                            size=file_info["size"],
                        )

                # Update conversation history
                conversation_history.append({
                    "role": "assistant",
                    "parts": [{"text": natural_response}],
                    "metadata": {
                        "files": files_info,
                        "operation": operation
                    }
                })
                request.session["conversation_history"] = conversation_history
                request.session.modified = True

                # Store response in cache for streaming
                cache.set(f"stream_{task_id}", {
                    "chunks": [natural_response],
                    "full_text": natural_response,
                    "done": True,
                    "error": None
                }, timeout=300)

                # Return response with file info
                return JsonResponse({
                    "task_id": task_id,
                    "message": natural_response,
                    "files": files_info,
                    "type": "document_response",
                    "operation": operation
                })

            # Handle natural conversation
            else:
                logger.warning(f"No document operation detected, falling back to conversation: {intent_data}")
                # Add user message and files to history
                if user_message:
                    conversation_history.append({
                        "role": "user",
                        "parts": [{"text": user_message}]
                    })
                for meta in file_metadata:
                    if meta['type'].startswith('image/'):
                        with open(os.path.join(settings.TEMP_DIR, meta['name']), "rb") as img_file:
                            img_data = base64.b64encode(img_file.read()).decode('utf-8')
                            conversation_history.append({
                                "role": "user",
                                "parts": [
                                    {"text": f"Uploaded image: {meta['name']}"},
                                    {
                                        "inline_data": {
                                            "mime_type": meta['type'],
                                            "data": img_data
                                        }
                                    }
                                ]
                            })
                    else:
                        conversation_history.append({
                            "role": "user",
                            "parts": [{"text": f"Uploaded file: {meta['name']}"}]
                        })

                # Prepare Gemini history
                gemini_history = []
                for msg in conversation_history:
                    if msg["role"] == "user":
                        gemini_history.append({
                            "role": "user",
                            "parts": [{"text": msg["parts"][0]["text"]}]
                        })
                    elif msg["role"] == "assistant":
                        gemini_history.append({
                            "role": "model",
                            "parts": [{"text": msg["parts"][0]["text"]}]
                        })

                # Start chat with history
                chat = model.start_chat(history=gemini_history)

                # Prepare current message
                current_message = []
                if user_message:
                    current_message.append({"text": user_message})
                for meta in file_metadata:
                    if meta['type'].startswith('image/'):
                        with open(os.path.join(settings.TEMP_DIR, meta['name']), "rb") as img_file:
                            img_data = base64.b64encode(img_file.read()).decode('utf-8')
                            current_message.append({
                                "inline_data": {
                                    "mime_type": meta["type"],
                                    "data": img_data
                                }
                            })
                    else:
                       current_message.append({"text": f"Uploaded file: {meta['name']}"})

                # Generate task ID
                cache.set(f"stream_{task_id}", {"chunks": [], "full_text": "", "done": False, "error": None}, timeout=300)

                def generate_response():
                    try:
                        # Include context from last operation for suggestions
                        last_operation = request.session.get('last_operation', {})
                        suggestion_prompt = ""
                        if last_operation:
                            operation = last_operation.get('operation')
                            if operation == "convert_and_compress_images_to_pdf":
                                suggestion_prompt = "The user recently converted images to a compressed PDF. Suggest compressing it further or converting it to Word."
                            elif operation == "word_to_pdf":
                                suggestion_prompt = "The user converted a Word document to PDF. Suggest compressing the PDF or converting it back to Word for editing."
                            elif operation == "compress_pdf":
                                suggestion_prompt = "The user compressed a PDF. Suggest re-compressing to a smaller size or converting to another format like Word."
                            elif operation == "images_to_pdf":
                                suggestion_prompt = "The user converted images to a PDF. Suggest compressing the PDF or adding more images."
                            elif operation == "pdf_to_word":
                                suggestion_prompt = "The user converted a PDF to Word. Suggest editing the Word file or converting it back to PDF."
                            elif operation == "ppt_to_pdf":
                                suggestion_prompt = "The user converted a PowerPoint to PDF. Suggest compressing the PDF or converting to another format."
                            elif operation == "excel_to_pdf":
                                suggestion_prompt = "The user converted an Excel file to PDF. Suggest extracting data to Excel or compressing the PDF."
                            elif operation == "pdf_to_excel":
                                suggestion_prompt = "The user converted a PDF to Excel. Suggest editing the Excel file or converting back to PDF."
                            elif operation == "pdf_to_ppt":
                                suggestion_prompt = "The user converted a PDF to PowerPoint. Suggest editing the presentation or converting to PDF."
                            elif operation == "convert_image_format":
                                suggestion_prompt = "The user converted an image format. Suggest resizing the image or converting to another format."
                            elif operation == "resize_image":
                                suggestion_prompt = "The user resized an image. Suggest converting to another format or resizing again."
                            elif operation == "convert_parallel_operations":
                                suggestion_prompt = "The user performed parallel operations on files. Suggest additional operations like compression or conversion."
                            suggestion_prompt += " Provide a natural response and include a suggestion for the next task."

                        response = chat.send_message(
                            current_message + [{"text": suggestion_prompt}],
                            generation_config={
                                "temperature": 0.7,
                                "max_output_tokens": 8192,
                            }
                        )
                        full_text = response.text.strip()
                        logger.debug(f"Assistant response: {full_text}")
                        print(f"🔹 Assistant: {full_text}")

                        # Save assistant response if authenticated
                        if request.user.is_authenticated:
                            assistant_msg = Message.objects.create(
                                chat_session=chat_session,
                                text=full_text,
                                sender="assistant",
                            )
                            for meta in file_metadata:
                                File.objects.create(
                                    message=assistant_msg,
                                    name=meta["name"],
                                    type=meta["type"],
                                    size=meta["size"],
                                )

                        words = full_text.split(" ")
                        chunks = []
                        for i in range(0, len(words), 5):
                            chunk = " ".join(words[i:i+5])
                            chunks.append(chunk)
                            cache.set(f"stream_{task_id}", {
                                "chunks": chunks,
                                "full_text": full_text,
                                "done": False,
                                "error": None
                            }, timeout=300)
                            time.sleep(0.1)
                        cache.set(f"stream_{task_id}", {
                            "chunks": chunks,
                            "full_text": full_text,
                            "done": True,
                            "error": None
                        }, timeout=300)

                        # Save assistant response
                        conversation_history.append({
                            "role": "assistant",
                            "parts": [{"text": full_text}]
                        })
                        request.session["conversation_history"] = conversation_history
                        request.session.modified = True

                    except Exception as e:
                        logger.error(f"Error generating response: {str(e)}")
                        cache.set(f"stream_{task_id}", {
                            "chunks": [],
                            "full_text": "",
                            "done": True,
                            "error": str(e)
                        }, timeout=300)

                # Start generation in a thread
                Thread(target=generate_response).start()

                return JsonResponse({"task_id": task_id})

        except Exception as e:
            logger.error(f"Error in send_message: {str(e)}", exc_info=True)
            return JsonResponse({"error": f"Failed to process request: {str(e)}"}, status=500)
    return JsonResponse({"error": "Invalid request"}, status=400)

@sync_to_async
def send_message_async(request):
    return send_message(request)

@csrf_exempt
def stream_response(request, task_id):
    def stream():
        while True:
            data = cache.get(f"stream_{task_id}")
            if not data:
                yield f"data: {json.dumps({'error': 'Task not found'})}\n\n"
                break
            if data.get("error"):
                yield f"data: {json.dumps({'error': data['error']})}\n\n"
                break
            for chunk in data["chunks"]:
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            if data["done"]:
                yield f"data: {json.dumps({'done': True, 'full_text': data['full_text']})}\n\n"
                break
            time.sleep(0.1)
    return StreamingHttpResponse(stream(), content_type="text/event-stream")

@csrf_exempt
def task_status(request, task_id):
    try:
        task = AsyncResult(task_id)
        if task.ready():
            if task.successful():
                result = task.result
                files = []
                if "converted" in result and "compressed" in result:
                    files = [
                        {
                            "name": os.path.basename(result["converted"]),
                            "url": f"/api/download/{os.path.basename(result['converted'])}",
                            "size": os.path.getsize(result["converted"]),
                            "type": "application/pdf"
                        },
                        {
                            "name": os.path.basename(result["compressed"]),
                            "url": f"/api/download/{os.path.basename(result['compressed'])}",
                            "size": os.path.getsize(result["compressed"]),
                            "type": "application/pdf"
                        },
                    ]
                elif "first_output" in result and "second_output" in result:
                    files = [
                        {
                            "name": os.path.basename(result["first_output"]),
                            "url": f"/api/download/{os.path.basename(result['first_output'])}",
                            "size": os.path.getsize(result["first_output"]),
                            "type": mimetypes.guess_type(result["first_output"])[0] or "application/octet-stream"
                        },
                        {
                            "name": os.path.basename(result["second_output"]),
                            "url": f"/api/download/{os.path.basename(result['second_output'])}",
                            "size": os.path.getsize(result["second_output"]),
                            "type": mimetypes.guess_type(result["second_output"])[0] or "application/octet-stream"
                        },
                    ]
                elif "output" in result:
                    files = [
                        {
                            "name": os.path.basename(result["output"]),
                            "url": f"/api/download/{os.path.basename(result['output'])}",
                            "size": os.path.getsize(result["output"]),
                            "type": mimetypes.guess_type(result["output"])[0] or "application/octet-stream"
                        }
                    ]
                return JsonResponse({"status": "SUCCESS", "files": files})
            else:
                return JsonResponse({"status": "FAILURE", "error": str(task.result)})
        return JsonResponse({"status": "PENDING"})
    except Exception as e:
        logger.error(f"Error in task_status: {str(e)}", exc_info=True)
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
def download_file(request, file_path):
    try:
        safe_file_path = unquote(os.path.basename(file_path))
        full_path = os.path.join(settings.PROCESSED_DIR, safe_file_path)

        logger.info(f"Download request for: {safe_file_path}")

        if not os.path.exists(full_path):
            logger.error(f"File not found: {full_path}")
            return JsonResponse({"error": "File not found"}, status=404)

        file_size = os.path.getsize(full_path)
        if file_size == 0:
            logger.error(f"File is empty: {full_path}")
            return JsonResponse({"error": "File is empty"}, status=500)

        content_type, _ = mimetypes.guess_type(full_path)
        if not content_type:
            content_type = 'application/pdf' if full_path.lower().endswith('.pdf') else 'image/jpeg'

        logger.info(f"Serving file: {safe_file_path}, Size: {file_size} bytes, Content-Type: {content_type}")

        file = open(full_path, 'rb')
        response = FileResponse(
            file,
            as_attachment=True,
            filename=safe_file_path,
            content_type=content_type
        )
        response['Content-Length'] = file_size
        response['Content-Disposition'] = f'attachment; filename="{safe_file_path}"'
        return response

    except Exception as e:
        logger.error(f"Error downloading file {safe_file_path}: {str(e)}", exc_info=True)
        return JsonResponse({"error": f"Download failed: {str(e)}"}, status=500)