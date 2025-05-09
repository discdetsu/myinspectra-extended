from django.contrib import admin
from .models import User, Prediction, Report

# Register your models here.
class UserAdmin(admin.ModelAdmin):
  list_display = ("firstname", "lastname", "joined_date",)

class PredictionAdmin(admin.ModelAdmin):
  list_display = ("user", "created_at",)

class ReportAdmin(admin.ModelAdmin):
  list_display = ("prediction", "created_at", "pdf")
  
admin.site.register(User, UserAdmin)
admin.site.register(Prediction, PredictionAdmin)
admin.site.register(Report, ReportAdmin)