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
    TeamInviteAcceptView,
    TeamInviteCreateView,
    TeamInvitePreviewView,
    TeamInviteRevokeView,
    TeamMemberRemoveView,
    TeamMemberUpdateView,
    TeamViewSet,
)

router = DefaultRouter()
router.register(r'teams', TeamViewSet)
router.register(r'projects', ProjectViewSet)
router.register(r'folders', FolderViewSet)
router.register(r'assets', HydrofoilAssetViewSet)
router.register(r'runs', SimulationRunViewSet)

urlpatterns = [
    path('auth/csrf/', CsrfCookieView.as_view(), name='auth-csrf'),
    path('auth/login/', SessionLoginView.as_view(), name='auth-login'),
    path('auth/logout/', SessionLogoutView.as_view(), name='auth-logout'),
    path('auth/me/', CurrentUserView.as_view(), name='auth-me'),
    path('teams/<int:team_pk>/invites/', TeamInviteCreateView.as_view(), name='team-invite-create'),
    path('teams/<int:team_pk>/invites/<int:invite_pk>/revoke/', TeamInviteRevokeView.as_view(), name='team-invite-revoke'),
    path('teams/<int:team_pk>/members/<int:user_pk>/', TeamMemberUpdateView.as_view(), name='team-member-update'),
    path('teams/<int:team_pk>/members/<int:user_pk>/remove/', TeamMemberRemoveView.as_view(), name='team-member-remove'),
    path('team-invites/<str:token>/', TeamInvitePreviewView.as_view(), name='team-invite-preview'),
    path('team-invites/<str:token>/accept/', TeamInviteAcceptView.as_view(), name='team-invite-accept'),
    path('', include(router.urls)),
]