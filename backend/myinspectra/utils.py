import cv2
import os
import pydicom
import shutil
import numpy as np
from pydicom.pixel_data_handlers.util import convert_color_space
import tempfile
import logging
from PIL import Image
import io

logger = logging.getLogger(__name__)

# Configure pydicom encoding
pydicom.charset.python_encoding.update({'ISO_IR 196':'UTF-8'})
pydicom.charset.python_encoding.update({'ISO IR 192':'UTF-8'})

def check_dcm_keys(dataset, keys):
    """
    Check whether dicom metadata exists or not
    """
    return all([key in dataset.dir(key) for key in keys])

def rescale_image(image, slope, intercept):
    """
    Rescale image to corresponding range using slope and intercept.
    return: image (numpy ndarray of float 32)
    """
    return image.astype(np.float32) * slope + intercept

def fix_photometric_interpretation(dataset, image):
    """
    Fix color scheme: MONOCHROME1 -> MONOCHROME2, YBR -> RGB
    """
    if dataset.PhotometricInterpretation == 'MONOCHROME1':
        return image.max() - image
    elif dataset.PhotometricInterpretation not in ['MONOCHROME2', 'RGB']:
        # Attempt conversion, though mostly for YBR
        try:
            return convert_color_space(image, dataset.PhotometricInterpretation, 'RGB')
        except Exception as e:
            logger.warning(f"Could not convert color space: {e}")
            return image
    return image

def apply_window(image, center, width):
    """
    Apply windowing to image
    """
    if not isinstance(center, (int, float)):
        center = float(center) if hasattr(center, 'real') else center[0]
    if not isinstance(width, (int, float)):
        width = float(width) if hasattr(width, 'real') else width[0]
        
    image = image.copy()
    min_value = center - width // 2
    max_value = center + width // 2
    image[image < min_value] = min_value
    image[image > max_value] = max_value
    return image

def dcm_to_numpy(dataset, fix_color_scheme=True, window=True, normalize=True, rescale=True):
    """
    Convert dcm object to a numpy image (uint8).
    """
    # 1. Rescale (Slope/Intercept)
    if rescale and check_dcm_keys(dataset, ['RescaleSlope', 'RescaleIntercept']):
        image_2d = rescale_image(dataset.pixel_array, dataset.RescaleSlope, dataset.RescaleIntercept)
    else:
        # Fallback to copy to avoid modifying original if it is read-only
        image_2d = dataset.pixel_array.copy()
    
    # 2. Apply Windowing
    if window and check_dcm_keys(dataset, ['WindowCenter', 'WindowWidth']):
        image_2d = apply_window(image_2d, dataset.WindowCenter, dataset.WindowWidth)
    
    # 3. Fix Photometric Interpretation (Color Space)
    if fix_color_scheme and 'PhotometricInterpretation' in dataset:
        image_2d = fix_photometric_interpretation(dataset, image_2d)
    
    # 4. Normalize to 0-255 uint8
    if normalize:
        image_2d = image_2d.astype(float)
        imin, imax = image_2d.min(), image_2d.max()
        if imax > imin:
            image_2d = (image_2d - imin) / (imax - imin)
        else:
            image_2d = np.zeros_like(image_2d) # Avoid div by zero
            
        image_2d = (image_2d * 255.0)
        image_2d = np.uint8(image_2d)
        
    return image_2d

def convert_dicom_to_image(dicom_input):
    """
    Convert a DICOM file/path to a PIL Image.
    :param dicom_input: File path (str) or file-like object.
    :return: PIL.Image object
    """
    try:
        if isinstance(dicom_input, str):
            dcm = pydicom.dcmread(dicom_input, force=True)
        else:
            # Assume file-like
            dicom_input.seek(0)
            dcm = pydicom.dcmread(dicom_input, force=True)

        # Convert to numpy
        np_image = dcm_to_numpy(dcm)
        
        # Convert numpy to PIL
        return Image.fromarray(np_image)
    except Exception as e:
        logger.error(f"Error converting DICOM: {e}")
        raise ValueError(f"Failed to process DICOM file: {e}")

class TempFileManager:
    """Helper class to manage downloading S3 files to temporary local files."""
    def __init__(self):
        self.temp_files = []

    def get_path(self, django_file):
        """
        Get a local filesystem path for a Django file object.
        If the storage is S3-like (no local path), downloads to a temp file.
        """
        if not django_file:
            return None
            
        try:
            return django_file.path
        except NotImplementedError:
            # S3 or other storage that doesn't support .path
            # Download to temp file
            try:
                # Use suffix from name if available
                ext = os.path.splitext(django_file.name)[1]
                # Create temp file; delete=False so we can close and use it
                tf = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
                
                # Read content and write to temp
                django_file.open('rb') # Ensure open
                tf.write(django_file.read())
                django_file.close() # Good practice to close
                tf.close()
                
                self.temp_files.append(tf.name)
                return tf.name
            except Exception as e:
                logger.error(f"Error creating temp file for {django_file.name}: {e}")
                # Try to cleanup if failed halfway
                if 'tf' in locals() and tf and os.path.exists(tf.name):
                     try: os.remove(tf.name) 
                     except: pass
                raise

    def cleanup(self):
        """Remove all temporary files created."""
        for path in self.temp_files:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass