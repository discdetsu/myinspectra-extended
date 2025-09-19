from django.db import models
import uuid


def raw_image_upload_path(instance, filename):
    return f'raw_images/{filename}'


def heatmap_upload_path(instance, filename):
    """Generate upload path for heatmap images"""
    case_id = instance.prediction.case_request.request_id
    disease_slug = instance.prediction.disease_name.lower().replace(' ', '_')
    return f'heatmaps/{case_id}/{disease_slug}_{filename}'


class CXRModel(models.Model):
    """Store information about different AI models"""

    name = models.CharField(max_length=100)
    version = models.CharField(max_length=20)
    description = models.TextField(blank=True)
    model_file_path = models.CharField(max_length=500, help_text="Path to model weights")
    confidence_stat_file_path = models.CharField(max_length=500, help_text="Path to confidence statistics")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['name', 'version']
    
    def __str__(self):
        return f"{self.name} {self.version}"


class CaseRequest(models.Model):
    """Store case request data for X-ray analysis"""

    request_id = models.UUIDField(default=uuid.uuid4, editable=False, db_index=True)
    model_version = models.ForeignKey(CXRModel, on_delete=models.CASCADE)
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


class Prediction(models.Model):
    """Store individual disease prediction data for X-ray analysis"""

    case_request = models.ForeignKey(CaseRequest, on_delete=models.CASCADE, related_name='predictions')
    disease_name = models.CharField(max_length=100, help_text="Disease name from API response")

    # Prediction values from API
    prediction_value = models.FloatField(help_text="Raw prediction value from API")
    balanced_score = models.FloatField(help_text="Balanced score from API")
    thresholded_percentage = models.CharField(max_length=10, help_text="Thresholded percentage (e.g., '80%')")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['case_request', 'disease_name']  # One prediction per disease per case

    def __str__(self):
        return f"{self.case_request.request_id}"


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
