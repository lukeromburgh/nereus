from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FolderViewSet, HydrofoilAssetViewSet, ProjectViewSet, SimulationRunViewSet

router = DefaultRouter()
router.register(r'projects', ProjectViewSet)
router.register(r'folders', FolderViewSet)
router.register(r'assets', HydrofoilAssetViewSet)
router.register(r'runs', SimulationRunViewSet)

urlpatterns = [
    path('', include(router.urls)),
]