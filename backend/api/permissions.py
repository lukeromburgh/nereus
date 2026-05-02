from rest_framework.permissions import SAFE_METHODS, BasePermission

from .access import user_can_access_project, user_can_edit_team_resources, user_can_manage_team
from .models import Folder, HydrofoilAsset, Project, SimulationRun


class IsOwnerOrTeamMember(BasePermission):
    message = 'You do not have access to this resource.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True

        project = self._resolve_project(obj)
        if project is None or project.team_id is None or not user_can_access_project(request.user, project):
            return False

        if request.method in SAFE_METHODS:
            return True

        if isinstance(obj, Project) and request.method == 'DELETE':
            return user_can_manage_team(request.user, project.team)

        return user_can_edit_team_resources(request.user, project.team)

    def _resolve_project(self, obj):
        if isinstance(obj, Project):
            return obj
        if isinstance(obj, (Folder, HydrofoilAsset, SimulationRun)):
            return obj.project
        return None