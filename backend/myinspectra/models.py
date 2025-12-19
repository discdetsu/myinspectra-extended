from django.db import models
import uuid


def raw_image_upload_path(instance, filename):
    return f'raw_images/{filename}'


def heatmap_upload_path(instance, filename):
    """Generate upload path for heatmap images"""
    case_id = instance.prediction.case_request.request_id
    disease_slug = instance.prediction.disease_name.lower().replace(' ', '_')
    return f'heatmaps/{case_id}/{disease_slug}_{filename}'

def segment_upload_path(instance, filename):
    """Generate upload path for segment images"""
    case_id = instance.case_request.request_id
    disease_slug = instance.class_name.lower().replace(' ', '_')
    return f'segments/{case_id}/{disease_slug}_{filename}'



def overlay_heatmap_upload_path(instance, filename):
    """Generate upload path for overlay heatmap images"""
    case_id = instance.case_request.request_id
    return f'overlay_heatmaps/{case_id}/{filename}'


def dicom_upload_path(instance, filename):
    """Generate upload path for dicom files"""
    case_id = instance.case_request.request_id
    return f'dicom/{case_id}/{filename}'


class CXRModel(models.Model):
    """Store information about different AI models"""

    SERVICE_CHOICES = [
        ('abnormality', 'Abnormality'),
        ('tuberculosis', 'Tuberculosis'),
        ('pneumothorax', 'Pneumothorax'),
        ('lung_segmentation', 'Lung Segmentation'),
        ('pleural_effusion_segmentation', 'Pleural Effusion Segmentation'),
        ('pneumothorax_segmentation', 'Pneumothorax Segmentation'),
    ]

    name = models.CharField(max_length=100)
    version = models.CharField(max_length=20)
    service_type = models.CharField(max_length=50, choices=SERVICE_CHOICES, default='abnormality')
    api_url = models.URLField(max_length=200, help_text="Full API URL e.g., http://0.0.0.0:50000/predict", default="http://0.0.0.0:50000/predict")
    description = models.TextField(blank=True)
    model_file_path = models.CharField(max_length=500, help_text="Path to model weights", blank=True)
    confidence_stat_file_path = models.CharField(max_length=500, help_text="Path to confidence statistics", blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['name', 'version', 'service_type']
    
    def __str__(self):
        return f"{self.get_service_type_display()} - {self.name} ({self.version})"


class PredictionProfile(models.Model):
    """Group a set of models to be used for a prediction request"""
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    cxr_models = models.ManyToManyField(CXRModel, related_name='profiles')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class CaseRequest(models.Model):
    """Store case request data for X-ray analysis"""

    request_id = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True)
    # profile field removed
    model_version = models.ForeignKey(CXRModel, on_delete=models.SET_NULL, null=True, blank=True, help_text="Legacy field")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    success_upload = models.BooleanField(default=False, help_text="Indicates whether the image was uploaded successfully")
    success_process = models.BooleanField(default=False, help_text="Indicates whether the image was predicted successfully")
    success_response = models.BooleanField(default=False, help_text="Indicates whether the response was received successfully")

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return str(self.request_id)


class RawImage(models.Model):
    """Store raw X-ray images with metadata"""

    case_request = models.ForeignKey(CaseRequest, on_delete=models.CASCADE)
    image = models.ImageField(upload_to=raw_image_upload_path, editable=False)

    # Image metadata
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True, help_text="Size in bytes")

    # Additional metadata
    original_filename = models.CharField(max_length=255, blank=True)
    content_type = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return str(self.case_request.request_id)


class DicomFile(models.Model):
    """Store uploaded DICOM files"""
    case_request = models.ForeignKey(CaseRequest, on_delete=models.CASCADE, related_name='dicom_files')
    file = models.FileField(upload_to=dicom_upload_path)
    
    # Metadata
    original_filename = models.CharField(max_length=255, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"DICOM - {self.case_request.request_id}"


class Prediction(models.Model):
    """Store individual disease prediction data for X-ray analysis"""

    case_request = models.ForeignKey(CaseRequest, on_delete=models.CASCADE, related_name='predictions')
    disease_name = models.CharField(max_length=100, help_text="Disease name from API response")
    model_version = models.CharField(max_length=20, default='v3.5.1')

    # Prediction values from API
    prediction_value = models.FloatField(help_text="Raw prediction value from API")
    balanced_score = models.FloatField(help_text="Balanced score from API")
    thresholded_percentage = models.CharField(max_length=10, help_text="Thresholded percentage (e.g., '80%')")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['case_request', 'disease_name', 'model_version']

    def __str__(self):
        return f"{self.case_request.request_id} - {self.disease_name} ({self.model_version})"


class Heatmap(models.Model):
    """Store heatmap images for disease predictions"""

    prediction = models.OneToOneField(Prediction, on_delete=models.CASCADE, related_name='heatmap')
    heatmap_image = models.ImageField(upload_to=heatmap_upload_path)

    # Image metadata
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True, help_text="Size in bytes")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.prediction.case_request.request_id}"


class Segment(models.Model):
    """Store segment images for UNet models"""
    case_request = models.ForeignKey(CaseRequest, on_delete=models.CASCADE, related_name='segments')
    class_name = models.CharField(max_length=100)
    model_version = models.CharField(max_length=20, default='v3.5.1')
    segment_image = models.ImageField(upload_to=segment_upload_path)

    # Image metadata
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True, help_text="Size in bytes")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.case_request.request_id} - {self.class_name} ({self.model_version})"


class OverlayHeatmap(models.Model):
    """Store overlay heatmap images (aggregated from heatmaps and segments)"""
    case_request = models.ForeignKey(CaseRequest, on_delete=models.CASCADE, related_name='overlay_heatmaps')
    version = models.CharField(max_length=20, default='v3.5.1')
    overlay_image = models.ImageField(upload_to=overlay_heatmap_upload_path)
    
    # Image metadata
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    file_size = models.BigIntegerField(null=True, blank=True, help_text="Size in bytes")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['case_request', 'version']

    def __str__(self):
        return f"{self.case_request.request_id} - {self.version}"

