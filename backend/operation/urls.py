from django.urls import path,include
from . import views

urlpatterns = [
    path('', views.api_overview, name="api-overview"),
    path('send-message/', views.send_message, name="send-message"),
    path('stream-response/<str:task_id>/', views.stream_response, name='stream_response'),
    path("signup/", views.signup, name="signup"),
    path("login/", views.user_login, name="login"),
    path('check-auth/', views.check_auth, name="check-auth"),
    path("logout/", views.user_logout, name="logout"),
    path('task-status/<str:task_id>/', views.task_status, name="task-status"),
    path('chat-history/', views.get_chat_history, name="chat-history"),
    path('chat/<str:chat_id>/', views.get_chat, name="get_chat"),
    path('save-chat/', views.save_chat, name="save-chat"),
    path('rename-chat/', views.rename_chat, name="rename-chat"),
    path('delete-chat/<str:chat_id>/', views.delete_chat, name="delete-chat"),
    path('accounts/', include('allauth.urls')),
]
