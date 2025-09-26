from django.shortcuts import render
from django.http import HttpResponse
from django.core.files.base import ContentFile
from .models import RawImage, CaseRequest, CXRModel, Prediction, Heatmap, Segment
from PIL import Image
import requests
import base64
import io

def upload_test(request):
    if request.method == 'POST':
        if 'image' in request.FILES:
            uploaded_file = request.FILES['image']
            model_version = request.POST.get('model_version')

            # Get model version first
            try:
                model_version = CXRModel.objects.get(version=model_version)
            except Exception:
                model_version = None

            if not model_version:
                return HttpResponse("<h2>Error: Model version not found</h2>")

            # Create CaseRequest first
            case_request = CaseRequest.objects.create(
                model_version=model_version,
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
                # Reset file pointer to beginning
                uploaded_file.seek(0)

                # Call prediction API with multipart/form-data
                abnormality_url = "http://0.0.0.0:50000/predict"
                lung_segmentation_url = "http://0.0.0.0:50004/predict"

                # Prepare multipart form data
                files = {
                    'file': (uploaded_file.name, uploaded_file, uploaded_file.content_type)
                }
                data = {
                    'request_id': str(case_request.request_id)
                }

                ab_response = requests.post(abnormality_url, files=files, data=data, timeout=30)
                ab_response.raise_for_status()
                ab_json = ab_response.json()

                # Reset file pointer for second request
                uploaded_file.seek(0)
                files = {
                    'file': (uploaded_file.name, uploaded_file, uploaded_file.content_type)
                }

                lung_response = requests.post(lung_segmentation_url, files=files, data=data, timeout=30)
                lung_response.raise_for_status()
                lung_json = lung_response.json()

                # Extract and store prediction results
                if 'result' in ab_json:
                    result_data = ab_json['result']

                    for disease, values in result_data.items():
                        # Create or update Prediction record for each disease
                        prediction, _ = Prediction.objects.update_or_create(
                            case_request=case_request,
                            disease_name=disease,
                            defaults={
                                'prediction_value': values.get('prediction', 0.0),
                                'balanced_score': values.get('balanced_score', 0.0),
                                'thresholded_percentage': values.get('thresholded', '0%'),
                            }
                        )

                        # Save heatmap image if available
                        heatmap_b64 = values.get('heatmap', '')
                        if heatmap_b64:
                            try:
                                # Decode base64 to image
                                heatmap_data = base64.b64decode(heatmap_b64)
                                heatmap_image = Image.open(io.BytesIO(heatmap_data))

                                # Create filename for heatmap
                                filename = f"heatmap_{disease.lower().replace(' ', '_')}.png"

                                # Convert PIL image to file-like object
                                img_buffer = io.BytesIO()
                                heatmap_image.save(img_buffer, format='PNG')
                                img_buffer.seek(0)

                                # Create or update Heatmap record
                                heatmap, _ = Heatmap.objects.update_or_create(
                                    prediction=prediction,
                                    defaults={
                                        'width': heatmap_image.width,
                                        'height': heatmap_image.height,
                                        'file_size': len(heatmap_data),
                                    }
                                )

                                # Save the image file
                                heatmap.heatmap_image.save(
                                    filename,
                                    ContentFile(img_buffer.getvalue()),
                                    save=True
                                )

                            except Exception as heatmap_error:
                                # Log heatmap error but don't fail the whole prediction
                                print(f"Error saving heatmap for {disease}: {heatmap_error}")

                    
                if 'result' in lung_json:
                    lung_result_data = lung_json['result']

                    for lung_class, segment_b64 in lung_result_data['heatmap'].items():
                        if segment_b64:
                            try:
                                # Decode base64 to image
                                segment_data = base64.b64decode(segment_b64)
                                segment_image = Image.open(io.BytesIO(segment_data))

                                # Create filename for segment
                                filename = f"segment_{lung_class.lower().replace(' ', '_')}.png"

                                # Convert PIL image to file-like object
                                img_buffer = io.BytesIO()
                                segment_image.save(img_buffer, format='PNG')
                                img_buffer.seek(0)

                                # Create or update Segment record
                                segment, _ = Segment.objects.update_or_create(
                                    case_request=case_request,
                                    class_name=lung_class,
                                    defaults={
                                        'width': segment_image.width,
                                        'height': segment_image.height,
                                        'file_size': len(segment_data),
                                    }
                                )

                                # Save the image file
                                segment.segment_image.save(
                                    filename,
                                    ContentFile(img_buffer.getvalue()),
                                    save=True
                                )

                            except Exception as segment_error:
                                # Log segment error but don't fail the whole prediction
                                print(f"Error saving segment for {lung_class}: {segment_error}")


                # Heatmap orchestration
                prediction_data = Prediction.objects.filter(case_request=case_request)
                heatmap_data = Heatmap.objects.filter(prediction__in=prediction_data)
                print(heatmap_data.values())
                

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

    return render(request, 'upload_test.html')