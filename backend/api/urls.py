from django.urls import path
from . import views

urlpatterns = [
    path('api/', views.predict, name='predict'),
]