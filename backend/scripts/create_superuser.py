"""
Django Superuser Creation Script

This script creates a Django superuser using credentials from the .env file.
It reads DJANGO_ADMIN_USERNAME and DJANGO_ADMIN_PASSWORD from the environment.

Usage:
    python scripts/create_superuser.py

Environment variables required:
    DJANGO_ADMIN_USERNAME - Username for the superuser
    DJANGO_ADMIN_PASSWORD - Password for the superuser
"""

import os
import sys
import django
from pathlib import Path

# Add the parent directory to Python path to import Django settings
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

def create_superuser():
    """Create a superuser using credentials from .env file"""

    # Get credentials from environment
    username = os.getenv('DJANGO_ADMIN_USERNAME')
    password = os.getenv('DJANGO_ADMIN_PASSWORD')

    if not username:
        print("❌ Error: DJANGO_ADMIN_USERNAME not found in environment variables")
        return False

    if not password:
        print("❌ Error: DJANGO_ADMIN_PASSWORD not found in environment variables")
        return False

    print(f"📝 Creating superuser with username: {username}")

    # Get the User model
    User = get_user_model()

    try:
        # Check if user already exists
        if User.objects.filter(username=username).exists():
            print(f"⚠ Warning: User '{username}' already exists. Updating password...")
            user = User.objects.get(username=username)
            user.set_password(password)
            user.is_superuser = True
            user.is_staff = True
            user.save()
            print(f"✓ Updated existing user '{username}' with new password and superuser privileges")
        else:
            # Create new superuser
            user = User.objects.create_superuser(
                username=username,
                password=password,
                email=f"{username}@example.com"  # Default email
            )
            print(f"✓ Successfully created superuser '{username}'")

        return True

    except ValidationError as e:
        print(f"❌ Validation Error: {e}")
        return False
    except Exception as e:
        print(f"❌ Error creating superuser: {e}")
        return False

def main():
    """Main function"""
    print("🚀 Django Superuser Creation Script")
    print("=" * 40)

    success = create_superuser()

    if success:
        print("\n✅ Superuser creation completed successfully!")
        print("You can now log in to the Django admin at /admin/")
    else:
        print("\n❌ Superuser creation failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()