from django.urls import path
from . import views

urlpatterns = [
    path('test-upload/', views.upload_test, name='upload_test'),
    
    # REST API endpoints
    path('api/cases/', views.api_case_list, name='api_case_list'),
    path('api/cases/<uuid:request_id>/', views.api_case_detail, name='api_case_detail'),
    path('api/upload/', views.api_upload, name='api_upload'),
    
    # V5 Experimental (no DB persistence)
    path('api/v5/predict/', views.api_v5_predict, name='api_v5_predict'),
]