from django.contrib import admin
from .models import User, Prediction

# Register your models here.
class UserAdmin(admin.ModelAdmin):
  list_display = ("firstname", "lastname", "joined_date",)

class PredictionAdmin(admin.ModelAdmin):
  list_display = ("user", "created_at",)
  
admin.site.register(User, UserAdmin)
admin.site.register(Prediction)