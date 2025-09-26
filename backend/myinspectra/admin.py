from django.contrib import admin
from .models import CXRModel, RawImage, CaseRequest, Prediction, Heatmap, Segment  

# Configure admin site headers and titles
admin.site.site_header = "MyInspectra Admin"
admin.site.site_title = "MyInspectra Admin Portal"
admin.site.index_title = "Welcome to MyInspectra Administration"


# Define inline classes first (before they're used)
class PredictionInline(admin.TabularInline):
    model = Prediction
    extra = 0
    readonly_fields = ['created_at', 'updated_at']


class HeatmapInline(admin.StackedInline):
    model = Heatmap
    extra = 0
    readonly_fields = ['created_at', 'updated_at', 'width', 'height', 'file_size', 'heatmap_url']

    def heatmap_url(self, obj):
        if obj.heatmap_image:
            return obj.heatmap_image.url
        return "No heatmap"
    heatmap_url.short_description = 'Heatmap URL'


@admin.register(CXRModel)
class CXRModelAdmin(admin.ModelAdmin):
    list_display = ['name', 'version', 'is_active', 'created_at']
    list_filter = ['is_active', 'version']
    search_fields = ['name', 'version']


@admin.register(CaseRequest)
class CaseRequestAdmin(admin.ModelAdmin):
    list_display = ['request_id', 'model_version', 'created_at', 'is_image_uploaded', 'is_prediction_generated', 'is_success_response']
    list_filter = ['model_version', 'created_at']
    search_fields = ['request_id']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [PredictionInline]

    def is_image_uploaded(self, obj):
        return obj.success_upload
    is_image_uploaded.boolean = True
    is_image_uploaded.short_description = 'Image Uploaded'

    def is_prediction_generated(self, obj):
        return obj.success_process
    is_prediction_generated.boolean = True
    is_prediction_generated.short_description = 'Prediction Generated'

    def is_success_response(self, obj):
        return obj.success_response
    is_success_response.boolean = True
    is_success_response.short_description = 'Success Response'


@admin.register(RawImage)
class RawImageAdmin(admin.ModelAdmin):
    list_display = ['case_request', 'image', 'original_filename', 'width', 'height', 'file_size', 'created_at']
    list_filter = ['content_type', 'created_at']
    search_fields = ['case_request__request_id', 'original_filename']
    readonly_fields = ['created_at', 'updated_at', 'image_url']

    def image_url(self, obj):
        if obj.image:
            return obj.image.url
        return "No image"
    image_url.short_description = 'Image URL'


@admin.register(Prediction)
class PredictionAdmin(admin.ModelAdmin):
    list_display = ['case_request', 'disease_name', 'prediction_value', 'balanced_score', 'thresholded_percentage', 'created_at']
    list_filter = ['disease_name', 'created_at', 'case_request__model_version']
    search_fields = ['case_request__request_id', 'disease_name']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [HeatmapInline]


@admin.register(Heatmap)
class HeatmapAdmin(admin.ModelAdmin):
    list_display = ['prediction', 'heatmap_image','get_disease_name', 'get_case_request', 'width', 'height', 'file_size', 'created_at']
    list_filter = ['prediction__disease_name', 'created_at']
    search_fields = ['prediction__case_request__request_id', 'prediction__disease_name']
    readonly_fields = ['created_at', 'updated_at', 'heatmap_url']

    def get_disease_name(self, obj):
        return obj.prediction.disease_name
    get_disease_name.short_description = 'Disease'
    get_disease_name.admin_order_field = 'prediction__disease_name'

    def get_case_request(self, obj):
        return obj.prediction.case_request.request_id
    get_case_request.short_description = 'Case Request'
    get_case_request.admin_order_field = 'prediction__case_request__request_id'

    def heatmap_url(self, obj):
        if obj.heatmap_image:
            return obj.heatmap_image.url
        return "No heatmap"
    heatmap_url.short_description = 'Heatmap URL'

@admin.register(Segment)
class SegmentAdmin(admin.ModelAdmin):
    list_display = ['case_request', 'segment_image', 'class_name', 'width', 'height', 'file_size', 'created_at']
    list_filter = ['class_name', 'created_at', 'case_request__model_version']
    search_fields = ['case_request__request_id', 'class_name']
    readonly_fields = ['created_at', 'updated_at', 'segment_image_url']

    def segment_image_url(self, obj):
        if obj.segment_image:
            return obj.segment_image.url
        return "No segment image"
    segment_image_url.short_description = 'Segment Image URL'
