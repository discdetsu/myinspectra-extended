from django.urls import path
from . import views

urlpatterns = [
    path('test-upload/', views.upload_test, name='upload_test'),
]