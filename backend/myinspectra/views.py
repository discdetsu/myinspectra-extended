from django.shortcuts import render
from django.http import HttpResponse
from django.core.files.base import ContentFile
import io
import concurrent.futures
from .models import RawImage, CaseRequest, CXRModel, Prediction, Heatmap, Segment, OverlayHeatmap, PredictionProfile
from .heatmap_orchestrate.main import HeatmapOverlayProcessor
from .heatmap_orchestrate.config import HeatmapConfig, InspectraImageOverlayConfig
import os
import tempfile
import requests
import base64
from PIL import Image

def call_prediction_api(url, file_data, filename, content_type, data):
    files = {'file': (filename, file_data, content_type)}
    try:
        response = requests.post(url, files=files, data=data, timeout=30)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error calling {url}: {e}")
        return {}

def save_heatmap(prediction, heatmap_b64):
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
        heatmap.heatmap_image.save("heatmap.png", ContentFile(img_buffer.getvalue()), save=True)
    except Exception as e:
        print(f"Error saving heatmap: {e}")

def process_prediction_result(case_request, result_data):
    if not result_data:
        return
    for disease, values in result_data.items():
        prediction, _ = Prediction.objects.update_or_create(
            case_request=case_request,
            disease_name=disease,
            defaults={
                'prediction_value': values.get('prediction', 0.0),
                'balanced_score': values.get('balanced_score', 0.0),
                'thresholded_percentage': values.get('thresholded', '0%'),
            }
        )
        save_heatmap(prediction, values.get('heatmap', ''))

def process_segmentation_result(case_request, result_data):
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
                defaults={
                    'width': segment_image.width,
                    'height': segment_image.height,
                    'file_size': len(segment_data),
                }
            )
            segment.segment_image.save("segment.png", ContentFile(img_buffer.getvalue()), save=True)
        except Exception as e:
            print(f"Error saving segment for {class_name}: {e}")


