from django.shortcuts import render
from django.http import HttpResponse
from django.core.files.base import ContentFile
from .models import RawImage, CaseRequest, CXRModel, Prediction, Heatmap
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
                cxr_api_url = "http://0.0.0.0:50000/predict"

                # Prepare multipart form data
                files = {
                    'file': (uploaded_file.name, uploaded_file, uploaded_file.content_type)
                }
                data = {
                    'request_id': str(case_request.request_id)
                }

                response = requests.post(cxr_api_url, files=files, data=data, timeout=30)
                response.raise_for_status()
                cxr_result = response.json()

                # Extract and store prediction results
                if 'result' in cxr_result:
                    result_data = cxr_result['result']

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