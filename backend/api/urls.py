from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CsrfCookieView,
    CurrentUserView,
    FolderViewSet,
    HydrofoilAssetViewSet,
    ProjectViewSet,
    SessionLoginView,
    SessionLogoutView,
    SimulationRunViewSet,
)

router = DefaultRouter()
router.register(r'projects', ProjectViewSet)
router.register(r'folders', FolderViewSet)
router.register(r'assets', HydrofoilAssetViewSet)
router.register(r'runs', SimulationRunViewSet)

urlpatterns = [
    path('auth/csrf/', CsrfCookieView.as_view(), name='auth-csrf'),
    path('auth/login/', SessionLoginView.as_view(), name='auth-login'),
    path('auth/logout/', SessionLogoutView.as_view(), name='auth-logout'),
    path('auth/me/', CurrentUserView.as_view(), name='auth-me'),
    path('', include(router.urls)),
]