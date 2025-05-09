from django.db import models

# Create your models here.
class User(models.Model):
    firstname = models.CharField(max_length=255)
    lastname = models.CharField(max_length=255)
    phone = models.IntegerField(null=True)
    joined_date = models.DateTimeField(auto_now_add=True, null=True)

class Prediction(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    image = models.ImageField(upload_to='images/')
    result = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

class Report(models.Model):
    pdf = models.FileField(upload_to='reports/')
    prediction = models.ForeignKey(Prediction, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)