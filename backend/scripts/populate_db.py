import os
import django

import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from myinspectra.models import CXRModel, PredictionProfile

# Define the models and versions
from dotenv import load_dotenv

# Load environment variables from .env file (assuming it's in the project root)
# Adjust path if necessary. Here we assume script is run from backend/ dir, so .env is in ../
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
load_dotenv(env_path)

# Define the models and versions
models_data = [
    ('abnormality', os.getenv('ABNORMALITY_V3_VERSION', '3.5.1'), os.getenv('ABNORMALITY_V3_URL', 'http://0.0.0.0:50035/predict')),
    ('abnormality', os.getenv('ABNORMALITY_V4_VERSION', '4.5.0'), os.getenv('ABNORMALITY_V4_URL', 'http://0.0.0.0:50045/predict')),
    ('tuberculosis', os.getenv('TUBERCULOSIS_VERSION', '2.0.3'), os.getenv('TUBERCULOSIS_URL', 'http://0.0.0.0:50001/predict')),
    ('pneumothorax', os.getenv('PNEUMOTHORAX_VERSION', '2.0.3'), os.getenv('PNEUMOTHORAX_URL', 'http://0.0.0.0:50002/predict')),
    ('pleural_effusion_segmentation', os.getenv('PLEURAL_EFFUSION_SEG_VERSION', '1.1.4'), os.getenv('PLEURAL_EFFUSION_SEG_URL', 'http://0.0.0.0:50003/predict')),
    ('lung_segmentation', os.getenv('LUNG_SEG_VERSION', '2.2.0'), os.getenv('LUNG_SEG_URL', 'http://0.0.0.0:50004/predict')),
    ('pneumothorax_segmentation', os.getenv('PNEUMOTHORAX_SEG_VERSION', '1.1.3'), os.getenv('PNEUMOTHORAX_SEG_URL', 'http://0.0.0.0:50005/predict')),
]

created_models = {}

print("Creating CXRModels...")
for service_type, version, url in models_data:
    model, created = CXRModel.objects.get_or_create(
        name=service_type.replace('_', ' ').title(),
        version=version,
        service_type=service_type,
        defaults={'api_url': url}
    )
    created_models[(service_type, version)] = model
    print(f"  {'Created' if created else 'Found'}: {model}")

# Create Profiles
profiles_data = [
    ("Abnormality v3.5.1", "3.5.1"),
    ("Abnormality v4.5.0", "4.5.0"),
]

print("\nCreating PredictionProfiles...")
for profile_name, abnormality_version in profiles_data:
    profile, created = PredictionProfile.objects.get_or_create(name=profile_name)
    
    # Add models to profile
    # 1. Abnormality (specific version)
    profile.cxr_models.add(created_models[('abnormality', abnormality_version)])
    
    # 2. Add all other standard services
    for (service_type, version), model in created_models.items():
        if service_type != 'abnormality':
            profile.cxr_models.add(model)
            
    print(f"  {'Created' if created else 'Updated'}: {profile}")
    print(f"    Models: {', '.join([str(m) for m in profile.cxr_models.all()])}")

print("\nDone!")