def upload_test(request):
    if request.method == 'POST':
        if 'image' in request.FILES:
            uploaded_file = request.FILES['image']
            profile_id = request.POST.get('profile_id')
            profile = None
            
            if profile_id:
                try:
                    profile = PredictionProfile.objects.get(id=profile_id)
                except Exception:
                    pass
            
            # Fallback to default profile if none selected (or create one if needed)
            if not profile:
                 # Try to find a default profile or the first active one
                profile = PredictionProfile.objects.filter(is_active=True).first()

            if not profile:
                return HttpResponse("<h2>Error: No active Prediction Profile found. Please configure one in Admin.</h2>")

            # Create CaseRequest
            case_request = CaseRequest.objects.create(
                profile=profile,
            )

            # Create RawImage instance with the case_request
            raw_image = RawImage()
            raw_image.case_request = case_request
            raw_image.image = uploaded_file
            raw_image.original_filename = uploaded_file.name
            raw_image.content_type = uploaded_file.content_type
            raw_image.file_size = uploaded_file.size

            # Get image dimensions
            try:
                img = Image.open(uploaded_file)
                raw_image.width, raw_image.height = img.size
            except Exception:
                pass

            raw_image.save()

            case_request.success_upload = True
            case_request.save()

            # Send uploaded image to prediction API
            prediction_success = False
            prediction_error = None

            try:
                # Read file content once
                uploaded_file.seek(0)
                file_data = uploaded_file.read()
                
                # Construct URLs dynamically from the profile
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
                            uploaded_file.name, 
                            uploaded_file.content_type, 
                            data
                        ): name 
                        for name, url in urls.items()
                    }
                    
                    for future in concurrent.futures.as_completed(future_to_url):
                        name = future_to_url[future]
                        try:
                            results[name] = future.result()
                        except Exception as exc:
                            print(f'{name} generated an exception: {exc}')

                # Process results
                if 'result' in results.get('abnormality', {}):
                    process_prediction_result(case_request, results['abnormality']['result'])
                
                if 'result' in results.get('tuberculosis', {}):
                    process_prediction_result(case_request, results['tuberculosis']['result'])
                    
                if 'result' in results.get('pneumothorax', {}):
                    process_prediction_result(case_request, results['pneumothorax']['result'])
                
                if 'result' in results.get('lung_segmentation', {}):
                    process_segmentation_result(case_request, results['lung_segmentation']['result'])
                    
                if 'result' in results.get('pleural_effusion_segmentation', {}):
                    process_segmentation_result(case_request, results['pleural_effusion_segmentation']['result'])
                    
                if 'result' in results.get('pneumothorax_segmentation', {}):
                    process_segmentation_result(case_request, results['pneumothorax_segmentation']['result'])


                # Heatmap orchestration (Overlay)
                try:
                    current_dir = os.path.dirname(os.path.abspath(__file__))
                    config_path = os.path.join(current_dir, 'heatmap_orchestrate', 'configs', 'config.yml')
                    overlay_config_path = os.path.join(current_dir, 'heatmap_orchestrate', 'configs', 'overlay_config.yml')

                    custom_config = HeatmapConfig(config_path)
                    custom_overlay_config = InspectraImageOverlayConfig(overlay_config_path)
                    processor = HeatmapOverlayProcessor(config=custom_config, overlay_config=custom_overlay_config)

                    heatmap_paths = {}
                    confidence_scores = {}
                    
                    # Collect heatmaps and scores from Predictions
                    predictions = Prediction.objects.filter(case_request=case_request)
                    for pred in predictions:
                        if hasattr(pred, 'heatmap') and pred.heatmap.heatmap_image:
                            heatmap_paths[pred.disease_name] = pred.heatmap.heatmap_image.path
                            confidence_scores[pred.disease_name] = pred.balanced_score

                    # Collect segments
                    segments = Segment.objects.filter(case_request=case_request)
                    lung_mask_path = None
                    fallback_heatmap_paths = {}
                    
                    for seg in segments:

                        if seg.class_name == 'Lung':
                            lung_mask_path = seg.segment_image.path

                        elif seg.class_name == 'Lung Convex':
                            lung_convex_mask_path = seg.segment_image.path

                        elif seg.segment_image:
                            # Special handling for Pneumothorax
                            if seg.class_name == 'Pneumothorax':
                                # Use segment as primary
                                heatmap_paths['Pneumothorax'] = seg.segment_image.path
                                
                                # If we already had a heatmap from prediction (which we collected above),
                                # move it to fallback
                                pred = predictions.filter(disease_name='Pneumothorax').first()
                                if pred and hasattr(pred, 'heatmap') and pred.heatmap.heatmap_image:
                                    fallback_heatmap_paths['Pneumothorax'] = pred.heatmap.heatmap_image.path

                            else:
                                # For other segments, treat as usual (maybe overwrite or add)
                                heatmap_paths[seg.class_name + ' Segmentation'] = seg.segment_image.path
                                pred = predictions.filter(disease_name=seg.class_name).first()
                                if pred:
                                    confidence_scores[seg.class_name + ' Segmentation'] = pred.balanced_score

                    if lung_mask_path and raw_image.image:
                        # We need a temporary path for output
                        # Or we can save directly to a temp file and then read it
                        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp_file:
                            output_path = tmp_file.name
                        
                        # Fallback paths are now populated in the loop above


                        result = processor.process_from_files(
                            heatmap_paths=heatmap_paths,
                            lung_mask_path=lung_mask_path,
                            raw_image_path=raw_image.image.path,
                            scores=confidence_scores,
                            output_path=output_path,
                            mode="color",
                            fallback_heatmap_paths=fallback_heatmap_paths,
                            save_processed_heatmaps=False # We don't need intermediate files stored permanently by processor
                        )

                        if result is not None and os.path.exists(output_path):
                            # Save to OverlayHeatmap model
                            with open(output_path, 'rb') as f:
                                overlay_content = f.read()
                                
                            overlay, _ = OverlayHeatmap.objects.update_or_create(
                                case_request=case_request,
                                defaults={
                                    'width': raw_image.width, # Assuming same size
                                    'height': raw_image.height,
                                    'file_size': len(overlay_content)
                                }
                            )
                            overlay.overlay_image.save("overlay_heatmap.png", ContentFile(overlay_content), save=True)
                            
                            # Clean up temp file
                            os.remove(output_path)

                except Exception as e:
                    print(f"Error in overlay generation: {e}")
                    import traceback
                    traceback.print_exc()

                # Mark prediction as successful
                case_request.success_process = True
                case_request.save()
                prediction_success = True

            except Exception as e:
                prediction_error = str(e)

            prediction_status_html = ""
            if prediction_success:
                prediction_status_html = f"""
                <h3 style="color: green;">✓ Prediction Successful!</h3>
                <p><strong>success_process:</strong> {case_request.success_process}</p>
                """
            elif prediction_error:
                prediction_status_html = f"""
                <h3 style="color: red;">✗ Prediction Failed</h3>
                <p><strong>Error:</strong> {prediction_error}</p>
                <p><strong>success_process:</strong> {case_request.success_process}</p>
                """

            return HttpResponse(f"""
            <h2>Upload Successful!</h2>
            <p><strong>Request ID:</strong> {case_request.request_id}</p>
            <p><strong>RawImage ID:</strong> {raw_image.id}</p>
            <p><strong>CaseRequest ID:</strong> {case_request.id}</p>
            <p><strong>Filename:</strong> {raw_image.original_filename}</p>
            <p><strong>Size:</strong> {raw_image.file_size} bytes</p>
            <p><strong>Dimensions:</strong> {raw_image.width}x{raw_image.height}</p>
            <p><strong>Content Type:</strong> {raw_image.content_type}</p>
            <p><strong>Image URL:</strong> <a href="{raw_image.image.url}" target="_blank">{raw_image.image.url}</a></p>
            {prediction_status_html}
            <br>
            <p>You can filter by request_id to get both records:</p>
            <ul>
                <li>RawImage.objects.filter(case_request__request_id='{case_request.request_id}')</li>
                <li>CaseRequest.objects.filter(request_id='{case_request.request_id}')</li>
            </ul>
            <br>
            <a href="/test-upload/">Upload Another</a> |
            <a href="/admin/">View in Admin</a>
            """)

    profiles = PredictionProfile.objects.filter(is_active=True)
    return render(request, 'upload_test.html', {'profiles': profiles})