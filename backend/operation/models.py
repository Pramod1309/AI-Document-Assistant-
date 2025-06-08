from django.db import models
from django.contrib.auth.models import User
import uuid

class ChatSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="chat_sessions")
    title = models.CharField(max_length=255, blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

class Message(models.Model):
    chat_session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name="messages")
    text = models.TextField()
    sender = models.CharField(max_length=20, choices=[('user', 'User'), ('assistant', 'Assistant')])
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']

class File(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name="files")
    name = models.CharField(max_length=255)
    url = models.CharField(max_length=512, blank=True, null=True)
    type = models.CharField(max_length=100)
    size = models.BigIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)