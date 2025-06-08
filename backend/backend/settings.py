import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Define Base Directory
BASE_DIR = Path(__file__).resolve().parent.parent

# Get Secret Key from .env
SECRET_KEY = os.getenv("SECRET_KEY", "fallback-secret-key")

# Debug Mode
DEBUG = os.getenv("DEBUG", "True") == "True"

# Allowed Hosts 
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "127.0.0.1,localhost").split(",")


# CORS Configuration
CORS_ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
CSRF_TRUSTED_ORIGINS = os.getenv("CSRF_TRUSTED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_ALL_ORIGINS = False  # Enable only allowed origins
CORS_DEBUG = True

#for celery connection
CELERY_BROKER_URL = 'redis://localhost:6379/0'
CELERY_RESULT_BACKEND = 'redis://localhost:6379/0'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.sites', 
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'operation',
    'corsheaders',
    'rest_framework',
    
    
]

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',  # Django's default
    'allauth.account.auth_backends.AuthenticationBackend',  # allauth backend
]

SITE_ID = 1  # Required for django-allauth
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_USERNAME_REQUIRED = False
ACCOUNT_LOGIN_METHODS = {'email'}
ACCOUNT_EMAIL_VERIFICATION = 'optional'
ACCOUNT_DEFAULT_HTTP_PROTOCOL = 'http'
SOCIALACCOUNT_AUTO_SIGNUP = True
SOCIALACCOUNT_LOGIN_ON_GET = True
ACCOUNT_LOGOUT_ON_GET = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_LOGIN = True
LOGIN_REDIRECT_URL = "/api/check-auth/"
LOGOUT_REDIRECT_URL = "http://localhost:5173/"
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
# Tell allauth to process login immediately on a GET request (bypassing the extra confirmation page)
 

# Google OAuth2 configuration for allauth
SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'APP': {
            'client_id': '764335922653-l21ckf3e8d2933390j6j24rpedei7s59.apps.googleusercontent.com',
            'secret': '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',  # Replace with your actual secret
            'key': ''
        },
        'SCOPE': ['profile', 'email'],  # Request profile info and email
        'AUTH_PARAMS': {
            'access_type': 'online', 
            'prompt': 'select_account' # or 'offline' if you need refresh tokens
        },
        'OAUTH_PKCE_ENABLED': True,
    }
}




# Add logging for allauth
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'loggers': {
        'allauth': {
            'handlers': ['console'],
            'level': 'DEBUG',
        },
    },
}

# Session Settings
SESSION_COOKIE_AGE = 1209600  # 2 weeks
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_SECURE = False
SESSION_COOKIE_SAMESITE = 'None'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_DOMAIN = None
CSRF_COOKIE_SAMESITE = 'None'
CSRF_COOKIE_SECURE = False
CSRF_COOKIE_HTTPONLY = True

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'allauth.account.middleware.AccountMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    }
}

ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.wsgi.application'

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',  
        'NAME': 'assistant',          
        'USER': 'root',         
        'PASSWORD': '12345',     
        'HOST': 'localhost',                   
        'PORT': '3306', 
    }
}




# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = 'static/'

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "backend", "media")  # Updated to match the actual media directory
TEMP_DIR = os.path.join(MEDIA_ROOT, "temp")
PROCESSED_DIR = os.path.join(MEDIA_ROOT, "processed")
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)
DATA_UPLOAD_MAX_NUMBER_FILES = 1000
DEBUG = True
APPEND_SLASH = True

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'