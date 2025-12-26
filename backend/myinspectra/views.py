from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
from django.core.files.base import ContentFile
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.core.paginator import Paginator
import json
import io
import concurrent.futures
from .models import RawImage, CaseRequest, CXRModel, Prediction, Heatmap, Segment, OverlayHeatmap, PredictionProfile, DicomFile, ProcessedHeatmap
from .heatmap_orchestrate.main import HeatmapOverlayProcessor
from .heatmap_orchestrate.config import HeatmapConfig, InspectraImageOverlayConfig
from .utils import TempFileManager, convert_dicom_to_image
import os
import requests
import base64
import tempfile
from PIL import Image

import logging

logger = logging.getLogger(__name__)

# =============================================================================
# Constants and Helpers
# =============================================================================

# File upload validation
ALLOWED_IMAGE_TYPES = {'image/png', 'image/jpeg', 'image/jpg'}
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.dcm'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

def api_error_response(message: str, status: int = 400, details: dict = None) -> JsonResponse:
    """Standardized error response for API endpoints."""
    response_data = {'error': message}
    if details:
        response_data['details'] = details
    return JsonResponse(response_data, status=status)

def validate_uploaded_file(file) -> tuple[bool, str]:
    """Validate uploaded file. Returns (is_valid, error_message)."""
    if not file:
        return False, "No file provided"
    
    # Check file size
    if file.size > MAX_FILE_SIZE:
        return False, f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB"
    
    # Check extension
    ext = os.path.splitext(file.name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
    
    return True, ""

def call_prediction_api(url, file_data, filename, content_type, data):
    files = {'file': (filename, file_data, content_type)}
    try:
        response = requests.post(url, files=files, data=data, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Error calling {url}: {e}")
        return {'error': str(e)}

def save_heatmap(prediction, heatmap_b64, model_version='v4.5.0'):
    if not heatmap_b64:
        return
    try:
        heatmap_data = base64.b64decode(heatmap_b64)
        heatmap_image = Image.open(io.BytesIO(heatmap_data))
        
        img_buffer = io.BytesIO()
        heatmap_image.save(img_buffer, format='PNG')
        img_buffer.seek(0)
        
        heatmap, _ = Heatmap.objects.update_or_create(
            prediction=prediction,
            defaults={
                'width': heatmap_image.width,
                'height': heatmap_image.height,
                'file_size': len(heatmap_data),
            }
        )
        # Include version as subdirectory to prevent overwriting
        filename = f"heatmaps/{model_version}/heatmap.png"
        heatmap.heatmap_image.save(filename, ContentFile(img_buffer.getvalue()), save=True)
    except Exception as e:
        logger.error(f"Error saving heatmap: {e}")

def process_prediction_result(case_request, result_data, model_version):
    if not result_data:
        return
    for disease, values in result_data.items():
        prediction, _ = Prediction.objects.update_or_create(
            case_request=case_request,
            disease_name=disease,
            model_version=model_version,
            defaults={
                'prediction_value': values.get('prediction', 0.0),
                'balanced_score': values.get('balanced_score', 0.0),
                'thresholded_percentage': values.get('thresholded', '0%'),
            }
        )
        save_heatmap(prediction, values.get('heatmap', ''), model_version)

def process_segmentation_result(case_request, result_data, model_version):
    if not result_data or 'heatmap' not in result_data:
        return

    for class_name, segment_b64 in result_data['heatmap'].items():
        if not segment_b64:
            continue
        try:
            segment_data = base64.b64decode(segment_b64)
            segment_image = Image.open(io.BytesIO(segment_data))
            
            img_buffer = io.BytesIO()
            segment_image.save(img_buffer, format='PNG')
            img_buffer.seek(0)
            
            segment, _ = Segment.objects.update_or_create(
                case_request=case_request,
                class_name=class_name,
                model_version=model_version,
                defaults={
                    'width': segment_image.width,
                    'height': segment_image.height,
                    'file_size': len(segment_data),
                }
            )
            # Include version as subdirectory to prevent overwriting
            safe_class_name = class_name.replace(' ', '_').lower()
            filename = f"segments/{model_version}/{safe_class_name}_segment.png"
            segment.segment_image.save(filename, ContentFile(img_buffer.getvalue()), save=True)
        except Exception as e:
            logger.error(f"Error saving segment for {class_name}: {e}")

        


def process_profile_workflow(case_request, profile, raw_image, file_data, filename, content_type):
    """
    Helper function to process a single profile:
    1. Call APIs
    2. Save Predictions/Segments
    3. Generate Overlay
    4. Save OverlayHeatmap with version
    
    Returns: (success, errors)
    """
    logger.info(f"Processing profile: {profile.name}")
    errors = []
    
    # Determine version for config and DB
    version_key = "v3.5.1"
    if "v4.5.0" in profile.name:
        version_key = "v4.5.0"

    # 1. Call APIs
    urls = {}
    for model in profile.cxr_models.filter(is_active=True):
        urls[model.service_type] = model.api_url

    data = {'request_id': str(case_request.request_id)}
    
    results = {}
    with concurrent.futures.ThreadPoolExecutor() as executor:
        future_to_url = {
            executor.submit(
                call_prediction_api, 
                url, 
                file_data, 
                filename, 
                content_type, 
                data
            ): name 
            for name, url in urls.items()
        }
        
        for future in concurrent.futures.as_completed(future_to_url):
            name = future_to_url[future]
            try:
                res = future.result()
                if isinstance(res, dict) and 'error' in res:
                     msg = f"API Error [{name}]: {res['error']}"
                     logger.error(msg)
                     errors.append(msg)
                else:
                    results[name] = res
            except Exception as exc:
                msg = f"Exception calling {name}: {exc}"
                logger.error(msg)
                errors.append(msg)

    # 2. Process results (Saves to DB with version)
    try:
        if 'result' in results.get('abnormality', {}):
            process_prediction_result(case_request, results['abnormality']['result'], version_key)
        
        if 'result' in results.get('tuberculosis', {}):
            process_prediction_result(case_request, results['tuberculosis']['result'], version_key)
            
        if 'result' in results.get('pneumothorax', {}):
            process_prediction_result(case_request, results['pneumothorax']['result'], version_key)
        
        if 'result' in results.get('lung_segmentation', {}):
            process_segmentation_result(case_request, results['lung_segmentation']['result'], version_key)
            
        if 'result' in results.get('pleural_effusion_segmentation', {}):
            process_segmentation_result(case_request, results['pleural_effusion_segmentation']['result'], version_key)
            
        if 'result' in results.get('pneumothorax_segmentation', {}):
            process_segmentation_result(case_request, results['pneumothorax_segmentation']['result'], version_key)
    except Exception as e:
        msg = f"Error processing results for {version_key}: {e}"
        logger.error(msg)
        errors.append(msg)


    # 3. Heatmap orchestration (Overlay)
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        
        if version_key == "v4.5.0":
            config_path = os.path.join(current_dir, 'heatmap_orchestrate', 'configs', 'config_v4.yml')
            overlay_config_path = os.path.join(current_dir, 'heatmap_orchestrate', 'configs', 'overlay_config_v4.yml')
        else:
            config_path = os.path.join(current_dir, 'heatmap_orchestrate', 'configs', 'config.yml')
            overlay_config_path = os.path.join(current_dir, 'heatmap_orchestrate', 'configs', 'overlay_config.yml')

        custom_config = HeatmapConfig(config_path)
        custom_overlay_config = InspectraImageOverlayConfig(overlay_config_path)
        processor = HeatmapOverlayProcessor(config=custom_config, overlay_config=custom_overlay_config)

        temp_manager = TempFileManager()

        try:
            heatmap_paths = {}
            confidence_scores = {}
            heatmap_settings = {}

            # Collect heatmaps and scores from Predictions (filtered by version)
            predictions = Prediction.objects.filter(case_request=case_request, model_version=version_key)
            
            low_threshold_diseases = set()
            for pred in predictions:
                if pred.thresholded_percentage == 'Low':
                    low_threshold_diseases.add(pred.disease_name)

            for pred in predictions:
                if pred.disease_name in low_threshold_diseases:
                    continue
                
                # Exclude Cardiomegaly from heatmap processing (uses separate CTR service)
                if pred.disease_name == 'Cardiomegaly':
                    continue

                if hasattr(pred, 'heatmap') and pred.heatmap.heatmap_image:
                    # Get temp path (downloads if S3)
                    path = temp_manager.get_path(pred.heatmap.heatmap_image)
                    if path:
                        heatmap_paths[pred.disease_name] = path
                        confidence_scores[pred.disease_name] = pred.balanced_score
                        heatmap_settings[pred.disease_name] = custom_config.get_heatmap_setting(pred.disease_name)

            # Collect segments (filtered by version)
            segments = Segment.objects.filter(case_request=case_request, model_version=version_key)
            lung_mask_path = None
            lung_convex_mask_path = None
            fallback_heatmap_paths = {}
            
            for seg in segments:
                if seg.class_name in low_threshold_diseases:
                    continue

                if seg.class_name == 'Lung':
                    lung_mask_path = temp_manager.get_path(seg.segment_image)
                elif seg.class_name == 'Lung Convex':
                    lung_convex_mask_path = temp_manager.get_path(seg.segment_image)
                elif seg.segment_image:
                    path = temp_manager.get_path(seg.segment_image)
                    if path:
                        # Special handling for Pneumothorax
                        if seg.class_name == 'Pneumothorax':
                            heatmap_paths['Pneumothorax'] = path
                            heatmap_settings['Pneumothorax'] = custom_config.get_heatmap_setting('Pneumothorax')
                            pred = predictions.filter(disease_name='Pneumothorax').first()
                            if pred and hasattr(pred, 'heatmap') and pred.heatmap.heatmap_image:
                                fallback_path = temp_manager.get_path(pred.heatmap.heatmap_image)
                                if fallback_path:
                                    fallback_heatmap_paths['Pneumothorax'] = fallback_path
                        else:
                            heatmap_paths[seg.class_name + ' Segmentation'] = path
                            heatmap_settings[seg.class_name + ' Segmentation'] = custom_config.get_heatmap_setting(seg.class_name)
                            pred = predictions.filter(disease_name=seg.class_name).first()
                            if pred:
                                confidence_scores[seg.class_name + ' Segmentation'] = pred.balanced_score
            
            raw_image_path = None
            if raw_image.image:
                raw_image_path = temp_manager.get_path(raw_image.image)
            
            if lung_mask_path and raw_image_path:
                with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                    output_path = tmp_file.name

                if version_key == "v4.5.0":
                    result = processor.process_from_files(
                        heatmap_paths=heatmap_paths,
                        lung_mask_path=lung_mask_path,
                        raw_image_path=raw_image_path,
                        scores=confidence_scores,
                        output_path=output_path,
                        mode="color",
                        fallback_heatmap_paths=fallback_heatmap_paths,
                        use_v4_processing=True,
                        heatmap_settings=heatmap_settings,
                        convex_lung_mask_path=lung_convex_mask_path,
                        save_processed_heatmaps=False,
                        processed_heatmap_output_dir="example_output",
                        generate_individual_overlays=True,
                    )
                else:
                    result = processor.process_from_files(
                        heatmap_paths=heatmap_paths,
                        lung_mask_path=lung_mask_path,
                        raw_image_path=raw_image_path,
                        scores=confidence_scores,
                        output_path=output_path,
                        mode="color",
                        fallback_heatmap_paths=fallback_heatmap_paths,
                        save_processed_heatmaps=False,
                        generate_individual_overlays=True,
                    )

                if result is not None and os.path.exists(output_path):
                    # 4. Save to OverlayHeatmap model
                    with open(output_path, 'rb') as f:
                        overlay_content = f.read()
                        
                    overlay, _ = OverlayHeatmap.objects.update_or_create(
                        case_request=case_request,
                        version=version_key,
                        defaults={
                            'width': raw_image.width,
                            'height': raw_image.height,
                            'file_size': len(overlay_content)
                        }
                    )
                    # Save with a unique name including version
                    overlay.overlay_image.save(f"overlay_heatmap_{version_key}.png", ContentFile(overlay_content), save=True)
                    
                    os.remove(output_path)
                    
                    # 5. Save individual heatmap overlays for each positive disease
                    # These are generated with proper processing (watershed/blur/gamma) by the processor
                    if isinstance(result, dict) and 'individual_overlays' in result:
                        import cv2
                        
                        individual_overlays = result['individual_overlays']
                        for disease_name, overlay_img in individual_overlays.items():
                            try:
                                # Encode image as PNG
                                success, encoded_img = cv2.imencode('.png', overlay_img)
                                if success:
                                    img_content = encoded_img.tobytes()
                                    
                                    processed_heatmap, _ = ProcessedHeatmap.objects.update_or_create(
                                        case_request=case_request,
                                        disease_name=disease_name,
                                        model_version=version_key,
                                        defaults={
                                            'width': overlay_img.shape[1],
                                            'height': overlay_img.shape[0],
                                            'file_size': len(img_content)
                                        }
                                    )
                                    safe_disease_name = disease_name.lower().replace(' ', '_')
                                    processed_heatmap.heatmap_image.save(
                                        f"{safe_disease_name}_overlay.png",
                                        ContentFile(img_content),
                                        save=True
                                    )
                                    logger.info(f"Saved individual heatmap for {disease_name} ({version_key})")
                            except Exception as e:
                                logger.warning(f"Failed to save individual heatmap for {disease_name}: {e}")
                    
                    return True, errors
        finally:
            if 'temp_manager' in locals():
                temp_manager.cleanup()

    except Exception as e:
        msg = f"Error in overlay generation for {profile.name}: {e}"
        logger.error(msg)
        import traceback
        traceback.print_exc()
        errors.append(msg)
    
    return False, errors


def upload_test(request):
    if request.method == 'POST':
        if 'image' in request.FILES:
            uploaded_file = request.FILES['image']
            
            # Find profiles
            profile_v3 = PredictionProfile.objects.filter(name__icontains="v3.5.1", is_active=True).first()
            profile_v4 = PredictionProfile.objects.filter(name__icontains="v4.5.0", is_active=True).first()
            
            if not profile_v3 or not profile_v4:
                 # Fallback search if exact names not found
                profiles = PredictionProfile.objects.filter(is_active=True)
                for p in profiles:
                    if "v3" in p.name and not profile_v3: profile_v3 = p
                    if "v4" in p.name and not profile_v4: profile_v4 = p
            
            if not profile_v3 or not profile_v4:
                return HttpResponse(f"<h2>Error: Could not find both v3.5.1 and v4.5.0 profiles. Found: v3={profile_v3}, v4={profile_v4}</h2>")

            # Create CaseRequest
            case_request = CaseRequest.objects.create()

            # Create RawImage instance
            raw_image = RawImage()
            raw_image.case_request = case_request
            
            # Check if DICOM
            is_dicom = uploaded_file.name.lower().endswith('.dcm')
            
            if is_dicom:
                # 1. Save DICOM file
                dicom_file = DicomFile.objects.create(
                    case_request=case_request,
                    file=uploaded_file,
                    original_filename=uploaded_file.name,
                    file_size=uploaded_file.size
                )
                
                # 2. Convert to Image
                try:
                     # Reset pointer for conversion reading
                    uploaded_file.seek(0)
                    pil_image = convert_dicom_to_image(uploaded_file)
                    
                    # Save to buffer as PNG
                    img_buffer = io.BytesIO()
                    pil_image.save(img_buffer, format='PNG')
                    img_buffer.seek(0)
                    
                    # Create ContentFile for RawImage
                    file_content = ContentFile(img_buffer.getvalue())
                    new_filename = os.path.splitext(uploaded_file.name)[0] + ".png"
                    
                    raw_image.image.save(new_filename, file_content, save=False)
                    raw_image.original_filename = uploaded_file.name # Keep original name reference or change? Keeping original seems fine for tracking.
                    raw_image.content_type = 'image/png'
                    raw_image.file_size = len(img_buffer.getvalue())
                    raw_image.width = pil_image.width
                    raw_image.height = pil_image.height
                    
                    # Prepare data for processing (use the converted PNG data)
                    file_data = img_buffer.getvalue()
                    content_type_for_api = 'image/png'
                    filename_for_api = new_filename
                    
                except Exception as e:
                    return HttpResponse(f"<h2>Error processing DICOM file: {e}</h2>")
                
            else:
                # Normal Image flow
                raw_image.image = uploaded_file
                raw_image.original_filename = uploaded_file.name
                raw_image.content_type = uploaded_file.content_type
                raw_image.file_size = uploaded_file.size
                
                try:
                    img = Image.open(uploaded_file)
                    raw_image.width, raw_image.height = img.size
                except Exception:
                    pass

                # Read file content for processing
                uploaded_file.seek(0)
                file_data = uploaded_file.read()
                content_type_for_api = uploaded_file.content_type
                filename_for_api = uploaded_file.name

            raw_image.save()
            case_request.success_upload = True
            case_request.save()

            # (File data already prepared above)

            all_errors = []

            # Process v3.5.1
            success_v3, errors_v3 = process_profile_workflow(case_request, profile_v3, raw_image, file_data, filename_for_api, content_type_for_api)
            if errors_v3:
                all_errors.extend([f"[v3.5.1] {e}" for e in errors_v3])

            # Process v4.5.0
            success_v4, errors_v4 = process_profile_workflow(case_request, profile_v4, raw_image, file_data, filename_for_api, content_type_for_api)
            if errors_v4:
                all_errors.extend([f"[v4.5.0] {e}" for e in errors_v4])

            case_request.success_process = success_v3 and success_v4 
            case_request.save()

            # Retrieve overlays for display
            overlay_v3 = OverlayHeatmap.objects.filter(case_request=case_request, version="v3.5.1").first()
            overlay_v4 = OverlayHeatmap.objects.filter(case_request=case_request, version="v4.5.0").first()
            
            v3_url = overlay_v3.overlay_image.url if overlay_v3 else ""
            v4_url = overlay_v4.overlay_image.url if overlay_v4 else ""
            raw_url = raw_image.image.url

            error_html = ""
            if all_errors:
                error_list = "".join([f"<li>{e}</li>" for e in all_errors])
                error_html = f"""
                <div style="background-color: #f8d7da; color: #721c24; padding: 10px; margin-bottom: 20px; border: 1px solid #f5c6cb; border-radius: 5px;">
                    <h3>⚠️ Errors Occurred During Processing:</h3>
                    <ul>{error_list}</ul>
                </div>
                """

            prediction_status_html = ""
            if case_request.success_process:
                prediction_status_html = f"""
                <h3 style="color: green;">✓ All Predictions Successful!</h3>
                """
            else:
                prediction_status_html = f"""
                <h3 style="color: orange;">⚠ Completed with Issues (Success Status: {case_request.success_process})</h3>
                """

            return HttpResponse(f"""
            <html>
            <head>
                <style>
                    .container {{ font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }}
                    .image-container {{ position: relative; width: 100%; max-width: 600px; margin-top: 20px; }}
                    .display-img {{ width: 100%; display: none; }}
                    .display-img.active {{ display: block; }}
                    .controls {{ margin-bottom: 20px; }}
                    button {{ padding: 10px 20px; cursor: pointer; margin-right: 10px; }}
                    button.active {{ background-color: #007bff; color: white; border: none; }}
                </style>
                <script>
                    function showImage(type) {{
                        document.querySelectorAll('.display-img').forEach(img => img.classList.remove('active'));
                        document.getElementById('img-' + type).classList.add('active');
                        
                        document.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                        document.getElementById('btn-' + type).classList.add('active');
                    }}
                </script>
            </head>
            <body>
                <div class="container">
                    <h2>Analysis Result</h2>
                    {error_html}
                    <p><strong>Request ID:</strong> {case_request.request_id}</p>
                    
                    <div class="controls">
                        <button id="btn-raw" onclick="showImage('raw')" class="active">Raw Image</button>
                        <button id="btn-v3" onclick="showImage('v3')">v3.5.1 Overlay</button>
                        <button id="btn-v4" onclick="showImage('v4')">v4.5.0 Overlay</button>
                    </div>

                    <div class="image-container">
                        <img id="img-raw" src="{raw_url}" class="display-img active" alt="Raw Image">
                        <img id="img-v3" src="{v3_url}" class="display-img" alt="v3.5.1 Overlay">
                        <img id="img-v4" src="{v4_url}" class="display-img" alt="v4.5.0 Overlay">
                    </div>
                    
                    <br>
                    {prediction_status_html}
                    <br>
                    <a href="/test-upload/">Upload Another</a> |
                    <a href="/admin/">View in Admin</a>
                </div>
            </body>
            </html>
            """)

    profiles = PredictionProfile.objects.filter(is_active=True)
    return render(request, 'upload_test.html', {'profiles': profiles})


# =============================================================================
# REST API Endpoints for React Frontend
# =============================================================================

@require_http_methods(["GET"])
def api_case_list(request):
    """
    GET /api/cases/
    Returns paginated list of cases for history table.
    Query params: page, page_size, search
    """
    # Input validation for pagination
    try:
        page = int(request.GET.get('page', 1))
        page = max(1, page)  # Ensure page is at least 1
    except (ValueError, TypeError):
        page = 1
    
    try:
        page_size = int(request.GET.get('page_size', 10))
        page_size = max(1, min(100, page_size))  # Clamp between 1 and 100
    except (ValueError, TypeError):
        page_size = 10
    
    search = request.GET.get('search', '').strip()
    
    cases = CaseRequest.objects.filter(success_upload=True).order_by('-created_at')
    
    if search:
        cases = cases.filter(request_id__icontains=search)
    
    paginator = Paginator(cases, page_size)
    page_obj = paginator.get_page(page)
    
    # Define disease groups
    TB_DISEASES = ['Tuberculosis', 'Inspectra Lung Opacity v2']
    ABNORMALITY_DISEASES = ['Pneumothorax', 'Pleural Effusion', 'Cardiomegaly', 'Atelectasis', 'Edema', 'Nodule', 'Mass', 'Lung Opacity']
    
    def get_version_summary(predictions):
        """Get summary for a specific model version's predictions"""
        # Tuberculosis: check if TB or Inspectra Lung Opacity v2 is positive
        tb_preds = [p for p in predictions if p.disease_name in TB_DISEASES]
        tb_positive = any(p.thresholded_percentage != 'Low' for p in tb_preds)
        tb_score = None
        tb_status = 'none'  # none, low, positive
        if tb_preds:
            for name in TB_DISEASES:
                pred = next((p for p in predictions if p.disease_name == name), None)
                if pred:
                    if pred.thresholded_percentage != 'Low':
                        tb_score = pred.thresholded_percentage
                        tb_status = 'positive'
                        break
                    else:
                        tb_status = 'low'
        
        # Pneumothorax
        pneumo_pred = next((p for p in predictions if p.disease_name == 'Pneumothorax'), None)
        pneumo_status = 'none'
        pneumo_score = None
        if pneumo_pred:
            if pneumo_pred.thresholded_percentage != 'Low':
                pneumo_status = 'positive'
                pneumo_score = pneumo_pred.thresholded_percentage
            else:
                pneumo_status = 'low'
        
        # Abnormality: max score from remaining classes (excluding TB diseases and Pneumothorax)
        abnormality_preds = [p for p in predictions if p.disease_name in ABNORMALITY_DISEASES and p.disease_name != 'Pneumothorax']
        abnormality_positive = any(p.thresholded_percentage != 'Low' for p in abnormality_preds)
        abnormality_status = 'none'
        max_abnormality_score = None
        if abnormality_preds:
            if abnormality_positive:
                abnormality_status = 'positive'
                max_abnormality_value = 0
                for p in abnormality_preds:
                    if p.thresholded_percentage != 'Low':
                        try:
                            val = int(p.thresholded_percentage.replace('%', ''))
                            if val > max_abnormality_value:
                                max_abnormality_value = val
                                max_abnormality_score = p.thresholded_percentage
                        except ValueError:
                            # Couldn't parse percentage, use as fallback
                            if max_abnormality_score is None:
                                max_abnormality_score = p.thresholded_percentage
            else:
                abnormality_status = 'low'
        
        # Build results list (all 3 models with status)
        results = [
            {'name': 'Tuberculosis', 'score': tb_score, 'status': tb_status},
            {'name': 'Pneumothorax', 'score': pneumo_score, 'status': pneumo_status},
            {'name': 'Abnormality', 'score': max_abnormality_score, 'status': abnormality_status},
        ]
        
        # Build conditions list (all non-Low predictions)
        conditions = []
        for pred in predictions:
            if pred.thresholded_percentage != 'Low':
                conditions.append({
                    'name': pred.disease_name,
                    'thresholded': pred.thresholded_percentage
                })
        
        return {
            'results': results,
            'conditions': conditions,
        }
    
    case_list = []
    for case in page_obj:
        # Get associated raw image
        raw_image = RawImage.objects.filter(case_request=case).first()
        
        # Get predictions for both versions
        predictions_v3 = list(Prediction.objects.filter(case_request=case, model_version='v3.5.1'))
        predictions_v4 = list(Prediction.objects.filter(case_request=case, model_version='v4.5.0'))
        
        v3_summary = get_version_summary(predictions_v3)
        v4_summary = get_version_summary(predictions_v4)
        
        case_list.append({
            'request_id': str(case.request_id),
            'created_at': case.created_at.isoformat(),
            'patient_name': raw_image.original_filename if raw_image else 'N/A',
            'raw_image_url': raw_image.image.url if raw_image and raw_image.image else None,
            'success_process': case.success_process,
            'v3': v3_summary,
            'v4': v4_summary,
        })
    
    return JsonResponse({
        'cases': case_list,
        'total_count': paginator.count,
        'total_pages': paginator.num_pages,
        'current_page': page,
        'has_next': page_obj.has_next(),
        'has_previous': page_obj.has_previous(),
    })


@require_http_methods(["GET"])
def api_case_detail(request, request_id):
    """
    GET /api/cases/<uuid>/
    Returns full case details including predictions and overlays for preview page.
    """
    try:
        case = CaseRequest.objects.get(request_id=request_id)
    except CaseRequest.DoesNotExist:
        return JsonResponse({'error': 'Case not found'}, status=404)
    
    # Get raw image
    raw_image = RawImage.objects.filter(case_request=case).first()
    
    # Get predictions grouped by version
    predictions_data = {}
    for version in ['v3.5.1', 'v4.5.0']:
        predictions = Prediction.objects.filter(case_request=case, model_version=version)
        predictions_data[version] = [
            {
                'disease_name': pred.disease_name,
                'prediction_value': pred.prediction_value,
                'balanced_score': pred.balanced_score,
                'thresholded_percentage': pred.thresholded_percentage,
            }
            for pred in predictions
        ]
    
    # Get overlay heatmaps
    overlays = {}
    for overlay in OverlayHeatmap.objects.filter(case_request=case):
        overlays[overlay.version] = {
            'url': overlay.overlay_image.url if overlay.overlay_image else None,
            'width': overlay.width,
            'height': overlay.height,
        }
    
    # Get individual processed heatmaps for positive diseases
    individual_heatmaps = {}
    for version in ['v3.5.1', 'v4.5.0']:
        processed_heatmaps = ProcessedHeatmap.objects.filter(
            case_request=case, 
            model_version=version
        )
        individual_heatmaps[version] = [
            {
                'disease_name': ph.disease_name,
                'url': ph.heatmap_image.url if ph.heatmap_image else None,
            }
            for ph in processed_heatmaps
        ]
    
    return JsonResponse({
        'request_id': str(case.request_id),
        'created_at': case.created_at.isoformat(),
        'success_process': case.success_process,
        'raw_image': {
            'url': raw_image.image.url if raw_image and raw_image.image else None,
            'filename': raw_image.original_filename if raw_image else None,
            'width': raw_image.width if raw_image else None,
            'height': raw_image.height if raw_image else None,
        },
        'predictions': predictions_data,
        'overlays': overlays,
        'individual_heatmaps': individual_heatmaps,
    })


@csrf_exempt
@require_http_methods(["POST"])
def api_upload(request):
    """
    POST /api/upload/
    Upload an image and process it. Returns the case ID for redirect.
    """
    if 'image' not in request.FILES:
        return api_error_response('No image file provided')
    
    uploaded_file = request.FILES['image']
    
    # Validate uploaded file
    is_valid, error_msg = validate_uploaded_file(uploaded_file)
    if not is_valid:
        return api_error_response(error_msg)
    
    # Find profiles
    profile_v3 = PredictionProfile.objects.filter(name__icontains="v3.5.1", is_active=True).first()
    profile_v4 = PredictionProfile.objects.filter(name__icontains="v4.5.0", is_active=True).first()
    
    if not profile_v3 or not profile_v4:
        profiles = PredictionProfile.objects.filter(is_active=True)
        for p in profiles:
            if "v3" in p.name and not profile_v3: profile_v3 = p
            if "v4" in p.name and not profile_v4: profile_v4 = p
    
    if not profile_v3 or not profile_v4:
        return JsonResponse({
            'error': f'Could not find both prediction profiles. Found: v3={bool(profile_v3)}, v4={bool(profile_v4)}'
        }, status=500)
    
    # Create CaseRequest
    case_request = CaseRequest.objects.create()
    raw_image = RawImage(case_request=case_request)
    
    # Check if DICOM
    is_dicom = uploaded_file.name.lower().endswith('.dcm')
    
    try:
        if is_dicom:
            DicomFile.objects.create(
                case_request=case_request,
                file=uploaded_file,
                original_filename=uploaded_file.name,
                file_size=uploaded_file.size
            )
            
            uploaded_file.seek(0)
            pil_image = convert_dicom_to_image(uploaded_file)
            
            img_buffer = io.BytesIO()
            pil_image.save(img_buffer, format='PNG')
            img_buffer.seek(0)
            
            file_content = ContentFile(img_buffer.getvalue())
            new_filename = os.path.splitext(uploaded_file.name)[0] + ".png"
            
            raw_image.image.save(new_filename, file_content, save=False)
            raw_image.original_filename = uploaded_file.name
            raw_image.content_type = 'image/png'
            raw_image.file_size = len(img_buffer.getvalue())
            raw_image.width = pil_image.width
            raw_image.height = pil_image.height
            
            file_data = img_buffer.getvalue()
            content_type_for_api = 'image/png'
            filename_for_api = new_filename
        else:
            raw_image.image = uploaded_file
            raw_image.original_filename = uploaded_file.name
            raw_image.content_type = uploaded_file.content_type
            raw_image.file_size = uploaded_file.size
            
            try:
                img = Image.open(uploaded_file)
                raw_image.width, raw_image.height = img.size
            except Exception:
                pass
            
            uploaded_file.seek(0)
            file_data = uploaded_file.read()
            content_type_for_api = uploaded_file.content_type
            filename_for_api = uploaded_file.name
        
        raw_image.save()
        case_request.success_upload = True
        case_request.save()
        
        # Return immediately with case ID, processing happens async
        # For sync processing (current behavior), process both profiles
        all_errors = []
        
        success_v3, errors_v3 = process_profile_workflow(
            case_request, profile_v3, raw_image, file_data, filename_for_api, content_type_for_api
        )
        if errors_v3:
            all_errors.extend([f"[v3.5.1] {e}" for e in errors_v3])
        
        success_v4, errors_v4 = process_profile_workflow(
            case_request, profile_v4, raw_image, file_data, filename_for_api, content_type_for_api
        )
        if errors_v4:
            all_errors.extend([f"[v4.5.0] {e}" for e in errors_v4])
        
        case_request.success_process = success_v3 and success_v4
        case_request.save()
        
        return JsonResponse({
            'request_id': str(case_request.request_id),
            'success': case_request.success_process,
            'errors': all_errors if all_errors else None,
        })
        
    except Exception as e:
        logger.exception("Error processing upload")
        return JsonResponse({'error': str(e)}, status=500)


# =============================================================================
# V5 Experimental API (No DB persistence)
# =============================================================================

@csrf_exempt
@require_http_methods(["POST"])
def api_v5_predict(request):
    """
    POST /api/v5/predict/
    Call v5 API for a case without saving to DB.
    Request body: { "request_id": "uuid" }
    Returns: { predictions: [...], overlay_image: "data:image/png;base64,..." }
    """
    try:
        # Parse request body
        try:
            body = json.loads(request.body)
            request_id = body.get('request_id')
        except json.JSONDecodeError:
            return api_error_response('Invalid JSON body')
        
        if not request_id:
            return api_error_response('request_id is required')
        
        # Get the case and raw image
        try:
            case = CaseRequest.objects.get(request_id=request_id)
        except CaseRequest.DoesNotExist:
            return api_error_response('Case not found', status=404)
        
        raw_image = RawImage.objects.filter(case_request=case).first()
        if not raw_image or not raw_image.image:
            return api_error_response('No raw image found for this case', status=404)
        
        # Read image data
        try:
            raw_image.image.seek(0)
            file_data = raw_image.image.read()
            content_type = raw_image.content_type or 'image/png'
            filename = raw_image.original_filename or 'image.png'
        except Exception as e:
            logger.error(f"Error reading raw image: {e}")
            return api_error_response('Failed to read image data', status=500)
        
        # Get v5 API URL from environment
        v5_url = os.environ.get('ABNORMALITY_V5_URL')
        if not v5_url:
            return api_error_response('V5 API not configured', status=500)
        
        # Call v5 API
        logger.info(f"Calling v5 API: {v5_url} for case {request_id}")
        try:
            files = {'file': (filename, file_data, content_type)}
            data = {'request_id': str(request_id)}
            response = requests.post(v5_url, files=files, data=data, timeout=60)
            response.raise_for_status()
            v5_result = response.json()
        except requests.exceptions.Timeout:
            return api_error_response('V5 API request timed out', status=504)
        except requests.exceptions.RequestException as e:
            logger.error(f"V5 API error: {e}")
            return api_error_response(f'V5 API error: {str(e)}', status=502)
        
        # Transform v5 response to frontend format
        # V5 response: { "result": { "Disease": { "prediction": float, "balanced_score": float, "thresholded": str }, ... }, "overlay_heatmap_image": "<base64>" }
        predictions = []
        result_data = v5_result.get('result', {})
        for disease_name, values in result_data.items():
            predictions.append({
                'disease_name': disease_name,
                'prediction_value': values.get('prediction', 0.0),
                'balanced_score': values.get('balanced_score', 0.0),
                'thresholded_percentage': values.get('thresholded', 'Low'),
            })
        
        # Get base64 overlay image
        overlay_b64 = v5_result.get('overlay_heatmap_image', '')
        overlay_image_url = f"data:image/png;base64,{overlay_b64}" if overlay_b64 else None
        
        return JsonResponse({
            'request_id': str(request_id),
            'api_version': v5_result.get('api_version', '5.0.0'),
            'predictions': predictions,
            'overlay_image': overlay_image_url,
        })
        
    except Exception as e:
        logger.exception("Error in v5 prediction")
        return JsonResponse({'error': str(e)}, status=500)